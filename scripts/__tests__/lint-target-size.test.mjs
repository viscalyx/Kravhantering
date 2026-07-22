import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  discoverFiles,
  formatResults,
  inspectSource,
  main,
  runTargetSizeLint,
} from '../lint-target-size.mjs'

const createFakeProcess = () => ({
  exit: vi.fn(code => {
    throw new Error(`exit:${code}`)
  }),
  stderr: { write: vi.fn() },
  stdout: { write: vi.fn() },
})

describe('lint-target-size.mjs', () => {
  it('finds an explicit compact button', () => {
    const diagnostics = inspectSource(
      `export function View() {
  return <button aria-label="Remove" className="inline-flex h-5 w-5" />
}`,
      'components/View.tsx',
    )

    expect(diagnostics).toMatchObject([
      {
        detail: 'missing WCAG 2.5.8 target-size exception annotation',
        filePath: 'components/View.tsx',
        identity: 'aria-label="Remove"',
        tokens: ['h-5', 'w-5'],
      },
    ])
  })

  it('accepts the canonical multiline annotation with concrete evidence', () => {
    const diagnostics = inspectSource(
      `export function View() {
  return (
    <>
      {/* WCAG 2.5.8 target-size exception: spacing —
          24 CSS-pixel circles do not intersect; verified by compact-target.spec.ts. */}
      <button aria-label="Remove" className="h-5 w-5" />
    </>
  )
}`,
      'components/View.tsx',
    )

    expect(diagnostics).toEqual([])
  })

  it.each([
    [
      'WCAG 2.5.8 target-size exception: preference — compact layout',
      'unsupported target-size exception "preference"',
    ],
    [
      'WCAG 2.5.8 target-size exception: spacing — <evidence>',
      'target-size exception annotation needs concrete evidence',
    ],
    [
      'WCAG 2.5.8 target-size exception: spacing',
      'malformed target-size exception annotation',
    ],
  ])('rejects invalid annotation %s', (annotation, detail) => {
    const diagnostics = inspectSource(
      `<>
  {/* ${annotation} */}
  <button aria-label="Remove" className="size-5" />
</>`,
      'components/View.tsx',
    )

    expect(diagnostics[0]?.detail).toBe(detail)
  })

  it('does not treat a distant annotation as belonging to the target', () => {
    const diagnostics = inspectSource(
      `{/* WCAG 2.5.8 target-size exception: spacing — verified by geometry test */}





<button aria-label="Remove" className="size-5" />`,
      'components/View.tsx',
    )

    expect(diagnostics).toHaveLength(1)
  })

  it('allows 24px minima to protect a smaller visual size', () => {
    const diagnostics = inspectSource(
      '<button aria-label="Help" className="h-4 w-4 min-h-6 min-w-6" />',
      'components/View.tsx',
    )

    expect(diagnostics).toEqual([])
  })

  it('supports compact arbitrary pixel and rem values', () => {
    const diagnostics = inspectSource(
      '<button aria-label="One" className="h-[20px]" /><button aria-label="Two" className="w-[1rem]" />',
      'components/View.tsx',
    )

    expect(diagnostics.map(item => item.tokens)).toEqual([
      ['h-[20px]'],
      ['w-[1rem]'],
    ])
  })

  it('handles pixel utilities, ignores unknown sizes, and honors responsive minima', () => {
    const diagnostics = inspectSource(
      `<button aria-label="Pixel" className="h-px" />
<button aria-label="Unknown" className="h-[calc(1rem+2px)]" />
<button aria-label="Responsive" className="sm:h-5 sm:min-h-6 min-w-6" />`,
      'components/View.tsx',
    )

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.tokens).toEqual(['h-px'])
  })

  it('resolves class constants, conditionals, concatenation, and responsive variants', () => {
    const diagnostics = inspectSource(
      `const compact = active ? 'sm:h-5' : 'w-' + '5'
export function View() {
  return <button aria-label="Remove" className={compact} />
}`,
      'components/View.tsx',
    )

    expect(diagnostics[0]?.tokens).toEqual(['sm:h-5', 'w-5'])
  })

  it('detects an unsized icon-only button but not a padded one', () => {
    const diagnostics = inspectSource(
      `<button aria-label="Remove"><X className="h-3 w-3" /></button>
<button aria-label="Safe" className="p-2"><X className="h-3 w-3" /></button>`,
      'components/View.tsx',
    )

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      identity: 'aria-label="Remove"',
      tokens: ['h-3'],
    })
  })

  it('requires an annotation when a shared dynamic class cannot be resolved', () => {
    const dynamicClass = '$' + '{sharedTargetClassName}'
    const diagnostics = inspectSource(
      `<button aria-label="Edit" className={cn(\`${dynamicClass} text-primary-700\`)}>
  <Pencil className="h-4 w-4" />
</button>`,
      'components/View.tsx',
    )

    expect(diagnostics[0]).toMatchObject({
      detail:
        'unresolved className needs a concrete target-size exception annotation',
      identity: 'aria-label="Edit"',
      tokens: ['className'],
    })
  })

  it('requires one uppercase icon child before inferring an unsized icon target', () => {
    const diagnostics = inspectSource(
      `<button aria-label="Many"><X className="size-3" /><Y className="size-3" /></button>
<button aria-label="Markup"><span className="size-3" /></button>`,
      'components/View.tsx',
    )

    expect(diagnostics).toEqual([])
  })

  it('checks interactive roles and leaves ordinary inline links alone', () => {
    const diagnostics = inspectSource(
      `<span aria-label="Toggle" className="size-5" role="switch" />
<a href="/help" className="text-sm">Help</a>`,
      'components/View.tsx',
    )

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.tagName).toBe('span')
  })

  it('checks native interactive form controls but ignores hidden inputs', () => {
    const diagnostics = inspectSource(
      `<input aria-label="Toggle" className="size-3" type="checkbox" />
<input className="size-3" type="hidden" />
<select aria-label="Choose" className="h-5" />
<textarea aria-label="Describe" className="h-5" />`,
      'components/View.tsx',
    )

    expect(diagnostics.map(diagnostic => diagnostic.tagName)).toEqual([
      'input',
      'select',
      'textarea',
    ])
  })

  it('requires padding to prove a 24px hit area on both axes', () => {
    const diagnostics = inspectSource(
      `<button aria-label="Pixel" className="p-px"><X className="size-3" /></button>
<button aria-label="Horizontal" className="px-1"><X className="size-3" /></button>
<button aria-label="Safe" className="p-2"><X className="size-3" /></button>`,
      'components/View.tsx',
    )

    expect(diagnostics.map(diagnostic => diagnostic.identity)).toEqual([
      'aria-label="Pixel"',
      'aria-label="Horizontal"',
    ])
  })

  it('resolves bindings in their lexical scope', () => {
    const diagnostics = inspectSource(
      `function First() {
  const targetClass = 'size-5'
  return <button aria-label="First" className={targetClass} />
}
function Second() {
  const targetClass = 'min-h-6 min-w-6'
  return <button aria-label="Second" className={targetClass} />
}`,
      'components/View.tsx',
    )

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.identity).toBe('aria-label="First"')
  })

  it('resolves static class composition calls and reports unresolved calls', () => {
    const diagnostics = inspectSource(
      `<button aria-label="Static" className={cn('size-5')} />
<button aria-label="Dynamic" className={cn(targetClass)} />`,
      'components/View.tsx',
    )

    expect(diagnostics).toMatchObject([
      { identity: 'aria-label="Static"', tokens: ['size-5'] },
      {
        detail:
          'unresolved className needs a concrete target-size exception annotation',
        identity: 'aria-label="Dynamic"',
        tokens: ['className'],
      },
    ])
  })

  it('binds an annotation only to its directly following JSX target', () => {
    const diagnostics = inspectSource(
      `<>
  {/* WCAG 2.5.8 target-size exception: spacing — verified by geometry test. */}
  <button aria-label="Covered" className="size-5" />
  <button aria-label="Uncovered" className="size-5" />
</>`,
      'components/View.tsx',
    )

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.identity).toBe('aria-label="Uncovered"')
  })

  it('uses alternate identity attributes and a defined unlabelled fallback', () => {
    const diagnostics = inspectSource(
      `<button className="size-5" data-testid="compact" />
<button className="size-5" />`,
      'components/View.tsx',
    )

    expect(diagnostics.map(item => item.identity)).toEqual([
      'data-testid="compact"',
      'unlabelled',
    ])
  })

  it('discovers JSX sources and skips generated directories', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'target-size-lint-'))
    try {
      await mkdir(path.join(tempRoot, 'components', '.next'), {
        recursive: true,
      })
      await mkdir(path.join(tempRoot, 'components', 'playwright-report-dev'), {
        recursive: true,
      })
      await writeFile(path.join(tempRoot, 'components', 'Keep.tsx'), '')
      await writeFile(path.join(tempRoot, 'components', 'Skip.ts'), '')
      await writeFile(
        path.join(tempRoot, 'components', '.next', 'Skip.tsx'),
        '',
      )
      await writeFile(
        path.join(tempRoot, 'components', 'playwright-report-dev', 'Skip.tsx'),
        '',
      )

      await expect(
        discoverFiles({ cwd: tempRoot, roots: ['components', 'missing'] }),
      ).resolves.toEqual(['components/Keep.tsx'])
    } finally {
      await rm(tempRoot, { force: true, recursive: true })
    }
  })

  it('runs against a temporary project and formats diagnostics', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'target-size-run-'))
    try {
      await mkdir(path.join(tempRoot, 'components'))
      await writeFile(
        path.join(tempRoot, 'components', 'Compact.tsx'),
        '<button aria-label="Remove" className="size-5" />',
      )

      const result = await runTargetSizeLint({
        cwd: tempRoot,
        roots: ['components'],
      })
      expect(formatResults(result)).toContain(
        'Target-size policy lint found 1 unapproved compact target:',
      )
    } finally {
      await rm(tempRoot, { force: true, recursive: true })
    }
  })

  it('exits cleanly when no compact targets are found', async () => {
    const processObj = createFakeProcess()
    await expect(
      main([], {
        processObj,
        runLint: async () => ({
          diagnostics: [],
        }),
      }),
    ).rejects.toThrow('exit:0')

    expect(processObj.stdout.write).toHaveBeenCalledWith(
      'Target-size policy lint: no new issues found.\n',
    )
  })

  it('exits nonzero for diagnostics and unexpected failures', async () => {
    const diagnosticProcess = createFakeProcess()
    await expect(
      main([], {
        processObj: diagnosticProcess,
        runLint: async () => ({
          diagnostics: [
            {
              column: 1,
              detail: 'missing annotation',
              filePath: 'View.tsx',
              identity: 'aria-label="Remove"',
              line: 2,
              tokens: ['size-5'],
            },
          ],
        }),
      }),
    ).rejects.toThrow('exit:1')
    expect(diagnosticProcess.stderr.write).toHaveBeenCalled()

    const failureProcess = createFakeProcess()
    await expect(
      main([], {
        processObj: failureProcess,
        runLint: async () => {
          throw new Error('broken input')
        },
      }),
    ).rejects.toThrow('exit:1')
    expect(failureProcess.stderr.write).toHaveBeenCalledWith(
      'Target-size policy lint failed: broken input\n',
    )

    const stringFailureProcess = createFakeProcess()
    await expect(
      main([], {
        processObj: stringFailureProcess,
        runLint: async () => {
          throw 'broken string input'
        },
      }),
    ).rejects.toThrow('exit:1')
    expect(stringFailureProcess.stderr.write).toHaveBeenCalledWith(
      'Target-size policy lint failed: broken string input\n',
    )
  })
})
