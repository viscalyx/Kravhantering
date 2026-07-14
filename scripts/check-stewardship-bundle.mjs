import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  budgetFailures,
  createScenario,
  formatScenario,
  readClientBundleArtifacts,
} from './lib/client-bundle-budget.mjs'

const STEWARDSHIP_ROUTE_MODULE =
  '[project]/app/[locale]/requirements/stewardship/page'
const STEWARDSHIP_CLIENT_MODULE =
  '[project]/app/[locale]/requirements/stewardship/stewardship-client.tsx'

export const STEWARDSHIP_WORKSPACE_IDS = [
  'packages',
  'questions',
  'rfi',
  'norms',
]

const IMPORT_PATH_TO_WORKSPACE = new Map([
  ['../../requirement-packages/requirement-packages-client', 'packages'],
  ['./requirement-selection-questions-client', 'questions'],
  ['./rfi-questions-client', 'rfi'],
  ['../../norm-references/norm-references-client', 'norms'],
])

export const STEWARDSHIP_WORKSPACE_GZIP_MAX_BYTES = {
  // 2026-07-14 production baseline: 245,256 gzip bytes plus 5% headroom.
  packages: 257_519,
  // 2026-07-14 production baseline: 268,875 gzip bytes plus 5% headroom.
  questions: 282_319,
  // 2026-07-14 production baseline: 13,072 gzip bytes plus 5% headroom.
  rfi: 13_726,
  // 2026-07-14 production baseline: 238,348 gzip bytes plus 5% headroom.
  norms: 250_266,
}

export function extractLazyWorkspaceIds(source) {
  return Array.from(source.matchAll(/import\(\s*'([^']+)'\s*\)/gu), match => {
    const workspaceId = IMPORT_PATH_TO_WORKSPACE.get(match[1])
    if (!workspaceId) {
      throw new Error(
        `Stewardship contains an unknown lazy workspace import: ${match[1]}.`,
      )
    }
    return workspaceId
  })
}

function assertExpectedWorkspaceOrder(importedWorkspaceIds) {
  if (
    JSON.stringify(importedWorkspaceIds) !==
    JSON.stringify(STEWARDSHIP_WORKSPACE_IDS)
  ) {
    throw new Error(
      `Stewardship lazy workspace imports must remain in this order: ${STEWARDSHIP_WORKSPACE_IDS.join(', ')}. Found: ${importedWorkspaceIds.join(', ') || 'none'}.`,
    )
  }
}

export function evaluateStewardshipBundle({
  entryChunks,
  importedWorkspaceIds,
  lazyChunkGroups,
  staticDirectory,
}) {
  assertExpectedWorkspaceOrder(importedWorkspaceIds)
  if (lazyChunkGroups.length !== importedWorkspaceIds.length) {
    throw new Error(
      `Expected ${importedWorkspaceIds.length} compiled lazy stewardship chunk sets, found ${lazyChunkGroups.length}.`,
    )
  }

  const entryChunkSet = new Set(entryChunks)
  const workspaces = importedWorkspaceIds.map((workspaceId, index) => {
    const chunks = lazyChunkGroups[index]
    if (chunks.length === 0) {
      throw new Error(
        `Stewardship workspace ${workspaceId} has no asynchronous chunks.`,
      )
    }
    const entryOverlap = chunks.filter(chunk => entryChunkSet.has(chunk))
    if (entryOverlap.length > 0) {
      throw new Error(
        `Stewardship workspace ${workspaceId} is included in entry chunks: ${entryOverlap.join(', ')}.`,
      )
    }

    return {
      id: workspaceId,
      incremental: createScenario(
        `stewardship-${workspaceId}-incremental`,
        chunks,
        staticDirectory,
      ),
      total: createScenario(
        `stewardship-${workspaceId}`,
        [...entryChunks, ...chunks],
        staticDirectory,
      ),
    }
  })

  return {
    entry: createScenario('stewardship-entry', entryChunks, staticDirectory),
    workspaces,
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
  const stewardshipClientPath = join(
    projectRoot,
    'app',
    '[locale]',
    'requirements',
    'stewardship',
    'stewardship-client.tsx',
  )
  const manifestPath = join(
    projectRoot,
    '.next',
    'server',
    'app',
    '[locale]',
    'requirements',
    'stewardship',
    'page_client-reference-manifest.js',
  )
  const { entryChunks, lazyChunkGroups, staticDirectory } =
    readClientBundleArtifacts({
      clientModule: STEWARDSHIP_CLIENT_MODULE,
      manifestPath,
      projectRoot,
      routeModule: STEWARDSHIP_ROUTE_MODULE,
      surfaceName: 'Stewardship',
    })

  return evaluateStewardshipBundle({
    entryChunks,
    importedWorkspaceIds: extractLazyWorkspaceIds(
      readFileSync(stewardshipClientPath, 'utf8'),
    ),
    lazyChunkGroups,
    staticDirectory,
  })
}

export function runStewardshipBundleCheck({ projectRoot, reportOnly = false }) {
  const report = readStewardshipBundleReport(projectRoot)
  console.log(formatScenario(report.entry))
  for (const workspace of report.workspaces) {
    console.log(formatScenario(workspace.incremental))
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
  try {
    runCheck({
      projectRoot: resolve(cwd),
      reportOnly: argv.includes('--report'),
    })
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const scriptPath = fileURLToPath(import.meta.url)
/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (resolve(process.argv[1] ?? '') === scriptPath) {
  process.exitCode = runStewardshipBundleCli()
}
