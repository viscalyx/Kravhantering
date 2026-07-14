import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

// 2026-07-14 production baseline 4,596 gzip bytes plus 5% headroom.
export const ADMIN_CENTER_ENTRY_GZIP_MAX_BYTES = 4_826
// 2026-07-14 largest panel baseline 8,824 gzip bytes plus 5% headroom.
export const ADMIN_CENTER_PANEL_GZIP_MAX_BYTES = 9_266

const ADMIN_ROUTE_MODULE = '[project]/app/[locale]/admin/page'
const LOCALE_LAYOUT_MODULE = '[project]/app/[locale]/layout'
const ADMIN_CLIENT_MODULE = '[project]/app/[locale]/admin/admin-client.tsx'

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
  return Array.from(
    source.matchAll(/Promise\.all\(\[([^\]]*)\]\.map\(/gu),
    match => {
      const chunks = JSON.parse(`[${match[1]}]`)
      if (
        !Array.isArray(chunks) ||
        chunks.some(
          chunk =>
            typeof chunk !== 'string' ||
            !/^static\/chunks\/.+\.js$/u.test(chunk),
        )
      ) {
        throw new Error('Admin Center contains an unrecognized lazy chunk set.')
      }
      return chunks
    },
  )
}

export function parseClientReferenceManifest(source) {
  const match = source.match(/=\s*(\{[^;]+\});\s*$/u)
  if (!match) {
    throw new Error('Could not parse the Admin Center client manifest.')
  }
  const manifest = JSON.parse(match[1])
  if (!manifest || typeof manifest !== 'object' || !manifest.moduleLoading) {
    throw new Error('Could not parse the Admin Center client manifest.')
  }
  return manifest
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

export function createScenario(name, chunks, staticDirectory) {
  const uniqueChunks = [...new Set(chunks)].sort()
  const files = uniqueChunks.map(chunk => {
    const path = join(staticDirectory, chunk.replace(/^static\//u, ''))
    const content = readFileSync(path)
    return {
      chunk,
      gzipBytes: gzipSync(content).byteLength,
      rawBytes: statSync(path).size,
    }
  })
  return {
    chunks: files,
    gzipBytes: files.reduce((total, file) => total + file.gzipBytes, 0),
    name,
    rawBytes: files.reduce((total, file) => total + file.rawBytes, 0),
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
  return scenarios
    .filter(scenario => scenario.gzipBytes > scenario.limit)
    .map(scenario => ({
      ...scenario,
      excessBytes: scenario.gzipBytes - scenario.limit,
    }))
}

export function formatScenario(scenario, limit) {
  const chunks = scenario.chunks
    .map(file => `${file.chunk} (${file.rawBytes} raw, ${file.gzipBytes} gzip)`)
    .join(', ')
  return `${scenario.name}: ${scenario.rawBytes} raw bytes, ${scenario.gzipBytes} gzip bytes, limit ${limit}; chunks: ${chunks}`
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
  let manifestSource
  try {
    manifestSource = readFileSync(manifestPath, 'utf8')
  } catch {
    throw new Error(
      'Admin Center bundle manifest is missing. Run an optimized production build first.',
    )
  }

  const manifest = parseClientReferenceManifest(manifestSource)
  const routeChunks = manifest.entryJSFiles?.[ADMIN_ROUTE_MODULE]
  const layoutChunks = manifest.entryJSFiles?.[LOCALE_LAYOUT_MODULE]
  const adminClientChunks =
    manifest.clientModules?.[ADMIN_CLIENT_MODULE]?.chunks
  if (!routeChunks || !layoutChunks || !adminClientChunks) {
    throw new Error('Admin Center bundle manifest fields are incomplete.')
  }
  const layoutChunkSet = new Set(layoutChunks)
  const entryChunks = routeChunks.filter(chunk => !layoutChunkSet.has(chunk))
  if (entryChunks.length === 0) {
    throw new Error('Admin Center has no route-specific entry chunk.')
  }
  const normalizedAdminClientChunks = adminClientChunks.map(chunk =>
    chunk.replace(/^\/_next\//u, ''),
  )
  const shellChunks = normalizedAdminClientChunks.filter(chunk =>
    entryChunks.includes(chunk),
  )
  if (shellChunks.length === 0) {
    throw new Error('Could not identify the Admin Center shell chunk.')
  }
  const staticDirectory = join(projectRoot, '.next', 'static')
  const shellSource = shellChunks
    .map(chunk =>
      readFileSync(
        join(staticDirectory, chunk.replace(/^static\//u, '')),
        'utf8',
      ),
    )
    .join('\n')

  return evaluateAdminBundle({
    entryChunks,
    importedPanelNames: extractLazyPanelImportNames(
      readFileSync(adminClientPath, 'utf8'),
    ),
    lazyChunkGroups: extractDynamicChunkGroups(shellSource),
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

const scriptPath = fileURLToPath(import.meta.url)
if (resolve(process.argv[1] ?? '') === scriptPath) {
  try {
    runAdminBundleCheck({
      projectRoot: resolve(process.cwd()),
      reportOnly: process.argv.includes('--report'),
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
