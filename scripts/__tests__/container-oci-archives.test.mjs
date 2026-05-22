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

function service(name, image, tag, digest) {
  return {
    digest,
    image,
    name,
    role: name === 'db-job' ? 'database-job' : 'application',
    source: 'pr-build',
    tag,
  }
}

function stackLock() {
  return {
    schemaVersion: 1,
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
        'stable-alpine',
        'sha256:nginx',
      ),
    ],
  }
}

function fakeFs() {
  return {
    existsSync: filePath => String(filePath).endsWith('.oci.tar.gz'),
    mkdtempSync: vi.fn(() => '/workspace/tmp/container-oci-verify/verify-ci'),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify(stackLock())),
    rmSync: vi.fn(),
  }
}

describe('container OCI archive helpers', () => {
  it('plans project image archive paths and parses CLI options', () => {
    const plans = buildArchivePlans(stackLock(), 'tmp/oci')

    expect(parseArgs(['export', '--lock-file', 'lock.json'])).toMatchObject({
      command: 'export',
      lockFile: 'lock.json',
    })
    expect(
      parseArgs(['verify', '--verify-root', 'tmp/container-oci-verify']),
    ).toMatchObject({
      command: 'verify',
      verifyRoot: 'tmp/container-oci-verify',
    })
    expect(archiveFileName('app-runtime')).toBe('app-runtime.oci.tar.gz')
    expect(imageReference(stackLock().services[0])).toBe(
      'localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
    )
    expect(plans).toEqual([
      {
        archivePath: 'tmp/oci/app-runtime.oci.tar.gz',
        digest: 'sha256:app-runtime',
        imageRef: 'localhost/kravhantering/app-runtime:pr-7-99-deadbeef',
        rawArchivePath: 'tmp/oci/app-runtime.oci.tar',
        serviceName: 'app-runtime',
      },
      {
        archivePath: 'tmp/oci/db-job.oci.tar.gz',
        digest: 'sha256:db-job',
        imageRef: 'localhost/kravhantering/db-job:pr-7-99-deadbeef',
        rawArchivePath: 'tmp/oci/db-job.oci.tar',
        serviceName: 'db-job',
      },
    ])
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

  it('loads archives into an isolated Podman store and checks image digests', () => {
    const commands = []
    const fsImpl = fakeFs()
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
      cwd: '/workspace',
      execFileSync,
      fsImpl,
      outputDir: 'tmp/oci',
      spawnSync,
      verifyRoot: 'tmp/verify-oci',
    })

    expect(results.map(result => result.actualDigest)).toEqual([
      'sha256:app-runtime',
      'sha256:db-job',
    ])
    expect(commands).toEqual([
      'podman --root /workspace/tmp/verify-oci/root --runroot /workspace/tmp/verify-oci/run load --input tmp/oci/app-runtime.oci.tar.gz',
      'podman --root /workspace/tmp/verify-oci/root --runroot /workspace/tmp/verify-oci/run load --input tmp/oci/db-job.oci.tar.gz',
    ])
    expect(fsImpl.rmSync).not.toHaveBeenCalled()
  })

  it('does not let temporary Podman store cleanup failures mask digest verification', () => {
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

    expect(results.map(result => result.actualDigest)).toEqual([
      'sha256:app-runtime',
      'sha256:db-job',
    ])
    expect(commands).toEqual([
      'podman --root /workspace/tmp/container-oci-verify/verify-ci/root --runroot /workspace/tmp/container-oci-verify/verify-ci/run load --input tmp/oci/app-runtime.oci.tar.gz',
      'podman --root /workspace/tmp/container-oci-verify/verify-ci/root --runroot /workspace/tmp/container-oci-verify/verify-ci/run load --input tmp/oci/db-job.oci.tar.gz',
    ])
    expect(fsImpl.rmSync).toHaveBeenCalledTimes(2)
    expect(consoleObj.info).toHaveBeenCalledTimes(2)
    expect(consoleObj.info).toHaveBeenCalledWith(
      'Ignoring OCI verification store cleanup failure for /workspace/tmp/container-oci-verify/verify-ci: EACCES, permission denied. Podman may leave rootless storage files that Node cannot remove; the archive verification result is preserved.',
    )
  })

  it('fails when an archive digest does not match the stack lock', () => {
    expect(() =>
      verifyOciArchives({
        cwd: '/workspace',
        execFileSync: () => 'sha256:wrong\n',
        fsImpl: fakeFs(),
        outputDir: 'tmp/oci',
        spawnSync: () => ({ status: 0 }),
        verifyRoot: 'tmp/verify-oci',
      }),
    ).toThrow('does not match sha256:app-runtime')
  })

  it('keeps the PR workflow fork-safe and artifact-scoped', () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), '.github/workflows/container-pr-smoke.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('--skip-build')
    expect(workflow).toContain('container:oci:export')
    expect(workflow).toContain('container:oci:verify')
    expect(workflow).toContain('--verify-root tmp/container-oci-verify')
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
