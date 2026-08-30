import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { checkStandaloneServerDependencies } from '../check-standalone-server-dependencies.mjs'
import {
  buildStatusDocument,
  collectContainerStatus,
  extractMountedPaths,
  parseComposePsJson,
  parseArgs as parseStatusArgs,
  redactSensitiveText,
} from '../containers/collect-status.mjs'
import {
  CERTIFICATE_PROFILE,
  generateServerCertificate,
  generateTlsFiles,
  opensslCommandPlan,
  parseArgs as parseTlsArgs,
  sanitizeHostname,
  tlsFilePlan,
} from '../containers/generate-tls.mjs'
import {
  cleanupConflictingTestStacks,
  createLocalStackConfig,
  DEFAULT_PODMAN_STORAGE_DRIVER,
  parseEnvFile,
  parseArgs as parseLocalStackArgs,
  parseLocalTestProjectsFromPs,
  podmanComposeArgs,
  podmanComposeNetworkName,
  main as runLocalStackMain,
  sqlServerWaitPort,
} from '../containers/run-local-stack.mjs'
import { buildHashLines, hashFileContent } from '../containers/write-hashes.mjs'

describe('container stack helpers', () => {
  function fakeProcess(exitCode = 0) {
    const subprocess = new EventEmitter()
    subprocess.stdin = new PassThrough()
    subprocess.stdout = new PassThrough()
    subprocess.stderr = new PassThrough()
    process.nextTick(() => subprocess.emit('close', exitCode))
    return subprocess
  }

  function containerStackLock(overrides = {}) {
    const service = (name, role, image, tag, manifestDigest, imageId) => ({
      imageId,
      image,
      manifestDigest,
      name,
      role,
      source:
        name === 'app-runtime' || name === 'db-job' ? 'local-build' : 'test',
      tag,
    })

    return {
      schemaVersion: 2,
      releaseVersion: '0.1.0-test',
      commitSha: 'deadbeef',
      generatedAt: '2026-05-22T10:00:00.000Z',
      generatedBy: 'scripts/containers/generate-stack-lock.mjs',
      services: [
        {
          ...service(
            'app-runtime',
            'application',
            'localhost/kravhantering/app-runtime',
            'local',
            'sha256:local-manifest',
            'sha256:local-image',
          ),
          ...overrides.appRuntime,
        },
        {
          ...service(
            'db-job',
            'database-job',
            'localhost/kravhantering/db-job',
            'local',
            'sha256:local-manifest',
            'sha256:local-image',
          ),
          ...overrides.dbJob,
        },
        {
          ...service(
            'nginx',
            'tls-proxy',
            'docker.io/library/nginx',
            '1.31.3-alpine',
            'sha256:nginx',
            'sha256:nginx-image',
          ),
          ...overrides.nginx,
        },
        {
          ...service(
            'sqlserver',
            'database',
            'mcr.microsoft.com/mssql/server',
            '2025-CU7-ubuntu-24.04',
            'sha256:sqlserver',
            'sha256:sqlserver-image',
          ),
          ...overrides.sqlserver,
        },
        {
          ...service(
            'keycloak',
            'identity-provider',
            'quay.io/keycloak/keycloak',
            '26.7.2-2',
            'sha256:keycloak',
            'sha256:keycloak-image',
          ),
          ...overrides.keycloak,
        },
      ],
    }
  }

  it('plans a run-specific local test stack name', () => {
    const testConfig = createLocalStackConfig({
      mode: 'test',
      runId: 'abc123',
    })
    expect(testConfig).toMatchObject({
      networkName: 'kravhantering-internal',
      pruneDockerAfterLoad: false,
      projectName: 'kravhantering-container-stack-test-abc123',
      sqlServerHostPort: '127.0.0.1:15433',
      sqlServerVolumeName:
        'kravhantering-container-stack-test-abc123-sqlserver-data',
    })
    expect(podmanComposeArgs(testConfig, ['up', '-d', 'sqlserver'])).toEqual([
      'compose',
      '-f',
      'container-stack.compose.yml',
      '--project-name',
      'kravhantering-container-stack-test-abc123',
      'up',
      '-d',
      'sqlserver',
    ])
    expect(podmanComposeNetworkName(testConfig)).toBe('kravhantering-internal')
  })

  it('parses local stack CLI modes and env files', () => {
    expect(DEFAULT_PODMAN_STORAGE_DRIVER).toBe('vfs')
    expect(
      parseLocalStackArgs([
        'up',
        '--mode',
        'test',
        '--skip-build',
        '--prune-docker-after-load',
        '--run-id',
        'run1',
        '--network-name',
        'kravhantering-test-network',
        '--sqlserver-host-port',
        '127.0.0.1:16000',
      ]),
    ).toMatchObject({
      command: 'up',
      mode: 'test',
      networkName: 'kravhantering-test-network',
      pruneDockerAfterLoad: true,
      runId: 'run1',
      skipBuild: true,
      sqlServerHostPort: '127.0.0.1:16000',
    })
    expect(sqlServerWaitPort('127.0.0.1:16000')).toBe('16000')
    expect(sqlServerWaitPort('16000')).toBe('16000')
    expect(parseEnvFile('# demo\nDB_USER=kravhantering_job\nEMPTY=\n')).toEqual(
      {
        DB_USER: 'kravhantering_job',
        EMPTY: '',
      },
    )
    expect(() => parseLocalStackArgs(['up', '--mode', 'prod'])).toThrow(
      'Unsupported local stack mode',
    )
    expect(parseLocalStackArgs([])).toMatchObject({
      command: '',
      mode: 'test',
    })
    expect(parseLocalStackArgs(['up', '--mode', '   ']).mode).toBe('test')
    expect(() => parseLocalStackArgs(['up', 'mode'])).toThrow(
      'Unexpected argument: mode',
    )
    expect(() => parseLocalStackArgs(['up', '--run-id'])).toThrow(
      'Missing value for --run-id',
    )
    expect(parseEnvFile('INVALID\n=bad\n')).toEqual({})
  })

  it('identifies and removes previous test stacks before a new test run', () => {
    const removed = []
    const config = createLocalStackConfig({
      mode: 'test',
      runId: 'new',
    })
    const execFileSync = vi.fn((command, args) => {
      expect(command).toBe('podman')
      const joinedArgs = args.join(' ')
      if (joinedArgs === 'ps --all --format {{.Names}}\t{{.Ports}}') {
        return [
          'kravhantering-container-stack-test-old_sqlserver_1\t127.0.0.1:15433->1433/tcp',
          'kravhantering-container-stack-test-new_sqlserver_1\t127.0.0.1:15433->1433/tcp',
          'unrelated_container\t',
        ].join('\n')
      }
      if (
        joinedArgs.includes(
          'label=io.podman.compose.project=kravhantering-container-stack-test-old',
        ) &&
        joinedArgs.includes('--format {{.Names}}')
      ) {
        return 'kravhantering-container-stack-test-old_sqlserver_1\n'
      }
      if (
        joinedArgs.includes(
          'label=io.podman.compose.project=kravhantering-container-stack-test-old',
        ) &&
        joinedArgs.includes('--format {{.Name}}')
      ) {
        return 'kravhantering-container-stack-test-old-sqlserver-data\n'
      }
      throw new Error(`Unexpected podman args: ${joinedArgs}`)
    })
    const spawnSync = vi.fn((command, args) => {
      removed.push(`${command} ${args.join(' ')}`)
      return { status: 0 }
    })

    expect(
      parseLocalTestProjectsFromPs(
        [
          'kravhantering-container-stack-test-old_sqlserver_1\t127.0.0.1:15433->1433/tcp',
        ].join('\n'),
        config.projectName,
      ),
    ).toEqual(['kravhantering-container-stack-test-old'])
    expect(
      cleanupConflictingTestStacks(config, { execFileSync, spawnSync }),
    ).toEqual(['kravhantering-container-stack-test-old'])
    expect(removed).toEqual([
      'podman stop --time 10 kravhantering-container-stack-test-old_sqlserver_1',
      'podman rm kravhantering-container-stack-test-old_sqlserver_1',
      'podman volume rm kravhantering-container-stack-test-old-sqlserver-data',
    ])
  })

  it('plans short-lived TLS files and openssl commands without secrets', () => {
    const parsed = parseTlsArgs([
      '--hostname',
      'kravhantering.test',
      '--output-dir',
      'tmp/tls',
    ])
    const files = tlsFilePlan(parsed.outputDir, parsed.hostname)
    const commands = opensslCommandPlan(files, parsed.hostname)

    expect(files).toMatchObject({
      caCert: 'tmp/tls/ca.crt',
      serverCert: 'tmp/tls/kravhantering.test.crt',
      serverKey: 'tmp/tls/kravhantering.test.key',
      sqlServerCert: 'tmp/tls/sqlserver.crt',
      sqlServerKey: 'tmp/tls/sqlserver.key',
    })
    expect(commands).toHaveLength(5)
    expect(commands[0][1]).toContain('/CN=kravhantering.test local CA')
    expect(commands[3][1]).toContain('/CN=sqlserver')
    expect(commands[4][1]).toContain('tmp/tls/sqlserver.ext')
    expect(sanitizeHostname('kravhantering.test')).toBe('kravhantering.test')
  })

  it('plans a renewed SQL Server certificate from an existing CA', () => {
    const parsed = parseTlsArgs([
      '--hostname',
      'sqlserver',
      '--output-dir',
      'tmp/renewed',
      '--ca-cert',
      'tmp/tls/ca.crt',
      '--ca-key',
      'tmp/tls/ca.key',
      '--file-stem',
      'server',
    ])

    expect(parsed).toMatchObject({
      caCert: 'tmp/tls/ca.crt',
      caKey: 'tmp/tls/ca.key',
      fileStem: 'server',
      hostname: 'sqlserver',
      outputDir: 'tmp/renewed',
    })
  })

  it('rejects unsafe TLS hostnames before deriving file paths', () => {
    expect(() => parseTlsArgs(['--hostname', '../secret'])).toThrow(
      'Invalid TLS hostname',
    )
    expect(() => parseTlsArgs(['--ca-cert', 'tmp/tls/ca.crt'])).toThrow(
      '--ca-cert and --ca-key must be provided together',
    )
    expect(() => tlsFilePlan('tmp/tls', 'kravhantering.test/secret')).toThrow(
      'Invalid TLS hostname',
    )
    expect(() =>
      generateTlsFiles({
        execFileSync: vi.fn(),
        fsImpl: {
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
        },
        hostname: 'kravhantering..test',
        outputDir: 'tmp/tls',
      }),
    ).toThrow('Invalid TLS hostname')
  })

  it('generates TLS through injectable fs and exec dependencies', () => {
    const writes = new Map()
    const execFileSync = vi.fn()
    const fsImpl = {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn((filePath, content) =>
        writes.set(filePath, content),
      ),
    }

    const files = generateTlsFiles({
      execFileSync,
      fsImpl,
      hostname: 'kravhantering.test',
      outputDir: 'tmp/tls',
    })

    expect(fsImpl.mkdirSync).toHaveBeenCalledWith('tmp/tls', {
      recursive: true,
    })
    expect(writes.get(files.ext)).toContain(
      'subjectAltName=DNS:kravhantering.test',
    )
    expect(writes.get(files.sqlServerExt)).toContain(
      'subjectAltName=DNS:sqlserver',
    )
    expect(writes.get(files.sqlServerExt)).toContain(
      'keyUsage=critical,digitalSignature,keyEncipherment',
    )
    expect(execFileSync).toHaveBeenCalledTimes(5)
  })

  it('issues the SQL Server certificate profile through a reusable seam', () => {
    const writes = new Map()
    const execFileSync = vi.fn()
    const files = generateServerCertificate({
      caCert: 'tmp/tls/ca.crt',
      caKey: 'tmp/tls/ca.key',
      execFileSync,
      fileStem: 'server',
      fsImpl: {
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn((filePath, content) =>
          writes.set(filePath, content),
        ),
      },
      hostname: 'sqlserver',
      outputDir: 'tmp/renewed',
      profile: CERTIFICATE_PROFILE.SQL_SERVER,
    })

    expect(files).toMatchObject({
      serverCert: 'tmp/renewed/server.crt',
      serverKey: 'tmp/renewed/server.key',
    })
    expect(writes.get(files.ext)).toContain(
      'keyUsage=critical,digitalSignature,keyEncipherment',
    )
    expect(execFileSync).toHaveBeenCalledTimes(2)
  })

  it('redacts sensitive status text and keeps mount metadata allowlisted', () => {
    const composeText = `
      - ./containers/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./containers/app/.env.app.local
      - ./tmp/container-tls/kravhantering.test.key:/etc/nginx/tls/key:ro
      - ./typeorm/seed.mjs:/workspace/typeorm/seed.mjs:ro
    `
    const status = {
      composeFile: 'container-stack.compose.yml',
      generatedAt: '2026-05-22T00:00:00.000Z',
      images: [
        {
          imageId: 'sha256:app-image',
          image: 'localhost/kravhantering/app-runtime',
          manifestDigest: 'sha256:app-manifest',
          name: 'app-runtime',
          tag: 'local',
        },
      ],
      logs: [
        {
          service: 'app-runtime',
          text: 'AUTH_SESSION_COOKIE_PASSWORD=super-secret',
        },
      ],
      mountedPaths: extractMountedPaths(composeText),
      projectName: 'kravhantering-container-stack-test',
      ps: [],
      psText: '',
    }

    expect(status.mountedPaths).toEqual([
      './containers/nginx/nginx.conf',
      './typeorm/seed.mjs',
    ])
    expect(redactSensitiveText('DB_PASSWORD=secret')).toBe(
      'DB_PASSWORD= [redacted]',
    )
    expect(buildStatusDocument(status)).not.toContain('super-secret')
  })

  it('parses podman compose ps JSON lines and hashes safe files only', () => {
    const ps = parseComposePsJson('{"Name":"a"}\n{"Name":"b"}\n')
    const fsImpl = {
      existsSync: filePath => filePath.endsWith('container-status.txt'),
      readFileSync: () => 'status',
    }

    expect(ps).toEqual([{ Name: 'a' }, { Name: 'b' }])
    expect(hashFileContent('status')).toHaveLength(64)
    expect(
      buildHashLines(['container-status.txt'], {
        cwd: '/workspace',
        fsImpl,
      }),
    ).toEqual([`${hashFileContent('status')}  container-status.txt`])
    expect(() => buildHashLines(['tmp/container-tls/server.key'])).toThrow(
      'Refusing to hash sensitive runtime file',
    )
    expect(() =>
      buildHashLines(['../outside.txt'], {
        cwd: '/workspace',
        fsImpl,
      }),
    ).toThrow('Refusing to hash file outside workspace')
  })

  it('validates status log tail length at the CLI boundary', () => {
    expect(parseStatusArgs([]).tail).toBe(80)
    expect(parseStatusArgs(['--tail', '160']).tail).toBe(160)
    expect(() => parseStatusArgs(['--tail', '0'])).toThrow(
      '--tail must be a positive integer.',
    )
    expect(() => parseStatusArgs(['--tail', 'many'])).toThrow(
      '--tail must be a positive integer.',
    )
    expect(() => parseStatusArgs(['--tail', '12many'])).toThrow(
      '--tail must be a positive integer.',
    )
  })

  it('falls back to podman ps when podman-compose lacks JSON ps output', () => {
    const execFileSync = vi.fn((command, args) => {
      expect(command).toBe('podman')
      const joinedArgs = args.join(' ')
      if (joinedArgs.includes('compose -f stack.yml --project-name demo ps')) {
        throw new Error('unrecognized arguments: --format json')
      }
      if (joinedArgs.includes('label=io.podman.compose.project=demo')) {
        return 'demo_app-runtime_1\tUp\tlocalhost/app:local\t\n'
      }
      if (args[0] === 'logs') {
        return 'log tail'
      }
      throw new Error(`Unexpected podman args: ${joinedArgs}`)
    })
    const fsImpl = {
      existsSync: () => true,
      readFileSync: filePath =>
        String(filePath).endsWith('lock.json')
          ? JSON.stringify(containerStackLock())
          : '- ./containers/nginx/nginx.conf:/etc/nginx/nginx.conf:ro',
    }

    const status = collectContainerStatus({
      composeFile: 'stack.yml',
      execFileSync,
      fsImpl,
      lockFile: 'lock.json',
      projectName: 'demo',
    })

    expect(status.ps).toEqual([])
    expect(status.psText).toContain('demo_app-runtime_1')
    expect(status.psText).not.toContain('unrecognized arguments')
  })

  it('falls back to direct podman logs when Compose returns an empty log tail', () => {
    const execFileSync = vi.fn((_command, args) => {
      if (args.includes('ps')) {
        return '[]'
      }
      if (args[0] === 'compose') {
        return ''
      }
      if (args[0] === 'logs') {
        return `direct log from ${args.at(-1)}`
      }
      throw new Error(`Unexpected podman args: ${args.join(' ')}`)
    })
    const fsImpl = {
      existsSync: () => false,
    }

    const status = collectContainerStatus({
      composeFile: 'stack.yml',
      execFileSync,
      fsImpl,
      projectName: 'demo',
    })

    expect(status.logs.find(log => log.service === 'app-runtime')?.text).toBe(
      'direct log from demo_app-runtime_1',
    )
  })

  it('rejects standalone dependencies resolved outside the deployment output', () => {
    const standaloneRequire = Object.assign(() => {}, {
      resolve: dependency =>
        dependency === 'mssql'
          ? `/workspace/node_modules/${dependency}/index.js`
          : `/workspace/.next/standalone/node_modules/${dependency}/index.js`,
    })

    expect(() =>
      checkStandaloneServerDependencies({
        createRequireImpl: () => standaloneRequire,
        cwd: '/workspace',
        fsImpl: { existsSync: () => true },
      }),
    ).toThrow('Standalone server dependencies are missing: mssql.')
  })

  it('uses the configured Compose file and starts app-runtime before nginx', async () => {
    const commands = []
    const composeFile = 'tmp/custom-stack.compose.yml'
    const dependencies = {
      consoleObj: {
        error: vi.fn(),
        log: vi.fn(),
      },
      execFileSync: vi.fn((command, args) => {
        expect(command).toBe('podman')
        const joinedArgs = args.join(' ')
        if (joinedArgs === 'ps --all --format {{.Names}}\t{{.Ports}}') {
          return ''
        }
        if (joinedArgs.includes('inspect --format {{.State.Running}}')) {
          return 'true\n'
        }
        if (
          joinedArgs.includes('image inspect') &&
          joinedArgs.includes('{{.Digest}}')
        ) {
          return 'sha256:local-manifest\n'
        }
        return 'sha256:local-image\n'
      }),
      fsImpl: {
        existsSync: filePath => String(filePath).includes('.env.'),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(filePath => {
          if (String(filePath).endsWith('containers/kong/image.lock.json')) {
            return JSON.stringify(kongLock())
          }
          if (String(filePath).endsWith('container-stack.lock.json')) {
            return JSON.stringify(containerStackLock())
          }
          return ''
        }),
        writeFileSync: vi.fn(),
      },
      spawn: vi.fn(() => fakeProcess()),
      spawnSync: vi.fn((command, args) => {
        commands.push(`${command} ${args.join(' ')}`)
        return { status: 0 }
      }),
    }

    await expect(
      runLocalStackMain(
        [
          'up',
          '--mode',
          'test',
          '--run-id',
          'order',
          '--compose-file',
          composeFile,
        ],
        dependencies,
      ),
    ).resolves.toBe(0)

    const appRuntimeIndex = commands.findIndex(command =>
      command.includes(
        'podman run --name kravhantering-container-stack-test-order_app-runtime_1 --detach',
      ),
    )
    const nginxIndex = commands.findIndex(command =>
      command.includes(
        'podman run --name kravhantering-container-stack-test-order_nginx_1 --detach',
      ),
    )
    const nginxWaitIndex = commands.findIndex(command =>
      command.includes('wait-for.mjs nginx'),
    )

    expect(commands).toContain(
      `node scripts/containers/generate-compose.mjs --mode test --lock-file container-stack.lock.json --output ${composeFile} --network-name kravhantering-internal --project-name kravhantering-container-stack-test-order --sqlserver-volume-name kravhantering-container-stack-test-order-sqlserver-data --sqlserver-host-port 127.0.0.1:15433 --tls-dir ./tmp/container-tls`,
    )
    expect(commands).toContain(
      `podman compose -f ${composeFile} --project-name kravhantering-container-stack-test-order up -d sqlserver keycloak`,
    )
    expect(
      commands.some(
        command =>
          command.includes('podman run --rm --pull=never') &&
          command.includes('--net kravhantering-internal') &&
          command.endsWith(
            'localhost/kravhantering/db-job:local seed:required',
          ),
      ),
    ).toBe(true)
    expect(commands.join('\n')).not.toContain('--exit-code-from')
    expect(commands.join('\n')).not.toContain('up --no-deps')
    expect(appRuntimeIndex).toBeGreaterThan(-1)
    expect(commands[appRuntimeIndex]).toContain('--no-hosts')
    expect(nginxIndex).toBeGreaterThan(appRuntimeIndex)
    expect(commands[nginxIndex]).toContain(
      '/containers/production/nginx/templates/api-docs-security-headers.conf:/etc/nginx/snippets/api-docs-security-headers.conf:ro',
    )
    expect(commands[nginxIndex]).toContain(
      '/public/api-docs:/usr/share/nginx/html/api-docs:ro',
    )
    expect(nginxWaitIndex).toBeGreaterThan(nginxIndex)
  })
})
