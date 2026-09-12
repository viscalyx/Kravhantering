import { describe, expect, it } from 'vitest'
import { evaluateOperatorUpgradeGate } from '../operator-upgrade-gate.mjs'

const document =
  '# Operator Upgrade Notes\n\n## Unreleased\n\nBack up the database.\n'
const declaration = id =>
  `- [x] ${id === 'updated' ? 'Operator notes updated' : 'No operator notes needed'} <!-- operator-upgrade:${id} -->`
describe('committed operator-note declaration', () => {
  it('accepts a meaningful committed correction under Unreleased', () => {
    expect(
      evaluateOperatorUpgradeGate({
        prBody: declaration('updated'),
        baseNotes: document,
        headNotes: document.replace('database.', 'database and keyring.'),
      }).passed,
    ).toBe(true)
  })
  it('requires exactly one declaration for every author', () => {
    for (const prBody of [
      '',
      `${declaration('updated')}\n${declaration('no-notes')}`,
      `${declaration('no-notes')}\n${declaration('no-notes')}`,
    ]) {
      expect(
        evaluateOperatorUpgradeGate({
          prBody,
          baseNotes: document,
          headNotes: document,
        }).passed,
      ).toBe(false)
    }
  })
  it('rejects formatting-only changes and deletions as updated notes', () => {
    for (const headNotes of [
      document,
      document.replace('the database', 'the\n database'),
      document.replace('Back up the database.', ''),
    ]) {
      expect(
        evaluateOperatorUpgradeGate({
          prBody: declaration('updated'),
          baseNotes: document,
          headNotes,
        }).passed,
      ).toBe(false)
    }
  })
  it('validates committed structure even when no new notes are needed', () => {
    for (const headNotes of [
      undefined,
      '# Notes',
      `${document}\n## Unreleased\n`,
    ]) {
      expect(
        evaluateOperatorUpgradeGate({
          prBody: declaration('no-notes'),
          baseNotes: document,
          headNotes,
        }).passed,
      ).toBe(false)
    }
    expect(
      evaluateOperatorUpgradeGate({
        prBody: declaration('no-notes'),
        headNotes: '# Notes\n\n## Unreleased\n',
      }).passed,
    ).toBe(true)
  })
})

import { vi } from 'vitest'
import {
  formatGateReport,
  main,
  parseArgs,
  readPullRequestFromGitHub,
} from '../operator-upgrade-gate.mjs'

describe('operator gate script boundary', () => {
  const env = {
    GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
    GITHUB_TOKEN: 'test',
    PR_NUMBER: '1',
  }
  const consoleObj = { log: vi.fn(), error: vi.fn() }
  const pr = {
    body: declaration('no-notes'),
    base: { sha: 'a'.repeat(40) },
    head: {
      sha: 'b'.repeat(40),
      repo: { full_name: 'contributor/Kravhantering' },
    },
  }
  it('reads the declaration and both exact committed documents without executing PR code', async () => {
    const urls = []
    const fetchImpl = vi.fn(async url => {
      urls.push(url)
      return {
        ok: true,
        json: async () =>
          url.includes('/pulls/')
            ? pr
            : {
                encoding: 'base64',
                content: Buffer.from(document).toString('base64'),
              },
      }
    })
    expect(await main([], { env, consoleObj, fetchImpl })).toBe(0)
    expect(urls[1]).toContain(
      `viscalyx/Kravhantering/contents/docs/operations/operator-upgrade-notes.md?ref=${pr.base.sha}`,
    )
    expect(urls[2]).toContain(
      `contributor/Kravhantering/contents/docs/operations/operator-upgrade-notes.md?ref=${pr.head.sha}`,
    )
  })
  it('reports invalid declarations and missing or malformed remote documents', async () => {
    for (const response of [
      { ok: false, status: 404 },
      { ok: true, json: async () => ({ encoding: 'none' }) },
    ]) {
      const fetchImpl = vi.fn(async url =>
        url.includes('/pulls/') ? { ok: true, json: async () => pr } : response,
      )
      expect(
        await main(['--github-pr', '1'], { env, consoleObj, fetchImpl }),
      ).toBe(1)
    }
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      json: async () =>
        url.includes('/pulls/')
          ? { ...pr, body: undefined }
          : {
              encoding: 'base64',
              content: Buffer.from(document).toString('base64'),
            },
    }))
    expect(
      await main(['--github-pr', '1'], { env, consoleObj, fetchImpl }),
    ).toBe(1)
    expect(
      formatGateReport({ passed: false, failures: ['incomplete'] }),
    ).toContain('incomplete')
  })
  it('supports local input, help and useful argument errors', async () => {
    const fsImpl = {
      readFileSync: file =>
        file === 'pr.md'
          ? declaration('updated')
          : file === 'head.md'
            ? document.replace('database.', 'database and keyring.')
            : document,
    }
    expect(
      await main(
        [
          '--pr-body',
          'pr.md',
          '--base-notes',
          'base.md',
          '--head-notes',
          'head.md',
        ],
        { env: {}, consoleObj, fsImpl },
      ),
    ).toBe(0)
    expect(await main(['--help'], { consoleObj })).toBe(0)
    expect(await main(['--unknown', 'file'], { consoleObj })).toBe(1)
    expect(parseArgs(['-h'])).toEqual({ help: true })
    expect(() => parseArgs(['--pr-body'])).toThrow(/Missing/)
    expect(() => parseArgs(['file'])).toThrow(/Unexpected/)
  })
  it.each([
    { repository: '' },
    { token: '' },
    { prNumber: '' },
    { repository: 'invalid' },
  ])('rejects missing API inputs %j', async override => {
    await expect(
      readPullRequestFromGitHub({
        repository: env.GITHUB_REPOSITORY,
        token: 'test',
        prNumber: '1',
        ...override,
      }),
    ).rejects.toThrow()
  })
})

it.each([
  ['* Restart the service.', '- Restart the service.'],
  ['- Restart the service.', '1. Restart the service.'],
  [
    'See https://example.test.',
    'See [https://example.test](https://example.test).',
  ],
  ['**Back up SQL.**', 'Back up SQL.'],
])('rejects equivalent Markdown formatting from %s to %s', (before, after) => {
  expect(
    evaluateOperatorUpgradeGate({
      prBody: declaration('updated'),
      baseNotes: `# Notes\n\n## Unreleased\n\n${before}\n`,
      headNotes: `# Notes\n\n## Unreleased\n\n${after}\n`,
    }).passed,
  ).toBe(false)
})
