import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

export const LOCALE_LAYOUT_MODULE = '[project]/app/[locale]/layout'

export function extractDynamicChunkGroups(source, surfaceName) {
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
        throw new Error(
          `${surfaceName} contains an unrecognized lazy chunk set.`,
        )
      }
      return chunks
    },
  )
}

export function parseClientReferenceManifest(source, surfaceName) {
  const match = source.match(/=\s*(\{[^;]+\});\s*$/u)
  if (!match) {
    throw new Error(`Could not parse the ${surfaceName} client manifest.`)
  }

  let manifest
  try {
    manifest = JSON.parse(match[1])
  } catch {
    throw new Error(`Could not parse the ${surfaceName} client manifest.`)
  }
  if (!manifest || typeof manifest !== 'object' || !manifest.moduleLoading) {
    throw new Error(`Could not parse the ${surfaceName} client manifest.`)
  }
  return manifest
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

export function formatScenario(scenario, limit) {
  const chunks = scenario.chunks
    .map(file => `${file.chunk} (${file.rawBytes} raw, ${file.gzipBytes} gzip)`)
    .join(', ')
  const limitText = limit == null ? '' : `, limit ${limit}`
  return `${scenario.name}: ${scenario.rawBytes} raw bytes, ${scenario.gzipBytes} gzip bytes${limitText}; chunks: ${chunks}`
}

export function budgetFailures(scenarios) {
  return scenarios
    .filter(scenario => scenario.gzipBytes > scenario.limit)
    .map(scenario => ({
      ...scenario,
      excessBytes: scenario.gzipBytes - scenario.limit,
    }))
}

export function readClientBundleArtifacts({
  clientModule,
  manifestPath,
  projectRoot,
  routeModule,
  surfaceName,
}) {
  let manifestSource
  try {
    manifestSource = readFileSync(manifestPath, 'utf8')
  } catch {
    throw new Error(
      `${surfaceName} bundle manifest is missing. Run an optimized production build first.`,
    )
  }

  const manifest = parseClientReferenceManifest(manifestSource, surfaceName)
  const routeChunks = manifest.entryJSFiles?.[routeModule]
  const layoutChunks = manifest.entryJSFiles?.[LOCALE_LAYOUT_MODULE]
  const clientChunks = manifest.clientModules?.[clientModule]?.chunks
  if (
    !Array.isArray(routeChunks) ||
    !Array.isArray(layoutChunks) ||
    !Array.isArray(clientChunks)
  ) {
    throw new Error(`${surfaceName} bundle manifest fields are incomplete.`)
  }

  const layoutChunkSet = new Set(layoutChunks)
  const entryChunks = routeChunks.filter(chunk => !layoutChunkSet.has(chunk))
  if (entryChunks.length === 0) {
    throw new Error(`${surfaceName} has no route-specific entry chunk.`)
  }

  const normalizedClientChunks = clientChunks.map(chunk =>
    chunk.replace(/^\/_next\//u, ''),
  )
  const shellChunks = normalizedClientChunks.filter(chunk =>
    entryChunks.includes(chunk),
  )
  if (shellChunks.length === 0) {
    throw new Error(`Could not identify the ${surfaceName} shell chunk.`)
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

  return {
    entryChunks,
    lazyChunkGroups: extractDynamicChunkGroups(shellSource, surfaceName),
    staticDirectory,
  }
}
