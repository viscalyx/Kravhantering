import { describe, expect, it, vi } from 'vitest'
import {
  checkboxState,
  evaluateOperatorUpgradeGate,
  extractOperatorUpgradeNotes,
  formatGateReport,
  main,
  parseArgs,
  readPullRequestFromGitHub,
} from '../operator-upgrade-gate.mjs'

const noActionPrBody = `## Operator Upgrade Impact

- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->

<!-- DO NOT REMOVE: operator-upgrade:notes start -->
<!-- DO NOT REMOVE: operator-upgrade:notes end -->

## SSDLC Gate
`

const operatorNotesPrBody = noActionPrBody
  .replace(
    '- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
    '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
  )
  .replace(
    '<!-- DO NOT REMOVE: operator-upgrade:notes start -->\n',
    '<!-- DO NOT REMOVE: operator-upgrade:notes start -->\nAdded owner HSA-id pre-upgrade note.\n',
  )

const placeholderPrBody = noActionPrBody
  .replace(
    '- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
    '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
  )
  .replace(
    '<!-- DO NOT REMOVE: operator-upgrade:notes start -->\n',
    '<!-- DO NOT REMOVE: operator-upgrade:notes start -->\nWrite operator upgrade notes here...\n',
  )

describe('Operator Upgrade gate', () => {
  it('parses checkbox states and bounded notes block independently', () => {
    expect(checkboxState(noActionPrBody, 'no-notes')).toBe('checked')
    expect(
      checkboxState(
        noActionPrBody.replace(
          '- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
          '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
        ),
        'no-notes',
      ),
    ).toBe('unchecked')
    expect(checkboxState(noActionPrBody, 'unknown')).toBe('missing')
    expect(extractOperatorUpgradeNotes(operatorNotesPrBody)).toContain(
      'Added owner HSA-id pre-upgrade note.',
    )
    expect(extractOperatorUpgradeNotes(noActionPrBody)).toBe('')
    expect(extractOperatorUpgradeNotes(placeholderPrBody)).toBe(
      'Write operator upgrade notes here...',
    )
  })

  it('fails when the PR body has no completed operator evidence', () => {
    const result = evaluateOperatorUpgradeGate({
      prBody: '',
    })

    expect(result.passed).toBe(false)
    expect(result.requiresGate).toBe(true)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Missing Operator Upgrade checkbox marker "operator-upgrade:no-notes" in the PR body.',
      ]),
    )
    expect(formatGateReport(result)).toContain(
      'The PR body does not contain completed operator-upgrade evidence.',
    )
  })

  it('requires operator notes when the no-notes checkbox is unchecked', () => {
    const incompleteBody = noActionPrBody.replace(
      '- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
      '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
    )

    const result = evaluateOperatorUpgradeGate({
      prBody: incompleteBody,
    })

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Operator Upgrade evidence is missing. Check "No operator notes needed" or add operator notes between the operator-upgrade notes markers.',
      ]),
    )
  })

  it('rejects the unchanged operator notes placeholder', () => {
    const result = evaluateOperatorUpgradeGate({
      prBody: placeholderPrBody,
    })

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Operator Upgrade notes still contain the default placeholder. Replace it with operator notes, or check "No operator notes needed".',
      ]),
    )
  })

  it('accepts operator upgrade notes without a legacy prefix', () => {
    const result = evaluateOperatorUpgradeGate({
      prBody: operatorNotesPrBody,
    })

    expect(result.passed).toBe(true)
  })

  it('ignores notes and placeholders when no-notes is checked', () => {
    const notesResult = evaluateOperatorUpgradeGate({
      prBody: operatorNotesPrBody.replace(
        '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
        '- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
      ),
    })

    expect(notesResult.passed).toBe(true)
    expect(notesResult.noNotesCheckbox.state).toBe('checked')
    expect(notesResult.notes).toContain('Added owner HSA-id pre-upgrade note.')

    const placeholderResult = evaluateOperatorUpgradeGate({
      prBody: placeholderPrBody.replace(
        '- [ ] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
        '- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->',
      ),
    })

    expect(placeholderResult.passed).toBe(true)
    expect(placeholderResult.notes).toBe('Write operator upgrade notes here...')

    const missingBlockResult = evaluateOperatorUpgradeGate({
      prBody:
        '## Operator Upgrade Impact\n\n- [x] No operator notes needed. <!-- DO NOT REMOVE: operator-upgrade:no-notes -->\n',
    })

    expect(missingBlockResult.passed).toBe(true)
    expect(missingBlockResult.notes).toBe('')
  })

  it('passes the no-notes checkbox', () => {
    const result = evaluateOperatorUpgradeGate({
      prBody: noActionPrBody,
    })

    expect(result.passed).toBe(true)
    expect(result.requiresGate).toBe(true)
    expect(result.noNotesCheckbox.state).toBe('checked')
    expect(result.notes).toBe('')
    expect(formatGateReport(result)).toBe('Operator Upgrade gate passed.')
  })

  it('reads pull request body from GitHub', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ body: noActionPrBody }),
    }))

    const input = await readPullRequestFromGitHub({
      fetchImpl,
      prNumber: '42',
      repository: 'viscalyx/Kravhantering',
      token: 'token',
    })
    const result = evaluateOperatorUpgradeGate(input)

    expect(input).toEqual({ prBody: noActionPrBody })
    expect(result.requiresGate).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('runs the local CLI path from PR-body input', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const fsImpl = {
      readFileSync: vi.fn(filePath => {
        if (filePath === 'body.md') return noActionPrBody
        throw new Error(`Unexpected file: ${filePath}`)
      }),
    }

    const exitCode = await main(['--pr-body', 'body.md'], {
      consoleObj,
      fsImpl,
    })

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

    const changedFilesExitCode = await main(
      ['--changed-files', 'changed.txt'],
      {
        consoleObj,
      },
    )
    expect(changedFilesExitCode).toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('--changed-files is no longer supported'),
    )
  })
})
