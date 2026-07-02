#!/usr/bin/env node
import childProcess from 'node:child_process'
import { createWriteStream, existsSync, readdirSync, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ROOT = 'tests/integration'
export const DEFAULT_AREAS_PER_CHUNK = 3
export const DEFAULT_TARGET_SPECS = 10
export const MANIFEST_PATH = 'tests/integration-chunks.manifest.json'

const GENERATED_BY = 'tests/integration-chunks.mjs'
const SUITE_NAMES = ['dev', 'prodlike']

const SUITE_CONFIG = {
  dev: {
    baseUrl: 'http://localhost:3000',
    buildCommand: null,
    configArgs: [],
    outputName: 'dev',
    port: 3000,
    serverCommand: ['npm', ['run', 'dev']],
    serverEnv: {
      ENABLE_ERROR_BOUNDARY_TEST_ROUTE: '1',
      NODE_ENV: 'development',
    },
  },
  prodlike: {
    baseUrl: 'http://localhost:3001',
    buildCommand: [
      'npm',
      ['run', 'build:local-prod'],
      { ENABLE_ERROR_BOUNDARY_TEST_ROUTE: '1' },
    ],
    configArgs: ['--config=playwright.prodlike.config.ts'],
    outputName: 'prodlike',
    port: 3001,
    serverCommand: ['npm', ['run', 'start:prodlike-pruned']],
    serverEnv: {
      BUILD_TARGET: 'local-prod',
      ENABLE_ERROR_BOUNDARY_TEST_ROUTE: '1',
      NODE_ENV: 'production',
    },
  },
}

const USAGE = `Usage:
  node tests/integration-chunks.mjs run --suite dev|prodlike [--chunk <id>] [playwright args...]
  node tests/integration-chunks.mjs list --suite dev|prodlike
  node tests/integration-chunks.mjs generate
  node tests/integration-chunks.mjs check`

function assertSuite(suite) {
  if (!SUITE_NAMES.includes(suite)) {
    throw new Error('--suite must be dev or prodlike')
  }
}

function sleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

export function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function uniqueStrings(values) {
  return [...new Set(values)]
}

function arraysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
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

export function discoverIntegrationSpecs(root = DEFAULT_ROOT) {
  return walkFiles(root)
    .filter(file => file.endsWith('.spec.ts'))
    .map(toPosixPath)
    .sort()
}

function topLevelArea(root, specPath) {
  const relative = path.relative(root, specPath)
  const [area] = relative.split(path.sep)
  return area ? toPosixPath(path.join(root, area)) : toPosixPath(root)
}

export function shouldIgnoreSpec(suite, specPath) {
  assertSuite(suite)
  const normalized = toPosixPath(specPath)

  if (suite === 'dev') {
    return normalized === 'tests/integration/mcp/seeded-scan.spec.ts'
  }

  return normalized === 'tests/integration/developer-mode/overlay.spec.ts'
}

function slugForManifestPath(root, manifestPath) {
  const relative = manifestPath.startsWith(`${root}/`)
    ? manifestPath.slice(root.length + 1)
    : manifestPath
  return relative
    .replace(/\.spec\.ts$/u, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase()
}

function chunkIdForPaths(suite, root, paths) {
  const slug = paths
    .map(chunkPath => slugForManifestPath(root, chunkPath))
    .join('-')
  return `${suite}-${slug}`
}

function buildSuiteManifest({
  areasPerChunk,
  root,
  specs,
  suite,
  targetSpecs,
}) {
  const ignoredSpecs = specs.filter(spec => shouldIgnoreSpec(suite, spec))
  const includedSpecs = specs.filter(spec => !shouldIgnoreSpec(suite, spec))
  const finalSpecs =
    suite === 'prodlike'
      ? includedSpecs.filter(spec => spec.startsWith(`${root}/mcp/`))
      : []
  const normalSpecs =
    suite === 'prodlike'
      ? includedSpecs.filter(spec => !spec.startsWith(`${root}/mcp/`))
      : includedSpecs
  const grouped = new Map()

  for (const spec of normalSpecs) {
    const area = topLevelArea(root, spec)
    const areaSpecs = grouped.get(area) ?? []
    areaSpecs.push(spec)
    grouped.set(area, areaSpecs)
  }

  const areas = [...grouped.entries()]
    .map(([area, areaSpecs]) => ({
      area,
      specCount: areaSpecs.length,
    }))
    .sort((left, right) => left.area.localeCompare(right.area))

  const chunks = []
  let currentAreas = []
  let currentSpecCount = 0

  function flushCurrent() {
    if (currentAreas.length === 0) return
    const paths = currentAreas.map(entry => entry.area)
    chunks.push({
      id: chunkIdForPaths(suite, root, paths),
      paths,
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
      chunks.push({
        id: chunkIdForPaths(suite, root, [area.area]),
        paths: [area.area],
        specCount: area.specCount,
      })
      continue
    }

    if (currentAreas.length > 0 && (wouldExceedAreas || wouldExceedSpecs)) {
      flushCurrent()
    }

    currentAreas.push(area)
    currentSpecCount += area.specCount
  }
  flushCurrent()

  for (const spec of finalSpecs) {
    chunks.push({
      id: chunkIdForPaths(suite, root, [spec]),
      paths: [spec],
      specCount: 1,
    })
  }

  return {
    chunks,
    ignoredSpecs,
    includedSpecCount: includedSpecs.length,
  }
}

export function buildManifestFromSpecs(
  specs,
  {
    areasPerChunk = DEFAULT_AREAS_PER_CHUNK,
    root = DEFAULT_ROOT,
    targetSpecs = DEFAULT_TARGET_SPECS,
  } = {},
) {
  const normalizedSpecs = sortStrings(specs.map(toPosixPath))
  const suites = Object.fromEntries(
    SUITE_NAMES.map(suite => [
      suite,
      buildSuiteManifest({
        areasPerChunk,
        root,
        specs: normalizedSpecs,
        suite,
        targetSpecs,
      }),
    ]),
  )

  return {
    schemaVersion: 1,
    $comment:
      'Generated file. Do not manually edit; run npm run test:integration:chunks:generate.',
    generatedBy: GENERATED_BY,
    root,
    chunkPolicy: {
      areasPerChunk,
      targetSpecs,
    },
    discoveredSpecCount: normalizedSpecs.length,
    suites,
  }
}

export function buildCurrentManifest(options = {}) {
  const root = options.root ?? DEFAULT_ROOT
  return buildManifestFromSpecs(discoverIntegrationSpecs(root), {
    areasPerChunk: options.areasPerChunk,
    root,
    targetSpecs: options.targetSpecs,
  })
}

export function formatManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2).replace(
    /\[\n\s+"([^"\n]+)"\n\s+\]/gu,
    '["$1"]',
  )}\n`
}

function canonicalManifestText(manifest) {
  return JSON.stringify(manifest)
}

function specsForManifestPath(manifestPath, specs) {
  const normalizedPath = toPosixPath(manifestPath)
  if (normalizedPath.endsWith('.spec.ts')) {
    return specs.includes(normalizedPath) ? [normalizedPath] : [normalizedPath]
  }

  const prefix = `${normalizedPath.replace(/\/$/u, '')}/`
  return specs.filter(spec => spec.startsWith(prefix))
}

function expandChunkSpecs(chunk, specs) {
  return chunk.paths.flatMap(chunkPath =>
    specsForManifestPath(chunkPath, specs),
  )
}

export function validateManifestAgainstSpecs(
  manifest,
  specs,
  { root = DEFAULT_ROOT } = {},
) {
  const errors = []
  const normalizedSpecs = sortStrings(specs.map(toPosixPath))

  if (manifest.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  if (manifest.root !== root) {
    errors.push(`root must be ${root}`)
  }

  for (const suite of SUITE_NAMES) {
    const suiteManifest = manifest.suites?.[suite]
    if (!suiteManifest) {
      errors.push(`suite ${suite} is missing`)
      continue
    }

    const chunkIds = suiteManifest.chunks.map(chunk => chunk.id)
    const duplicateChunkIds = chunkIds.filter(
      (id, index) => chunkIds.indexOf(id) !== index,
    )
    for (const chunkId of uniqueStrings(duplicateChunkIds)) {
      errors.push(`suite ${suite} has duplicate chunk id ${chunkId}`)
    }

    const expectedIgnoredSpecs = normalizedSpecs.filter(spec =>
      shouldIgnoreSpec(suite, spec),
    )
    const actualIgnoredSpecs = sortStrings(suiteManifest.ignoredSpecs ?? [])
    if (!arraysEqual(actualIgnoredSpecs, expectedIgnoredSpecs)) {
      errors.push(`suite ${suite} ignoredSpecs is out of date`)
    }

    const expectedSpecs = normalizedSpecs.filter(
      spec => !shouldIgnoreSpec(suite, spec),
    )
    const expectedSet = new Set(expectedSpecs)
    const assignedCounts = new Map()

    for (const chunk of suiteManifest.chunks ?? []) {
      const chunkSpecs = expandChunkSpecs(chunk, normalizedSpecs)
      if (chunkSpecs.length === 0) {
        errors.push(`suite ${suite} chunk ${chunk.id} matches no specs`)
      }
      if (chunk.specCount !== chunkSpecs.length) {
        errors.push(
          `suite ${suite} chunk ${chunk.id} specCount is ${chunk.specCount}, expected ${chunkSpecs.length}`,
        )
      }

      for (const spec of chunkSpecs) {
        assignedCounts.set(spec, (assignedCounts.get(spec) ?? 0) + 1)
      }
    }

    const assignedSpecs = sortStrings([...assignedCounts.keys()])
    const missingSpecs = expectedSpecs.filter(spec => !assignedCounts.has(spec))
    const unexpectedSpecs = assignedSpecs.filter(spec => !expectedSet.has(spec))
    const duplicateSpecs = assignedSpecs.filter(
      spec => (assignedCounts.get(spec) ?? 0) > 1,
    )

    for (const spec of missingSpecs) {
      errors.push(`suite ${suite} is missing ${spec}`)
    }
    for (const spec of unexpectedSpecs) {
      errors.push(`suite ${suite} unexpectedly assigns ${spec}`)
    }
    for (const spec of duplicateSpecs) {
      errors.push(`suite ${suite} assigns ${spec} more than once`)
    }
  }

  return errors
}

export function checkManifestAgainstSpecs(
  manifest,
  specs,
  {
    areasPerChunk = DEFAULT_AREAS_PER_CHUNK,
    root = DEFAULT_ROOT,
    targetSpecs = DEFAULT_TARGET_SPECS,
  } = {},
) {
  const expected = buildManifestFromSpecs(specs, {
    areasPerChunk,
    root,
    targetSpecs,
  })
  const errors = validateManifestAgainstSpecs(manifest, specs, { root })

  if (canonicalManifestText(manifest) !== canonicalManifestText(expected)) {
    errors.push(
      'manifest content differs from generated integration chunks; run npm run test:integration:chunks:generate',
    )
  }

  return {
    errors,
    expected,
    ok: errors.length === 0,
  }
}

export function selectChunks(manifest, suite, chunkId) {
  assertSuite(suite)
  const chunks = manifest.suites?.[suite]?.chunks
  if (!chunks) {
    throw new Error(`Suite ${suite} is missing from the chunk manifest`)
  }

  if (!chunkId) return chunks

  const chunk = chunks.find(candidate => candidate.id === chunkId)
  if (!chunk) {
    throw new Error(`Unknown ${suite} integration chunk: ${chunkId}`)
  }
  return [chunk]
}

function suiteReportPaths(suite) {
  assertSuite(suite)
  return {
    blobDir: `test-results/playwright-blob-${suite}`,
    htmlDir: `playwright-report-${suite}`,
    junitFile: `test-results/${suite}/playwright-junit.xml`,
    serverLogDir: `test-results/${suite}/server-logs`,
  }
}

export function formatChunkServerLogFinishedLine({ chunkId, logFile, suite }) {
  return `[integration-chunks] Finished ${suite} chunk ${chunkId}; app server log: ${logFile}\n`
}

export function readSystemMemorySnapshot({
  freeBytes = os.freemem(),
  totalBytes = os.totalmem(),
} = {}) {
  return {
    freeBytes,
    totalBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes),
  }
}

function formatMemoryMiB(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MiB`
}

export function formatChunkMemoryLine({ chunkId, phase, snapshot, suite }) {
  const usedPercent =
    snapshot.totalBytes > 0
      ? ((snapshot.usedBytes / snapshot.totalBytes) * 100).toFixed(1)
      : '0.0'
  const timing = phase === 'before' ? 'before start' : 'after finish'
  return `[integration-chunks] Memory ${timing} ${suite} chunk ${chunkId}: used=${formatMemoryMiB(snapshot.usedBytes)} total=${formatMemoryMiB(snapshot.totalBytes)} free=${formatMemoryMiB(snapshot.freeBytes)} usedPercent=${usedPercent}%\n`
}

function command(commandName, args = [], env = {}) {
  return {
    args,
    command: commandName,
    env,
  }
}

function killPortCommand(suite) {
  const config = SUITE_CONFIG[suite]
  return command('npm', [
    'run',
    'kill:port',
    '--',
    '--port',
    String(config.port),
  ])
}

function buildCommandForSuite(suite) {
  const suiteBuildCommand = SUITE_CONFIG[suite].buildCommand
  if (!suiteBuildCommand) return null
  const [commandName, args, env] = suiteBuildCommand
  return command(commandName, args, env)
}

function serverCommandForSuite(suite) {
  const [commandName, args] = SUITE_CONFIG[suite].serverCommand
  return command(commandName, args, SUITE_CONFIG[suite].serverEnv)
}

function basePlaywrightArgs(suite) {
  return ['playwright', 'test', ...SUITE_CONFIG[suite].configArgs]
}

function directPlaywrightCommand(suite, passthroughArgs) {
  return command('npx', [...basePlaywrightArgs(suite), ...passthroughArgs])
}

function chunkPlaywrightCommand({ chunk, forceAuthSetup, suite }) {
  const reportPaths = suiteReportPaths(suite)
  const env = {
    ENABLE_ERROR_BOUNDARY_TEST_ROUTE: '1',
    PLAYWRIGHT_BASE_URL: SUITE_CONFIG[suite].baseUrl,
    PLAYWRIGHT_BLOB_OUTPUT_DIR: reportPaths.blobDir,
    PLAYWRIGHT_BLOB_OUTPUT_NAME: `${chunk.id}.zip`,
    PLAYWRIGHT_SKIP_WEBSERVER: '1',
    PWTEST_BLOB_DO_NOT_REMOVE: '1',
  }

  if (forceAuthSetup) {
    env.PLAYWRIGHT_FORCE_AUTH_SETUP = '1'
  } else {
    env.PLAYWRIGHT_FORCE_AUTH_SETUP = undefined
  }

  return command(
    'npx',
    [...basePlaywrightArgs(suite), '--reporter=blob,list', ...chunk.paths],
    env,
  )
}

function mergeReportsCommand(suite) {
  const reportPaths = suiteReportPaths(suite)
  return command(
    'npx',
    [
      'playwright',
      'merge-reports',
      reportPaths.blobDir,
      '--reporter=html,junit',
    ],
    {
      PLAYWRIGHT_HTML_OPEN: 'never',
      PLAYWRIGHT_HTML_OUTPUT_DIR: reportPaths.htmlDir,
      PLAYWRIGHT_JUNIT_OUTPUT_FILE: reportPaths.junitFile,
    },
  )
}

export function createRunPlan({
  chunkId,
  env = process.env,
  manifest,
  passthroughArgs = [],
  suite,
}) {
  assertSuite(suite)

  if (passthroughArgs.length > 0) {
    return {
      commands: [directPlaywrightCommand(suite, passthroughArgs)],
      mode: 'direct',
      passthroughArgs,
      suite,
    }
  }

  const chunks = selectChunks(manifest, suite, chunkId)
  const externalServer = Boolean(env.PLAYWRIGHT_SKIP_WEBSERVER)
  const commands = []
  const buildCommand = externalServer ? null : buildCommandForSuite(suite)

  if (buildCommand) {
    commands.push({ ...buildCommand, kind: 'build' })
  }

  for (const [index, chunk] of chunks.entries()) {
    if (!externalServer) {
      commands.push({
        ...killPortCommand(suite),
        chunkId: chunk.id,
        kind: 'kill-port',
      })
      commands.push({
        ...serverCommandForSuite(suite),
        chunkId: chunk.id,
        kind: 'start-server',
      })
    }

    const forceAuthSetup =
      index === 0 &&
      (!externalServer || Boolean(env.PLAYWRIGHT_FORCE_AUTH_SETUP))
    commands.push({
      ...chunkPlaywrightCommand({
        chunk,
        forceAuthSetup,
        suite,
      }),
      chunkId: chunk.id,
      kind: 'playwright-chunk',
    })
  }

  commands.push({ ...mergeReportsCommand(suite), kind: 'merge-reports' })

  return {
    chunkId,
    chunks,
    commands,
    externalServer,
    mode: 'chunked',
    reportPaths: suiteReportPaths(suite),
    suite,
  }
}

export function parseArgs(argv) {
  const [commandName = '', ...rest] = argv
  const parsed = {
    chunkId: undefined,
    command: commandName,
    help: false,
    passthroughArgs: [],
    suite: undefined,
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--') {
      parsed.passthroughArgs = rest.slice(index + 1)
      break
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }

    const [inlineKey, inlineValue] = arg.startsWith('--')
      ? arg.slice(2).split('=', 2)
      : [undefined, undefined]

    if (arg === '--suite' || inlineKey === 'suite') {
      const value = inlineValue ?? rest[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --suite')
      }
      parsed.suite = value
      if (inlineValue == null) index += 1
      continue
    }

    if (arg === '--chunk' || inlineKey === 'chunk') {
      const value = inlineValue ?? rest[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --chunk')
      }
      parsed.chunkId = value
      if (inlineValue == null) index += 1
      continue
    }

    parsed.passthroughArgs = rest.slice(index)
    break
  }

  return parsed
}

export async function loadManifest(manifestPath = MANIFEST_PATH) {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8'))
}

async function writeManifest(manifest, manifestPath = MANIFEST_PATH) {
  await fs.writeFile(manifestPath, formatManifest(manifest))
}

async function assertManifestCurrent(manifest) {
  const root = manifest.root ?? DEFAULT_ROOT
  const check = checkManifestAgainstSpecs(
    manifest,
    discoverIntegrationSpecs(root),
    {
      areasPerChunk: manifest.chunkPolicy?.areasPerChunk,
      root,
      targetSpecs: manifest.chunkPolicy?.targetSpecs,
    },
  )

  if (!check.ok) {
    throw new Error(
      [
        'Integration chunk manifest is out of date.',
        'Run npm run test:integration:chunks:generate.',
        ...check.errors.map(error => `- ${error}`),
      ].join('\n'),
    )
  }
}

async function runCommand(commandPlan, options = {}) {
  const {
    allowFailure = false,
    cwd = process.cwd(),
    env = process.env,
    stdio = 'inherit',
  } = options
  const childEnv = { ...env, ...commandPlan.env }

  for (const [key, value] of Object.entries(childEnv)) {
    if (value === undefined) {
      delete childEnv[key]
    }
  }

  return await new Promise((resolve, reject) => {
    const child = childProcess.spawn(commandPlan.command, commandPlan.args, {
      cwd,
      env: childEnv,
      shell: false,
      stdio,
    })

    child.once('error', reject)
    child.once('close', (code, signal) => {
      const exitCode = code ?? (signal ? 1 : 0)
      if (exitCode !== 0 && !allowFailure) {
        reject(
          new Error(
            `${commandPlan.command} ${commandPlan.args.join(' ')} exited with ${signal ?? exitCode}`,
          ),
        )
        return
      }
      resolve({ exitCode, signal })
    })
  })
}

async function startServer(commandPlan, options = {}) {
  const { cwd = process.cwd(), env = process.env } = options
  const childEnv = { ...env, ...commandPlan.env }
  const detached = process.platform !== 'win32'
  const logFile = options.logFile

  if (!logFile) {
    throw new Error('startServer requires a logFile option')
  }

  await fs.mkdir(path.dirname(logFile), { recursive: true })
  const logStream = createWriteStream(logFile, { flags: 'a' })
  logStream.write(
    `# ${commandPlan.command} ${commandPlan.args.join(' ')}\n# ${new Date().toISOString()}\n`,
  )

  return await new Promise((resolve, reject) => {
    const child = childProcess.spawn(commandPlan.command, commandPlan.args, {
      cwd,
      detached,
      env: childEnv,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout?.on('data', chunk => logStream.write(chunk))
    child.stderr?.on('data', chunk => logStream.write(chunk))
    child.once('error', reject)
    child.once('spawn', () => resolve({ child, logFile, logStream }))
  })
}

async function stopServer(server) {
  const child = server?.child
  if (!server) return

  try {
    if (!child || child.exitCode != null || child.signalCode != null) return

    const pid = child.pid
    if (!pid) return

    try {
      if (process.platform === 'win32') {
        child.kill('SIGTERM')
      } else {
        process.kill(-pid, 'SIGTERM')
      }
    } catch {
      child.kill('SIGTERM')
    }

    const exited = await Promise.race([
      new Promise(resolve => child.once('exit', () => resolve(true))),
      sleep(5_000).then(() => false),
    ])

    if (exited) return

    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL')
      } else {
        process.kill(-pid, 'SIGKILL')
      }
    } catch {
      child.kill('SIGKILL')
    }
  } finally {
    await new Promise(resolve => server.logStream.end(resolve))
  }
}

async function waitForUrl(url, options = {}) {
  const {
    child,
    fetchImpl = fetch,
    intervalMs = 1_000,
    requestTimeoutMs = 5_000,
    timeoutMs = 120_000,
  } = options
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() <= deadline) {
    if (child && child.exitCode != null) {
      throw new Error(`Server exited before ${url} became ready`)
    }

    try {
      await fetchImpl(url, {
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
      return
    } catch (error) {
      lastError = error
    }

    await sleep(intervalMs)
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(
    `${url} did not become ready within ${timeoutMs} ms: ${reason}`,
  )
}

async function runDirect(plan) {
  const [directCommand] = plan.commands
  const result = await runCommand(directCommand, { allowFailure: true })
  return result.exitCode
}

async function runChunked(plan) {
  await fs.rm(plan.reportPaths.blobDir, { force: true, recursive: true })
  await fs.mkdir(plan.reportPaths.blobDir, { recursive: true })

  const buildCommand = plan.commands.find(entry => entry.kind === 'build')
  if (buildCommand) {
    await runCommand(buildCommand)
  }

  const failedChunks = []

  for (const chunk of plan.chunks) {
    const killCommand = plan.commands.find(
      entry => entry.kind === 'kill-port' && entry.chunkId === chunk.id,
    )
    const startCommand = plan.commands.find(
      entry => entry.kind === 'start-server' && entry.chunkId === chunk.id,
    )
    const playwrightCommand = plan.commands.find(
      entry => entry.kind === 'playwright-chunk' && entry.chunkId === chunk.id,
    )
    let server
    const serverLogFile = path.join(
      plan.reportPaths.serverLogDir,
      `${chunk.id}.log`,
    )

    process.stdout.write(
      `[integration-chunks] Running ${plan.suite} chunk ${chunk.id}: ${chunk.paths.join(' ')}\n`,
    )
    process.stdout.write(
      formatChunkMemoryLine({
        chunkId: chunk.id,
        phase: 'before',
        snapshot: readSystemMemorySnapshot(),
        suite: plan.suite,
      }),
    )
    if (!plan.externalServer) {
      process.stdout.write(
        `[integration-chunks] App server log: ${serverLogFile}\n`,
      )
    }

    try {
      if (!plan.externalServer) {
        await runCommand(killCommand)
        server = await startServer(startCommand, { logFile: serverLogFile })
        await waitForUrl(SUITE_CONFIG[plan.suite].baseUrl, {
          child: server.child,
        })
      }

      const result = await runCommand(playwrightCommand, { allowFailure: true })
      if (result.exitCode !== 0) {
        failedChunks.push(chunk.id)
      }
    } finally {
      await stopServer(server)
      process.stdout.write(
        formatChunkMemoryLine({
          chunkId: chunk.id,
          phase: 'after',
          snapshot: readSystemMemorySnapshot(),
          suite: plan.suite,
        }),
      )
      if (!plan.externalServer) {
        process.stdout.write(
          formatChunkServerLogFinishedLine({
            chunkId: chunk.id,
            logFile: serverLogFile,
            suite: plan.suite,
          }),
        )
      }
    }
  }

  const mergeCommand = plan.commands.find(
    entry => entry.kind === 'merge-reports',
  )
  const hasBlobReports = existsSync(plan.reportPaths.blobDir)
  if (hasBlobReports) {
    await runCommand(mergeCommand)
  }

  if (failedChunks.length > 0) {
    process.stderr.write(
      `[integration-chunks] Failed chunks: ${failedChunks.join(', ')}\n`,
    )
    return 1
  }

  return 0
}

function formatChunkList(manifest, suite) {
  const suiteManifest = manifest.suites[suite]
  const lines = [
    `# ${suite}: ${suiteManifest.includedSpecCount}/${manifest.discoveredSpecCount} specs in ${suiteManifest.chunks.length} chunks`,
  ]

  for (const chunk of suiteManifest.chunks) {
    lines.push(`${chunk.id} ${chunk.paths.join(' ')}`)
  }

  return `${lines.join('\n')}\n`
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help || !args.command) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  if (args.command === 'generate') {
    const manifest = buildCurrentManifest()
    await writeManifest(manifest)
    process.stdout.write(`Wrote ${MANIFEST_PATH}\n`)
    return 0
  }

  if (args.command === 'check') {
    const manifest = await loadManifest()
    await assertManifestCurrent(manifest)
    process.stdout.write('Integration chunk manifest is current.\n')
    return 0
  }

  if (args.command === 'list') {
    assertSuite(args.suite)
    const manifest = await loadManifest()
    process.stdout.write(formatChunkList(manifest, args.suite))
    return 0
  }

  if (args.command === 'run') {
    assertSuite(args.suite)
    const manifest = await loadManifest()
    if (args.passthroughArgs.length === 0) {
      await assertManifestCurrent(manifest)
    }
    const plan = createRunPlan({
      chunkId: args.chunkId,
      manifest,
      passthroughArgs: args.passthroughArgs,
      suite: args.suite,
    })

    if (plan.mode === 'direct') {
      return await runDirect(plan)
    }

    return await runChunked(plan)
  }

  throw new Error(`Unknown command: ${args.command}`)
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    process.exitCode = await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 1
  }
}
