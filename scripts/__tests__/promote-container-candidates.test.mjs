import { describe, expect, it, vi } from 'vitest'
import {
  parseArgs,
  promoteCandidates,
  promotionEntries,
} from '../release/promote-container-candidates.mjs'

function image(name, digest = `sha256:${name}`) {
  return {
    candidate: {
      artifactPath: `candidates/${name}.oci.tar`,
      manifestDigest: digest,
    },
    manifestDigest: digest,
    tags: [`ghcr.io/viscalyx/${name}:1.2.3`],
  }
}

function metadata() {
  return {
    appRuntime: image('app-runtime'),
    dbJob: image('db-job'),
    demoSeed: image('demo-seed'),
    hsaIntegrationSupport: {
      hsaPersonLookupAdapter: image('hsa-person-lookup-adapter'),
    },
    testSupport: {
      hsaDirectoryMock: image('hsa-directory-mock'),
    },
  }
}

describe('container candidate promotion', () => {
  it('parses promotion CLI options and rejects malformed arguments', () => {
    expect(
      parseArgs([
        '--metadata',
        'release-metadata.json',
        '--output',
        'promotion-result.json',
      ]),
    ).toEqual({
      metadata: 'release-metadata.json',
      output: 'promotion-result.json',
    })
    expect(() => parseArgs(['metadata.json'])).toThrow('Unexpected argument')
    expect(() => parseArgs(['--metadata'])).toThrow(
      'Missing value for --metadata',
    )
  })

  it('verifies every staged image before applying final release tags', () => {
    const commands = []
    const entries = promotionEntries(metadata())
    const result = promoteCandidates(metadata(), {
      execFileSync: vi.fn((_command, args) => {
        const tag = args.at(-1).replace('docker://', '')
        return `${
          entries.find(
            entry => entry.stagingTag === tag || entry.tags.includes(tag),
          ).manifestDigest
        }\n`
      }),
      spawnSync: vi.fn((command, args) => {
        commands.push(`${command} ${args.join(' ')}`)
        return { status: 0 }
      }),
    })

    expect(result.staged).toHaveLength(5)
    expect(result.promoted).toHaveLength(5)
    expect(commands).toHaveLength(10)
    expect(commands[0]).toContain(
      'skopeo copy --all --preserve-digests --retry-times 3 oci-archive:candidates/app-runtime.oci.tar docker://ghcr.io/viscalyx/app-runtime:candidate-sha256-app-runtime',
    )
    expect(commands[4]).toContain(
      'oci-archive:candidates/hsa-person-lookup-adapter.oci.tar docker://ghcr.io/viscalyx/hsa-person-lookup-adapter:candidate-sha256-hsa-person-lookup-adapter',
    )
    expect(commands[5]).toContain(
      'docker://ghcr.io/viscalyx/app-runtime:candidate-sha256-app-runtime docker://ghcr.io/viscalyx/app-runtime:1.2.3',
    )
  })

  it('applies no release tag when a staged digest does not match', () => {
    const spawnSync = vi.fn(() => ({ status: 0 }))
    expect(() =>
      promoteCandidates(metadata(), {
        execFileSync: vi.fn(() => 'sha256:unexpected\n'),
        spawnSync,
      }),
    ).toThrow('Staged digest mismatch')
    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(
      spawnSync.mock.calls.some(([_command, args]) =>
        args.at(-1).endsWith(':1.2.3'),
      ),
    ).toBe(false)
  })

  it('stops final tagging when a promoted digest does not match', () => {
    const entries = promotionEntries(metadata())
    const spawnSync = vi.fn(() => ({ status: 0 }))
    expect(() =>
      promoteCandidates(metadata(), {
        execFileSync: vi.fn((_command, args) => {
          const tag = args.at(-1).replace('docker://', '')
          const entry = entries.find(
            candidate =>
              candidate.stagingTag === tag || candidate.tags.includes(tag),
          )
          return tag.endsWith(':1.2.3')
            ? 'sha256:unexpected\n'
            : `${entry.manifestDigest}\n`
        }),
        spawnSync,
      }),
    ).toThrow('Published digest mismatch')
    expect(spawnSync).toHaveBeenCalledTimes(6)
  })

  it('rejects metadata whose candidate and release digests differ', () => {
    const invalid = metadata()
    invalid.appRuntime.candidate.manifestDigest = 'sha256:different'

    expect(() => promotionEntries(invalid)).toThrow(
      'Release metadata is incomplete for app-runtime',
    )
  })

  it('rejects release tags that do not name one repository', () => {
    const invalidTag = metadata()
    invalidTag.appRuntime.tags = ['ghcr.io/viscalyx/app-runtime']
    expect(() => promotionEntries(invalidTag)).toThrow(
      'Promoted image reference must include a tag',
    )

    const multipleRepositories = metadata()
    multipleRepositories.appRuntime.tags.push(
      'ghcr.io/viscalyx/other-app-runtime:latest',
    )
    expect(() => promotionEntries(multipleRepositories)).toThrow(
      'Release tags span multiple repositories for app-runtime',
    )
  })

  it('propagates a failed Skopeo process before digest inspection', () => {
    const execFileSync = vi.fn()
    expect(() =>
      promoteCandidates(metadata(), {
        execFileSync,
        spawnSync: vi.fn(() => ({
          error: new Error('unable to start Skopeo'),
        })),
      }),
    ).toThrow('unable to start Skopeo')
    expect(execFileSync).not.toHaveBeenCalled()
  })
})
