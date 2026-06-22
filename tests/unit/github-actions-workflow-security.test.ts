import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows')
const FULL_COMMIT_SHA = /^[a-f0-9]{40}$/iu
const USES_LINE = /^\s*uses:\s*([^#\s]+)(?:\s+#\s*(.+))?\s*$/u
const PERSIST_CREDENTIALS_FALSE_LINE =
  /^\s*persist-credentials:\s*['"]?false['"]?(?:\s+#.*)?$/iu

function workflowFiles() {
  return readdirSync(WORKFLOWS_DIR)
    .filter(fileName => /\.(?:ya?ml)$/u.test(fileName))
    .sort()
}

function isLocalOrContainerReference(reference: string) {
  return (
    reference.startsWith('./') ||
    reference.startsWith('../') ||
    reference.startsWith('docker://')
  )
}

function disablesCheckoutCredentialPersistence(
  lines: string[],
  usesLineIndex: number,
) {
  const usesLineIndent = lines[usesLineIndex].search(/\S/u)

  for (
    let lineIndex = usesLineIndex + 1;
    lineIndex < lines.length;
    lineIndex += 1
  ) {
    const line = lines[lineIndex]
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    if (line.search(/\S/u) < usesLineIndent) return false
    if (PERSIST_CREDENTIALS_FALSE_LINE.test(line)) return true
  }

  return false
}

describe('GitHub Actions workflow security', () => {
  it('pins external actions and hardens checkout credentials', () => {
    const unpinnedReferences: string[] = []

    for (const fileName of workflowFiles()) {
      const relativePath = path.join('.github', 'workflows', fileName)
      const lines = readFileSync(
        path.join(WORKFLOWS_DIR, fileName),
        'utf8',
      ).split(/\r?\n/u)

      lines.forEach((line, index) => {
        if (line.trimStart().startsWith('#')) return
        const match = line.match(USES_LINE)
        const reference = match?.[1]
        if (!reference || isLocalOrContainerReference(reference)) return

        const refSeparatorIndex = reference.lastIndexOf('@')
        const ref =
          refSeparatorIndex === -1
            ? undefined
            : reference.slice(refSeparatorIndex + 1)
        const versionComment = match[2]?.trim()

        if (!ref || !FULL_COMMIT_SHA.test(ref) || !versionComment) {
          unpinnedReferences.push(`${relativePath}:${index + 1} ${reference}`)
        }

        if (
          reference.startsWith('actions/checkout') &&
          !disablesCheckoutCredentialPersistence(lines, index)
        ) {
          unpinnedReferences.push(
            `${relativePath}:${index + 1} ${reference} missing persist-credentials: false`,
          )
        }
      })
    }

    expect(unpinnedReferences).toEqual([])
  })

  it('keeps the fork-compatible SSDLC gate on trusted base code', () => {
    const workflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'ssdlc-gate.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request_target:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain(
      ['ref: $', '{{ github.event.pull_request.base.sha }}'].join(''),
    )
    expect(workflow).not.toMatch(/github\.event\.pull_request\.head/iu)
    expect(workflow).not.toMatch(/\bgithub\.head_ref\b/iu)
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|run)\b/iu)
  })

  it('keeps the fork-compatible operator upgrade gate on trusted base code', () => {
    const workflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'operator-upgrade-gate.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request_target:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain(
      ['ref: $', '{{ github.event.pull_request.base.sha }}'].join(''),
    )
    expect(workflow).toContain(
      'node scripts/release/operator-upgrade-gate.mjs --github-pr',
    )
    expect(workflow).not.toMatch(/github\.event\.pull_request\.head/iu)
    expect(workflow).not.toMatch(/\bgithub\.head_ref\b/iu)
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|run)\b/iu)
  })

  it('keeps merged PR operator notes persistence on trusted main code', () => {
    const workflow = readFileSync(
      path.join(WORKFLOWS_DIR, 'operator-upgrade-notes.yml'),
      'utf8',
    )

    expect(workflow).toContain('pull_request_target:')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('types: [closed]')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain('if: github.event.pull_request.merged == true')
    expect(workflow).toContain('ref: main')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain(
      'node scripts/release/operator-upgrade-notes.mjs sync-pr --github-pr',
    )
    expect(workflow).toContain(
      'git diff --quiet -- "docs/operations/operator-upgrade-notes.md"',
    )
    expect(workflow).not.toMatch(/github\.event\.pull_request\.head/iu)
    expect(workflow).not.toMatch(/\bgithub\.head_ref\b/iu)
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|run)\b/iu)
  })
})
