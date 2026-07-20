import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  budgetFailures,
  createScenario,
  formatScenario,
  LOCALE_LAYOUT_MODULE,
  parseClientReferenceManifest,
  runBundleCli,
} from './lib/client-bundle-budget.mjs'

const ADMIN_ROUTE_ROOT = '[project]/app/[locale]/admin/workspaces'
const ADMIN_CLIENT_MODULE = '[project]/app/[locale]/admin/admin-client.tsx'

export const ADMIN_WORKSPACES = [
  {
    clientModule: '[project]/app/[locale]/admin/panels/columns-panel.tsx',
    id: 'columns',
    routeSegment: 'columns',
  },
  {
    clientModule: '[project]/app/[locale]/admin/panels/identity-panel.tsx',
    id: 'identity',
    routeSegment: 'identity',
  },
  {
    clientModule: '[project]/app/[locale]/admin/panels/settings-panel.tsx',
    id: 'settings',
    routeSegment: 'settings',
  },
  {
    clientModule: '[project]/app/[locale]/admin/panels/taxonomy-panel.tsx',
    id: 'taxonomy',
    routeSegment: 'taxonomy',
  },
  {
    clientModule:
      '[project]/app/[locale]/admin/panels/statuses-and-workflows-panel.tsx',
    id: 'statusesAndWorkflows',
    routeSegment: 'statuses-and-workflows',
  },
  {
    clientModule: '[project]/app/[locale]/admin/panels/access-review-panel.tsx',
    id: 'accessReview',
    routeSegment: 'access-review',
  },
  {
    clientModule: '[project]/app/[locale]/admin/panels/archiving-panel.tsx',
    id: 'archiving',
    routeSegment: 'archiving',
  },
  {
    clientModule: '[project]/app/[locale]/admin/panels/privacy-panel.tsx',
    id: 'privacy',
    routeSegment: 'privacy',
  },
  {
    clientModule:
      '[project]/app/[locale]/admin/panels/action-audit-log-panel.tsx',
    id: 'actionAuditLog',
    routeSegment: 'action-audit-log',
  },
]

export const ADMIN_WORKSPACE_GZIP_MAX_BYTES = {
  // 2026-07-20 isolated-route baseline: 13,236 gzip bytes plus 5% headroom.
  accessReview: 13_898,
  // 2026-07-20 isolated-route baseline: 6,357 gzip bytes plus 5% headroom.
  actionAuditLog: 6_675,
  // 2026-07-20 isolated-route baseline: 7,676 gzip bytes plus 5% headroom.
  archiving: 8_060,
  // 2026-07-20 isolated-route baseline: 9,265 gzip bytes plus 5% headroom.
  columns: 9_729,
  // 2026-07-20 isolated-route baseline: 9,191 gzip bytes plus 5% headroom.
  identity: 9_651,
  // 2026-07-20 isolated-route baseline: 12,599 gzip bytes plus 5% headroom.
  privacy: 13_229,
  // 2026-07-20 isolated-route baseline: 15,778 gzip bytes plus 5% headroom.
  settings: 16_567,
  // 2026-07-20 isolated-route baseline: 4,879 gzip bytes plus 5% headroom.
  statusesAndWorkflows: 5_123,
  // 2026-07-20 isolated-route baseline: 5,256 gzip bytes plus 5% headroom.
  taxonomy: 5_519,
}

function expectedWorkspaceIds() {
  return ADMIN_WORKSPACES.map(workspace => workspace.id)
}

function assertExpectedWorkspaceOrder(workspaces) {
  const actualIds = workspaces.map(workspace => workspace.id)
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedWorkspaceIds())) {
    throw new Error(
      `Admin workspace routes must remain in this order: ${expectedWorkspaceIds().join(', ')}. Found: ${actualIds.join(', ') || 'none'}.`,
    )
  }
}

function normalizeClientChunks(chunks) {
  return chunks.map(chunk => chunk.replace(/^\/_next\//u, ''))
}

export function workspaceChunksFromManifest(manifest, workspace) {
  const routeModule = `${ADMIN_ROUTE_ROOT}/${workspace.routeSegment}/page`
  const routeChunks = manifest.entryJSFiles?.[routeModule]
  const layoutChunks = manifest.entryJSFiles?.[LOCALE_LAYOUT_MODULE]
  const clientChunks = manifest.clientModules?.[ADMIN_CLIENT_MODULE]?.chunks
  const panelChunks = manifest.clientModules?.[workspace.clientModule]?.chunks

  if (
    !Array.isArray(routeChunks) ||
    !Array.isArray(layoutChunks) ||
    !Array.isArray(clientChunks) ||
    !Array.isArray(panelChunks)
  ) {
    throw new Error(
      `Admin ${workspace.id} bundle manifest fields are incomplete.`,
    )
  }

  const layoutChunkSet = new Set(normalizeClientChunks(layoutChunks))
  const selectedChunks = [
    ...normalizeClientChunks(routeChunks),
    ...normalizeClientChunks(clientChunks),
    ...normalizeClientChunks(panelChunks),
  ].filter(chunk => !layoutChunkSet.has(chunk))

  if (selectedChunks.length === 0) {
    throw new Error(
      `Admin ${workspace.id} has no route-specific client chunks.`,
    )
  }

  return [...new Set(selectedChunks)]
}

export function evaluateAdminBundle({ staticDirectory, workspaceRoutes }) {
  assertExpectedWorkspaceOrder(workspaceRoutes)

  return {
    workspaces: workspaceRoutes.map(workspace => {
      if (!Array.isArray(workspace.chunks) || workspace.chunks.length === 0) {
        throw new Error(`Admin workspace ${workspace.id} has no client chunks.`)
      }
      return {
        id: workspace.id,
        total: createScenario(
          `admin-${workspace.id}`,
          workspace.chunks,
          staticDirectory,
        ),
      }
    }),
  }
}

export function adminBudgetFailures(
  report,
  limits = ADMIN_WORKSPACE_GZIP_MAX_BYTES,
) {
  return budgetFailures(
    report.workspaces.map(workspace => ({
      ...workspace.total,
      limit: limits[workspace.id],
    })),
  )
}

export function readAdminBundleReport(projectRoot) {
  const workspaceRoutes = ADMIN_WORKSPACES.map(workspace => {
    const manifestPath = join(
      projectRoot,
      '.next',
      'server',
      'app',
      '[locale]',
      'admin',
      'workspaces',
      workspace.routeSegment,
      'page_client-reference-manifest.js',
    )
    let manifestSource
    try {
      manifestSource = readFileSync(manifestPath, 'utf8')
    } catch {
      throw new Error(
        `Admin ${workspace.id} bundle manifest is missing. Run an optimized production build first.`,
      )
    }
    const manifest = parseClientReferenceManifest(
      manifestSource,
      `Admin ${workspace.id}`,
    )
    return {
      chunks: workspaceChunksFromManifest(manifest, workspace),
      id: workspace.id,
    }
  })

  return evaluateAdminBundle({
    staticDirectory: join(projectRoot, '.next', 'static'),
    workspaceRoutes,
  })
}

export function runAdminBundleCheck({ projectRoot, reportOnly = false }) {
  const report = readAdminBundleReport(projectRoot)
  for (const workspace of report.workspaces) {
    console.log(
      formatScenario(
        workspace.total,
        ADMIN_WORKSPACE_GZIP_MAX_BYTES[workspace.id],
      ),
    )
  }

  if (reportOnly) return report
  const failures = adminBudgetFailures(report)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `${formatScenario(failure, failure.limit)}; exceeds limit by ${failure.excessBytes} bytes`,
      )
    }
    throw new Error('Admin Center JavaScript bundle budget exceeded.')
  }
  return report
}

export function runAdminBundleCli({
  argv = process.argv,
  cwd = process.cwd(),
  runCheck = runAdminBundleCheck,
} = {}) {
  return runBundleCli({ argv, cwd, runCheck })
}

const scriptPath = fileURLToPath(import.meta.url)
/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (resolve(process.argv[1] ?? '') === scriptPath) {
  process.exitCode = runAdminBundleCli()
}
