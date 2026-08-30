import { afterEach, describe, expect, it, vi } from 'vitest'
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
        '1.31.4-alpine',
        'sha256:nginx',
      ),
      service(
        'sqlserver',
        'mcr.microsoft.com/mssql/server',
        '2025-CU8-ubuntu-24.04',
        'sha256:sqlserver',
      ),
      service(
        'keycloak',
        'quay.io/keycloak/keycloak',
        '26.7.2-2',
        'sha256:keycloak',
      ),
    ],
  }
}

function fakeFs(existingArchives = ['.oci.tar.gz']) {
  return {
    existsSync: filePath =>
      existingArchives.some(extension => String(filePath).endsWith(extension)),
    mkdtempSync: vi.fn(() => '/tmp/kh-oci-verify/verify-ci'),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify(stackLock())),
    rmSync: vi.fn(),
  }
}

describe('container OCI archive helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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
    vi.stubEnv('STORAGE_DRIVER', 'runner-defined-driver')
    const fsImpl = fakeFs()
    const commands = []
    const spawnSync = vi.fn((command, args, options) => {
      commands.push(`${command} ${args.join(' ')}`)
      expect(options.env.STORAGE_DRIVER).toBeUndefined()
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
    expect(commandEnvs.every(env => env.STORAGE_DRIVER === 'vfs')).toBe(true)
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

  it('verifies uncompressed Buildx OCI candidate archives', () => {
    const fsImpl = fakeFs(['.oci.tar'])
    const commands = []
    const spawnSync = vi.fn((command, args) => {
      commands.push(`${command} ${args.join(' ')}`)
      return { status: 0 }
    })
    const execFileSync = vi.fn((_command, args) =>
      args.join(' ').includes('db-job')
        ? 'sha256:db-job\n'
        : 'sha256:app-runtime\n',
    )

    const results = verifyOciArchives({
      cwd: '/workspace',
      execFileSync,
      fsImpl,
      outputDir: 'tmp/oci',
      spawnSync,
      verifyRoot: 'tmp/verify-oci',
    })

    expect(results.map(result => result.archivePath)).toEqual([
      'tmp/oci/app-runtime.oci.tar',
      'tmp/oci/db-job.oci.tar',
    ])
    expect(commands[0]).toContain('load --input tmp/oci/app-runtime.oci.tar')
    expect(commands[2]).toContain('load --input tmp/oci/db-job.oci.tar')
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
})
