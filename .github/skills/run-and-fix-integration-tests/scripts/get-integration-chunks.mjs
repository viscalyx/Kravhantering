#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_ROOT = 'tests/integration'
const DEFAULT_AREAS_PER_CHUNK = 3
const DEFAULT_TARGET_SPECS = 10

function usage() {
  return `Usage: node .github/skills/run-and-fix-integration-tests/scripts/get-integration-chunks.mjs [options]

Options:
  --suite dev|prodlike       Suite to chunk. Default: dev
  --root <path>              Integration test root. Default: tests/integration
  --areas-per-chunk <count>  Target top-level areas per chunk. Default: 3
  --target-specs <count>     Target spec files per chunk. Default: 10
  --format commands|json|paths
                             Output format. Default: commands
  --help                     Show this help
`
}

function parseArgs(argv) {
  const parsed = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    if (rawKey === 'help') {
      parsed.help = true
      continue
    }

    const value = inlineValue ?? argv[index + 1]
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`)
    }
    if (inlineValue == null) index += 1

    parsed[rawKey] = value
  }

  return parsed
}

function readPositiveInteger(value, fallback, label) {
  if (value == null) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

function walkFiles(root) {
  const results = []

  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath))
    } else if (stat.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

function topLevelArea(root, specPath) {
  const relative = path.relative(root, specPath)
  const [area] = relative.split(path.sep)
  return area ? toPosixPath(path.join(root, area)) : toPosixPath(root)
}

function shouldIgnoreSpec(suite, specPath) {
  if (suite === 'dev') {
    return specPath === 'tests/integration/mcp/seeded-scan.spec.ts'
  }

  if (suite === 'prodlike') {
    return specPath.startsWith('tests/integration/developer-mode/')
  }

  return false
}

function buildChunks({ areasPerChunk, root, suite, targetSpecs }) {
  const allSpecs = walkFiles(root)
    .filter(file => file.endsWith('.spec.ts'))
    .map(toPosixPath)
    .sort()

  const ignoredSpecs = allSpecs.filter(spec => shouldIgnoreSpec(suite, spec))
  const includedSpecs = allSpecs.filter(spec => !shouldIgnoreSpec(suite, spec))
  const finalSpecs =
    suite === 'prodlike'
      ? includedSpecs.filter(spec => spec.startsWith('tests/integration/mcp/'))
      : []
  const normalSpecs =
    suite === 'prodlike'
      ? includedSpecs.filter(spec => !spec.startsWith('tests/integration/mcp/'))
      : includedSpecs
  const grouped = new Map()

  for (const spec of normalSpecs) {
    const area = topLevelArea(root, spec)
    const specs = grouped.get(area) ?? []
    specs.push(spec)
    grouped.set(area, specs)
  }

  const areas = [...grouped.entries()]
    .map(([area, specs]) => ({
      area,
      specCount: specs.length,
      specs,
    }))
    .sort((left, right) => left.area.localeCompare(right.area))

  const chunks = []
  let currentAreas = []
  let currentSpecCount = 0

  function flushCurrent() {
    if (currentAreas.length === 0) return
    chunks.push({
      paths: currentAreas.map(entry => entry.area),
      specCount: currentSpecCount,
    })
    currentAreas = []
    currentSpecCount = 0
  }

  for (const area of areas) {
    const isLargeArea = area.specCount >= targetSpecs
    const wouldExceedAreas = currentAreas.length >= areasPerChunk
    const wouldExceedSpecs = currentSpecCount + area.specCount > targetSpecs

    if (isLargeArea) {
      flushCurrent()
      chunks.push({ paths: [area.area], specCount: area.specCount })
      continue
    }

    if (currentAreas.length > 0 && (wouldExceedAreas || wouldExceedSpecs)) {
      flushCurrent()
    }

    currentAreas.push(area)
    currentSpecCount += area.specCount
  }
  flushCurrent()

  if (finalSpecs.length > 0) {
    chunks.push({
      paths: finalSpecs,
      specCount: finalSpecs.length,
    })
  }

  return {
    areasPerChunk,
    chunks,
    discoveredSpecCount: allSpecs.length,
    ignoredSpecs,
    includedSpecCount: includedSpecs.length,
    root: toPosixPath(root),
    suite,
    targetSpecs,
  }
}

function commandForChunk(suite, chunk, index) {
  const paths = chunk.paths.map(shellQuote).join(' ')
  if (suite === 'prodlike') {
    const authSetup = index === 0 ? 'PLAYWRIGHT_FORCE_AUTH_SETUP=1 ' : ''
    return `PLAYWRIGHT_SKIP_WEBSERVER=1 ${authSetup}npx playwright test --config=playwright.prodlike.config.ts ${paths}`
  }

  return `npm run test:integration -- ${paths}`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const suite = args.suite ?? 'dev'
  if (!['dev', 'prodlike'].includes(suite)) {
    throw new Error('--suite must be dev or prodlike')
  }

  const format = args.format ?? 'commands'
  if (!['commands', 'json', 'paths'].includes(format)) {
    throw new Error('--format must be commands, json, or paths')
  }

  const result = buildChunks({
    areasPerChunk: readPositiveInteger(
      args['areas-per-chunk'],
      DEFAULT_AREAS_PER_CHUNK,
      '--areas-per-chunk',
    ),
    root: args.root ?? DEFAULT_ROOT,
    suite,
    targetSpecs: readPositiveInteger(
      args['target-specs'],
      DEFAULT_TARGET_SPECS,
      '--target-specs',
    ),
  })

  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (format === 'paths') {
    process.stdout.write(
      `${result.chunks
        .map(chunk => chunk.paths.map(shellQuote).join(' '))
        .join('\n')}\n`,
    )
    return
  }

  const ignored =
    result.ignoredSpecs.length > 0
      ? ` (${result.ignoredSpecs.length} ignored by ${suite} config)`
      : ''
  process.stdout.write(
    `# ${suite}: ${result.includedSpecCount}/${result.discoveredSpecCount} specs in ${result.chunks.length} chunks${ignored}\n`,
  )
  process.stdout.write(
    `${result.chunks
      .map((chunk, index) => commandForChunk(suite, chunk, index))
      .join('\n')}\n`,
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
  process.stderr.write(usage())
  process.exitCode = 1
}
