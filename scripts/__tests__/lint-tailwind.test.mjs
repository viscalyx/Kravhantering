import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  discoverFiles,
  extractClassListsFromCss,
  extractClassListsFromScript,
  findCanonicalClassDiagnostics,
  formatDiagnostics,
  main,
} from '../lint-tailwind.mjs'

const createFakeProcess = () => ({
  stderr: { write: vi.fn() },
  stdout: { write: vi.fn() },
  exit: vi.fn(code => {
    throw new Error(`exit:${code}`)
  }),
})

const replacements = new Map([
  ['!px-4', 'px-4!'],
  ['bg-gradient-to-b', 'bg-linear-to-b'],
  ['min-h-[40px]', 'min-h-10'],
  ['min-h-[64px]', 'min-h-16'],
  ['rounded-[2rem]', 'rounded-4xl'],
  ['w-[22rem]', 'w-88'],
  ['z-[90]', 'z-90'],
])

const canonicalize = className => replacements.get(className) ?? className

describe('lint-tailwind.mjs', () => {
  it('exits cleanly when no diagnostics are found', async () => {
    const processObj = createFakeProcess()
    const runTailwindLint = vi.fn(async () => [])

    await expect(
      main([], {
        consoleObj: { error: vi.fn() },
        processObj,
        runTailwindLint,
      }),
    ).rejects.toThrow('exit:0')

    expect(runTailwindLint).toHaveBeenCalledWith({
      roots: ['app', 'components', 'lib'],
    })
    expect(processObj.stdout.write).toHaveBeenCalledWith(
      'Tailwind canonical class lint: no issues found.\n',
    )
  })

  it('formats a canonical-class diagnostic with file, position, and replacement', () => {
    const source = 'export const panelClassName = "rounded-[2rem] p-4"\n'
    const classLists = extractClassListsFromScript(source, 'example.ts')
    const diagnostics = findCanonicalClassDiagnostics(
      source,
      classLists,
      canonicalize,
    )

    expect(formatDiagnostics(diagnostics)).toBe(
      [
        'Tailwind canonical class lint found 1 issue:',
        'example.ts:1:32 rounded-[2rem] -> rounded-4xl',
        '',
      ].join('\n'),
    )
  })

  it('exits nonzero when Tailwind design-system loading fails', async () => {
    const processObj = createFakeProcess()
    const consoleObj = { error: vi.fn() }

    await expect(
      main([], {
        consoleObj,
        processObj,
        runTailwindLint: async () => {
          throw new Error('missing Tailwind entrypoint')
        },
      }),
    ).rejects.toThrow('exit:1')

    expect(consoleObj.error).toHaveBeenCalledWith(
      'Tailwind canonical class lint failed: missing Tailwind entrypoint',
    )
  })

  it('discovers source files and skips generated or external directories', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-tailwind-'))

    try {
      await mkdir(path.join(tempRoot, 'app', 'feature'), { recursive: true })
      await mkdir(path.join(tempRoot, 'app', 'node_modules'), {
        recursive: true,
      })
      await mkdir(path.join(tempRoot, 'app', '.next'), { recursive: true })
      await mkdir(path.join(tempRoot, 'app', '.open-next'), { recursive: true })
      await mkdir(path.join(tempRoot, 'app', '.wrangler'), { recursive: true })
      await mkdir(path.join(tempRoot, 'app', 'coverage'), { recursive: true })
      await mkdir(path.join(tempRoot, 'app', 'test-results'), {
        recursive: true,
      })
      await mkdir(path.join(tempRoot, 'app', 'playwright-report-dev'), {
        recursive: true,
      })
      await writeFile(path.join(tempRoot, 'app', 'feature', 'keep.tsx'), '')
      await writeFile(path.join(tempRoot, 'app', 'feature', 'keep.css'), '')
      await writeFile(path.join(tempRoot, 'app', 'feature', 'skip.md'), '')
      await writeFile(
        path.join(tempRoot, 'app', 'node_modules', 'skip.tsx'),
        '',
      )
      await writeFile(path.join(tempRoot, 'app', '.next', 'skip.tsx'), '')
      await writeFile(path.join(tempRoot, 'app', '.open-next', 'skip.tsx'), '')
      await writeFile(path.join(tempRoot, 'app', '.wrangler', 'skip.tsx'), '')
      await writeFile(path.join(tempRoot, 'app', 'coverage', 'skip.tsx'), '')
      await writeFile(
        path.join(tempRoot, 'app', 'test-results', 'skip.tsx'),
        '',
      )
      await writeFile(
        path.join(tempRoot, 'app', 'playwright-report-dev', 'skip.tsx'),
        '',
      )

      await expect(
        discoverFiles({ cwd: tempRoot, roots: ['app'] }),
      ).resolves.toEqual(['app/feature/keep.css', 'app/feature/keep.tsx'])
    } finally {
      await rm(tempRoot, { force: true, recursive: true })
    }
  })

  it('extracts static class surfaces from JSX, class variables, helpers, and templates', () => {
    const source = `
const panelClassName = 'rounded-[2rem]'
const variantsClassNames = {
  primary: 'min-h-[40px]',
}
function getBadgeClass() {
  return \`bg-gradient-to-b \${state}\`
}
const helper = cn('!px-4', { 'z-[90]': active }, \`min-h-[64px] \${dynamic}\`)
export function View() {
  return <div className="w-[22rem]" />
}
`
    const classLists = extractClassListsFromScript(source, 'example.tsx')
    const diagnostics = findCanonicalClassDiagnostics(
      source,
      classLists,
      canonicalize,
    )

    expect(diagnostics.map(diagnostic => diagnostic.current)).toEqual([
      'rounded-[2rem]',
      'min-h-[40px]',
      'bg-gradient-to-b',
      '!px-4',
      'z-[90]',
      'min-h-[64px]',
      'w-[22rem]',
    ])
  })

  it('extracts Tailwind class lists from CSS @apply rules', () => {
    const source = '.panel { @apply rounded-[2rem] min-h-[40px]; }\n'
    const classLists = extractClassListsFromCss(source, 'app/globals.css')
    const diagnostics = findCanonicalClassDiagnostics(
      source,
      classLists,
      canonicalize,
    )

    expect(diagnostics.map(diagnostic => diagnostic.current)).toEqual([
      'rounded-[2rem]',
      'min-h-[40px]',
    ])
  })
})
