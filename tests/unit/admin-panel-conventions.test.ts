import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Admin Center panel conventions', () => {
  it('keeps a focused unit test beside every convention-discovered panel', () => {
    const root = resolve(process.cwd())
    const panelNames = readdirSync(resolve(root, 'app/[locale]/admin/panels'), {
      withFileTypes: true,
    })
      .filter(entry => entry.isFile() && entry.name.endsWith('-panel.tsx'))
      .map(entry => entry.name.replace(/\.tsx$/u, ''))
      .sort()
    const testNames = new Set(
      readdirSync(resolve(root, 'tests/unit'))
        .filter(name => name.startsWith('admin-') && name.endsWith('.test.tsx'))
        .map(name => name.replace(/^admin-|\.test\.tsx$/gu, '')),
    )

    expect(panelNames.filter(name => !testNames.has(name))).toEqual([])
  })

  it('keeps server-only data access out of client panel chunks', () => {
    const panelsDirectory = resolve(process.cwd(), 'app/[locale]/admin/panels')
    const forbiddenServerReferences = [
      /['"]server-only['"]/u,
      /['"]@\/lib\/dal(?:\/|['"])/u,
      /['"]@\/lib\/db(?:\/|['"])/u,
    ]

    const violations = readdirSync(panelsDirectory)
      .filter(name => name.endsWith('-panel.tsx'))
      .flatMap(name => {
        const source = readFileSync(resolve(panelsDirectory, name), 'utf8')
        const runtimeSource = source.replace(
          /import\s+type\s+(?:\{[\s\S]*?\}|[^\s]+)\s+from\s+['"][^'"]+['"]/gu,
          '',
        )
        return forbiddenServerReferences
          .filter(pattern => pattern.test(runtimeSource))
          .map(pattern => `${name}: ${pattern.source}`)
      })

    expect(violations).toEqual([])
  })
})
