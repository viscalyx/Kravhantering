import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MUTATING_EXPORT =
  /\bexport\s+(?:(?:async\s+)?function|const)\s+(POST|PUT|PATCH|DELETE)\b/
const DIRECT_MUTATING_EXPORT =
  /\bexport\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/

const documentedExceptions = new Set(['app/api/mcp/route.ts'])

async function routeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(entry => {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return routeFiles(entryPath)
      return entry.name === 'route.ts' ? [entryPath] : []
    }),
  )
  return files.flat()
}

function relativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join('/')
}

describe('secure mutation route coverage', () => {
  it('wraps all app-owned mutating REST routes', async () => {
    const files = await routeFiles(path.join(process.cwd(), 'app/api'))
    const violations: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (!MUTATING_EXPORT.test(source)) continue

      const relative = relativePath(file)
      if (documentedExceptions.has(relative)) continue

      if (
        !source.includes('secureMutationRoute') &&
        !source.includes('secureLogoutMutationRoute')
      ) {
        violations.push(`${relative}: missing secure mutation wrapper`)
      }
      if (DIRECT_MUTATING_EXPORT.test(source)) {
        violations.push(`${relative}: direct mutating export`)
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps MCP as the only direct mutating export exception', async () => {
    const files = await routeFiles(path.join(process.cwd(), 'app/api'))
    const directExports: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (DIRECT_MUTATING_EXPORT.test(source)) {
        directExports.push(relativePath(file))
      }
    }

    expect(directExports.sort()).toEqual([...documentedExceptions].sort())
  })
})
