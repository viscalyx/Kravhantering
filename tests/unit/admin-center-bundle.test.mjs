import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bundleBudgetFailures,
  createScenario,
  discoverAdminPanelNames,
  evaluateAdminBundle,
  extractDynamicChunkGroups,
  extractLazyPanelImportNames,
  formatScenario,
  parseClientReferenceManifest,
  readAdminBundleReport,
  runAdminBundleCheck,
} from '../../scripts/check-admin-center-bundle.mjs'

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'admin-center-bundle-'))
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
      '[project]/app/[locale]/admin/admin-client.tsx': {
        chunks: [
          '/_next/static/chunks/layout.js',
          '/_next/static/chunks/shell.js',
        ],
      },
    },
    entryJSFiles: {
      '[project]/app/[locale]/admin/page': [
        'static/chunks/layout.js',
        'static/chunks/shell.js',
      ],
      '[project]/app/[locale]/layout': ['static/chunks/layout.js'],
    },
    moduleLoading: {},
  }
}

function writeCompleteFixture() {
  const root = fixtureRoot()
  write(
    root,
    'app/[locale]/admin/admin-client.tsx',
    "lazy(() => import('./panels/example-panel'))",
  )
  write(root, 'app/[locale]/admin/panels/example-panel.tsx', 'export default 1')
  write(root, '.next/static/chunks/layout.js', 'layout')
  write(
    root,
    '.next/static/chunks/shell.js',
    'Promise.all(["static/chunks/example.js"].map(i=>e.l(i))).then()',
  )
  write(root, '.next/static/chunks/example.js', 'example panel')
  write(
    root,
    '.next/server/app/[locale]/admin/page_client-reference-manifest.js',
    `globalThis.x = ${JSON.stringify(clientManifest())};`,
  )
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Admin Center bundle contract', () => {
  it('discovers panel files and extracts matching lazy imports', () => {
    const root = fixtureRoot()
    const directory = join(root, 'panels')
    write(root, 'panels/zeta-panel.tsx', '')
    write(root, 'panels/alpha-panel.tsx', '')
    write(root, 'panels/readme.md', '')

    expect(discoverAdminPanelNames(directory)).toEqual([
      'alpha-panel',
      'zeta-panel',
    ])
    expect(
      extractLazyPanelImportNames(
        "lazy(() => import('./panels/alpha-panel')); lazy(() => import('./panels/zeta-panel'))",
      ),
    ).toEqual(['alpha-panel', 'zeta-panel'])
  })

  it('parses the client manifest and compiled lazy chunk groups', () => {
    const manifest = clientManifest()
    expect(
      parseClientReferenceManifest(
        `globalThis.a = {}; globalThis.b = ${JSON.stringify(manifest)};`,
      ),
    ).toEqual(manifest)
    expect(
      extractDynamicChunkGroups(
        'Promise.all(["static/chunks/a.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
      ),
    ).toEqual([['static/chunks/a.js', 'static/chunks/shared.js']])
    expect(() => parseClientReferenceManifest('not a manifest')).toThrow(
      'Could not parse',
    )
    expect(() =>
      extractDynamicChunkGroups(
        'Promise.all(["invalid.js"].map(i=>e.l(i))).then()',
      ),
    ).toThrow('unrecognized lazy chunk set')
  })

  it('measures unique files and reports budget excess', () => {
    const root = fixtureRoot()
    write(root, 'chunks/a.js', 'aaaaaaaaaaaaaaaa')
    const scenario = createScenario(
      'example',
      ['static/chunks/a.js', 'static/chunks/a.js'],
      root,
    )
    const report = { entry: scenario, panels: [scenario] }

    expect(scenario.chunks).toHaveLength(1)
    expect(scenario.rawBytes).toBe(16)
    expect(
      bundleBudgetFailures(report, { entryLimit: 0, panelLimit: 0 }),
    ).toEqual([
      expect.objectContaining({ excessBytes: scenario.gzipBytes }),
      expect.objectContaining({ excessBytes: scenario.gzipBytes }),
    ])
    expect(
      bundleBudgetFailures(report, {
        entryLimit: scenario.gzipBytes,
        panelLimit: scenario.gzipBytes,
      }),
    ).toEqual([])
    expect(formatScenario(scenario, 100)).toContain('example: 16 raw bytes')
  })

  it('matches every panel to an async non-entry chunk set', () => {
    const root = fixtureRoot()
    write(root, 'chunks/entry.js', 'entry')
    write(root, 'chunks/a.js', 'panel a')
    write(root, 'chunks/b.js', 'panel b')

    const report = evaluateAdminBundle({
      entryChunks: ['static/chunks/entry.js'],
      importedPanelNames: ['a-panel', 'b-panel'],
      lazyChunkGroups: [['static/chunks/a.js'], ['static/chunks/b.js']],
      panelNames: ['a-panel', 'b-panel'],
      staticDirectory: root,
    })

    expect(report.entry.name).toBe('admin-center-entry')
    expect(report.panels.map(panel => panel.name)).toEqual([
      'a-panel',
      'b-panel',
    ])

    const positionalReport = evaluateAdminBundle({
      entryChunks: ['static/chunks/entry.js'],
      importedPanelNames: ['b-panel', 'a-panel'],
      lazyChunkGroups: [['static/chunks/a.js'], ['static/chunks/b.js']],
      panelNames: ['a-panel', 'b-panel'],
      staticDirectory: root,
    })
    expect(
      positionalReport.panels.map(panel => ({
        chunks: panel.chunks.map(file => file.chunk),
        name: panel.name,
      })),
    ).toEqual([
      { chunks: ['static/chunks/a.js'], name: 'b-panel' },
      { chunks: ['static/chunks/b.js'], name: 'a-panel' },
    ])

    expect(() =>
      evaluateAdminBundle({
        entryChunks: ['static/chunks/entry.js'],
        importedPanelNames: ['a-panel'],
        lazyChunkGroups: [['static/chunks/entry.js']],
        panelNames: ['a-panel'],
        staticDirectory: root,
      }),
    ).toThrow('included in entry chunks')
    expect(() =>
      evaluateAdminBundle({
        entryChunks: ['static/chunks/entry.js'],
        importedPanelNames: ['a-panel'],
        lazyChunkGroups: [],
        panelNames: ['a-panel'],
        staticDirectory: root,
      }),
    ).toThrow('compiled lazy panel chunk sets')
    expect(() =>
      evaluateAdminBundle({
        entryChunks: ['static/chunks/entry.js'],
        importedPanelNames: ['unknown-panel'],
        lazyChunkGroups: [[]],
        panelNames: ['a-panel'],
        staticDirectory: root,
      }),
    ).toThrow('do not match')
  })

  it('reads a finished build fixture and supports report-only execution', () => {
    const root = writeCompleteFixture()
    const report = readAdminBundleReport(root)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    expect(report.entry.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/shell.js',
    ])
    expect(report.panels[0].name).toBe('example-panel')
    expect(
      runAdminBundleCheck({ projectRoot: root, reportOnly: true }),
    ).toEqual(report)
    expect(logSpy).toHaveBeenCalled()
  })

  it('explains missing and incomplete production manifests', () => {
    const root = fixtureRoot()
    expect(() => readAdminBundleReport(root)).toThrow(
      'optimized production build',
    )

    write(
      root,
      '.next/server/app/[locale]/admin/page_client-reference-manifest.js',
      `globalThis.x = ${JSON.stringify({ moduleLoading: {} })};`,
    )
    expect(() => readAdminBundleReport(root)).toThrow('fields are incomplete')
  })
})
