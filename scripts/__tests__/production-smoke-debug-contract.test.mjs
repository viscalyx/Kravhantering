import { describe, expect, it, vi } from 'vitest'
import { waitForSystemd } from '../containers/production-smoke-debug.mjs'
import {
  buildSmokeEnvironment,
  DEFAULT_REPOSITORY,
  debugBaseImageReference,
  describeControllerDelegation,
  parseDebugArgs,
  parseOciImageMetadata,
  selectOciManifest,
  selectRunArtifacts,
  serviceImageReference,
  validateDownloadedArtifactCache,
} from '../containers/production-smoke-debug-contract.mjs'

const digest = character => `sha256:${character.repeat(64)}`

function service(name) {
  return { image: `registry.example/${name}`, name, tag: 'candidate' }
}

describe('production smoke debug contract', () => {
  it('parses the run and lifecycle commands', () => {
    expect(parseDebugArgs(['run', '--run-id', '123'])).toEqual({
      command: 'run',
      repository: DEFAULT_REPOSITORY,
      runId: '123',
    })
    expect(
      parseDebugArgs([
        'run',
        '--repo',
        'fork/Kravhantering',
        '--run-id',
        '456',
      ]),
    ).toEqual({
      command: 'run',
      repository: 'fork/Kravhantering',
      runId: '456',
    })
    for (const command of ['down', 'evidence', 'shell']) {
      expect(parseDebugArgs([command])).toEqual({ command })
    }
    expect(parseDebugArgs(['--help'])).toEqual({ command: 'help' })
  })

  it('rejects invalid command options', () => {
    expect(() => parseDebugArgs([])).toThrow('Expected run')
    expect(() => parseDebugArgs(['run'])).toThrow('numeric --run-id')
    expect(() => parseDebugArgs(['run', '--run-id', 'abc'])).toThrow(
      'numeric --run-id',
    )
    expect(() =>
      parseDebugArgs(['run', '--unknown', 'value', '--run-id', '1']),
    ).toThrow('Invalid run option')
    expect(() =>
      parseDebugArgs(['run', '--run-id', '1', '--repo', 'invalid']),
    ).toThrow('owner/repository')
    expect(() => parseDebugArgs(['down', '--run-id', '1'])).toThrow(
      'does not accept options',
    )
  })

  it('selects the exact, unexpired PR artifacts', () => {
    expect(
      selectRunArtifacts(
        [
          { expired: false, name: 'container-candidate-app-runtime' },
          { expired: false, name: 'production-assembly-evidence' },
          { expired: false, name: 'container-candidate-db-job' },
        ],
        '123',
      ),
    ).toEqual({
      'app-runtime': 'container-candidate-app-runtime',
      'db-job': 'container-candidate-db-job',
      runtime: 'production-assembly-evidence',
    })
    expect(() => selectRunArtifacts([], '123')).toThrow('found 0')
    expect(() =>
      selectRunArtifacts(
        [
          { expired: true, name: 'container-candidate-app-runtime' },
          { expired: false, name: 'production-assembly-evidence' },
        ],
        '123',
      ),
    ).toThrow('has expired')
  })

  it('clears an incomplete downloaded artifact cache', () => {
    const artifactRoot = '/cache/run/artifacts'
    const requiredPaths = [
      '/cache/run/artifacts/oci/app.oci.tar',
      '/cache/run/artifacts/runtime/build.json',
    ]
    const rmSync = vi.fn()
    const completeFs = {
      existsSync: vi.fn(() => true),
      rmSync,
      statSync: vi.fn(() => ({ size: 1 })),
    }
    validateDownloadedArtifactCache({
      artifactRoot,
      fsImpl: completeFs,
      requiredPaths,
    })
    expect(rmSync).not.toHaveBeenCalled()

    const incompleteFs = {
      existsSync: vi.fn(path => path !== requiredPaths[1]),
      rmSync,
      statSync: vi.fn(() => ({ size: 1 })),
    }
    expect(() =>
      validateDownloadedArtifactCache({
        artifactRoot,
        fsImpl: incompleteFs,
        requiredPaths,
      }),
    ).toThrow(`cleared incomplete cache at ${artifactRoot}`)
    expect(rmSync).toHaveBeenCalledWith(artifactRoot, {
      force: true,
      recursive: true,
    })

    expect(() =>
      validateDownloadedArtifactCache({
        artifactRoot,
        fsImpl: {
          existsSync: vi.fn(() => true),
          rmSync,
          statSync: vi.fn(() => ({ size: 0 })),
        },
        requiredPaths,
      }),
    ).toThrow(`Downloaded run artifact is incomplete: ${requiredPaths[0]}`)
  })

  it('uses the image repository and manifest digest from the base lock', () => {
    const lock = {
      image: 'registry.example/devcontainers/base',
      imageId: digest('a'),
      manifestDigest: digest('b'),
      tag: 'ubuntu-24.04',
    }
    expect(debugBaseImageReference(lock)).toBe(`${lock.image}@${digest('b')}`)
    expect(
      debugBaseImageReference({ ...lock, manifestDigest: digest('c') }),
    ).toBe(`${lock.image}@${digest('c')}`)
    expect(() =>
      debugBaseImageReference({ ...lock, manifestDigest: 'latest' }),
    ).toThrow('manifest digest must be a sha256 digest')
    expect(() => debugBaseImageReference({ ...lock, image: '' })).toThrow(
      'must declare an image repository',
    )
  })

  it('waits for logind before probing systemd inside the debug host', () => {
    const runCommand = vi
      .fn()
      .mockReturnValueOnce({ stdout: 'Starting systemd-logind.service...' })
      .mockReturnValueOnce({
        stdout: 'Started systemd-logind.service - User Login Management.',
      })
      .mockReturnValueOnce({ stdout: 'starting' })
      .mockReturnValueOnce({ stdout: 'degraded' })
    const waitAfterFailure = vi.fn()

    waitForSystemd({ runCommand, waitAfterFailure })

    expect(runCommand.mock.calls.map(([, args]) => args[0])).toEqual([
      'logs',
      'logs',
      'exec',
      'exec',
    ])
    expect(waitAfterFailure).toHaveBeenCalledTimes(2)
  })

  it('reports when logind never starts', () => {
    const runCommand = vi.fn(() => ({
      stdout: 'Starting systemd-logind.service...',
    }))
    const waitAfterFailure = vi.fn()
    expect(() => waitForSystemd({ runCommand, waitAfterFailure })).toThrow(
      'did not start systemd-logind.service',
    )
    expect(runCommand.mock.calls.every(([, args]) => args[0] === 'logs')).toBe(
      true,
    )
  })

  it('reports when systemd never reaches a running state after logind starts', () => {
    const runCommand = vi.fn((_, args) => ({
      stdout:
        args[0] === 'logs'
          ? 'Started systemd-logind.service - User Login Management.'
          : 'starting',
    }))
    expect(() =>
      waitForSystemd({
        runCommand,
        waitAfterFailure: vi.fn(),
      }),
    ).toThrow('did not reach a running or degraded systemd state')
  })

  it('identifies every required controller absent from the service cgroup', () => {
    expect(
      describeControllerDelegation({ status: 0, stdout: 'cpu memory pids\n' }),
    ).toBe('')
    expect(
      describeControllerDelegation({
        status: 0,
        stdout: 'cpuset cpu memory\n',
      }),
    ).toBe('Missing service user cgroup controllers: pids.')
    expect(describeControllerDelegation({ status: 0, stdout: '' })).toBe(
      'Missing service user cgroup controllers: cpu, memory, pids.',
    )
  })

  it('reports when delegation cannot be read', () => {
    expect(describeControllerDelegation({ status: 1, stdout: '' })).toBe(
      'Could not read the service user cgroup controllers. Required controllers: cpu, memory, pids.',
    )
  })

  it('reads one runnable OCI image identity', () => {
    const descriptor = {
      annotations: { 'org.opencontainers.image.ref.name': 'image:tag' },
      digest: digest('a'),
      platform: { architecture: 'amd64', os: 'linux' },
    }
    const index = {
      manifests: [
        descriptor,
        {
          annotations: { 'vnd.docker.reference.type': 'attestation-manifest' },
          digest: digest('b'),
          platform: { architecture: 'unknown', os: 'unknown' },
        },
      ],
    }
    expect(selectOciManifest(index)).toBe(descriptor)
    expect(
      parseOciImageMetadata(index, { config: { digest: digest('c') } }),
    ).toEqual({ descriptor, imageId: digest('c'), reference: 'image:tag' })
  })

  it('rejects ambiguous or incomplete OCI metadata', () => {
    expect(() => selectOciManifest({ manifests: [] })).toThrow('found 0')
    expect(() =>
      selectOciManifest({
        manifests: [{ digest: digest('a') }, { digest: digest('b') }],
      }),
    ).toThrow('found 2')
    expect(() =>
      parseOciImageMetadata(
        { manifests: [{ digest: digest('a') }] },
        { config: { digest: digest('b') } },
      ),
    ).toThrow('tagged image reference')
    expect(() =>
      parseOciImageMetadata(
        {
          manifests: [
            {
              annotations: { 'io.containerd.image.name': 'image:tag' },
              digest: digest('a'),
            },
          ],
        },
        { config: { digest: 'invalid' } },
      ),
    ).toThrow('config digest')
  })

  it('builds the exact stack environment', () => {
    const stackLock = {
      services: ['nginx', 'keycloak', 'sqlserver'].map(service),
    }
    const supportLock = { services: [service('kong')] }
    const names = [
      'app-runtime',
      'db-job',
      'demo-seed',
      'hsa-directory-mock',
      'hsa-mtls-provisioner',
      'hsa-person-lookup-adapter',
    ]
    const imageArchives = Object.fromEntries(
      names.map(name => [name, `/artifacts/${name}.tar`]),
    )
    const imageMetadata = Object.fromEntries(
      names.map((name, index) => [
        name,
        { imageId: digest(String(index)), reference: `localhost/${name}:tag` },
      ]),
    )
    const environment = buildSmokeEnvironment({
      evidenceDirectory: '/evidence',
      imageArchives,
      imageMetadata,
      runId: '123',
      stackLock,
      supportLock,
    })
    expect(environment).toMatchObject({
      APP_RUNTIME_IMAGE_ID: digest('0'),
      APP_RUNTIME_IMAGE_REF: 'localhost/app-runtime:tag',
      APP_RUNTIME_OCI_ARCHIVE: '/artifacts/app-runtime.tar',
      DB_JOB_IMAGE_REF: 'localhost/db-job:tag',
      PRODUCTION_SMOKE_SCOPE: 'core',
      KEYCLOAK_IMAGE_REF: 'registry.example/keycloak:candidate',
      PRODUCTION_SMOKE_EVIDENCE_DIR: '/evidence',
      RELEASE_SMOKE_RUN_ID: '123',
    })
    expect(() => serviceImageReference({}, 'nginx')).toThrow('missing')
    expect(() =>
      buildSmokeEnvironment({
        evidenceDirectory: '/evidence',
        imageArchives: {},
        imageMetadata: {},
        runId: '123',
        stackLock,
        supportLock,
      }),
    ).toThrow('incomplete for app-runtime')
  })
})
