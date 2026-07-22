import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_WORKSPACES,
  adminBudgetFailures,
  evaluateAdminBundle,
  readAdminBundleReport,
  runAdminBundleCheck,
  runAdminBundleCli,
  workspaceChunksFromManifest,
} from '../../scripts/check-admin-center-bundle.mjs'
import { deterministicBytes } from './helpers/bundle-test-helpers.mjs'

const ADMIN_CLIENT_MODULE = '[project]/app/[locale]/admin/admin-client.tsx'
const LAYOUT_MODULE = '[project]/app/[locale]/layout'

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'admin-center-bundle-'))
}

function write(root, relativePath, content) {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

function clientManifest(workspace) {
  const routeModule =
    `[project]/app/[locale]/admin/workspaces/` +
    `${workspace.routeSegment}/page`
  return {
    clientModules: {
      [ADMIN_CLIENT_MODULE]: {
        chunks: ['/_next/static/chunks/shell.js'],
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
  for (const name of ['layout', 'shell', 'shared']) {
    write(root, `.next/static/chunks/${name}.js`, name)
  }
  for (const workspace of ADMIN_WORKSPACES) {
    write(
      root,
      `.next/static/chunks/${workspace.id}-route.js`,
      `${workspace.id} route`,
    )
    write(
      root,
      `.next/static/chunks/${workspace.id}.js`,
      `${workspace.id} panel`,
    )
    write(
      root,
      `.next/server/app/[locale]/admin/workspaces/${workspace.routeSegment}/page_client-reference-manifest.js`,
      `globalThis.x = ${JSON.stringify(clientManifest(workspace))};`,
    )
  }
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Admin Center bundle contract', () => {
  it('selects only the requested workspace route and client chunks', () => {
    const workspace = ADMIN_WORKSPACES[7]

    expect(
      workspaceChunksFromManifest(clientManifest(workspace), workspace),
    ).toEqual([
      'static/chunks/privacy-route.js',
      'static/chunks/shell.js',
      'static/chunks/privacy.js',
      'static/chunks/shared.js',
    ])
  })

  it('measures every isolated workspace without double-counting chunks', () => {
    const root = fixtureRoot()
    write(root, 'chunks/shared.js', 'shared')
    const workspaceRoutes = ADMIN_WORKSPACES.map(workspace => {
      write(root, `chunks/${workspace.id}.js`, workspace.id)
      return {
        chunks: [`chunks/${workspace.id}.js`, 'chunks/shared.js'],
        id: workspace.id,
      }
    })

    const report = evaluateAdminBundle({
      staticDirectory: root,
      workspaceRoutes,
    })

    expect(report.workspaces.map(workspace => workspace.total.name)).toEqual(
      ADMIN_WORKSPACES.map(workspace => `admin-${workspace.id}`),
    )
    expect(report.workspaces[0].total.chunks.map(file => file.chunk)).toEqual([
      'chunks/columns.js',
      'chunks/shared.js',
    ])
  })

  it('fails closed for route order, empty routes, and incomplete manifests', () => {
    const root = fixtureRoot()
    write(root, 'chunks/a.js', 'a')
    const completeRoutes = ADMIN_WORKSPACES.map(workspace => ({
      chunks: ['chunks/a.js'],
      id: workspace.id,
    }))

    expect(() =>
      evaluateAdminBundle({
        staticDirectory: root,
        workspaceRoutes: [
          completeRoutes[1],
          completeRoutes[0],
          ...completeRoutes.slice(2),
        ],
      }),
    ).toThrow('must remain in this order')
    expect(() =>
      evaluateAdminBundle({ staticDirectory: root, workspaceRoutes: [] }),
    ).toThrow('Found: none')
    expect(() =>
      evaluateAdminBundle({
        staticDirectory: root,
        workspaceRoutes: [
          { ...completeRoutes[0], chunks: [] },
          ...completeRoutes.slice(1),
        ],
      }),
    ).toThrow('has no client chunks')
    expect(() =>
      workspaceChunksFromManifest({ moduleLoading: {} }, ADMIN_WORKSPACES[0]),
    ).toThrow('manifest fields are incomplete')
  })

  it('applies individual workspace limits', () => {
    const report = readAdminBundleReport(writeCompleteFixture())
    const exactLimits = Object.fromEntries(
      report.workspaces.map(workspace => [
        workspace.id,
        workspace.total.gzipBytes,
      ]),
    )

    expect(adminBudgetFailures(report, exactLimits)).toEqual([])
    expect(adminBudgetFailures(report, { ...exactLimits, privacy: 0 })).toEqual(
      [
        expect.objectContaining({
          excessBytes: report.workspaces[7].total.gzipBytes,
          name: 'admin-privacy',
        }),
      ],
    )
  })

  it('reads isolated build fixtures and supports report-only execution', () => {
    const root = writeCompleteFixture()
    const report = readAdminBundleReport(root)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    expect(report.workspaces[7].total.chunks.map(file => file.chunk)).toEqual([
      'static/chunks/privacy-route.js',
      'static/chunks/privacy.js',
      'static/chunks/shared.js',
      'static/chunks/shell.js',
    ])
    expect(
      runAdminBundleCheck({ projectRoot: root, reportOnly: true }),
    ).toEqual(report)
    expect(logSpy).toHaveBeenCalledTimes(ADMIN_WORKSPACES.length)
  })

  it('explains missing production manifests', () => {
    expect(() => readAdminBundleReport(fixtureRoot())).toThrow(
      'optimized production build',
    )
  })

  it('fails an over-budget workspace with actionable diagnostics', () => {
    const root = writeCompleteFixture()
    write(root, '.next/static/chunks/privacy.js', deterministicBytes(600_000))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    expect(() => runAdminBundleCheck({ projectRoot: root })).toThrow(
      'Admin Center JavaScript bundle budget exceeded',
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('exceeds limit by'),
    )
  })

  it('maps Admin CLI options and non-Error failures to an exit code', () => {
    const runCheck = vi.fn()
    expect(
      runAdminBundleCli({
        argv: ['node', 'check-admin-center-bundle.mjs', '--report'],
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
      runAdminBundleCli({
        argv: [],
        cwd: '/workspace/project',
        runCheck: () => {
          throw 'admin failure'
        },
      }),
    ).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('admin failure')
  })
})
