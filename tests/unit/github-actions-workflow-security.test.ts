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
})
