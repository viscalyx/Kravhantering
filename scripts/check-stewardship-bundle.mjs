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

const STEWARDSHIP_ROUTE_ROOT =
  '[project]/app/[locale]/requirements/stewardship/workspaces'
const STEWARDSHIP_BOUNDARY_MODULE =
  '[project]/app/[locale]/requirements/stewardship/stewardship-lazy-workspace.tsx'

export const STEWARDSHIP_WORKSPACES = [
  {
    clientModule:
      '[project]/app/[locale]/requirement-packages/requirement-packages-client.tsx',
    id: 'packages',
    routeSegment: 'packages',
  },
  {
    clientModule:
      '[project]/app/[locale]/requirements/stewardship/requirement-selection-questions-client.tsx',
    id: 'questions',
    routeSegment: 'questions',
  },
  {
    clientModule:
      '[project]/app/[locale]/requirements/stewardship/rfi-questions-client.tsx',
    id: 'rfi',
    routeSegment: 'information-requests',
  },
  {
    clientModule:
      '[project]/app/[locale]/norm-references/norm-references-client.tsx',
    id: 'norms',
    routeSegment: 'norms',
  },
]

export const STEWARDSHIP_WORKSPACE_GZIP_MAX_BYTES = {
  // 2026-07-20 isolated-route baseline: 244,443 gzip bytes plus 5% headroom.
  packages: 256_666,
  // 2026-07-20 isolated-route baseline: 268,160 gzip bytes plus 5% headroom.
  questions: 281_568,
  // 2026-07-20 isolated-route baseline: 11,780 gzip bytes plus 5% headroom.
  rfi: 12_369,
  // 2026-07-20 isolated-route baseline: 237,747 gzip bytes plus 5% headroom.
  norms: 249_635,
}

function expectedWorkspaceIds() {
  return STEWARDSHIP_WORKSPACES.map(workspace => workspace.id)
}

function assertExpectedWorkspaceOrder(workspaces) {
  const actualIds = workspaces.map(workspace => workspace.id)
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedWorkspaceIds())) {
    throw new Error(
      `Stewardship workspace routes must remain in this order: ${expectedWorkspaceIds().join(', ')}. Found: ${actualIds.join(', ') || 'none'}.`,
    )
  }
}

function normalizeClientChunks(chunks) {
  return chunks.map(chunk => chunk.replace(/^\/_next\//u, ''))
}

export function workspaceChunksFromManifest(manifest, workspace) {
  const routeModule = `${STEWARDSHIP_ROUTE_ROOT}/${workspace.routeSegment}/page`
  const routeChunks = manifest.entryJSFiles?.[routeModule]
  const layoutChunks = manifest.entryJSFiles?.[LOCALE_LAYOUT_MODULE]
  const workspaceChunks =
    manifest.clientModules?.[workspace.clientModule]?.chunks
  const boundaryChunks =
    manifest.clientModules?.[STEWARDSHIP_BOUNDARY_MODULE]?.chunks

  if (
    !Array.isArray(routeChunks) ||
    !Array.isArray(layoutChunks) ||
    !Array.isArray(workspaceChunks) ||
    !Array.isArray(boundaryChunks)
  ) {
    throw new Error(
      `Stewardship ${workspace.id} bundle manifest fields are incomplete.`,
    )
  }

  const layoutChunkSet = new Set(normalizeClientChunks(layoutChunks))
  const selectedChunks = [
    ...normalizeClientChunks(routeChunks),
    ...normalizeClientChunks(workspaceChunks),
    ...normalizeClientChunks(boundaryChunks),
  ].filter(chunk => !layoutChunkSet.has(chunk))

  if (selectedChunks.length === 0) {
    throw new Error(
      `Stewardship ${workspace.id} has no route-specific client chunks.`,
    )
  }

  return [...new Set(selectedChunks)]
}

export function evaluateStewardshipBundle({
  staticDirectory,
  workspaceRoutes,
}) {
  assertExpectedWorkspaceOrder(workspaceRoutes)

  return {
    workspaces: workspaceRoutes.map(workspace => {
      if (!Array.isArray(workspace.chunks) || workspace.chunks.length === 0) {
        throw new Error(
          `Stewardship workspace ${workspace.id} has no client chunks.`,
        )
      }
      return {
        id: workspace.id,
        total: createScenario(
          `stewardship-${workspace.id}`,
          workspace.chunks,
          staticDirectory,
        ),
      }
    }),
  }
}

export function stewardshipBudgetFailures(
  report,
  limits = STEWARDSHIP_WORKSPACE_GZIP_MAX_BYTES,
) {
  return budgetFailures(
    report.workspaces.map(workspace => ({
      ...workspace.total,
      limit: limits[workspace.id],
    })),
  )
}

export function readStewardshipBundleReport(projectRoot) {
  const workspaceRoutes = STEWARDSHIP_WORKSPACES.map(workspace => {
    const manifestPath = join(
      projectRoot,
      '.next',
      'server',
      'app',
      '[locale]',
      'requirements',
      'stewardship',
      'workspaces',
      workspace.routeSegment,
      'page_client-reference-manifest.js',
    )
    let manifestSource
    try {
      manifestSource = readFileSync(manifestPath, 'utf8')
    } catch {
      throw new Error(
        `Stewardship ${workspace.id} bundle manifest is missing. Run an optimized production build first.`,
      )
    }
    const manifest = parseClientReferenceManifest(
      manifestSource,
      `Stewardship ${workspace.id}`,
    )
    return {
      chunks: workspaceChunksFromManifest(manifest, workspace),
      id: workspace.id,
    }
  })

  return evaluateStewardshipBundle({
    staticDirectory: join(projectRoot, '.next', 'static'),
    workspaceRoutes,
  })
}

export function runStewardshipBundleCheck({ projectRoot, reportOnly = false }) {
  const report = readStewardshipBundleReport(projectRoot)
  for (const workspace of report.workspaces) {
    console.log(
      formatScenario(
        workspace.total,
        STEWARDSHIP_WORKSPACE_GZIP_MAX_BYTES[workspace.id],
      ),
    )
  }

  if (reportOnly) return report
  const failures = stewardshipBudgetFailures(report)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `${formatScenario(failure, failure.limit)}; exceeds limit by ${failure.excessBytes} bytes`,
      )
    }
    throw new Error('Stewardship JavaScript bundle budget exceeded.')
  }
  return report
}

export function runStewardshipBundleCli({
  argv = process.argv,
  cwd = process.cwd(),
  runCheck = runStewardshipBundleCheck,
} = {}) {
  return runBundleCli({ argv, cwd, runCheck })
}

const scriptPath = fileURLToPath(import.meta.url)
/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (resolve(process.argv[1] ?? '') === scriptPath) {
  process.exitCode = runStewardshipBundleCli()
}
