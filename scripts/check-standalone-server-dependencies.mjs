import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_SERVER_DEPENDENCIES = ['mssql', 'tedious', 'typeorm']

function isWithinDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`)
}

export function checkStandaloneServerDependencies(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const standaloneRoot = path.resolve(
    cwd,
    options.outputDir ?? '.next/standalone',
  )
  const serverEntry = path.join(standaloneRoot, 'server.js')

  if (!fsImpl.existsSync(serverEntry)) {
    throw new Error(
      `Standalone server entry is missing at ${path.relative(cwd, serverEntry)}.`,
    )
  }

  const standaloneRequire = (options.createRequireImpl ?? createRequire)(
    serverEntry,
  )
  const missing = REQUIRED_SERVER_DEPENDENCIES.filter(dependency => {
    try {
      const resolved = standaloneRequire.resolve(dependency)
      return !isWithinDirectory(resolved, standaloneRoot)
    } catch {
      return true
    }
  })

  if (missing.length > 0) {
    throw new Error(
      `Standalone server dependencies are missing: ${missing.join(', ')}. ` +
        'The application cannot initialize SQL Server at runtime. Ensure the ' +
        'SQL Server driver is statically imported and passed to TypeORM.',
    )
  }

  return REQUIRED_SERVER_DEPENDENCIES
}

export function main(options = {}) {
  const consoleObj = options.consoleObj ?? console
  try {
    const dependencies = checkStandaloneServerDependencies(options)
    consoleObj.log(
      `Standalone server dependency check passed: ${dependencies.join(', ')}`,
    )
    return 0
  } catch (error) {
    consoleObj.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = main()
}
