#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEVCONTAINER_DB_DIR = '/var/lib/kravhantering'
export const DEVCONTAINER_DB_FILE = `${DEVCONTAINER_DB_DIR}/devcontainer.sqlite`

export function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

export function loadEnvironmentFiles(env = process.env) {
  const initialEnv = new Set(Object.keys(env))
  const loadedEnv = new Set()
  const envFiles = [
    '.env',
    '.env.development',
    '.env.local',
    '.env.development.local',
  ]

  for (const file of envFiles) {
    const fullPath = resolve(process.cwd(), file)
    if (!existsSync(fullPath)) {
      continue
    }

    const content = readFileSync(fullPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const equalsIndex = trimmed.indexOf('=')
      if (equalsIndex < 1) {
        continue
      }

      const key = trimmed.slice(0, equalsIndex).trim()
      const rawValue = trimmed.slice(equalsIndex + 1).trim()
      if (!key) {
        continue
      }

      if (initialEnv.has(key) && !loadedEnv.has(key)) {
        continue
      }

      env[key] = stripWrappingQuotes(rawValue)
      loadedEnv.add(key)
    }
  }
}

export function isHttpDatabaseUrl(connectionString) {
  return (
    connectionString.startsWith('http://') ||
    connectionString.startsWith('https://')
  )
}

export function resolveSqliteFilePath(connectionString) {
  if (connectionString === ':memory:') {
    return connectionString
  }

  if (connectionString.startsWith('file:')) {
    const url = new URL(connectionString)
    const filePath = decodeURIComponent(url.pathname)
    return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
  }

  return isAbsolute(connectionString)
    ? connectionString
    : resolve(process.cwd(), connectionString)
}

export function resolveInspectableDatabase(options = {}) {
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? existsSync
  const connectionString = env.DATABASE_URL?.trim()

  if (connectionString && !isHttpDatabaseUrl(connectionString)) {
    const filePath = resolveSqliteFilePath(connectionString)
    return fileExists(filePath)
      ? {
          kind: 'file',
          path: filePath,
          source: 'DATABASE_URL',
        }
      : {
          kind: 'missing',
          message: `No local SQLite database found at ${filePath}. Run \`npm run db:setup\` first.`,
          path: filePath,
          source: 'DATABASE_URL',
        }
  }

  if (fileExists(DEVCONTAINER_DB_DIR)) {
    return fileExists(DEVCONTAINER_DB_FILE)
      ? {
          kind: 'file',
          path: DEVCONTAINER_DB_FILE,
          source: 'devcontainer-volume',
        }
      : {
          kind: 'missing',
          message: `No local SQLite database found at ${DEVCONTAINER_DB_FILE}. Run \`npm run db:setup\` first.`,
          path: DEVCONTAINER_DB_FILE,
          source: 'devcontainer-volume',
        }
  }

  if (connectionString) {
    return {
      kind: 'unavailable',
      message: `DATABASE_URL points to an HTTP SQLite proxy (${connectionString}), but this environment does not have the database file mounted locally. Run this command from the devcontainer, inspect the Docker volume directly, or set DATABASE_URL to a local SQLite file and rerun \`npm run db:setup\`.`,
    }
  }

  return {
    kind: 'unavailable',
    message:
      'DATABASE_URL is not set and no local SQLite database mount is available.',
  }
}

export function createStudioConfig(filePath) {
  return `export default {
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: ${JSON.stringify(filePath)} },
}
`
}

export function getNpxCommand(platform = process.platform) {
  return platform === 'win32' ? 'npx.cmd' : 'npx'
}

function runChild(command, args, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl(command, args, {
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 0
}

export function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const env = dependencies.env ?? process.env
  const fileExists = dependencies.fileExists ?? existsSync
  const spawnSyncImpl = dependencies.spawnSyncImpl ?? spawnSync
  const mkdtempSyncImpl = dependencies.mkdtempSyncImpl ?? mkdtempSync
  const writeFileSyncImpl = dependencies.writeFileSyncImpl ?? writeFileSync
  const rmSyncImpl = dependencies.rmSyncImpl ?? rmSync

  loadEnvironmentFiles(env)

  const [command, ...extraArgs] = args
  if (!command) {
    consoleObj.error('Usage: node scripts/db-tools.mjs <browse|studio>')
    return 1
  }

  if (command !== 'browse' && command !== 'studio') {
    consoleObj.error('Usage: node scripts/db-tools.mjs <browse|studio>')
    return 1
  }

  const target = resolveInspectableDatabase({ env, fileExists })
  if (target.kind !== 'file') {
    consoleObj.error(target.message)
    return 1
  }

  if (command === 'browse') {
    consoleObj.log(`Opening ${target.path} in VS Code...`)

    try {
      return runChild('code', [target.path], spawnSyncImpl)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'ENOENT') {
          consoleObj.log(`Open ${target.path} in SQLite Viewer.`)
          return 0
        }
      }

      consoleObj.error(
        error instanceof Error ? error.message : 'Failed to launch VS Code.',
      )
      return 1
    }
  }

  if (command === 'studio') {
    const tempDir = mkdtempSyncImpl(join(tmpdir(), 'kravhantering-db-studio-'))
    const configPath = join(tempDir, 'drizzle-studio.config.mjs')

    try {
      writeFileSyncImpl(configPath, createStudioConfig(target.path))
      consoleObj.log(`Starting Drizzle Studio for ${target.path}...`)

      return runChild(
        getNpxCommand(),
        ['drizzle-kit', 'studio', '--config', configPath, ...extraArgs],
        spawnSyncImpl,
      )
    } catch (error) {
      consoleObj.error(
        error instanceof Error
          ? error.message
          : 'Failed to start Drizzle Studio.',
      )
      return 1
    } finally {
      rmSyncImpl(tempDir, { force: true, recursive: true })
    }
  }
}

const isMainEntry =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  const exitCode = main(process.argv.slice(2))
  process.exit(exitCode)
}
