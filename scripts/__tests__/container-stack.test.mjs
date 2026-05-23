import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  buildStatusDocument,
  collectContainerStatus,
  extractMountedPaths,
  parseComposePsJson,
  parseArgs as parseStatusArgs,
  redactSensitiveText,
} from '../containers/collect-status.mjs'
import {
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
  DEFAULT_RELEASE_SMOKE_SQLSERVER_HOST_PORT,
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

  it('plans run-specific test and release-smoke stack names with stable demo stack names', () => {
    const testConfig = createLocalStackConfig({
      mode: 'test',
      runId: 'abc123',
    })
    const releaseSmokeConfig = createLocalStackConfig({
      mode: 'release-smoke',
      runId: 'smoke123',
    })
    const demoConfig = createLocalStackConfig({
      mode: 'demo',
      runId: 'ignored',
    })

    expect(testConfig).toMatchObject({
      projectName: 'kravhantering-container-stack-test-abc123',
      sqlServerHostPort: '127.0.0.1:15433',
      sqlServerVolumeName:
        'kravhantering-container-stack-test-abc123-sqlserver-data',
    })
    expect(releaseSmokeConfig).toMatchObject({
      projectName: 'kravhantering-container-stack-release-smoke-smoke123',
      sqlServerHostPort: DEFAULT_RELEASE_SMOKE_SQLSERVER_HOST_PORT,
      sqlServerVolumeName:
        'kravhantering-container-stack-release-smoke-smoke123-sqlserver-data',
    })
    expect(demoConfig).toMatchObject({
      projectName: 'kravhantering-container-stack-demo',
      sqlServerHostPort: '127.0.0.1:15434',
      sqlServerVolumeName: 'kravhantering-container-stack-demo-sqlserver-data',
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
    expect(podmanComposeNetworkName(testConfig)).toBe(
      'kravhantering-container-stack-test-abc123_default',
    )
  })

  it('parses local stack CLI modes and env files', () => {
    expect(DEFAULT_PODMAN_STORAGE_DRIVER).toBe('vfs')
    expect(
      parseLocalStackArgs([
        'up',
        '--mode',
        'demo',
        '--skip-build',
        '--run-id',
        'run1',
        '--sqlserver-host-port',
        '127.0.0.1:16000',
      ]),
    ).toMatchObject({
      command: 'up',
      mode: 'demo',
      runId: 'run1',
      skipBuild: true,
      sqlServerHostPort: '127.0.0.1:16000',
    })
    expect(sqlServerWaitPort('127.0.0.1:16000')).toBe('16000')
    expect(
      parseLocalStackArgs(['up', '--mode', 'release-smoke']),
    ).toMatchObject({
      command: 'up',
      mode: 'release-smoke',
    })
    expect(parseEnvFile('# demo\nDB_USER=kravhantering_job\nEMPTY=\n')).toEqual(
      {
        DB_USER: 'kravhantering_job',
        EMPTY: '',
      },
    )
    expect(() => parseLocalStackArgs(['up', '--mode', 'prod'])).toThrow(
      'Unsupported local stack mode',
    )
  })

  it('reuses prebuilt PR images when --skip-build is set', async () => {
    const commands = []
    const spawned = []
    const env = {
      APP_RUNTIME_IMAGE: 'localhost/kravhantering/app-runtime',
      APP_RUNTIME_SOURCE: 'pr-build',
      APP_RUNTIME_TAG: 'pr-7-99-deadbeef',
      DB_JOB_IMAGE: 'localhost/kravhantering/db-job',
      DB_JOB_SOURCE: 'pr-build',
      DB_JOB_TAG: 'pr-7-99-deadbeef',
    }
    const config = createLocalStackConfig({
      env,
      mode: 'release-smoke',
      runId: '99',
      skipBuild: true,
    })

    expect(config).toMatchObject({
      appRuntimeImageReference:
        'localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
      dbJobImageReference: 'localhost/kravhantering/db-job:pr-7-99-deadbeef',
      skipBuild: true,
    })

    const dependencies = {
      consoleObj: {
        error: vi.fn(),
        log: vi.fn(),
      },
      env,
      execFileSync: vi.fn((command, args) => {
        expect(command).toBe('podman')
        const joinedArgs = args.join(' ')
        if (joinedArgs === 'ps --all --format {{.Names}}\t{{.Ports}}') {
          return ''
        }
        if (joinedArgs.includes('inspect --format {{.State.Running}}')) {
          return 'true\n'
        }
        return joinedArgs.includes('db-job')
          ? 'sha256:db-job-pr\n'
          : 'sha256:app-runtime-pr\n'
      }),
      fsImpl: {
        existsSync: filePath => String(filePath).includes('.env.'),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(filePath =>
          String(filePath).endsWith('container-stack.lock.json')
            ? JSON.stringify({
                services: [
                  {
                    digest: 'sha256:nginx',
                    image: 'docker.io/library/nginx',
                    name: 'nginx',
                  },
                ],
              })
            : '',
        ),
        writeFileSync: vi.fn(),
      },
      spawn: vi.fn((command, args) => {
        spawned.push(`${command} ${args.join(' ')}`)
        return fakeProcess()
      }),
      spawnSync: vi.fn((command, args) => {
        commands.push(`${command} ${args.join(' ')}`)
        return { status: 0 }
      }),
    }

    await expect(
      runLocalStackMain(
        ['up', '--mode', 'release-smoke', '--run-id', '99', '--skip-build'],
        dependencies,
      ),
    ).resolves.toBe(0)

    expect(commands.join('\n')).not.toContain('container:build:app-runtime')
    expect(commands.join('\n')).not.toContain('container:build:db-job')
    expect(spawned).toContain(
      'docker save localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
    )
    expect(spawned).toContain(
      'docker save localhost/kravhantering/db-job:pr-7-99-deadbeef',
    )
    expect(commands.join('\n')).toContain('--app-tag pr-7-99-deadbeef')
    expect(commands.join('\n')).toContain('--db-job-tag pr-7-99-deadbeef')
    expect(
      commands.some(command =>
        command.endsWith(
          'localhost/kravhantering/db-job:pr-7-99-deadbeef seed:demo',
        ),
      ),
    ).toBe(true)
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
          'kravhantering-container-stack-release-smoke-old_nginx_1\t0.0.0.0:443->443/tcp',
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
      if (
        joinedArgs.includes(
          'label=io.podman.compose.project=kravhantering-container-stack-release-smoke-old',
        ) &&
        joinedArgs.includes('--format {{.Names}}')
      ) {
        return 'kravhantering-container-stack-release-smoke-old_nginx_1\n'
      }
      if (
        joinedArgs.includes(
          'label=io.podman.compose.project=kravhantering-container-stack-release-smoke-old',
        ) &&
        joinedArgs.includes('--format {{.Name}}')
      ) {
        return 'kravhantering-container-stack-release-smoke-old-sqlserver-data\n'
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
          'kravhantering-container-stack-release-smoke-old_nginx_1\t0.0.0.0:443->443/tcp',
        ].join('\n'),
        config.projectName,
      ),
    ).toEqual([
      'kravhantering-container-stack-release-smoke-old',
      'kravhantering-container-stack-test-old',
    ])
    expect(
      cleanupConflictingTestStacks(config, { execFileSync, spawnSync }),
    ).toEqual([
      'kravhantering-container-stack-release-smoke-old',
      'kravhantering-container-stack-test-old',
    ])
    expect(removed).toEqual([
      'podman stop --time 10 kravhantering-container-stack-release-smoke-old_nginx_1',
      'podman rm kravhantering-container-stack-release-smoke-old_nginx_1',
      'podman volume rm kravhantering-container-stack-release-smoke-old-sqlserver-data',
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
    })
    expect(commands).toHaveLength(3)
    expect(commands[0][1]).toContain('/CN=kravhantering.test local CA')
    expect(sanitizeHostname('kravhantering.test')).toBe('kravhantering.test')
  })

  it('rejects unsafe TLS hostnames before deriving file paths', () => {
    expect(() => parseTlsArgs(['--hostname', '../secret'])).toThrow(
      'Invalid TLS hostname',
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
    expect(execFileSync).toHaveBeenCalledTimes(3)
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
          digest: 'sha256:app',
          image: 'localhost/kravhantering/app-runtime',
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
          ? JSON.stringify({ services: [] })
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

  it('starts app-runtime before nginx so the static upstream is resolvable', async () => {
    const commands = []
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
        return 'sha256:local-image\n'
      }),
      fsImpl: {
        existsSync: filePath => String(filePath).includes('.env.'),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(filePath =>
          String(filePath).endsWith('container-stack.lock.json')
            ? JSON.stringify({
                services: [
                  {
                    digest: 'sha256:nginx',
                    image: 'docker.io/library/nginx',
                    name: 'nginx',
                  },
                ],
              })
            : '',
        ),
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
        ['up', '--mode', 'test', '--run-id', 'order'],
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
      'podman compose -f container-stack.compose.yml --project-name kravhantering-container-stack-test-order up -d sqlserver keycloak',
    )
    expect(
      commands.some(
        command =>
          command.includes('podman run --rm --pull=never') &&
          command.includes(
            '--net kravhantering-container-stack-test-order_default',
          ) &&
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
    expect(nginxWaitIndex).toBeGreaterThan(nginxIndex)
  })

  it('runs demo seed for release-smoke before starting app-runtime', async () => {
    const commands = []
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
        return 'sha256:local-image\n'
      }),
      fsImpl: {
        existsSync: filePath => String(filePath).includes('.env.'),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(filePath =>
          String(filePath).endsWith('container-stack.lock.json')
            ? JSON.stringify({
                services: [
                  {
                    digest: 'sha256:nginx',
                    image: 'docker.io/library/nginx',
                    name: 'nginx',
                  },
                ],
              })
            : '',
        ),
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
        ['up', '--mode', 'release-smoke', '--run-id', 'smoke'],
        dependencies,
      ),
    ).resolves.toBe(0)

    const seedDemoIndex = commands.findIndex(command =>
      command.endsWith('localhost/kravhantering/db-job:local seed:demo'),
    )
    const appRuntimeIndex = commands.findIndex(command =>
      command.includes(
        'podman run --name kravhantering-container-stack-release-smoke-smoke_app-runtime_1 --detach',
      ),
    )

    expect(commands).toContain(
      'podman compose -f container-stack.compose.yml --project-name kravhantering-container-stack-release-smoke-smoke up -d sqlserver keycloak',
    )
    expect(seedDemoIndex).toBeGreaterThan(-1)
    expect(appRuntimeIndex).toBeGreaterThan(seedDemoIndex)
  })

  it('uses digest-locked release images from the stack lock without local build or load', async () => {
    const commands = []
    const spawned = []
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
        throw new Error(`Unexpected podman args: ${joinedArgs}`)
      }),
      fsImpl: {
        existsSync: filePath => String(filePath).includes('.env.'),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(filePath =>
          String(filePath).endsWith('container-stack.lock.json')
            ? JSON.stringify({
                services: [
                  {
                    digest: 'sha256:app-runtime-release',
                    image: 'ghcr.io/viscalyx/kravhantering-app-runtime',
                    name: 'app-runtime',
                    source: 'ghcr-release',
                    tag: '1.2.3',
                  },
                  {
                    digest: 'sha256:db-job-release',
                    image: 'ghcr.io/viscalyx/kravhantering-db-job',
                    name: 'db-job',
                    source: 'ghcr-release',
                    tag: '1.2.3',
                  },
                  {
                    digest: 'sha256:nginx',
                    image: 'docker.io/library/nginx',
                    name: 'nginx',
                  },
                ],
              })
            : '',
        ),
        writeFileSync: vi.fn(),
      },
      spawn: vi.fn((command, args) => {
        spawned.push(`${command} ${args.join(' ')}`)
        return fakeProcess()
      }),
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
          'release-smoke',
          '--run-id',
          'release',
          '--release-images-from-lock',
        ],
        dependencies,
      ),
    ).resolves.toBe(0)

    const commandText = commands.join('\n')
    expect(commandText).not.toContain('container:build:app-runtime')
    expect(commandText).not.toContain('generate-stack-lock.mjs generate')
    expect(spawned).toEqual([])
    expect(commands).toContain(
      'podman pull ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app-runtime-release',
    )
    expect(commands).toContain(
      'podman pull ghcr.io/viscalyx/kravhantering-db-job@sha256:db-job-release',
    )
    expect(commandText).toContain('generate-compose.mjs --mode release')
    expect(
      commands.some(command =>
        command.endsWith(
          'ghcr.io/viscalyx/kravhantering-db-job@sha256:db-job-release seed:required',
        ),
      ),
    ).toBe(true)
    expect(
      commands.some(
        command =>
          command.includes(
            'podman run --name kravhantering-container-stack-release-smoke-release_app-runtime_1 --detach',
          ) &&
          command.includes(
            'ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app-runtime-release',
          ),
      ),
    ).toBe(true)
  })
})
