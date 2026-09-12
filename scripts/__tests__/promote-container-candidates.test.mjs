import { describe, expect, it, vi } from 'vitest'
import { publicationFixture } from '../release/__tests__/publication-fixture.mjs'
import {
  parseArgs,
  promoteCandidates,
  promotionEntries,
} from '../release/promote-container-candidates.mjs'

function fixture() {
  const context = publicationFixture()
  const metadata = context.metadata
  const remote = new Map()
  const entries = promotionEntries(metadata)
  const writes = []
  const execFileSync = vi.fn((_command, args) => {
    const ref = args.at(-1)
    if (ref.startsWith('oci-archive:'))
      return entries.find(entry => ref === `oci-archive:${entry.artifactPath}`)
        .manifestDigest
    const digest = remote.get(ref.replace('docker://', ''))
    if (!digest) {
      const error = new Error('Command failed: skopeo inspect')
      error.stderr = Buffer.from('manifest unknown')
      throw error
    }
    return digest
  })
  const spawnSync = vi.fn((_command, args) => {
    const tag = args.at(-1).replace('docker://', '')
    writes.push(tag)
    remote.set(
      tag,
      entries.find(
        entry => entry.stagingTag === tag || entry.tags.includes(tag),
      ).manifestDigest,
    )
    return { status: 0 }
  })
  return {
    ...context,
    metadata,
    remote,
    entries,
    writes,
    options: {
      plan: context.plan,
      evidence: context.evidence,
      execFileSync,
      spawnSync,
    },
  }
}
describe('candidate publication', () => {
  it('publishes verified candidates and preserves complete matching publication on rerun', () => {
    const f = fixture()
    expect(promoteCandidates(f.metadata, f.options).promoted).toHaveLength(18)
    expect(f.writes).toHaveLength(24)
    f.writes.length = 0
    expect(
      promoteCandidates(f.metadata, f.options).promoted.every(
        item => item.outcome === 'preserved',
      ),
    ).toBe(true)
    expect(f.writes).toEqual([])
  })
  it('blocks all writes when validation or committed notes are missing', () => {
    const f = fixture()
    f.evidence.notesContent = undefined
    expect(() => promoteCandidates(f.metadata, f.options)).toThrow(/notes/)
    expect(f.writes).toEqual([])
  })
  it('preserves existing material and completes missing stages', () => {
    const f = fixture()
    f.remote.set(f.entries[0].tags[0], f.entries[0].manifestDigest)
    const result = promoteCandidates(f.metadata, f.options)
    expect(result.promoted[0].outcome).toBe('preserved')
    expect(f.writes).toHaveLength(23)
  })
  it('stops on conflicting or unverifiable remote content before writing', () => {
    const f = fixture()
    f.remote.set(f.entries[5].tags[0], 'sha256:different')
    expect(() => promoteCandidates(f.metadata, f.options)).toThrow(
      /Conflicting/,
    )
    expect(f.writes).toEqual([])
    f.options.execFileSync.mockImplementation(() => {
      throw new Error('unauthorized')
    })
    expect(() => promoteCandidates(f.metadata, f.options)).toThrow(
      /unauthorized/,
    )
    expect(f.writes).toEqual([])
  })
  it('observes a successful write despite a failed response', () => {
    const f = fixture()
    const write = f.options.spawnSync.getMockImplementation()
    f.options.spawnSync.mockImplementation((...args) => {
      write(...args)
      return { status: 1 }
    })
    expect(promoteCandidates(f.metadata, f.options).promoted).toHaveLength(18)
    expect(f.writes).toHaveLength(24)
  })
  it('stops after incomplete publication without removing successful stages', () => {
    const f = fixture()
    const write = f.options.spawnSync.getMockImplementation()
    f.options.spawnSync.mockImplementation((...args) =>
      f.writes.length === 2 ? { status: 1 } : write(...args),
    )
    expect(() => promoteCandidates(f.metadata, f.options)).toThrow(/incomplete/)
    expect(f.remote.size).toBe(2)
  })
  it('rejects malformed metadata, local candidates and arguments', () => {
    const f = fixture()
    expect(() => promotionEntries({})).toThrow(/incomplete/)
    f.metadata.appRuntime.tags.push('ghcr.io/other/image:tag')
    expect(() => promotionEntries(f.metadata)).toThrow(/multiple repositories/)
    expect(parseArgs(['--plan', 'plan.json'])).toEqual({ plan: 'plan.json' })
    expect(() => parseArgs(['value'])).toThrow(/Unexpected/)
    expect(() => parseArgs(['--plan'])).toThrow(/Missing/)
    const g = fixture()
    g.options.execFileSync.mockReturnValue('sha256:different')
    expect(() => promoteCandidates(g.metadata, g.options)).toThrow(
      /Candidate content/,
    )
  })
})

it('blocks images when the Git release tag already identifies another source', () => {
  const f = fixture()
  f.evidence.tagSha = 'c'.repeat(40)
  expect(() => promoteCandidates(f.metadata, f.options)).toThrow(
    /tag.*another source/,
  )
  expect(f.writes).toEqual([])
})
it('retains completed image stages in an incomplete-publication report', () => {
  const f = fixture()
  const write = f.options.spawnSync.getMockImplementation()
  f.options.spawnSync.mockImplementation((...args) =>
    f.writes.length === 2 ? { status: 1 } : write(...args),
  )
  try {
    promoteCandidates(f.metadata, f.options)
    expect.fail('Publication should stop')
  } catch (error) {
    expect(error.promotionResult.staged).toHaveLength(2)
    expect(error.promotionResult.promoted).toEqual([])
  }
})

it('blocks unverifiable registry access without treating authorization failure as absence', () => {
  const f = fixture()
  const inspect = f.options.execFileSync.getMockImplementation()
  f.options.execFileSync.mockImplementation((command, args) => {
    if (args.at(-1).startsWith('docker://'))
      throw new Error('authorization denied')
    return inspect(command, args)
  })
  expect(() => promoteCandidates(f.metadata, f.options)).toThrow(
    /Cannot verify.*authorization denied/,
  )
  expect(f.writes).toEqual([])
})
it('reports a failed publisher process without deleting earlier stages', () => {
  const f = fixture()
  f.options.spawnSync.mockReturnValue({ error: new Error('broken pipe') })
  expect(() => promoteCandidates(f.metadata, f.options)).toThrow(
    /incomplete.*broken pipe/,
  )
  expect(f.remote.size).toBe(0)
})
