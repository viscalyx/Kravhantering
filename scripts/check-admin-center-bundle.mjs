import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  budgetFailures,
  createScenario,
  extractDynamicChunkGroups as extractSharedDynamicChunkGroups,
  formatScenario,
  parseClientReferenceManifest as parseSharedClientReferenceManifest,
  readClientBundleArtifacts,
} from './lib/client-bundle-budget.mjs'

// 2026-07-14 production baseline 4,596 gzip bytes plus 5% headroom.
export const ADMIN_CENTER_ENTRY_GZIP_MAX_BYTES = 4_826
// 2026-07-14 largest panel baseline 8,824 gzip bytes plus 5% headroom.
export const ADMIN_CENTER_PANEL_GZIP_MAX_BYTES = 9_266

const ADMIN_ROUTE_MODULE = '[project]/app/[locale]/admin/page'
const ADMIN_CLIENT_MODULE = '[project]/app/[locale]/admin/admin-client.tsx'

export { createScenario, formatScenario }

export function discoverAdminPanelNames(panelDirectory) {
  return readdirSync(panelDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('-panel.tsx'))
    .map(entry => entry.name.replace(/\.tsx$/u, ''))
    .sort()
}

export function extractLazyPanelImportNames(source) {
  return Array.from(
    source.matchAll(/import\('\.\/panels\/([^']+-panel)'\)/gu),
    match => match[1],
  )
}

export function extractDynamicChunkGroups(source) {
  return extractSharedDynamicChunkGroups(source, 'Admin Center')
}

export function parseClientReferenceManifest(source) {
  return parseSharedClientReferenceManifest(source, 'Admin Center')
}

function assertSameNames(discoveredNames, importedNames) {
  const discovered = [...discoveredNames].sort()
  const imported = [...importedNames].sort()
  if (JSON.stringify(discovered) !== JSON.stringify(imported)) {
    const missingImports = discovered.filter(name => !imported.includes(name))
    const unknownImports = imported.filter(name => !discovered.includes(name))
    throw new Error(
      [
        'Admin Center panel files and lazy imports do not match.',
        missingImports.length > 0
          ? `Missing lazy imports: ${missingImports.join(', ')}`
          : null,
        unknownImports.length > 0
          ? `Unknown lazy imports: ${unknownImports.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }
}

export function evaluateAdminBundle({
  entryChunks,
  importedPanelNames,
  lazyChunkGroups,
  panelNames,
  staticDirectory,
}) {
  assertSameNames(panelNames, importedPanelNames)
  if (lazyChunkGroups.length !== importedPanelNames.length) {
    throw new Error(
      `Expected ${importedPanelNames.length} compiled lazy panel chunk sets, found ${lazyChunkGroups.length}.`,
    )
  }

  const entryChunkSet = new Set(entryChunks)
  const panels = importedPanelNames.map((name, index) => {
    const chunks = lazyChunkGroups[index]
    const entryOverlap = chunks.filter(chunk => entryChunkSet.has(chunk))
    if (entryOverlap.length > 0) {
      throw new Error(
        `Admin Center panel ${name} is included in entry chunks: ${entryOverlap.join(', ')}.`,
      )
    }
    if (chunks.length === 0) {
      throw new Error(`Admin Center panel ${name} has no asynchronous chunks.`)
    }
    return createScenario(name, chunks, staticDirectory)
  })

  return {
    entry: createScenario('admin-center-entry', entryChunks, staticDirectory),
    panels,
  }
}

export function bundleBudgetFailures(
  report,
  {
    entryLimit = ADMIN_CENTER_ENTRY_GZIP_MAX_BYTES,
    panelLimit = ADMIN_CENTER_PANEL_GZIP_MAX_BYTES,
  } = {},
) {
  const scenarios = [
    { ...report.entry, limit: entryLimit },
    ...report.panels.map(panel => ({ ...panel, limit: panelLimit })),
  ]
  return budgetFailures(scenarios)
}

export function readAdminBundleReport(projectRoot) {
  const panelDirectory = join(projectRoot, 'app', '[locale]', 'admin', 'panels')
  const adminClientPath = join(
    projectRoot,
    'app',
    '[locale]',
    'admin',
    'admin-client.tsx',
  )
  const manifestPath = join(
    projectRoot,
    '.next',
    'server',
    'app',
    '[locale]',
    'admin',
    'page_client-reference-manifest.js',
  )
  const { entryChunks, lazyChunkGroups, staticDirectory } =
    readClientBundleArtifacts({
      clientModule: ADMIN_CLIENT_MODULE,
      manifestPath,
      projectRoot,
      routeModule: ADMIN_ROUTE_MODULE,
      surfaceName: 'Admin Center',
    })

  return evaluateAdminBundle({
    entryChunks,
    importedPanelNames: extractLazyPanelImportNames(
      readFileSync(adminClientPath, 'utf8'),
    ),
    lazyChunkGroups,
    panelNames: discoverAdminPanelNames(panelDirectory),
    staticDirectory,
  })
}

export function runAdminBundleCheck({ projectRoot, reportOnly = false }) {
  const report = readAdminBundleReport(projectRoot)
  console.log(formatScenario(report.entry, ADMIN_CENTER_ENTRY_GZIP_MAX_BYTES))
  for (const panel of report.panels) {
    console.log(formatScenario(panel, ADMIN_CENTER_PANEL_GZIP_MAX_BYTES))
  }

  if (reportOnly) return report
  const failures = bundleBudgetFailures(report)
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
  process.exitCode = runAdminBundleCli()
}
