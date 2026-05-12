import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Privacy guardrail: do not relax, skip, allowlist, or narrow this test to make
// UI/report code pass. If it fails, update rendering code to use
// '@/lib/privacy/display-name'. Intentional guardrail changes require explicit
// privacy review and the CI override label described in .github/workflows.

const rootDir = process.cwd()
const actorFieldPattern =
  /(?:\.(?:createdBy|decidedBy|resolvedBy|ownerName|firstName|lastName|displayName)\b)/
const formattedActorRenderPattern =
  /\b(?:formatActorDisplayName(?:ForLocale)?|format[A-Z]\w*Name)\s*\(/
const localeDisplayNameImportPattern =
  /import\s*\{[^}]*\bformatActorDisplayNameForLocale\b[^}]*\}\s*from ['"]@\/lib\/privacy\/display-name['"]/

function listFiles(dir: string, extensions: Set<string>): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap(entry => {
    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return listFiles(absolutePath, extensions)
    }
    return extensions.has(path.extname(entry.name)) ? [absolutePath] : []
  })
}

function relativePath(filePath: string): string {
  return path.relative(rootDir, filePath)
}

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8')
}

const uiSurfaceFiles = [
  ...listFiles(path.join(rootDir, 'app'), new Set(['.tsx'])),
  ...listFiles(path.join(rootDir, 'components'), new Set(['.tsx'])),
]

const reportRendererFiles = listFiles(
  path.join(rootDir, 'components/reports'),
  new Set(['.tsx']),
)

describe('privacy display-name enforcement', () => {
  it('does not expose the internal deleted-user sentinel in UI source', () => {
    const offenders = uiSurfaceFiles.flatMap(filePath => {
      const source = readSource(filePath)
      const matches = [
        ...source.matchAll(/(['"`])no-user\1|\bDELETED_USER_INTERNAL_NAME\b/g),
      ]
      return matches.map(match => `${relativePath(filePath)}: ${match[0]}`)
    })

    expect(offenders).toEqual([])
  })

  it('formats report actor fields through the locale-aware privacy helper', () => {
    const offenders = reportRendererFiles.flatMap(filePath => {
      const source = readSource(filePath)
      if (!actorFieldPattern.test(source)) return []

      const hasLocaleHelperImport = localeDisplayNameImportPattern.test(source)
      const unformattedLines = source
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(
          ({ line }) =>
            actorFieldPattern.test(line) &&
            !line.includes('formatActorDisplayNameForLocale('),
        )

      if (hasLocaleHelperImport && unformattedLines.length === 0) return []

      return [
        `${relativePath(filePath)}: actor display fields must be passed through formatActorDisplayNameForLocale(value, locale)`,
        ...unformattedLines.map(
          ({ line, number }) =>
            `${relativePath(filePath)}:${number}: ${line.trim()}`,
        ),
      ]
    })

    expect(offenders).toEqual([])
  })

  it('rejects direct visible actor field rendering', () => {
    const visibleActorRenderPatterns = [
      /render:\s*[^=\n]+=>[^\n]*(?:\.(?:ownerName|firstName|lastName|createdBy|decidedBy|resolvedBy|displayName)\b)/g,
      />\s*\{[^}\n]*\.(?:ownerName|firstName|lastName|createdBy|decidedBy|resolvedBy|displayName)\b[^}\n]*\}/g,
      /<option[\s\S]*?>[\s\S]{0,240}\{[^}]*\.(?:ownerName|firstName|lastName)\b[^}]*\}[\s\S]{0,240}<\/option>/g,
    ]

    const offenders = uiSurfaceFiles.flatMap(filePath => {
      const source = readSource(filePath)
      return visibleActorRenderPatterns.flatMap(pattern =>
        [...source.matchAll(pattern)]
          .filter(match => !formattedActorRenderPattern.test(match[0]))
          .map(
            match =>
              `${relativePath(filePath)}: visible actor fields must be formatted before rendering: ${match[0].trim()}`,
          ),
      )
    })

    expect(offenders).toEqual([])
  })
})
