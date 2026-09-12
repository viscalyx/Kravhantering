import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  archiveStableOperatorUpgradeNotesContent,
  archiveStableOperatorUpgradeNotesFile,
  meaningfulUnreleasedChange,
  operatorUpgradeSourceEndMarker,
  operatorUpgradeSourceStartMarker,
  parseOperatorUpgradeNotes,
} from '../operator-upgrade-notes.mjs'

const empty = '# Operator Upgrade Notes\n\n## Unreleased\n'
const block = `${operatorUpgradeSourceStartMarker('pr-1')}\nBack up SQL.\n${operatorUpgradeSourceEndMarker('pr-1')}`
const history = '\n## v1.0.0 - 2026-08-01\n\nExisting history.\n'
const source = `${empty}\n${block}\n${history}`
const options = { date: '2026-09-12', version: 'v1.2.3', sourceContent: source }
describe('committed operator-note lifecycle', () => {
  it('renders cumulative Unreleased guidance and preserves the full document', () => {
    const document = `${empty}\nNewer guidance.\n\n${block}\n${history}`
    const parsed = parseOperatorUpgradeNotes(document)
    expect(parsed.content).toBe(document)
    expect(parsed.unreleased).toContain('Newer guidance.')
    expect(parsed.unreleased).toContain('Back up SQL.')
    expect(parsed.history).toBe(history.trimStart())
  })
  it('archives only tagged membership while preserving newer main notes and history', () => {
    const current = source.replace(
      '## Unreleased',
      '## Unreleased\n\nNew main guidance.',
    )
    const result = archiveStableOperatorUpgradeNotesContent(current, options)
    const parsed = parseOperatorUpgradeNotes(result.content)
    expect(parsed.unreleased).toBe('New main guidance.')
    expect(parsed.history).toContain(`## v1.2.3 - 2026-09-12\n\n${block}`)
    expect(parsed.history).toContain(history.trim())
    expect(
      archiveStableOperatorUpgradeNotesContent(result.content, options),
    ).toEqual({
      changed: false,
      content: result.content,
      reason: 'already-archived',
    })
  })
  it('archives plain committed entries without consuming newer text', () => {
    const sourceContent = `${empty}\n### Storage\n\nBack up SQL.\n`
    const result = archiveStableOperatorUpgradeNotesContent(
      sourceContent.replace(
        '## Unreleased',
        '## Unreleased\n\n### Newer\n\nRenew TLS.',
      ),
      { ...options, sourceContent },
    )
    expect(parseOperatorUpgradeNotes(result.content).unreleased).toBe(
      '### Newer\n\nRenew TLS.',
    )
  })
  it('accepts an empty tagged section and blocks changed shipped guidance', () => {
    expect(
      archiveStableOperatorUpgradeNotesContent(source, {
        ...options,
        sourceContent: empty,
      }).reason,
    ).toBe('no-notes')
    expect(() =>
      archiveStableOperatorUpgradeNotesContent(
        source.replace('Back up SQL.', 'Different guidance.'),
        options,
      ),
    ).toThrow(/reconcile/)
    expect(() =>
      archiveStableOperatorUpgradeNotesContent(source, {
        ...options,
        version: 'preview',
      }),
    ).toThrow(/version/)
    expect(() =>
      archiveStableOperatorUpgradeNotesContent(source, {
        ...options,
        date: 'today',
      }),
    ).toThrow(/date/)
  })
  it.each([
    undefined,
    '# Notes',
    `${empty}\n## Unreleased\n`,
    `${empty}\n## Invalid\n`,
    `${empty}\n${operatorUpgradeSourceStartMarker('pr-1')}`,
    `${empty}\n${operatorUpgradeSourceEndMarker('pr-1')}`,
    `${empty}\n${block}\n${block}`,
    empty +
      '\n' +
      operatorUpgradeSourceStartMarker('pr-1') +
      '\n' +
      operatorUpgradeSourceStartMarker('pr-2'),
  ])('rejects malformed source documents %j', document =>
    expect(() => parseOperatorUpgradeNotes(document)).toThrow(),
  )
  it('distinguishes meaningful corrections from whitespace or removal', () => {
    expect(meaningfulUnreleasedChange(empty, source)).toBe(true)
    expect(
      meaningfulUnreleasedChange(
        source,
        source.replace('Back up SQL.', 'Back up\n SQL.'),
      ),
    ).toBe(false)
    expect(meaningfulUnreleasedChange(source, empty)).toBe(false)
  })
  it('writes the complete archival result through the file interface', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-notes-'))
    try {
      const filePath = path.join(dir, 'notes.md')
      fs.writeFileSync(filePath, source)
      const result = archiveStableOperatorUpgradeNotesFile({
        ...options,
        filePath,
      })
      expect(fs.readFileSync(filePath, 'utf8')).toBe(result.content)
      expect(
        archiveStableOperatorUpgradeNotesFile({ ...options, filePath }).changed,
      ).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

it('preserves a new main entry inserted between two tagged entries', () => {
  const first = '### Storage\n\nBack up SQL.'
  const second = '### Identity\n\nRenew TLS.'
  const sourceContent = `${empty}\n${first}\n\n${second}\n`
  const current = sourceContent.replace(
    second,
    `### Newer\n\nCheck the proxy.\n\n${second}`,
  )
  const result = archiveStableOperatorUpgradeNotesContent(current, {
    ...options,
    sourceContent,
  })
  expect(parseOperatorUpgradeNotes(result.content).unreleased).toBe(
    '### Newer\n\nCheck the proxy.',
  )
  expect(parseOperatorUpgradeNotes(result.content).history).toContain(
    `${first}\n\n${second}`,
  )
})

it('requires reconciliation when main expands a shipped entry', () => {
  const sourceContent = `${empty}\n### Storage\n\nBack up SQL.\n\n### Identity\n\nRenew TLS.\n`
  const current = sourceContent.replace(
    'Back up SQL.',
    'Back up SQL. Then stop the app.',
  )
  expect(() =>
    archiveStableOperatorUpgradeNotesContent(current, {
      ...options,
      sourceContent,
    }),
  ).toThrow(/reconcile/)
})
