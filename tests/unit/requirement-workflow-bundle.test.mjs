import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateRequirementWorkflowRoute,
  extractLazyRequirementWorkflowFeatureIds,
  readRequirementWorkflowBundleReport,
  requirementWorkflowBudgetFailures,
  runRequirementWorkflowBundleCheck,
  runRequirementWorkflowBundleCli,
} from '../../scripts/check-requirement-workflow-bundle.mjs'
import { deterministicBytes } from './helpers/bundle-test-helpers.mjs'

const LIBRARY_CLIENT_MODULE =
  '[project]/app/[locale]/requirements/requirements-client.tsx'
const LIBRARY_ROUTE_MODULE = '[project]/app/[locale]/requirements/page'
const SPECIFICATION_CLIENT_MODULE =
  '[project]/app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx'
const SPECIFICATION_ROUTE_MODULE =
  '[project]/app/[locale]/specifications/[specificationId]/page'

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'requirement-workflow-bundle-'))
}

function write(root, relativePath, content) {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

function clientManifest(clientModule, routeModule, shellChunk) {
  return {
    clientModules: {
      [clientModule]: {
        chunks: [
          '/_next/static/chunks/layout.js',
          `/_next/static/chunks/${shellChunk}`,
        ],
      },
    },
    entryJSFiles: {
      '[project]/app/[locale]/layout': ['static/chunks/layout.js'],
      [routeModule]: ['static/chunks/layout.js', `static/chunks/${shellChunk}`],
    },
    moduleLoading: {},
  }
}

function launcherSources() {
  return [
    "lazy(() => import('@/components/AiRequirementGenerator'))",
    "lazy(() => import('@/components/RequirementsImportDialog'))",
  ]
}

function writeCompleteFixture() {
  const root = fixtureRoot()
  const [aiLauncher, importLauncher] = launcherSources()
  write(root, 'components/LazyAiRequirementGenerator.tsx', aiLauncher)
  write(root, 'components/LazyRequirementsImportDialog.tsx', importLauncher)
  write(root, '.next/static/chunks/layout.js', 'layout')
  write(
    root,
    '.next/static/chunks/library-shell.js',
    [
      'Promise.all(["static/chunks/library-ai.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
      'Promise.all(["static/chunks/library-import.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
    ].join(';'),
  )
  write(
    root,
    '.next/static/chunks/specification-shell.js',
    [
      'Promise.all(["static/chunks/specification-ai.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
      'Promise.all(["static/chunks/specification-import.js","static/chunks/shared.js"].map(i=>e.l(i))).then()',
    ].join(';'),
  )
  for (const chunk of [
    'library-ai',
    'library-import',
    'specification-ai',
    'specification-import',
    'shared',
  ]) {
    write(root, `.next/static/chunks/${chunk}.js`, `${chunk} code`)
  }
  write(
    root,
    '.next/server/app/[locale]/requirements/page_client-reference-manifest.js',
    `globalThis.x = ${JSON.stringify(
      clientManifest(
        LIBRARY_CLIENT_MODULE,
        LIBRARY_ROUTE_MODULE,
        'library-shell.js',
      ),
    )};`,
  )
  write(
    root,
    '.next/server/app/[locale]/specifications/[specificationId]/page_client-reference-manifest.js',
    `globalThis.x = ${JSON.stringify(
      clientManifest(
        SPECIFICATION_CLIENT_MODULE,
        SPECIFICATION_ROUTE_MODULE,
        'specification-shell.js',
      ),
    )};`,
  )
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requirement workflow bundle contract', () => {
  it('extracts the exact ordered feature imports', () => {
    expect(
      extractLazyRequirementWorkflowFeatureIds(launcherSources().join('\n')),
    ).toEqual(['ai-authoring', 'import-review'])
  })

  it('reports entry, incremental, total, and deduplicated handoff scenarios', () => {
    const root = fixtureRoot()
    for (const chunk of ['entry', 'ai', 'import', 'shared']) {
      write(root, `chunks/${chunk}.js`, `${chunk} code`)
    }

    const route = evaluateRequirementWorkflowRoute({
      entryChunks: ['static/chunks/entry.js'],
      importedFeatureIds: ['ai-authoring', 'import-review'],
      lazyChunkGroups: [
        ['static/chunks/ai.js', 'static/chunks/shared.js'],
        ['static/chunks/import.js', 'static/chunks/shared.js'],
      ],
      routeId: 'requirements-library',
      staticDirectory: root,
    })

    expect(route.entry.name).toBe('requirements-library-entry')
    expect(route.features.map(feature => feature.incremental.name)).toEqual([
      'requirements-library-ai-authoring-incremental',
      'requirements-library-import-review-incremental',
    ])
    expect(route.features.map(feature => feature.total.name)).toEqual([
      'requirements-library-ai-authoring',
      'requirements-library-import-review',
    ])
    expect(route.combined.name).toBe('requirements-library-ai-to-import')
    expect(route.combined.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/ai.js',
      'static/chunks/entry.js',
      'static/chunks/import.js',
      'static/chunks/shared.js',
    ])
  })

  it('fails closed for order, group count, empty groups, eager overlap, and collapsed graphs', () => {
    const root = fixtureRoot()
    write(root, 'chunks/entry.js', 'entry')
    write(root, 'chunks/ai.js', 'ai')
    write(root, 'chunks/import.js', 'import')
    write(root, 'chunks/shared.js', 'shared')
    const base = {
      entryChunks: ['static/chunks/entry.js'],
      importedFeatureIds: ['ai-authoring', 'import-review'],
      lazyChunkGroups: [
        ['static/chunks/ai.js', 'static/chunks/shared.js'],
        ['static/chunks/import.js', 'static/chunks/shared.js'],
      ],
      routeId: 'requirements-library',
      staticDirectory: root,
    }

    expect(() =>
      evaluateRequirementWorkflowRoute({
        ...base,
        importedFeatureIds: ['import-review', 'ai-authoring'],
      }),
    ).toThrow('must remain in this order')
    expect(() =>
      evaluateRequirementWorkflowRoute({
        ...base,
        importedFeatureIds: [],
        lazyChunkGroups: [],
      }),
    ).toThrow('Found: none')
    expect(() =>
      evaluateRequirementWorkflowRoute({ ...base, lazyChunkGroups: [] }),
    ).toThrow('Expected 2 compiled lazy requirement-workflow chunk sets')
    expect(() =>
      evaluateRequirementWorkflowRoute({
        ...base,
        lazyChunkGroups: [[], ['static/chunks/import.js']],
      }),
    ).toThrow('ai-authoring has no asynchronous chunks')
    expect(() =>
      evaluateRequirementWorkflowRoute({
        ...base,
        lazyChunkGroups: [
          ['static/chunks/entry.js'],
          ['static/chunks/import.js'],
        ],
      }),
    ).toThrow('included in requirements-library entry chunks')
    expect(() =>
      evaluateRequirementWorkflowRoute({
        ...base,
        lazyChunkGroups: [
          ['static/chunks/shared.js'],
          ['static/chunks/shared.js'],
        ],
      }),
    ).toThrow('must have separate asynchronous feature chunks')
  })

  it('enforces route entry and both incremental feature limits', () => {
    const report = readRequirementWorkflowBundleReport(writeCompleteFixture())
    const limits = Object.fromEntries(
      report.routes.map(route => [
        route.id,
        {
          entry: route.entry.gzipBytes,
          ...Object.fromEntries(
            route.features.map(feature => [
              feature.id,
              feature.incremental.gzipBytes,
            ]),
          ),
        },
      ]),
    )

    expect(requirementWorkflowBudgetFailures(report, limits)).toEqual([])
    expect(
      requirementWorkflowBudgetFailures(report, {
        ...limits,
        'requirements-library': {
          ...limits['requirements-library'],
          'import-review': 0,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        name: 'requirements-library-import-review-incremental',
      }),
    ])
  })

  it('reads both production manifests and supports report-only execution', () => {
    const root = writeCompleteFixture()
    const report = readRequirementWorkflowBundleReport(root)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    expect(report.routes.map(route => route.id)).toEqual([
      'requirements-library',
      'requirements-specification-detail',
    ])
    expect(report.routes[0].entry.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/library-shell.js',
    ])
    expect(
      runRequirementWorkflowBundleCheck({
        projectRoot: root,
        reportOnly: true,
      }),
    ).toEqual(report)
    expect(logSpy).toHaveBeenCalledTimes(12)
  })

  it('explains missing and incomplete production manifests', () => {
    const root = fixtureRoot()
    write(
      root,
      'components/LazyAiRequirementGenerator.tsx',
      launcherSources()[0],
    )
    write(
      root,
      'components/LazyRequirementsImportDialog.tsx',
      launcherSources()[1],
    )
    expect(() => readRequirementWorkflowBundleReport(root)).toThrow(
      'optimized production build',
    )

    write(
      root,
      '.next/server/app/[locale]/requirements/page_client-reference-manifest.js',
      `globalThis.x = ${JSON.stringify({ moduleLoading: {} })};`,
    )
    expect(() => readRequirementWorkflowBundleReport(root)).toThrow(
      'fields are incomplete',
    )
  })

  it('fails an over-budget feature with actionable diagnostics', () => {
    const root = writeCompleteFixture()
    write(
      root,
      '.next/static/chunks/library-ai.js',
      deterministicBytes(230_000),
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    expect(() =>
      runRequirementWorkflowBundleCheck({ projectRoot: root }),
    ).toThrow('Requirement workflow JavaScript bundle budget exceeded')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('exceeds limit by'),
    )
  })

  it('maps CLI options and non-Error failures to an exit code', () => {
    const runCheck = vi.fn()
    expect(
      runRequirementWorkflowBundleCli({
        argv: ['node', 'check-requirement-workflow-bundle.mjs', '--report'],
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
      runRequirementWorkflowBundleCli({
        argv: [],
        cwd: '/workspace/project',
        runCheck: () => {
          throw 'requirement workflow failure'
        },
      }),
    ).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('requirement workflow failure')
  })
})
