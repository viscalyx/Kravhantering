#!/usr/bin/env node
/**
 * Bundle Size Analyzer for Cloudflare Workers
 *
 * Analyzes the OpenNext build output and reports sizes.
 * Can also run a dry-run deployment to get the actual wrangler bundle size.
 *
 * Usage:
 *   node scripts/analyze-bundle.js [options]
 *
 * Options:
 *   --ci          Output in GitHub Actions format
 *   --dry-run     Run wrangler deploy --dry-run to get actual bundle size
 *   --json        Output as JSON
 *   --help        Show help
 *
 * Exports marked with @internal are intended for tests and are not a stable public API.
 */

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { execSync } = require('node:child_process')

// Cloudflare Workers limits (gzipped)
const LIMITS = {
  // Free plan: 3MB compressed
  freeCompressedMB: 3,
  // Paid plan: 10MB compressed
  paidCompressedMB: 10,
  // Warning threshold (percentage of paid limit)
  warnPercentage: 50,
}

const DEFAULT_ANALYZE_RESULT = {
  serverHandler: {
    path: '.open-next/server-functions/default/handler.mjs',
    size: 0,
    gzipSize: 0,
  },
  middleware: {
    path: '.open-next/middleware/handler.mjs',
    size: 0,
    gzipSize: 0,
  },
  assets: {
    path: '.open-next/assets',
    size: 0,
  },
  serverFunctions: {
    path: '.open-next/server-functions',
    size: 0,
  },
  total: {
    path: '.open-next',
    size: 0,
  },
  wrangler: null,
  status: 'success',
  statusMessage: 'Bundle size OK',
}

function cloneDefaultAnalyzeResult() {
  return {
    serverHandler: { ...DEFAULT_ANALYZE_RESULT.serverHandler },
    middleware: { ...DEFAULT_ANALYZE_RESULT.middleware },
    assets: { ...DEFAULT_ANALYZE_RESULT.assets },
    serverFunctions: { ...DEFAULT_ANALYZE_RESULT.serverFunctions },
    total: { ...DEFAULT_ANALYZE_RESULT.total },
    wrangler: DEFAULT_ANALYZE_RESULT.wrangler,
    status: DEFAULT_ANALYZE_RESULT.status,
    statusMessage: DEFAULT_ANALYZE_RESULT.statusMessage,
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const kb = bytes / 1024
  const mb = kb / 1024
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB (${Math.round(kb)} KB)`
  }
  return `${kb.toFixed(2)} KB`
}

/**
 * Get emoji for status
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'error':
      return '❌'
    case 'warning':
      return '⚠️'
    case 'info':
      return 'ℹ️'
    default:
      return '✅'
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

/**
 * Get directory size recursively.
 * @internal Exported for testing.
 */
function getDirSize(dirPath) {
  let totalSize = 0
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name)
      if (item.isDirectory()) {
        totalSize += getDirSize(itemPath)
      } else {
        totalSize += getFileSize(itemPath)
      }
    }
  } catch {
    return 0
  }
  return totalSize
}

/**
 * Get gzipped size of a file using Node.js zlib.
 * @internal Exported for testing.
 */
function getGzipSize(filePath) {
  try {
    const content = fs.readFileSync(filePath)
    const compressed = zlib.gzipSync(content)
    return compressed.length
  } catch {
    return 0
  }
}

/**
 * Parse wrangler output and extract upload + gzip sizes.
 * Supports decimals using either "." or "," while preserving thousands separators.
 */
function parseWranglerOutput(output) {
  const normalize = s => {
    const value = String(s).trim()
    const lastComma = value.lastIndexOf(',')
    const lastDot = value.lastIndexOf('.')

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // Locale style: 1.500,00 -> 1500.00
        return value.replace(/\./g, '').replace(',', '.')
      }
      // Locale style: 1,500.00 -> 1500.00
      return value.replace(/,/g, '')
    }

    if (lastComma !== -1) {
      const fractionalDigits = value.length - lastComma - 1
      // Decimal comma (e.g. 1500,00 or 1,50)
      if (fractionalDigits > 0 && fractionalDigits <= 2) {
        return value.replace(',', '.')
      }
      // Thousands separators with comma (e.g. 1,500)
      return value.replace(/,/g, '')
    }

    return value
  }
  const SIZE_LINE_RE_KIB =
    /^\s*Total Upload:\s*([\d.,]+)\s*KiB\s*\/\s*gzip:\s*([\d.,]+)\s*KiB\s*$/im
  const SIZE_LINE_RE_MIB =
    /^\s*Total Upload:\s*([\d.,]+)\s*MiB\s*\/\s*gzip:\s*([\d.,]+)\s*MiB\s*$/im

  const kibMatch = output.match(SIZE_LINE_RE_KIB)
  if (kibMatch) {
    return {
      uncompressedKB: parseFloat(normalize(kibMatch[1])),
      compressedKB: parseFloat(normalize(kibMatch[2])),
    }
  }

  const mibMatch = output.match(SIZE_LINE_RE_MIB)
  if (mibMatch) {
    return {
      uncompressedKB: parseFloat(normalize(mibMatch[1])) * 1024,
      compressedKB: parseFloat(normalize(mibMatch[2])) * 1024,
    }
  }

  return null
}

/* c8 ignore start */
/** @internal Helper used by analyzeBuild dry-run mode. */
function getWranglerBundleSize() {
  try {
    console.error('📦 Running wrangler dry-run to get actual bundle size...\n')
    const result = execSync('npx wrangler deploy --dry-run 2>&1', {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const parsed = parseWranglerOutput(result)
    return parsed ? { ...parsed, raw: result } : null
  } catch (error) {
    // Try to extract from error output
    const errorOutput = error.stdout || error.stderr || ''
    const parsed = parseWranglerOutput(errorOutput)
    return parsed ? { ...parsed, raw: errorOutput } : null
  }
}
/* c8 ignore stop */

/**
 * Check if build exists and is recent (default: 30 minutes).
 * @internal Exported for testing.
 */
function isBuildFresh(maxAgeMinutes = 30) {
  const buildDir = path.join(process.cwd(), '.open-next')
  const serverHandler = path.join(
    buildDir,
    'server-functions/default/handler.mjs',
  )

  if (!fs.existsSync(serverHandler)) {
    return { fresh: false, reason: 'Build not found' }
  }

  const stats = fs.statSync(serverHandler)
  const ageMs = Date.now() - stats.mtimeMs
  const ageMinutes = ageMs / (1000 * 60)

  if (ageMinutes > maxAgeMinutes) {
    return {
      fresh: false,
      reason: `Build is ${Math.round(ageMinutes)} minutes old (max: ${maxAgeMinutes})`,
    }
  }

  return { fresh: true, ageMinutes: Math.round(ageMinutes) }
}

/* c8 ignore start */
/**
 * Run the OpenNext build.
 * @internal Exported for testing.
 */
function runBuild() {
  console.error('🔨 Building for Cloudflare Workers...\n')
  try {
    execSync('npx opennextjs-cloudflare build', {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    console.error('')
    return true
  } catch {
    console.error('❌ Build failed!')
    return false
  }
}
/* c8 ignore stop */

/**
 * Analyze the bundle and return results
 */
function analyzeBuild(options = {}, deps = {}) {
  const impl = {
    getWranglerBundleSize,
    ...deps,
  }
  const limits = { ...LIMITS, ...(impl.LIMITS || {}) }
  const buildDir = path.join(process.cwd(), '.open-next')

  if (!fs.existsSync(buildDir)) {
    console.error('❌ Build directory .open-next not found!')
    console.error(
      '   Run "npm run preview" or "npx opennextjs-cloudflare build" first.',
    )
    return {
      ...cloneDefaultAnalyzeResult(),
      limits,
      status: 'error',
      statusMessage: 'Build directory .open-next not found',
    }
  }

  const results = cloneDefaultAnalyzeResult()
  results.limits = limits

  // Analyze server handler
  const serverHandlerPath = path.join(
    buildDir,
    'server-functions/default/handler.mjs',
  )
  if (fs.existsSync(serverHandlerPath)) {
    results.serverHandler.size = getFileSize(serverHandlerPath)
    results.serverHandler.gzipSize = getGzipSize(serverHandlerPath)
  } else if (!options.dryRun) {
    const errorMessage =
      `Server handler not found at ${serverHandlerPath}. ` +
      `Build directory '${buildDir}' may be incomplete or corrupted.`
    console.error(`❌ Error: ${errorMessage}`)
    results.status = 'error'
    results.statusMessage = errorMessage
    return results
  }

  // Analyze middleware
  const middlewarePath = path.join(buildDir, 'middleware/handler.mjs')
  if (fs.existsSync(middlewarePath)) {
    results.middleware.size = getFileSize(middlewarePath)
    results.middleware.gzipSize = getGzipSize(middlewarePath)
  }

  // Analyze assets
  const assetsPath = path.join(buildDir, 'assets')
  if (fs.existsSync(assetsPath)) {
    results.assets.size = getDirSize(assetsPath)
  }

  // Analyze server functions directory
  const serverFuncsPath = path.join(buildDir, 'server-functions')
  if (fs.existsSync(serverFuncsPath)) {
    results.serverFunctions.size = getDirSize(serverFuncsPath)
  }

  // Total build size
  results.total.size = getDirSize(buildDir)

  // Get actual wrangler bundle size if requested
  if (options.dryRun) {
    results.wrangler = impl.getWranglerBundleSize()

    // Fail fast if dry-run was requested but wrangler sizes are unavailable
    if (!results.wrangler) {
      const errorMessage =
        'dry-run requested but wrangler sizes unavailable - cannot determine accurate bundle size'
      console.error(`❌ Error: ${errorMessage}`)
      results.status = 'error'
      results.statusMessage = errorMessage
      return results
    }
  }

  // Determine status based on wrangler size or estimated size
  // When dryRun is set, results.wrangler is guaranteed to be valid (fail-fast above)
  /* c8 ignore next */
  const compressedKB = results.wrangler
    ? results.wrangler.compressedKB
    : results.serverHandler.gzipSize / 1024

  const compressedMB = compressedKB / 1024

  // Calculate percentages for both plans
  const freeUsagePercent = (compressedMB / limits.freeCompressedMB) * 100
  const paidUsagePercent = (compressedMB / limits.paidCompressedMB) * 100

  results.usage = {
    compressedMB,
    freePercent: freeUsagePercent,
    paidPercent: paidUsagePercent,
    exceedsFree: compressedMB > limits.freeCompressedMB,
    exceedsPaid: compressedMB > limits.paidCompressedMB,
  }

  if (compressedMB > limits.paidCompressedMB) {
    results.status = 'error'
    results.statusMessage = `Bundle exceeds paid plan limit (${limits.paidCompressedMB}MB)!`
  } else if (compressedMB > limits.freeCompressedMB) {
    results.status = 'warning'
    results.statusMessage = `Bundle exceeds free plan limit (${limits.freeCompressedMB}MB) - requires paid plan`
  } else if (paidUsagePercent > limits.warnPercentage) {
    results.status = 'info'
    results.statusMessage = 'Bundle size OK but approaching limits'
  }

  return results
}

/**
 * Output results for GitHub Actions
 */
function outputForCI(results) {
  const output = []

  output.push(`server-size=${results.serverHandler.size}`)
  output.push(
    `server-size-formatted=${formatBytes(results.serverHandler.size)}`,
  )
  output.push(`server-gzip-size=${results.serverHandler.gzipSize}`)
  output.push(
    `server-gzip-formatted=${formatBytes(results.serverHandler.gzipSize)}`,
  )

  output.push(`middleware-size=${results.middleware.size}`)
  output.push(
    `middleware-size-formatted=${formatBytes(results.middleware.size)}`,
  )
  output.push(`middleware-gzip-size=${results.middleware.gzipSize}`)
  output.push(
    `middleware-gzip-formatted=${formatBytes(results.middleware.gzipSize)}`,
  )

  output.push(`assets-size=${results.assets.size}`)
  output.push(`assets-size-formatted=${formatBytes(results.assets.size)}`)

  output.push(`total-size=${results.total.size}`)
  output.push(`total-size-formatted=${formatBytes(results.total.size)}`)

  if (results.wrangler) {
    output.push(
      `wrangler-size=${Math.round(results.wrangler.uncompressedKB * 1024)}`,
    )
    output.push(
      `wrangler-size-formatted=${results.wrangler.uncompressedKB.toFixed(2)} KB`,
    )
    output.push(
      `wrangler-gzip-size=${Math.round(results.wrangler.compressedKB * 1024)}`,
    )
    output.push(
      `wrangler-gzip-formatted=${results.wrangler.compressedKB.toFixed(2)} KB`,
    )
  }

  if (results.usage) {
    output.push(`free-usage-percent=${results.usage.freePercent.toFixed(1)}`)
    output.push(`paid-usage-percent=${results.usage.paidPercent.toFixed(1)}`)
    output.push(`exceeds-free=${results.usage.exceedsFree}`)
    output.push(`exceeds-paid=${results.usage.exceedsPaid}`)
  }

  output.push(`status=${results.status}`)
  output.push(`status-emoji=${getStatusEmoji(results.status)}`)
  output.push(`status-message=${results.statusMessage}`)

  // Write to GITHUB_OUTPUT if available
  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `${output.join('\n')}\n`)
  }

  // Also print to stdout for debugging
  output.forEach(line => {
    console.log(line)
  })
}

/**
 * Output results as Markdown (for PR comments)
 */
function outputForMarkdown(results) {
  const limits = results.limits || LIMITS
  const statusEmoji = getStatusEmoji(results.status)

  const wranglerSize = results.wrangler
    ? `${results.wrangler.uncompressedKB.toFixed(2)} KB`
    : 'N/A'
  const wranglerGzipSize = results.wrangler
    ? `${results.wrangler.compressedKB.toFixed(2)} KB`
    : 'N/A'

  const freeStatus = results.usage
    ? results.usage.exceedsFree
      ? '❌'
      : '✅'
    : 'N/A'
  const paidStatus = results.usage
    ? results.usage.exceedsPaid
      ? '❌'
      : '✅'
    : 'N/A'
  const freePercent = results.usage?.freePercent?.toFixed(1) ?? 'N/A'
  const paidPercent = results.usage?.paidPercent?.toFixed(1) ?? 'N/A'

  let warningText = ''
  if (results.status === 'warning') {
    warningText =
      '⚠️ Consider optimizing bundle size to stay within comfortable limits.'
  } else if (results.status === 'error') {
    warningText =
      '❌ **Action required:** Bundle exceeds size limits and will fail deployment.'
  }

  const markdown = `${statusEmoji} **Status:** ${results.statusMessage}
${warningText}

<details>
<summary>📦 Bundle Size Report</summary>

### Wrangler Bundle (what Cloudflare deploys)

| Metric | Size |
|--------|------|
| Total Upload | ${wranglerSize} |
| **Gzipped** | **${wranglerGzipSize}** |

### 📊 Plan Usage

| Plan | Limit | Usage | Status |
|------|-------|-------|--------|
| Free | ${limits.freeCompressedMB} MB | ${freePercent}% | ${freeStatus} |
| Paid | ${limits.paidCompressedMB} MB | ${paidPercent}% | ${paidStatus} |

### 📦 Build Output Details

| Bundle | Uncompressed | Gzipped |
|--------|--------------|---------|
| Server Handler | ${formatBytes(results.serverHandler.size)} | ${formatBytes(results.serverHandler.gzipSize)} |
| Middleware | ${formatBytes(results.middleware.size)} | ${formatBytes(results.middleware.gzipSize)} |
| Static Assets | ${formatBytes(results.assets.size)} | - |
| **Total Build** | ${formatBytes(results.total.size)} | - |

*Note: Static assets are served via Cloudflare's CDN and don't count against worker limits.*

</details>`

  console.log(markdown.trim())
}

/**
 * Output results for terminal (human readable)
 */
function outputForTerminal(results) {
  const limits = results.limits || LIMITS
  const statusEmoji = getStatusEmoji(results.status)

  console.log('\n📦 Bundle Size Analysis\n')
  console.log('='.repeat(60))

  console.log('\n📊 Build Output Sizes:\n')
  console.log(
    `  Server Handler:     ${formatBytes(results.serverHandler.size)}`,
  )
  console.log(
    `    └─ gzipped:       ${formatBytes(results.serverHandler.gzipSize)}`,
  )
  console.log(`  Middleware:         ${formatBytes(results.middleware.size)}`)
  console.log(
    `    └─ gzipped:       ${formatBytes(results.middleware.gzipSize)}`,
  )
  console.log(`  Static Assets:      ${formatBytes(results.assets.size)}`)
  console.log(
    `  Server Functions:   ${formatBytes(results.serverFunctions.size)}`,
  )
  console.log(`  Total Build:        ${formatBytes(results.total.size)}`)

  if (results.wrangler) {
    console.log('\n🚀 Wrangler Bundle (what Cloudflare sees):\n')
    console.log(
      `  Total Upload:       ${results.wrangler.uncompressedKB.toFixed(2)} KB`,
    )
    console.log(
      `  Gzipped:            ${results.wrangler.compressedKB.toFixed(2)} KB`,
    )
    console.log(
      `                      (${(results.wrangler.compressedKB / 1024).toFixed(2)} MB)`,
    )
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`\n${statusEmoji} Status: ${results.statusMessage}`)

  console.log('\n📋 Cloudflare Workers Limits:\n')
  console.log(`  Plan        Limit     Your Usage`)
  console.log(`  ──────────  ────────  ──────────────────────────────`)

  if (results.usage) {
    const freeBar = createProgressBar(results.usage.freePercent, 20)
    const paidBar = createProgressBar(results.usage.paidPercent, 20)
    const freeStatus = results.usage.exceedsFree ? '❌ EXCEEDS' : '✅'
    const paidStatus = results.usage.exceedsPaid ? '❌ EXCEEDS' : '✅'

    console.log(
      `  Free        ${limits.freeCompressedMB} MB      ${freeBar} ${results.usage.freePercent.toFixed(1)}% ${freeStatus}`,
    )
    console.log(
      `  Paid        ${limits.paidCompressedMB} MB     ${paidBar} ${results.usage.paidPercent.toFixed(1)}% ${paidStatus}`,
    )
  } else {
    console.log(`  Free        ${limits.freeCompressedMB} MB`)
    console.log(`  Paid        ${limits.paidCompressedMB} MB`)
  }

  console.log('')
}

/**
 * Create a simple progress bar
 */
function createProgressBar(percent, width) {
  const filled = Math.min(Math.round((percent / 100) * width), width)
  const empty = width - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  return `[${bar}]`
}

/**
 * Main function
 */
function main(args = process.argv.slice(2), deps = {}) {
  const impl = {
    isBuildFresh,
    runBuild,
    analyzeBuild,
    outputForMarkdown,
    outputForCI,
    outputForTerminal,
    ...deps,
  }

  if (args.includes('--help')) {
    console.log(`
Bundle Size Analyzer for Cloudflare Workers

Usage:
  node scripts/analyze-bundle.js [options]

Options:
  --ci          Output in GitHub Actions format
  --dry-run     Run wrangler deploy --dry-run to get actual bundle size
  --json        Output as JSON
  --markdown    Output as Markdown (for PR comments)
  --no-build    Skip automatic build even if stale
  --max-age=N   Max build age in minutes before rebuilding (default: 30)
  --help        Show this help message

By default, the script will automatically rebuild if the existing build
is older than 30 minutes or doesn't exist.

Examples:
  node scripts/analyze-bundle.js                    # Auto-build if needed, full analysis
  node scripts/analyze-bundle.js --no-build         # Skip build, analyze existing
  node scripts/analyze-bundle.js --max-age=60       # Rebuild if older than 60 min
  node scripts/analyze-bundle.js --ci --dry-run     # For GitHub Actions
  node scripts/analyze-bundle.js --markdown         # Markdown output
`)
    process.exit(0)
  }

  // Parse max-age option
  const maxAgeArg = args.find(a => a.startsWith('--max-age='))
  let maxAgeMinutes = 30 // default
  if (maxAgeArg) {
    const parsed = parseInt(maxAgeArg.split('=')[1], 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error(
        `Error: Invalid --max-age value "${maxAgeArg.split('=')[1]}". Must be a positive integer.`,
      )
      console.error(
        'Usage: --max-age=N where N is minutes (e.g., --max-age=60)',
      )
      process.exit(1)
    }
    maxAgeMinutes = parsed
  }

  const options = {
    ci: args.includes('--ci'),
    dryRun: args.includes('--dry-run'),
    json: args.includes('--json'),
    markdown: args.includes('--markdown'),
    noBuild: args.includes('--no-build'),
    maxAgeMinutes,
  }

  // Check if we need to build
  if (!options.noBuild && !options.ci) {
    const buildStatus = impl.isBuildFresh(options.maxAgeMinutes)
    if (!buildStatus.fresh) {
      console.error(`⏰ ${buildStatus.reason}`)
      if (!impl.runBuild()) {
        process.exit(1)
      }
    } else {
      console.error(
        `✅ Using existing build (${buildStatus.ageMinutes} minutes old)\n`,
      )
    }
  }

  // Default to --dry-run for full accuracy unless --no-build or --ci
  if (!options.noBuild && !options.ci && !args.includes('--dry-run')) {
    options.dryRun = true
  }

  const results = impl.analyzeBuild(options)

  if (options.json) {
    console.log(JSON.stringify(results, null, 2))
  } else if (options.markdown) {
    impl.outputForMarkdown(results)
  } else if (options.ci) {
    impl.outputForCI(results)
  } else {
    impl.outputForTerminal(results)
  }

  // Exit with error code if bundle exceeds limit
  if (results.status === 'error') {
    process.exit(1)
  }
}

/* c8 ignore next 3 */
if (require.main === module) {
  main()
}

module.exports = {
  LIMITS,
  formatBytes,
  getStatusEmoji,
  getFileSize,
  getDirSize,
  getGzipSize,
  parseWranglerOutput,
  isBuildFresh,
  runBuild,
  analyzeBuild,
  outputForCI,
  outputForMarkdown,
  outputForTerminal,
  createProgressBar,
  main,
}
