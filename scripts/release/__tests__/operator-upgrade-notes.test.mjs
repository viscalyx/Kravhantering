import { describe, expect, it, vi } from 'vitest'
import { extractUnreleasedOperatorUpgradeNotes } from '../container-release.mjs'
import {
  addPullRequestNotesToContent,
  archiveStableOperatorUpgradeNotesContent,
  main,
  operatorUpgradeSourceEndMarker,
  operatorUpgradeSourceStartMarker,
  readPullRequestsForCommitFromGitHub,
  stripOperatorUpgradeSourceMarkers,
  syncPullRequestNotesFile,
} from '../operator-upgrade-notes.mjs'

const operatorNotesPath = 'docs/operations/operator-upgrade-notes.md'

const baseNotes = `# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering.

## Unreleased
`

const noActionPrBody = `## Operator Upgrade Impact

- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->

<!-- DO NOT REMOVE: operator-upgrade:notes start -->
<!-- DO NOT REMOVE: operator-upgrade:notes end -->
`

const operatorNotesPrBody = `## Operator Upgrade Impact

- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->

<!-- DO NOT REMOVE: operator-upgrade:notes start -->
### Topology changes

Keep production HSA lookup pointed at the approved facade.
<!-- DO NOT REMOVE: operator-upgrade:notes end -->
`

const placeholderPrBody = operatorNotesPrBody.replace(
  '### Topology changes\n\nKeep production HSA lookup pointed at the approved facade.',
  'Write operator upgrade notes here...',
)

describe('operator upgrade notes lifecycle', () => {
  it('appends PR operator notes under Unreleased with source markers', () => {
    const result = addPullRequestNotesToContent(baseNotes, {
      filePath: operatorNotesPath,
      prBody: operatorNotesPrBody,
      prNumber: '318',
    })

    expect(result.changed).toBe(true)
    expect(result.reason).toBe('synced')
    expect(result.content).toContain(operatorUpgradeSourceStartMarker('pr-318'))
    expect(result.content).toContain(
      'Keep production HSA lookup pointed at the approved facade.',
    )
    expect(result.content).toContain(operatorUpgradeSourceEndMarker('pr-318'))
  })

  it('does nothing when the PR explicitly needs no operator notes', () => {
    const result = addPullRequestNotesToContent(baseNotes, {
      filePath: operatorNotesPath,
      prBody: noActionPrBody,
      prNumber: '319',
    })

    expect(result).toEqual({
      changed: false,
      content: baseNotes,
      reason: 'no-notes',
    })
  })

  it('rejects placeholder or invalid operator evidence', () => {
    expect(() =>
      addPullRequestNotesToContent(baseNotes, {
        filePath: operatorNotesPath,
        prBody: placeholderPrBody,
        prNumber: '320',
      }),
    ).toThrow('Operator Upgrade gate failed')

    expect(() =>
      addPullRequestNotesToContent(baseNotes, {
        filePath: operatorNotesPath,
        prBody: '',
        prNumber: '321',
      }),
    ).toThrow('Missing Operator Upgrade checkbox marker')
  })

  it('does not duplicate notes for the same PR source marker', () => {
    const first = addPullRequestNotesToContent(baseNotes, {
      filePath: operatorNotesPath,
      prBody: operatorNotesPrBody,
      prNumber: '318',
    })
    const second = addPullRequestNotesToContent(first.content, {
      filePath: operatorNotesPath,
      prBody: operatorNotesPrBody,
      prNumber: '318',
    })

    expect(second).toEqual({
      changed: false,
      content: first.content,
      reason: 'already-synced',
    })
  })

  it('archives stable-release notes and leaves Unreleased empty', () => {
    const synced = addPullRequestNotesToContent(baseNotes, {
      filePath: operatorNotesPath,
      prBody: operatorNotesPrBody,
      prNumber: '318',
    })
    const archived = archiveStableOperatorUpgradeNotesContent(synced.content, {
      date: '2026-06-14',
      filePath: operatorNotesPath,
      version: 'v1.0.0',
    })

    expect(archived.changed).toBe(true)
    expect(archived.reason).toBe('archived')
    expect(archived.content).toContain(
      '## Unreleased\n\n## v1.0.0 - 2026-06-14',
    )
    expect(archived.content).toContain(
      operatorUpgradeSourceStartMarker('pr-318'),
    )
    expect(
      extractUnreleasedOperatorUpgradeNotes(
        archived.content,
        operatorNotesPath,
      ),
    ).toBeUndefined()
  })

  it('does not duplicate an existing stable archive', () => {
    const archivedContent = `${baseNotes}
## v1.0.0 - 2026-06-14

### Existing note

Already archived.
`
    const result = archiveStableOperatorUpgradeNotesContent(archivedContent, {
      date: '2026-06-14',
      filePath: operatorNotesPath,
      version: 'v1.0.0',
    })

    expect(result).toEqual({
      changed: false,
      content: archivedContent,
      reason: 'already-archived',
    })
  })

  it('does not expose archived stable notes to later preview release notes', () => {
    const content = `${baseNotes}
## v1.0.0 - 2026-06-14

### Stable-only note

Do not carry forward.
`

    expect(
      extractUnreleasedOperatorUpgradeNotes(content, operatorNotesPath),
    ).toBeUndefined()
  })

  it('strips source markers from release-note output only', () => {
    const synced = addPullRequestNotesToContent(baseNotes, {
      filePath: operatorNotesPath,
      prBody: operatorNotesPrBody,
      prNumber: '318',
    })

    expect(stripOperatorUpgradeSourceMarkers(synced.content)).not.toContain(
      'operator-upgrade:source',
    )
    expect(
      extractUnreleasedOperatorUpgradeNotes(synced.content, operatorNotesPath),
    ).not.toContain('operator-upgrade:source')
  })

  it('writes synced notes through the file helper', () => {
    let fileContent = baseNotes
    const fsImpl = {
      readFileSync: vi.fn(() => fileContent),
      writeFileSync: vi.fn((filePath, content) => {
        expect(filePath).toBe(operatorNotesPath)
        fileContent = content
      }),
    }

    const result = syncPullRequestNotesFile({
      filePath: operatorNotesPath,
      fsImpl,
      prBody: operatorNotesPrBody,
      prNumber: '318',
    })

    expect(result.changed).toBe(true)
    expect(fileContent).toContain('operator-upgrade:source pr-318 start')
  })

  it('runs sync-pr from GitHub PR body input', async () => {
    let fileContent = baseNotes
    const consoleObj = { error: vi.fn(), log: vi.fn(), warn: vi.fn() }
    const fsImpl = {
      readFileSync: vi.fn(() => fileContent),
      writeFileSync: vi.fn((_filePath, content) => {
        fileContent = content
      }),
    }
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ body: operatorNotesPrBody }),
      ok: true,
      status: 200,
    }))

    const exitCode = await main(['sync-pr', '--github-pr', '318'], {
      consoleObj,
      env: {
        GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
        GITHUB_TOKEN: 'token',
      },
      fetchImpl,
      fsImpl,
    })

    expect(exitCode).toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      'Operator upgrade notes updated (synced).',
    )
    expect(fileContent).toContain('operator-upgrade:source pr-318 start')
  })

  it('passes an abort signal to GitHub commit pull request lookups', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => [{ number: 318 }],
      ok: true,
      status: 200,
    }))

    await expect(
      readPullRequestsForCommitFromGitHub({
        commit: 'abc123',
        fetchImpl,
        repository: 'viscalyx/Kravhantering',
        token: 'token',
      }),
    ).resolves.toEqual([{ number: 318 }])

    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init?.headers).toMatchObject({
      accept: 'application/vnd.github+json',
      authorization: 'Bearer token',
      'user-agent': 'kravhantering-operator-upgrade-notes',
      'x-github-api-version': '2022-11-28',
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.signal.aborted).toBe(false)
  })

  it('aborts GitHub commit pull request lookups after the timeout', async () => {
    vi.useFakeTimers()
    try {
      let signal
      const fetchImpl = vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            signal = init.signal
            init.signal.addEventListener('abort', () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }),
      )

      const lookup = readPullRequestsForCommitFromGitHub({
        commit: 'abc123',
        fetchImpl,
        repository: 'viscalyx/Kravhantering',
        token: 'token',
      })
      const expectation = expect(lookup).rejects.toThrow(
        'GitHub API request timed out after 30000 ms',
      )

      await vi.advanceTimersByTimeAsync(30_000)

      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal.aborted).toBe(true)
      await expectation
    } finally {
      vi.useRealTimers()
    }
  })
})
