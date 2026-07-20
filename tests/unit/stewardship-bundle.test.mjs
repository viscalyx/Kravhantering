import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateStewardshipBundle,
  readStewardshipBundleReport,
  runStewardshipBundleCheck,
  runStewardshipBundleCli,
  STEWARDSHIP_WORKSPACES,
  stewardshipBudgetFailures,
  workspaceChunksFromManifest,
} from '../../scripts/check-stewardship-bundle.mjs'
import { deterministicBytes } from './helpers/bundle-test-helpers.mjs'

const BOUNDARY_MODULE =
  '[project]/app/[locale]/requirements/stewardship/stewardship-lazy-workspace.tsx'
const LAYOUT_MODULE = '[project]/app/[locale]/layout'

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'stewardship-bundle-'))
}

function write(root, relativePath, content) {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

function clientManifest(workspace) {
  const routeModule =
    `[project]/app/[locale]/requirements/stewardship/workspaces/` +
    `${workspace.routeSegment}/page`
  return {
    clientModules: {
      [BOUNDARY_MODULE]: {
        chunks: ['/_next/static/chunks/boundary.js'],
      },
      [workspace.clientModule]: {
        chunks: [
          `/_next/static/chunks/${workspace.id}.js`,
          '/_next/static/chunks/shared.js',
        ],
      },
    },
    entryJSFiles: {
      [LAYOUT_MODULE]: ['static/chunks/layout.js'],
      [routeModule]: [
        'static/chunks/layout.js',
        `static/chunks/${workspace.id}-route.js`,
      ],
    },
    moduleLoading: {},
  }
}

function writeCompleteFixture() {
  const root = fixtureRoot()
  write(root, '.next/static/chunks/layout.js', 'layout')
  write(root, '.next/static/chunks/boundary.js', 'boundary')
  write(root, '.next/static/chunks/shared.js', 'shared')

  for (const workspace of STEWARDSHIP_WORKSPACES) {
    write(
      root,
      `.next/static/chunks/${workspace.id}-route.js`,
      `${workspace.id} route`,
    )
    write(
      root,
      `.next/static/chunks/${workspace.id}.js`,
      `${workspace.id} workspace`,
    )
    write(
      root,
      `.next/server/app/[locale]/requirements/stewardship/workspaces/${workspace.routeSegment}/page_client-reference-manifest.js`,
      `globalThis.x = ${JSON.stringify(clientManifest(workspace))};`,
    )
  }
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stewardship bundle contract', () => {
  it('selects only the requested workspace route and client chunks', () => {
    const workspace = STEWARDSHIP_WORKSPACES[2]
    const manifest = clientManifest(workspace)

    expect(workspaceChunksFromManifest(manifest, workspace)).toEqual([
      'static/chunks/rfi-route.js',
      'static/chunks/rfi.js',
      'static/chunks/shared.js',
      'static/chunks/boundary.js',
    ])
  })

  it('measures each isolated workspace without double-counting chunks', () => {
    const root = fixtureRoot()
    for (const name of ['packages', 'questions', 'rfi', 'norms', 'shared']) {
      write(root, `chunks/${name}.js`, name)
    }

    const report = evaluateStewardshipBundle({
      staticDirectory: root,
      workspaceRoutes: [
        {
          chunks: ['static/chunks/packages.js', 'static/chunks/shared.js'],
          id: 'packages',
        },
        {
          chunks: ['static/chunks/questions.js', 'static/chunks/shared.js'],
          id: 'questions',
        },
        { chunks: ['static/chunks/rfi.js'], id: 'rfi' },
        { chunks: ['static/chunks/norms.js'], id: 'norms' },
      ],
    })

    expect(report.workspaces.map(workspace => workspace.total.name)).toEqual([
      'stewardship-packages',
      'stewardship-questions',
      'stewardship-rfi',
      'stewardship-norms',
    ])
    expect(report.workspaces[0].total.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/packages.js',
      'static/chunks/shared.js',
    ])
  })

  it('fails closed for route order, empty routes, and incomplete manifests', () => {
    const root = fixtureRoot()
    write(root, 'chunks/a.js', 'a')
    const completeRoutes = STEWARDSHIP_WORKSPACES.map(workspace => ({
      chunks: ['static/chunks/a.js'],
      id: workspace.id,
    }))

    expect(() =>
      evaluateStewardshipBundle({
        staticDirectory: root,
        workspaceRoutes: [
          completeRoutes[1],
          completeRoutes[0],
          ...completeRoutes.slice(2),
        ],
      }),
    ).toThrow('must remain in this order')
    expect(() =>
      evaluateStewardshipBundle({
        staticDirectory: root,
        workspaceRoutes: [],
      }),
    ).toThrow('Found: none')
    expect(() =>
      evaluateStewardshipBundle({
        staticDirectory: root,
        workspaceRoutes: [
          { ...completeRoutes[0], chunks: [] },
          ...completeRoutes.slice(1),
        ],
      }),
    ).toThrow('has no client chunks')

    const workspace = STEWARDSHIP_WORKSPACES[0]
    expect(() =>
      workspaceChunksFromManifest({ moduleLoading: {} }, workspace),
    ).toThrow('manifest fields are incomplete')
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

  it('reads isolated build fixtures and supports report-only execution', () => {
    const root = writeCompleteFixture()
    const report = readStewardshipBundleReport(root)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    expect(report.workspaces[2].total.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/boundary.js',
      'static/chunks/rfi-route.js',
      'static/chunks/rfi.js',
      'static/chunks/shared.js',
    ])
    expect(
      runStewardshipBundleCheck({ projectRoot: root, reportOnly: true }),
    ).toEqual(report)
    expect(logSpy).toHaveBeenCalledTimes(4)
  })

  it('explains missing production manifests', () => {
    expect(() => readStewardshipBundleReport(fixtureRoot())).toThrow(
      'optimized production build',
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
