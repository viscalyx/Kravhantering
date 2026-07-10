import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    const extension = entry.name.slice(entry.name.lastIndexOf('.'))
    return SOURCE_EXTENSIONS.has(extension) ? [path] : []
  })
}

describe('Radix import boundary', () => {
  it('keeps direct Radix imports inside local primitive wrappers', () => {
    const primitiveRoot = join(process.cwd(), 'components', 'primitives')
    const candidates = [
      ...sourceFiles(join(process.cwd(), 'app')),
      ...sourceFiles(join(process.cwd(), 'components')),
    ].filter(path => !path.startsWith(`${primitiveRoot}${sep}`))

    const violations = candidates
      .filter(path => readFileSync(path, 'utf8').includes("'@radix-ui/"))
      .map(path => relative(process.cwd(), path))

    expect(violations).toEqual([])
  })
})
