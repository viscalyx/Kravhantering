import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  archiveFileName,
  buildArchivePlans,
  exportOciArchives,
  imageReference,
  parseArgs,
  verifyOciArchives,
} from '../containers/export-oci-archives.mjs'

function service(
  name,
  image,
  tag,
  imageId,
  manifestDigest = `${imageId}-manifest`,
) {
  const roles = {
    'app-runtime': 'application',
    'db-job': 'database-job',
    keycloak: 'identity-provider',
    nginx: 'tls-proxy',
    sqlserver: 'database',
  }

  return {
    imageId,
    image,
    manifestDigest,
    name,
    role: roles[name],
    source: 'pr-build',
    tag,
  }
}

function stackLock() {
  return {
    schemaVersion: 2,
    releaseVersion: '0.1.0-test',
    commitSha: 'deadbeef',
    generatedAt: '2026-05-22T10:00:00.000Z',
    generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    services: [
      service(
        'app-runtime',
        'localhost/kravhantering/app-runtime',
        'pr-7-99-deadbeef',
        'sha256:app-runtime',
      ),
      service(
        'db-job',
        'localhost/kravhantering/db-job',
        'pr-7-99-deadbeef',
        'sha256:db-job',
      ),
      service(
        'nginx',
        'docker.io/library/nginx',
        '1.31.2-alpine',
        'sha256:nginx',
      ),
      service(
        'sqlserver',
        'mcr.microsoft.com/mssql/server',
        '2025-CU6-ubuntu-24.04',
        'sha256:sqlserver',
      ),
      service(
        'keycloak',
        'quay.io/keycloak/keycloak',
        '26.7.0-0',
        'sha256:keycloak',
      ),
    ],
  }
}

function fakeFs() {
  return {
    existsSync: filePath => String(filePath).endsWith('.oci.tar.gz'),
    mkdtempSync: vi.fn(() => '/tmp/kh-oci-verify/verify-ci'),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify(stackLock())),
    rmSync: vi.fn(),
  }
}

describe('container OCI archive helpers', () => {
  it('plans project image archive paths and parses CLI options', () => {
    const lock = stackLock()
    const plans = buildArchivePlans(lock, 'tmp/oci')

    expect(parseArgs(['export', '--lock-file', 'lock.json'])).toMatchObject({
      command: 'export',
      lockFile: 'lock.json',
    })
    expect(
      parseArgs(['verify', '--verify-root', '/tmp/kh-oci-verify']),
    ).toMatchObject({
      command: 'verify',
      verifyRoot: '/tmp/kh-oci-verify',
    })
    expect(archiveFileName('app-runtime')).toBe('app-runtime.oci.tar.gz')
    expect(imageReference(stackLock().services[0])).toBe(
      'localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
    )
    expect(lock.services[0]).toMatchObject({
      imageId: 'sha256:app-runtime',
      manifestDigest: 'sha256:app-runtime-manifest',
    })
    expect(plans).toEqual([
      {
        archivePath: 'tmp/oci/app-runtime.oci.tar.gz',
        imageId: 'sha256:app-runtime',
        imageRef: 'localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
        rawArchivePath: 'tmp/oci/app-runtime.oci.tar',
        serviceName: 'app-runtime',
      },
      {
        archivePath: 'tmp/oci/db-job.oci.tar.gz',
        imageId: 'sha256:db-job',
        imageRef: 'localhost/kravhantering/db-job:pr-7-99-deadbeef',
        rawArchivePath: 'tmp/oci/db-job.oci.tar',
        serviceName: 'db-job',
      },
    ])
  })

  it('fails fast when an archived service has no image ID', () => {
    const invalidStackLock = stackLock()
    delete invalidStackLock.services[0].imageId

    expect(() => buildArchivePlans(invalidStackLock, 'tmp/oci')).toThrow(
      'must include required field "imageId"',
    )
  })

  it('exports separate compressed OCI archives with Podman', () => {
    const fsImpl = fakeFs()
    const commands = []
    const spawnSync = vi.fn((command, args) => {
      commands.push(`${command} ${args.join(' ')}`)
      return { status: 0 }
    })

    const plans = exportOciArchives({
      cwd: '/workspace',
      fsImpl,
      outputDir: 'tmp/oci',
      spawnSync,
    })

    expect(plans).toHaveLength(2)
    expect(fsImpl.mkdirSync).toHaveBeenCalledWith('/workspace/tmp/oci', {
      recursive: true,
    })
    expect(commands).toEqual([
      'podman save --format oci-archive --output tmp/oci/app-runtime.oci.tar localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
      'gzip --force --best tmp/oci/app-runtime.oci.tar',
      'podman save --format oci-archive --output tmp/oci/db-job.oci.tar localhost/kravhantering/db-job:pr-7-99-deadbeef',
      'gzip --force --best tmp/oci/db-job.oci.tar',
    ])
  })

  it('loads archives into isolated Podman stores and checks image IDs', () => {
    const commands = []
    const commandEnvs = []
    const fsImpl = fakeFs()
    const spawnSync = vi.fn((command, args, options) => {
      commands.push(`${command} ${args.join(' ')}`)
      commandEnvs.push(options.env)
      return { status: 0 }
    })
    const execFileSync = vi.fn((command, args) => {
      expect(command).toBe('podman')
      const joinedArgs = args.join(' ')
      return joinedArgs.includes('db-job') ? 'sha256:db-job\n' : 'app-runtime\n'
    })

    const results = verifyOciArchives({
      cwd: '/workspace',
      execFileSync,
      fsImpl,
      outputDir: 'tmp/oci',
      spawnSync,
      verifyRoot: 'tmp/verify-oci',
    })

    expect(results.map(result => result.actualImageId)).toEqual([
      'sha256:app-runtime',
      'sha256:db-job',
    ])
    expect(commands).toEqual([
      'podman --root /workspace/tmp/verify-oci/app-runtime/root --runroot /workspace/tmp/verify-oci/app-runtime/run load --input tmp/oci/app-runtime.oci.tar.gz',
      'podman --root /workspace/tmp/verify-oci/app-runtime/root --runroot /workspace/tmp/verify-oci/app-runtime/run image prune --all --force',
      'podman --root /workspace/tmp/verify-oci/db-job/root --runroot /workspace/tmp/verify-oci/db-job/run load --input tmp/oci/db-job.oci.tar.gz',
      'podman --root /workspace/tmp/verify-oci/db-job/root --runroot /workspace/tmp/verify-oci/db-job/run image prune --all --force',
    ])
    expect(commandEnvs.map(env => env.TMPDIR)).toEqual([
      '/workspace/tmp/verify-oci/app-runtime/tmp',
      '/workspace/tmp/verify-oci/app-runtime/tmp',
      '/workspace/tmp/verify-oci/db-job/tmp',
      '/workspace/tmp/verify-oci/db-job/tmp',
    ])
    expect(commandEnvs.every(env => env.TMP === env.TMPDIR)).toBe(true)
    expect(commandEnvs.every(env => env.TEMP === env.TMPDIR)).toBe(true)
    expect(fsImpl.rmSync).toHaveBeenCalledTimes(2)
    expect(fsImpl.rmSync).toHaveBeenCalledWith(
      '/workspace/tmp/verify-oci/app-runtime',
      { force: true, recursive: true },
    )
    expect(fsImpl.rmSync).toHaveBeenCalledWith(
      '/workspace/tmp/verify-oci/db-job',
      { force: true, recursive: true },
    )
  })

  it('does not let temporary Podman store cleanup failures mask image ID verification', () => {
    const fsImpl = fakeFs()
    const commands = []
    const consoleObj = { info: vi.fn() }
    fsImpl.rmSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES, permission denied'), {
        code: 'EACCES',
      })
    })
    const spawnSync = vi.fn((command, args) => {
      commands.push(`${command} ${args.join(' ')}`)
      return { status: 0 }
    })
    const execFileSync = vi.fn((command, args) => {
      expect(command).toBe('podman')
      const joinedArgs = args.join(' ')
      return joinedArgs.includes('db-job') ? 'sha256:db-job\n' : 'app-runtime\n'
    })

    const results = verifyOciArchives({
      consoleObj,
      cwd: '/workspace',
      execFileSync,
      fsImpl,
      outputDir: 'tmp/oci',
      spawnSync,
    })

    expect(results.map(result => result.actualImageId)).toEqual([
      'sha256:app-runtime',
      'sha256:db-job',
    ])
    expect(commands).toEqual([
      'podman --root /tmp/kh-oci-verify/verify-ci/root --runroot /tmp/kh-oci-verify/verify-ci/run load --input tmp/oci/app-runtime.oci.tar.gz',
      'podman --root /tmp/kh-oci-verify/verify-ci/root --runroot /tmp/kh-oci-verify/verify-ci/run image prune --all --force',
      'podman --root /tmp/kh-oci-verify/verify-ci/root --runroot /tmp/kh-oci-verify/verify-ci/run load --input tmp/oci/db-job.oci.tar.gz',
      'podman --root /tmp/kh-oci-verify/verify-ci/root --runroot /tmp/kh-oci-verify/verify-ci/run image prune --all --force',
    ])
    expect(fsImpl.rmSync).toHaveBeenCalledTimes(2)
    expect(consoleObj.info).toHaveBeenCalledTimes(2)
    expect(consoleObj.info).toHaveBeenCalledWith(
      'Ignoring OCI verification store cleanup failure for /tmp/kh-oci-verify/verify-ci: EACCES, permission denied. Podman may leave rootless storage files that Node cannot remove; the archive verification result is preserved.',
    )
  })

  it('does not let Podman image prune failures mask image ID verification', () => {
    const fsImpl = fakeFs()
    const consoleObj = { info: vi.fn() }
    const spawnSync = vi.fn((command, args) => {
      expect(command).toBe('podman')
      return args.includes('prune') ? { status: 125 } : { status: 0 }
    })
    const execFileSync = vi.fn((command, args) => {
      expect(command).toBe('podman')
      const joinedArgs = args.join(' ')
      return joinedArgs.includes('db-job') ? 'sha256:db-job\n' : 'app-runtime\n'
    })

    const results = verifyOciArchives({
      consoleObj,
      cwd: '/workspace',
      execFileSync,
      fsImpl,
      outputDir: 'tmp/oci',
      spawnSync,
    })

    expect(results.map(result => result.actualImageId)).toEqual([
      'sha256:app-runtime',
      'sha256:db-job',
    ])
    expect(fsImpl.rmSync).toHaveBeenCalledTimes(2)
    expect(consoleObj.info).toHaveBeenCalledTimes(2)
    expect(consoleObj.info).toHaveBeenCalledWith(
      'Ignoring OCI verification Podman image prune failure for /tmp/kh-oci-verify/verify-ci: podman --root /tmp/kh-oci-verify/verify-ci/root --runroot /tmp/kh-oci-verify/verify-ci/run image prune --all --force failed with 125. Node cleanup will still run.',
    )
  })

  it('rejects verification stores whose runroot path exceeds Podman limits', () => {
    expect(() =>
      verifyOciArchives({
        cwd: '/home/runner/work/Kravhantering/Kravhantering',
        execFileSync: () => 'sha256:app-runtime\n',
        fsImpl: fakeFs(),
        outputDir: 'tmp/oci',
        spawnSync: () => ({ status: 0 }),
        verifyRoot: 'tmp/container-oci-verify',
      }),
    ).toThrow('Podman requires 50 or fewer')
  })

  it('fails when an archive image ID does not match the stack lock', () => {
    expect(() =>
      verifyOciArchives({
        cwd: '/workspace',
        execFileSync: () => 'sha256:wrong\n',
        fsImpl: fakeFs(),
        outputDir: 'tmp/oci',
        spawnSync: () => ({ status: 0 }),
        verifyRoot: 'tmp/verify-oci',
      }),
    ).toThrow('image ID sha256:wrong does not match sha256:app-runtime')
  })

  it('keeps the PR workflow fork-safe and artifact-scoped', () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), '.github/workflows/container-pr-smoke.yml'),
      'utf8',
    )
    const stepIndex = stepName => {
      const index = workflow.indexOf(stepName)
      expect(index, `${stepName} should exist in the workflow`).toBeGreaterThan(
        -1,
      )
      return index
    }
    const shellPrefix = '$'
    const runIdExpression = `${shellPrefix}{CONTAINER_STACK_RUN_ID}`
    const githubRunIdExpression = `${shellPrefix}{GITHUB_RUN_ID}`
    const githubWorkspaceExpression = `${shellPrefix}{GITHUB_WORKSPACE}`
    const runnerTempExpression = `${shellPrefix}{RUNNER_TEMP}`
    const verifyRootFallbackExpression = `${shellPrefix}{CONTAINER_STACK_RUN_ID:-${githubRunIdExpression}}`
    const targetExpression = `${shellPrefix}{target}`

    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain('npm install -g npm@latest')
    expect(workflow).toContain('--skip-build')
    expect(workflow).toContain('--prune-docker-after-load')
    expect(workflow).toContain('container:oci:export')
    expect(workflow).toContain(
      'HSA_PERSON_LOOKUP_ADAPTER_IMAGE: localhost/kravhantering/hsa-person-lookup-adapter',
    )
    expect(workflow).toContain(
      'echo "HSA_PERSON_LOOKUP_ADAPTER_SOURCE=pr-build"',
    )
    expect(workflow).toContain(
      `echo "HSA_PERSON_LOOKUP_ADAPTER_TAG=${shellPrefix}{image_tag}"`,
    )
    expect(workflow).toContain(
      `--tag "${shellPrefix}{HSA_PERSON_LOOKUP_ADAPTER_IMAGE}:${shellPrefix}{HSA_PERSON_LOOKUP_ADAPTER_TAG}"`,
    )
    expect(stepIndex('Report initial disk layout')).toBeLessThan(
      stepIndex('Remove unused pre-installed runner toolchains'),
    )
    expect(
      stepIndex('Remove unused pre-installed runner toolchains'),
    ).toBeLessThan(stepIndex('Checkout code'))
    expect(workflow).toContain('/usr/local/lib/android')
    expect(workflow).toContain('/usr/local/.ghcup')
    expect(workflow).toContain('/opt/hostedtoolcache/CodeQL')
    expect(workflow).toContain('/opt/hostedtoolcache/Python')
    expect(workflow).toContain('/usr/share/miniconda')
    expect(workflow).toContain('/usr/share/swift')
    expect(workflow).toContain('/usr/share/dotnet')
    expect(workflow).not.toContain('/opt/hostedtoolcache/node')
    expect(workflow).toContain('docker image prune --all --force')
    expect(workflow).toContain(
      `"${runnerTempExpression}/report-disk-layout.sh" "after runner toolchain cleanup"`,
    )
    expect(stepIndex('Build HSA person lookup adapter image')).toBeLessThan(
      stepIndex('Start container stack'),
    )
    expect(workflow).toContain(
      `cat > "${runnerTempExpression}/report-disk-layout.sh" <<'REPORT_DISK_LAYOUT'`,
    )
    expect(workflow).toContain(
      `verify_root="/tmp/kh-oci-${verifyRootFallbackExpression}"`,
    )
    expect(workflow).toContain('df -hT')
    expect(workflow).toContain('df -ihT')
    expect(workflow).toContain(`findmnt -T "${targetExpression}"`)
    expect(workflow).toContain('docker system df')
    expect(workflow).toContain('podman system df')
    expect(workflow).toContain(
      `"${githubWorkspaceExpression}/tmp/container-pr-artifacts/oci"`,
    )
    expect(workflow).toContain('/var/lib/docker')
    expect(stepIndex('Report OCI export disk layout')).toBeLessThan(
      stepIndex('Export OCI archives'),
    )
    expect(workflow).toContain('after OCI export')
    expect(stepIndex('Report OCI verification disk layout')).toBeLessThan(
      stepIndex('Verify OCI archives'),
    )
    expect(workflow).toContain('after OCI verification')
    expect(workflow).toContain('container:oci:verify')
    expect(workflow).toContain(`--verify-root "/tmp/kh-oci-${runIdExpression}"`)
    expect(workflow).not.toContain('--verify-root tmp/container-oci-verify')
    expect(workflow).toContain('retention-days: 2')
    expect(workflow).toContain('retention-days: 7')
    expect(workflow).not.toContain('pull_request_target')
    expect(workflow).not.toContain('packages: write')
    expect(workflow).not.toContain('ghcr.io')
    expect(workflow).not.toContain('cosign')
    expect(workflow).not.toContain('.env.app.local')
    expect(workflow).not.toContain('container-tls')
  })
})
