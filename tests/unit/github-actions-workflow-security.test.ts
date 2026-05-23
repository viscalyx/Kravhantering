import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows')
const FULL_COMMIT_SHA = /^[a-f0-9]{40}$/iu
const USES_LINE = /^\s*uses:\s*([^#\s]+)(?:\s+#\s*(.+))?\s*$/u

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

describe('GitHub Actions workflow security', () => {
  it('pins external actions to commit SHAs with Dependabot-readable version comments', () => {
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
      })
    }

    expect(unpinnedReferences).toEqual([])
  })
})
