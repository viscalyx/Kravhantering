import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SCAN_ROOTS = ['app', 'components', 'hooks', 'lib']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

function sourceFiles(root: string): string[] {
  const absoluteRoot = path.join(process.cwd(), root)
  const files: string[] = []

  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
    return files
  }

  for (const entry of readdirSync(absoluteRoot)) {
    const absoluteEntry = path.join(absoluteRoot, entry)
    const relativeEntry = path.relative(process.cwd(), absoluteEntry)
    const stat = statSync(absoluteEntry)
    if (stat.isDirectory()) {
      files.push(...sourceFiles(relativeEntry))
      continue
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(relativeEntry)
    }
  }

  return files
}

function isClientModule(source: string): boolean {
  return /^\s*['"]use client['"]/.test(source)
}

describe('client PDF import guard', () => {
  it('keeps React-PDF out of client modules', () => {
    const violations = SCAN_ROOTS.flatMap(sourceFiles).filter(file => {
      const source = readFileSync(file, 'utf8')
      return isClientModule(source) && source.includes('@react-pdf/renderer')
    })

    expect(violations).toEqual([])
  })
})
