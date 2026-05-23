import { describe, expect, it, vi } from 'vitest'
import { parseBuildMetadata, readBuildMetadata } from '@/lib/build-metadata'

const validMetadata = {
  builtAt: '2026-05-21T19:00:00.000Z',
  commitSha: 'abc123',
  imageTag: 'registry.example/app:1.2.3',
  version: '1.2.3',
}

describe('build metadata helper', () => {
  it('parses the public build metadata contract', () => {
    expect(parseBuildMetadata(validMetadata)).toEqual(validMetadata)
  })

  it('rejects incomplete or malformed metadata', () => {
    expect(parseBuildMetadata(null)).toBeNull()
    expect(parseBuildMetadata({ ...validMetadata, version: '' })).toBeNull()
    expect(parseBuildMetadata({ ...validMetadata, builtAt: 123 })).toBeNull()
  })

  it('reads metadata from JSON', () => {
    const fsImpl = {
      readFileSync: vi.fn(() => JSON.stringify(validMetadata)),
    }

    expect(readBuildMetadata('/tmp/build.json', fsImpl)).toEqual(validMetadata)
    expect(fsImpl.readFileSync).toHaveBeenCalledWith('/tmp/build.json', 'utf8')
  })

  it('returns null when metadata is missing or invalid', () => {
    expect(
      readBuildMetadata('/tmp/missing.json', {
        readFileSync: () => {
          throw new Error('missing')
        },
      }),
    ).toBeNull()
    expect(
      readBuildMetadata('/tmp/invalid.json', {
        readFileSync: () => '{',
      }),
    ).toBeNull()
  })
})
