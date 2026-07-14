import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  budgetFailures,
  createScenario,
  formatScenario,
  readClientBundleArtifacts,
  runBundleCli,
} from './lib/client-bundle-budget.mjs'

export const REQUIREMENT_WORKFLOW_FEATURE_IDS = [
  'ai-authoring',
  'import-review',
]

const FEATURE_IMPORT_TO_ID = new Map([
  ['AiRequirementGenerator', 'ai-authoring'],
  ['RequirementsImportDialog', 'import-review'],
])

const ROUTES = [
  {
    clientModule: '[project]/app/[locale]/requirements/requirements-client.tsx',
    id: 'requirements-library',
    manifestSegments: ['[locale]', 'requirements'],
    routeModule: '[project]/app/[locale]/requirements/page',
    surfaceName: 'Requirements Library',
  },
  {
    clientModule:
      '[project]/app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx',
    id: 'requirements-specification-detail',
    manifestSegments: ['[locale]', 'specifications', '[specificationId]'],
    routeModule: '[project]/app/[locale]/specifications/[specificationId]/page',
    surfaceName: 'Requirement specification detail',
  },
]

export const REQUIREMENT_WORKFLOW_GZIP_MAX_BYTES = {
  'requirements-library': {
    // 2026-07-14 production baseline: 280,092 gzip bytes plus 5% headroom.
    entry: 294_097,
    // 2026-07-14 production baseline: 209,476 gzip bytes plus 5% headroom.
    'ai-authoring': 219_950,
    // 2026-07-14 production baseline: 97,619 gzip bytes plus 5% headroom.
    'import-review': 102_500,
  },
  'requirements-specification-detail': {
    // 2026-07-14 production baseline: 311,099 gzip bytes plus 5% headroom.
    entry: 326_654,
    // 2026-07-14 production baseline: 210,140 gzip bytes plus 5% headroom.
    'ai-authoring': 220_647,
    // 2026-07-14 production baseline: 97,492 gzip bytes plus 5% headroom.
    'import-review': 102_367,
  },
}

export function extractLazyRequirementWorkflowFeatureIds(source) {
  return Array.from(
    source.matchAll(
      /import\('@\/components\/(AiRequirementGenerator|RequirementsImportDialog)'\)/gu,
    ),
    match => FEATURE_IMPORT_TO_ID.get(match[1]),
  )
}

function assertExpectedFeatureOrder(importedFeatureIds) {
  if (
    JSON.stringify(importedFeatureIds) !==
    JSON.stringify(REQUIREMENT_WORKFLOW_FEATURE_IDS)
  ) {
    throw new Error(
      `Requirement workflow lazy imports must remain in this order: ${REQUIREMENT_WORKFLOW_FEATURE_IDS.join(', ')}. Found: ${importedFeatureIds.join(', ') || 'none'}.`,
    )
  }
}

export function evaluateRequirementWorkflowRoute({
  entryChunks,
  importedFeatureIds,
  lazyChunkGroups,
  routeId,
  staticDirectory,
}) {
  assertExpectedFeatureOrder(importedFeatureIds)
  if (lazyChunkGroups.length !== REQUIREMENT_WORKFLOW_FEATURE_IDS.length) {
    throw new Error(
      `Expected 2 compiled lazy requirement-workflow chunk sets for ${routeId}, found ${lazyChunkGroups.length}.`,
    )
  }

  const entryChunkSet = new Set(entryChunks)
  const featureChunks = new Map(
    importedFeatureIds.map((featureId, index) => {
      const chunks = lazyChunkGroups[index]
      if (chunks.length === 0) {
        throw new Error(
          `Requirement workflow ${featureId} has no asynchronous chunks for ${routeId}.`,
        )
      }
      const entryOverlap = chunks.filter(chunk => entryChunkSet.has(chunk))
      if (entryOverlap.length > 0) {
        throw new Error(
          `Requirement workflow ${featureId} is included in ${routeId} entry chunks: ${entryOverlap.join(', ')}.`,
        )
      }
      return [featureId, chunks]
    }),
  )

  const aiChunks = featureChunks.get('ai-authoring')
  const importChunks = featureChunks.get('import-review')
  const aiChunkSet = new Set(aiChunks)
  const importChunkSet = new Set(importChunks)
  if (
    !aiChunks.some(chunk => !importChunkSet.has(chunk)) ||
    !importChunks.some(chunk => !aiChunkSet.has(chunk))
  ) {
    throw new Error(
      `Requirement workflow features must have separate asynchronous feature chunks for ${routeId}.`,
    )
  }

  const features = importedFeatureIds.map(featureId => {
    const chunks = featureChunks.get(featureId)
    return {
      id: featureId,
      incremental: createScenario(
        `${routeId}-${featureId}-incremental`,
        chunks,
        staticDirectory,
      ),
      total: createScenario(
        `${routeId}-${featureId}`,
        [...entryChunks, ...chunks],
        staticDirectory,
      ),
    }
  })

  return {
    combined: createScenario(
      `${routeId}-ai-to-import`,
      [...entryChunks, ...aiChunks, ...importChunks],
      staticDirectory,
    ),
    entry: createScenario(`${routeId}-entry`, entryChunks, staticDirectory),
    features,
    id: routeId,
  }
}

export function requirementWorkflowBudgetFailures(
  report,
  limits = REQUIREMENT_WORKFLOW_GZIP_MAX_BYTES,
) {
  return budgetFailures(
    report.routes.flatMap(route => [
      { ...route.entry, limit: limits[route.id].entry },
      ...route.features.map(feature => ({
        ...feature.incremental,
        limit: limits[route.id][feature.id],
      })),
    ]),
  )
}

function readImportedFeatureIds(projectRoot) {
  const launcherSources = [
    join(projectRoot, 'components', 'LazyAiRequirementGenerator.tsx'),
    join(projectRoot, 'components', 'LazyRequirementsImportDialog.tsx'),
  ].map(path => readFileSync(path, 'utf8'))
  return extractLazyRequirementWorkflowFeatureIds(launcherSources.join('\n'))
}

export function readRequirementWorkflowBundleReport(projectRoot) {
  const importedFeatureIds = readImportedFeatureIds(projectRoot)
  return {
    routes: ROUTES.map(route => {
      const manifestPath = join(
        projectRoot,
        '.next',
        'server',
        'app',
        ...route.manifestSegments,
        'page_client-reference-manifest.js',
      )
      const { entryChunks, lazyChunkGroups, staticDirectory } =
        readClientBundleArtifacts({
          clientModule: route.clientModule,
          manifestPath,
          projectRoot,
          routeModule: route.routeModule,
          surfaceName: route.surfaceName,
        })

      return evaluateRequirementWorkflowRoute({
        entryChunks,
        importedFeatureIds,
        lazyChunkGroups,
        routeId: route.id,
        staticDirectory,
      })
    }),
  }
}

export function runRequirementWorkflowBundleCheck({
  projectRoot,
  reportOnly = false,
}) {
  const report = readRequirementWorkflowBundleReport(projectRoot)
  for (const route of report.routes) {
    const limits = REQUIREMENT_WORKFLOW_GZIP_MAX_BYTES[route.id]
    console.log(formatScenario(route.entry, limits.entry))
    for (const feature of route.features) {
      console.log(formatScenario(feature.incremental, limits[feature.id]))
      console.log(formatScenario(feature.total))
    }
    console.log(formatScenario(route.combined))
  }

  if (reportOnly) return report
  const failures = requirementWorkflowBudgetFailures(report)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `${formatScenario(failure, failure.limit)}; exceeds limit by ${failure.excessBytes} bytes`,
      )
    }
    throw new Error('Requirement workflow JavaScript bundle budget exceeded.')
  }
  return report
}

export function runRequirementWorkflowBundleCli({
  argv = process.argv,
  cwd = process.cwd(),
  runCheck = runRequirementWorkflowBundleCheck,
} = {}) {
  return runBundleCli({ argv, cwd, runCheck })
}

const scriptPath = fileURLToPath(import.meta.url)
/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (resolve(process.argv[1] ?? '') === scriptPath) {
  process.exitCode = runRequirementWorkflowBundleCli()
}
