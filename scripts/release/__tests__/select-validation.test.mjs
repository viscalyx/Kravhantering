import { describe, expect, it, vi } from 'vitest'
import {
  changedPathFacts,
  collectSelectionInput,
  evaluateSelectedResults,
  selectionSummary,
} from '../select-validation.mjs'

const env = {
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_EVENT_BEFORE: 'b'.repeat(40),
}
describe('selection script input and reporting', () => {
  it('collects destination renames and deletions without filename quoting', () => {
    const files = changedPathFacts(
      'R100\0app/old.ts\0docs/new guide.md\0D\0app/gone.ts\0A\0app/[locale]/page.tsx\0C100\0from.ts\0to.ts\0',
    )
    expect(files).toEqual([
      { filename: 'docs/new guide.md', status: 'renamed' },
      { filename: 'app/gone.ts', status: 'removed' },
      { filename: 'app/[locale]/page.tsx', status: 'modified' },
      { filename: 'to.ts', status: 'modified' },
    ])
    expect(
      collectSelectionInput({ env, execFileSync: () => 'M\0docs/guide.md\0' })
        .collection.files,
    ).toEqual([{ filename: 'docs/guide.md', status: 'modified' }])
  })
  it.each(['M\0file', 'M\0', 'X\0file\0', 'R100\0from\0'])(
    'rejects incomplete Git output %j',
    value => expect(() => changedPathFacts(value)).toThrow(),
  )
  it('collects the PR merge-base range and keeps the caller source SHA', () => {
    const execFileSync = vi.fn(() => 'M\0app/route.ts\0')
    const result = collectSelectionInput({
      env: {
        ...env,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REF: 'refs/pull/1/merge',
        GITHUB_EVENT_PATH: 'event.json',
      },
      fsImpl: {
        readFileSync: () =>
          JSON.stringify({
            pull_request: { base: { sha: 'base' }, head: { sha: 'head' } },
          }),
      },
      execFileSync,
    })
    expect(result.commitSha).toBe(env.GITHUB_SHA)
    expect(execFileSync.mock.calls[0][1]).toContain('base...head')
  })
  it('handles initial trees, stable tags and explicit dispatch without inferring a main source', () => {
    expect(
      collectSelectionInput({
        env: { ...env, GITHUB_EVENT_BEFORE: '0'.repeat(40) },
        execFileSync: () => 'docs/a.md\0app/page.tsx\0',
      }).collection.files,
    ).toEqual(['docs/a.md', 'app/page.tsx'])
    expect(
      collectSelectionInput({
        env: {
          ...env,
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_EVENT_PATH: 'event.json',
        },
        fsImpl: { readFileSync: () => '{"inputs":{"preview":"true"}}' },
      }).preview,
    ).toBe(true)
    expect(
      collectSelectionInput({ env: { ...env, GITHUB_REF: 'refs/tags/v1.2.3' } })
        .collection.files,
    ).toEqual([])
    expect(
      collectSelectionInput({
        env: { ...env, GITHUB_EVENT_BEFORE: '0'.repeat(40) },
        execFileSync: () => '',
      }).collection.files,
    ).toEqual([])
    expect(() =>
      collectSelectionInput({
        env: { ...env, GITHUB_EVENT_BEFORE: '0'.repeat(40) },
        execFileSync: () => 'truncated',
      }),
    ).toThrow(/Truncated/)
  })
  it('blocks missing endpoints and failed collection', () => {
    expect(() =>
      collectSelectionInput({
        env: { ...env, GITHUB_EVENT_BEFORE: undefined },
      }),
    ).toThrow(/before/)
    expect(() =>
      collectSelectionInput({
        env: { ...env, GITHUB_EVENT_NAME: 'pull_request' },
      }),
    ).toThrow(/endpoints/)
    expect(() =>
      collectSelectionInput({
        env,
        execFileSync: () => {
          throw new Error('Git unavailable')
        },
      }),
    ).toThrow(/unavailable/)
  })
  it('reports policy exclusions and rejects failed, cancelled, skipped or missing selected jobs', () => {
    const selection = {
      owners: ['browser'],
      reasons: {
        browser: 'browser tests',
        runtime: 'Excluded: no applicable path',
      },
      classifications: [
        { path: 'tests/integration/a.spec.ts', category: 'browser tests' },
      ],
      commitSha: env.GITHUB_SHA,
      eventName: 'pull_request',
      ref: 'refs/pull/1/merge',
      releaseEligible: false,
      releaseReason: 'test only',
    }
    expect(selectionSummary(selection)).toContain('runtime: Native skip')
    for (const result of ['failure', 'cancelled', 'skipped', undefined])
      expect(
        evaluateSelectedResults(
          selection,
          { browser: { result } },
          { browser: ['browser'] },
        ).passed,
      ).toBe(false)
    expect(
      evaluateSelectedResults(
        selection,
        { browser: { result: 'success' } },
        { browser: ['browser'] },
      ).passed,
    ).toBe(true)
    expect(evaluateSelectedResults(selection, {}, {}).failures).toContain(
      'Selected owner browser has no result mapping.',
    )
    expect(
      evaluateSelectedResults({ ...selection, owners: [] }, {}, {}).passed,
    ).toBe(true)
  })
})
