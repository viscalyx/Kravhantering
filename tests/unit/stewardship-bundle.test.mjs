import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateStewardshipBundle,
  extractLazyWorkspaceIds,
  readStewardshipBundleReport,
  runStewardshipBundleCheck,
  runStewardshipBundleCli,
  stewardshipBudgetFailures,
} from '../../scripts/check-stewardship-bundle.mjs'
import { deterministicBytes } from './helpers/bundle-test-helpers.mjs'

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'stewardship-bundle-'))
}

function write(root, relativePath, content) {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

function clientManifest() {
  return {
    clientModules: {
      '[project]/app/[locale]/requirements/stewardship/stewardship-client.tsx':
        {
          chunks: [
            '/_next/static/chunks/layout.js',
            '/_next/static/chunks/shell.js',
          ],
        },
    },
    entryJSFiles: {
      '[project]/app/[locale]/layout': ['static/chunks/layout.js'],
      '[project]/app/[locale]/requirements/stewardship/page': [
        'static/chunks/layout.js',
        'static/chunks/shell.js',
      ],
    },
    moduleLoading: {},
  }
}

function stewardshipClientSource() {
  return [
    "lazy(() => import('../../requirement-packages/requirement-packages-client'))",
    "lazy(() => import('./requirement-selection-questions-client'))",
    "lazy(() => import('./rfi-questions-client'))",
    "lazy(() => import('../../norm-references/norm-references-client'))",
  ].join('\n')
}

function writeCompleteFixture() {
  const root = fixtureRoot()
  write(
    root,
    'app/[locale]/requirements/stewardship/stewardship-client.tsx',
    stewardshipClientSource(),
  )
  write(root, '.next/static/chunks/layout.js', 'layout')
  write(
    root,
    '.next/static/chunks/shell.js',
    [
      'Promise.all(["static/chunks/packages.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
      'Promise.all(["static/chunks/questions.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
      'Promise.all(["static/chunks/rfi.js"].map(i=>e.l(i))).then()',
      'Promise.all(["static/chunks/norms.js"].map(i=>e.l(i))).then()',
    ].join(';'),
  )
  for (const name of ['packages', 'questions', 'rfi', 'norms', 'shared']) {
    write(root, `.next/static/chunks/${name}.js`, `${name} workspace`)
  }
  write(
    root,
    '.next/server/app/[locale]/requirements/stewardship/page_client-reference-manifest.js',
    `globalThis.x = ${JSON.stringify(clientManifest())};`,
  )
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stewardship bundle contract', () => {
  it('extracts the exact ordered workspace imports', () => {
    expect(extractLazyWorkspaceIds(stewardshipClientSource())).toEqual([
      'packages',
      'questions',
      'rfi',
      'norms',
    ])
    expect(() =>
      extractLazyWorkspaceIds("lazy(() => import('./unknown-client'))"),
    ).toThrow('unknown lazy workspace import')
  })

  it('measures entry plus active workspace without double-counting chunks', () => {
    const root = fixtureRoot()
    write(root, 'chunks/entry.js', 'entry')
    write(root, 'chunks/shared.js', 'shared')
    write(root, 'chunks/packages.js', 'packages')
    write(root, 'chunks/questions.js', 'questions')
    write(root, 'chunks/rfi.js', 'rfi')
    write(root, 'chunks/norms.js', 'norms')

    const report = evaluateStewardshipBundle({
      entryChunks: ['static/chunks/entry.js'],
      importedWorkspaceIds: ['packages', 'questions', 'rfi', 'norms'],
      lazyChunkGroups: [
        ['static/chunks/packages.js', 'static/chunks/shared.js'],
        ['static/chunks/questions.js', 'static/chunks/shared.js'],
        ['static/chunks/rfi.js'],
        ['static/chunks/norms.js'],
      ],
      staticDirectory: root,
    })

    expect(report.entry.name).toBe('stewardship-entry')
    expect(report.workspaces.map(workspace => workspace.total.name)).toEqual([
      'stewardship-packages',
      'stewardship-questions',
      'stewardship-rfi',
      'stewardship-norms',
    ])
    expect(report.workspaces[0].total.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/entry.js',
      'static/chunks/packages.js',
      'static/chunks/shared.js',
    ])
  })

  it('fails closed for order, group count, empty groups, and eager overlap', () => {
    const root = fixtureRoot()
    write(root, 'chunks/entry.js', 'entry')
    write(root, 'chunks/a.js', 'a')

    const base = {
      entryChunks: ['static/chunks/entry.js'],
      importedWorkspaceIds: ['packages', 'questions', 'rfi', 'norms'],
      lazyChunkGroups: [
        ['static/chunks/a.js'],
        ['static/chunks/a.js'],
        ['static/chunks/a.js'],
        ['static/chunks/a.js'],
      ],
      staticDirectory: root,
    }

    expect(() =>
      evaluateStewardshipBundle({
        ...base,
        importedWorkspaceIds: ['questions', 'packages', 'rfi', 'norms'],
      }),
    ).toThrow('must remain in this order')
    expect(() =>
      evaluateStewardshipBundle({
        ...base,
        importedWorkspaceIds: [],
        lazyChunkGroups: [],
      }),
    ).toThrow('Found: none')
    expect(() =>
      evaluateStewardshipBundle({ ...base, lazyChunkGroups: [] }),
    ).toThrow('compiled lazy stewardship chunk sets')
    expect(() =>
      evaluateStewardshipBundle({
        ...base,
        lazyChunkGroups: [
          [],
          ['static/chunks/a.js'],
          ['static/chunks/a.js'],
          ['static/chunks/a.js'],
        ],
      }),
    ).toThrow('has no asynchronous chunks')
    expect(() =>
      evaluateStewardshipBundle({
        ...base,
        lazyChunkGroups: [
          ['static/chunks/entry.js'],
          ['static/chunks/a.js'],
          ['static/chunks/a.js'],
          ['static/chunks/a.js'],
        ],
      }),
    ).toThrow('included in entry chunks')
  })

  it('applies individual workspace limits', () => {
    const root = writeCompleteFixture()
    const report = readStewardshipBundleReport(root)
    const exactLimits = Object.fromEntries(
      report.workspaces.map(workspace => [
        workspace.id,
        workspace.total.gzipBytes,
      ]),
    )

    expect(stewardshipBudgetFailures(report, exactLimits)).toEqual([])
    expect(
      stewardshipBudgetFailures(report, { ...exactLimits, norms: 0 }),
    ).toEqual([
      expect.objectContaining({
        excessBytes: report.workspaces[3].total.gzipBytes,
        name: 'stewardship-norms',
      }),
    ])
  })

  it('reads a build fixture and supports report-only execution', () => {
    const root = writeCompleteFixture()
    const report = readStewardshipBundleReport(root)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    expect(report.entry.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/shell.js',
    ])
    expect(
      runStewardshipBundleCheck({ projectRoot: root, reportOnly: true }),
    ).toEqual(report)
    expect(logSpy).toHaveBeenCalledTimes(9)
  })

  it('explains missing and incomplete production manifests', () => {
    const root = fixtureRoot()
    expect(() => readStewardshipBundleReport(root)).toThrow(
      'optimized production build',
    )

    write(
      root,
      '.next/server/app/[locale]/requirements/stewardship/page_client-reference-manifest.js',
      `globalThis.x = ${JSON.stringify({ moduleLoading: {} })};`,
    )
    expect(() => readStewardshipBundleReport(root)).toThrow(
      'fields are incomplete',
    )
  })

  it('fails an over-budget workspace with actionable diagnostics', () => {
    const root = writeCompleteFixture()
    write(root, '.next/static/chunks/rfi.js', deterministicBytes(20_000))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    expect(() => runStewardshipBundleCheck({ projectRoot: root })).toThrow(
      'Stewardship JavaScript bundle budget exceeded',
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('exceeds limit by'),
    )
  })

  it('maps stewardship CLI options and non-Error failures to an exit code', () => {
    const runCheck = vi.fn()
    expect(
      runStewardshipBundleCli({
        argv: ['node', 'check-stewardship-bundle.mjs', '--report'],
        cwd: '/workspace/project',
        runCheck,
      }),
    ).toBe(0)
    expect(runCheck).toHaveBeenCalledWith({
      projectRoot: '/workspace/project',
      reportOnly: true,
    })

    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    expect(
      runStewardshipBundleCli({
        argv: [],
        cwd: '/workspace/project',
        runCheck: () => {
          throw 'stewardship failure'
        },
      }),
    ).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('stewardship failure')
  })
})
