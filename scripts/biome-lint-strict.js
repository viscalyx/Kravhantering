#!/usr/bin/env node

const { spawnSync } = require('node:child_process')

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function runBiomeJsonLint(args) {
  return spawnSync(
    getNpxCommand(),
    ['biome', 'lint', '--reporter=json', '--max-diagnostics=none', ...args],
    { encoding: 'utf8' },
  )
}

function parseBiomeJson(stdout) {
  const jsonStart = stdout.indexOf('{')
  if (jsonStart === -1) {
    throw new Error('Biome JSON output was not found in stdout.')
  }
  const jsonText = stdout.slice(jsonStart)

  try {
    return JSON.parse(jsonText)
  } catch {
    // Some Biome versions can emit unescaped control characters in diagnostics,
    // which makes the full JSON payload invalid. We only need "summary" here.
    const summaryMatch = jsonText.match(/"summary"\s*:\s*(\{[^{}]*\})/)
    if (!summaryMatch) {
      throw new Error('Biome JSON output does not contain a parseable summary.')
    }
    return { summary: JSON.parse(summaryMatch[1]) }
  }
}

function runReadableLint(args) {
  return spawnSync(
    getNpxCommand(),
    ['biome', 'lint', '--error-on-warnings', ...args],
    { stdio: 'inherit' },
  )
}

function main(
  args = process.argv.slice(2),
  impl = {
    runBiomeJsonLint,
    parseBiomeJson,
    runReadableLint,
    processObj: process,
    consoleObj: console,
  },
) {
  const { runBiomeJsonLint: runJson, parseBiomeJson: parseJson } = impl
  const runReadable = impl.runReadableLint
  const processObj = impl.processObj
  const consoleObj = impl.consoleObj

  const jsonRun = runJson(args)

  if (jsonRun.error) {
    consoleObj.error(jsonRun.error.message)
    processObj.exit(1)
  }

  let result
  try {
    result = parseJson(jsonRun.stdout)
  } catch (error) {
    if (jsonRun.stdout) processObj.stdout.write(jsonRun.stdout)
    if (jsonRun.stderr) processObj.stderr.write(jsonRun.stderr)
    consoleObj.error(`Failed to parse Biome JSON output: ${error.message}`)
    processObj.exit((jsonRun.status ?? 0) === 0 ? 1 : jsonRun.status)
  }

  const errors = result?.summary?.errors ?? 0
  const warnings = result?.summary?.warnings ?? 0
  const infos = result?.summary?.infos ?? 0
  const hasAnyDiagnostics = errors > 0 || warnings > 0 || infos > 0

  if (!hasAnyDiagnostics) {
    processObj.stdout.write(
      'Checked with strict mode: 0 errors, 0 warnings, 0 infos.\n',
    )
    processObj.exit(0)
  }

  const readableRun = runReadable(args)
  if (readableRun.error) {
    consoleObj.error(readableRun.error.message)
    processObj.exit(1)
  }
  const summaryMessage = `Strict summary: errors ${errors}, warnings ${warnings}, infos ${infos}.`
  if ((readableRun.status ?? 1) !== 0) {
    consoleObj.error(summaryMessage)
    processObj.exit(readableRun.status ?? 1)
  }

  consoleObj.error(summaryMessage)

  processObj.exit(1)
}

/* c8 ignore next 3 */
if (require.main === module) {
  main()
}

module.exports = {
  getNpxCommand,
  runBiomeJsonLint,
  parseBiomeJson,
  runReadableLint,
  main,
}
