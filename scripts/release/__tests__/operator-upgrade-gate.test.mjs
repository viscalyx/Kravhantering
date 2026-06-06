import { describe, expect, it, vi } from 'vitest'
import {
  checkboxState,
  classifyChangedFiles,
  evaluateOperatorUpgradeGate,
  extractOperatorUpgradeNotes,
  formatGateReport,
  main,
  matchesPathPattern,
  parseArgs,
  readPullRequestFromGitHub,
} from '../operator-upgrade-gate.mjs'

const noActionPrBody = `## Operator Upgrade Impact

- [x] <!-- operator-upgrade:reviewed --> Operator upgrade impact is reviewed,
  or explicitly not relevant.
- [x] <!-- operator-upgrade:no-notes --> No operator upgrade notes are needed.

<!-- operator-upgrade:notes start -->
<!-- operator-upgrade:notes end -->

## SSDLC Gate
`

const operatorNotesPrBody = noActionPrBody
  .replace(
    '- [x] <!-- operator-upgrade:no-notes -->',
    '- [ ] <!-- operator-upgrade:no-notes -->',
  )
  .replace(
    '<!-- operator-upgrade:notes start -->\n',
    '<!-- operator-upgrade:notes start -->\nAdded owner HSA-ID pre-upgrade note.\n',
  )

const placeholderPrBody = noActionPrBody
  .replace(
    '- [x] <!-- operator-upgrade:no-notes -->',
    '- [ ] <!-- operator-upgrade:no-notes -->',
  )
  .replace(
    '<!-- operator-upgrade:notes start -->\n',
    '<!-- operator-upgrade:notes start -->\nWrite operator upgrade notes here...\n',
  )

describe('Operator Upgrade gate', () => {
  it('does not require evidence outside migration and required seed paths', () => {
    const result = evaluateOperatorUpgradeGate({
      changedFiles: ['docs/operator-upgrade-notes.md', 'typeorm/seed.mjs'],
      prBody: '',
    })

    expect(result).toMatchObject({
      passed: true,
      requiresGate: false,
    })
    expect(formatGateReport(result)).toBe(
      'Operator Upgrade gate not required: no migration or required seed paths changed.',
    )
  })

  it('classifies only migration and required seed paths', () => {
    expect(
      matchesPathPattern(
        './typeorm/migrations/0026_example.mjs',
        'typeorm/migrations/**',
      ),
    ).toBe(true)
    expect(
      matchesPathPattern('typeorm/seed.mjs', 'typeorm/seed-required.mjs'),
    ).toBe(false)

    const groups = classifyChangedFiles([
      'typeorm/migrations/0026_example.mjs',
      'typeorm/seed-required.mjs',
      'typeorm/seed-runner.mjs',
      'typeorm/seed.mjs',
    ])

    expect(groups).toEqual([
      expect.objectContaining({
        files: [
          'typeorm/migrations/0026_example.mjs',
          'typeorm/seed-required.mjs',
          'typeorm/seed-runner.mjs',
        ],
        id: 'migration-required-seed',
      }),
    ])
  })

  it('parses checkbox states and bounded notes block independently', () => {
    expect(checkboxState(noActionPrBody, 'reviewed')).toBe('checked')
    expect(
      checkboxState(
        noActionPrBody.replace(
          '- [x] <!-- operator-upgrade:no-notes -->',
          '- [ ] <!-- operator-upgrade:no-notes -->',
        ),
        'no-notes',
      ),
    ).toBe('unchecked')
    expect(checkboxState(noActionPrBody, 'unknown')).toBe('missing')
    expect(extractOperatorUpgradeNotes(operatorNotesPrBody)).toContain(
      'Added owner HSA-ID pre-upgrade note.',
    )
    expect(extractOperatorUpgradeNotes(noActionPrBody)).toBe('')
    expect(extractOperatorUpgradeNotes(placeholderPrBody)).toBe(
      'Write operator upgrade notes here...',
    )
  })

  it('fails when scoped changes have no completed PR evidence', () => {
    const result = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/migrations/0026_example.mjs'],
      prBody: '',
    })

    expect(result.passed).toBe(false)
    expect(result.requiresGate).toBe(true)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Missing Operator Upgrade checkbox marker "operator-upgrade:reviewed" in the PR body.',
      ]),
    )
    expect(formatGateReport(result)).toContain(
      'typeorm/migrations/0026_example.mjs',
    )
  })

  it('requires review and either no-notes checkbox or upgrade notes', () => {
    const incompleteBody = noActionPrBody
      .replace(
        '- [x] <!-- operator-upgrade:reviewed -->',
        '- [ ] <!-- operator-upgrade:reviewed -->',
      )
      .replace(
        '- [x] <!-- operator-upgrade:no-notes -->',
        '- [ ] <!-- operator-upgrade:no-notes -->',
      )

    const result = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/seed-required.mjs'],
      prBody: incompleteBody,
    })

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Operator Upgrade checkbox is not checked: Operator upgrade impact is reviewed, or explicitly not relevant.',
        'Operator Upgrade evidence is missing. Check "No operator upgrade notes are needed" or add operator upgrade notes between the operator-upgrade notes markers.',
      ]),
    )
  })

  it('rejects the unchanged operator notes placeholder', () => {
    const result = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/seed-required.mjs'],
      prBody: placeholderPrBody,
    })

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Operator Upgrade notes still contain the default placeholder. Replace it with operator notes, or remove it and check the no-notes checkbox.',
      ]),
    )
  })

  it('accepts operator upgrade notes without a legacy prefix', () => {
    const result = evaluateOperatorUpgradeGate({
      changedFiles: [
        'typeorm/seed-runner.mjs',
        'docs/operator-upgrade-notes.md',
      ],
      prBody: operatorNotesPrBody,
    })

    expect(result.passed).toBe(true)
  })

  it('ignores notes and placeholders when no-notes is checked', () => {
    const notesResult = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/seed-runner.mjs'],
      prBody: operatorNotesPrBody.replace(
        '- [ ] <!-- operator-upgrade:no-notes -->',
        '- [x] <!-- operator-upgrade:no-notes -->',
      ),
    })

    expect(notesResult.passed).toBe(true)
    expect(notesResult.noNotesCheckbox.state).toBe('checked')
    expect(notesResult.notes).toContain('Added owner HSA-ID pre-upgrade note.')

    const placeholderResult = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/seed-runner.mjs'],
      prBody: placeholderPrBody.replace(
        '- [ ] <!-- operator-upgrade:no-notes -->',
        '- [x] <!-- operator-upgrade:no-notes -->',
      ),
    })

    expect(placeholderResult.passed).toBe(true)
    expect(placeholderResult.notes).toBe('Write operator upgrade notes here...')
  })

  it('requires docs changes when operator upgrade notes are provided', () => {
    const missingDocsResult = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/migrations/0026_example.mjs'],
      prBody: operatorNotesPrBody,
    })

    expect(missingDocsResult.passed).toBe(false)
    expect(missingDocsResult.failures).toContain(
      'Operator Upgrade notes are provided, but docs/operator-upgrade-notes.md is not changed.',
    )

    const withDocsResult = evaluateOperatorUpgradeGate({
      changedFiles: [
        'typeorm/migrations/0026_example.mjs',
        'docs/operator-upgrade-notes.md',
      ],
      prBody: operatorNotesPrBody,
    })

    expect(withDocsResult.passed).toBe(true)
  })

  it('passes the no-notes checkbox without operator notes doc changes', () => {
    const result = evaluateOperatorUpgradeGate({
      changedFiles: ['typeorm/seed-required.mjs'],
      prBody: noActionPrBody,
    })

    expect(result.passed).toBe(true)
    expect(result.requiresGate).toBe(true)
    expect(result.noNotesCheckbox.state).toBe('checked')
    expect(result.notes).toBe('')
    expect(formatGateReport(result)).toContain('Operator Upgrade gate passed')
  })

  it('reads pull request body and current plus previous changed paths from GitHub', async () => {
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('/files?per_page=100&page=1')) {
          return [
            {
              filename: 'docs/operator-upgrade-notes.md',
              previous_filename: 'typeorm/migrations/0010_old.mjs',
            },
          ]
        }
        return { body: noActionPrBody }
      },
    }))

    const input = await readPullRequestFromGitHub({
      fetchImpl,
      prNumber: '42',
      repository: 'viscalyx/Kravhantering',
      token: 'token',
    })
    const result = evaluateOperatorUpgradeGate(input)

    expect(input.changedFiles).toEqual([
      'docs/operator-upgrade-notes.md',
      'typeorm/migrations/0010_old.mjs',
    ])
    expect(result.requiresGate).toBe(true)
  })

  it('runs the local CLI path from changed-file and PR-body inputs', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const fsImpl = {
      readFileSync: vi.fn(filePath => {
        if (filePath === 'changed.txt') return 'typeorm/seed-required.mjs\n'
        if (filePath === 'body.md') return noActionPrBody
        throw new Error(`Unexpected file: ${filePath}`)
      }),
    }

    const exitCode = await main(
      ['--changed-files', 'changed.txt', '--pr-body', 'body.md'],
      {
        consoleObj,
        fsImpl,
      },
    )

    expect(exitCode).toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      expect.stringContaining('Operator Upgrade gate passed'),
    )
    expect(consoleObj.error).not.toHaveBeenCalled()
  })

  it('reports CLI help and validation errors', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }

    expect(parseArgs(['--github-pr', '42'])).toEqual({ 'github-pr': '42' })
    expect(() => parseArgs(['unexpected'])).toThrow('Unexpected argument')
    expect(() => parseArgs(['--github-pr'])).toThrow(
      'Missing value for --github-pr.',
    )

    await expect(main(['--help'], { consoleObj })).resolves.toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
    )

    const missingPairExitCode = await main(['--changed-files', 'changed.txt'], {
      consoleObj,
    })
    expect(missingPairExitCode).toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('--changed-files and --pr-body'),
    )
  })
})
