#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'

const MIGRATIONS_DIR = resolve(process.cwd(), 'drizzle/migrations')
const MIGRATIONS_TABLE = '__app_migrations'
const DEFAULT_TIMEOUT_MS = 60_000
export const SEED_SQL_FILE = 'drizzle/seed.sql'

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

export function getDatabaseUrl(env = process.env) {
  const value = env.DATABASE_URL?.trim()

  if (!value) {
    throw new Error(
      'DATABASE_URL is required for database administration commands.',
    )
  }

  return value
}

export function isHttpDatabaseUrl(connectionString) {
  return (
    connectionString.startsWith('http://') ||
    connectionString.startsWith('https://')
  )
}

export function normalizeBaseUrl(connectionString) {
  return connectionString.endsWith('/')
    ? connectionString.slice(0, -1)
    : connectionString
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

async function fetchJson(baseUrl, endpoint, body, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    body: body == null ? undefined : JSON.stringify(body),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    method: options.method ?? 'POST',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Request to ${endpoint} failed with ${response.status}: ${text}`,
    )
  }

  return response.json()
}

export function splitSqlStatements(sqlText) {
  return sqlText
    .split(/-->\s*statement-breakpoint/g)
    .map(statement => statement.trim())
    .filter(Boolean)
}

export function hashSql(sqlText) {
  return createHash('sha256').update(sqlText).digest('hex')
}

export function getSortedMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(entry => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
}

export function createLocalAdmin(connectionString) {
  const filePath = resolveSqliteFilePath(connectionString)
  let closed = false

  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true })
  }

  const sqlite = new BetterSqlite3(filePath)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')

  const closeIfNeeded = () => {
    if (!closed) {
      sqlite.close()
      closed = true
    }
  }

  return {
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params)
    },
    async close() {
      closeIfNeeded()
    },
    async execScript(sql) {
      sqlite.exec(sql)
    },
    async health() {
      return { dbFile: filePath, ok: true }
    },
    async reset() {
      closeIfNeeded()
      if (filePath !== ':memory:') {
        for (const suffix of ['', '-wal', '-shm']) {
          const path = `${filePath}${suffix}`
          try {
            rmSync(path, { force: true })
          } catch {}
        }
      }
      return { ok: true }
    },
    async runStatements(statements) {
      const transaction = sqlite.transaction(statementList => {
        for (const statement of statementList) {
          sqlite.prepare(statement.sql).run(...statement.params)
        }
      })
      transaction(statements)
    },
  }
}

export function createRemoteAdmin(connectionString) {
  const baseUrl = normalizeBaseUrl(connectionString)

  return {
    async all(sql, params = []) {
      const result = await fetchJson(baseUrl, '/query', {
        method: 'all',
        params,
        sql,
      })
      return result.rows ?? []
    },
    async close() {},
    async execScript(sql) {
      await fetchJson(baseUrl, '/exec', { sql })
    },
    async health() {
      return fetchJson(baseUrl, '/healthz', null, { method: 'GET' })
    },
    async reset() {
      return fetchJson(baseUrl, '/reset', {})
    },
    async runStatements(statements) {
      await fetchJson(baseUrl, '/batch', {
        queries: statements.map(statement => ({
          method: 'run',
          params: statement.params,
          sql: statement.sql,
        })),
      })
    },
  }
}

export function createAdminClient(connectionString) {
  return isHttpDatabaseUrl(connectionString)
    ? createRemoteAdmin(connectionString)
    : createLocalAdmin(connectionString)
}

export async function ensureMigrationsTable(admin) {
  await admin.runStatements([
    {
      params: [],
      sql: `
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          hash TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `,
    },
  ])
}

export async function readAppliedMigrations(admin) {
  const rows = await admin.all(
    `SELECT name, hash FROM ${MIGRATIONS_TABLE} ORDER BY name ASC`,
  )

  const map = new Map()
  for (const row of rows) {
    if (Array.isArray(row) && typeof row[0] === 'string') {
      map.set(row[0], row[1])
      continue
    }

    if (
      row &&
      typeof row === 'object' &&
      typeof row.name === 'string' &&
      typeof row.hash === 'string'
    ) {
      map.set(row.name, row.hash)
    }
  }

  return map
}

export async function migrate(admin) {
  await ensureMigrationsTable(admin)
  const appliedMigrations = await readAppliedMigrations(admin)
  const migrationFiles = getSortedMigrationFiles()
  let appliedCount = 0

  for (const filename of migrationFiles) {
    const fullPath = resolve(MIGRATIONS_DIR, filename)
    const sqlText = readFileSync(fullPath, 'utf8')
    const hash = hashSql(sqlText)
    const existingHash = appliedMigrations.get(filename)

    if (existingHash === hash) {
      continue
    }

    if (existingHash && existingHash !== hash) {
      throw new Error(
        `Migration ${filename} was already applied with a different hash.`,
      )
    }

    const statements = splitSqlStatements(sqlText).map(sql => ({
      params: [],
      sql,
    }))
    statements.push({
      params: [filename, hash],
      sql: `
        INSERT INTO ${MIGRATIONS_TABLE} (name, hash, applied_at)
        VALUES (?, ?, datetime('now'))
      `,
    })

    await admin.runStatements(statements)
    appliedCount += 1
    console.log(`Applied migration ${filename}`)
  }

  if (appliedCount === 0) {
    console.log('No pending migrations.')
    return
  }

  console.log(`Applied ${appliedCount} migration(s).`)
}

export async function waitForDatabase(admin, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await admin.health()
      console.log('Database is ready.')
      return
    } catch {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1000))
    }
  }

  throw new Error(`Database was not ready within ${timeoutMs} ms.`)
}

export async function execFile(admin, filePath, options = {}) {
  const consoleObj = options.consoleObj ?? console
  const cwd = options.cwd ?? process.cwd()
  const sqlText = readFileSync(resolve(cwd, filePath), 'utf8')
  await admin.execScript(sqlText)
  consoleObj.log(`Executed SQL from ${filePath}`)
}

export function resolveSeedSqlPath(cwd = process.cwd()) {
  return resolve(cwd, SEED_SQL_FILE)
}

export function readSeedSql(
  cwd = process.cwd(),
  readFileSyncImpl = readFileSync,
) {
  const filePath = resolveSeedSqlPath(cwd)

  try {
    return readFileSyncImpl(filePath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read ${SEED_SQL_FILE}: ${message}`)
  }
}

export async function seedDatabase(admin, options = {}) {
  const consoleObj = options.consoleObj ?? console
  const cwd = options.cwd ?? process.cwd()
  const readSeedSqlImpl = options.readSeedSql ?? readSeedSql
  const sqlText = readSeedSqlImpl(cwd)
  await admin.execScript(sqlText)
  consoleObj.log('Database seed completed.')
}

function getUsageText() {
  return 'Usage: node scripts/db-admin.mjs <wait|health|reset|migrate|seed|exec-file>'
}

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const adminFactory = dependencies.adminFactory ?? createAdminClient
  const consoleObj = dependencies.consoleObj ?? console
  const cwd = dependencies.cwd ?? process.cwd()
  const env = dependencies.env ?? process.env
  const readSeedSqlImpl = dependencies.readSeedSql ?? readSeedSql
  const loadEnvironmentFilesImpl =
    dependencies.loadEnvironmentFilesImpl ?? loadEnvironmentFiles
  let admin

  try {
    loadEnvironmentFilesImpl(env)
    const [command, ...rest] = args

    if (!command) {
      consoleObj.error(getUsageText())
      return 1
    }

    switch (command) {
      case 'exec-file':
      case 'health':
      case 'migrate':
      case 'reset':
      case 'seed':
      case 'wait':
        break
      default:
        consoleObj.error(getUsageText())
        return 1
    }

    const connectionString = getDatabaseUrl(env)
    admin = adminFactory(connectionString)

    switch (command) {
      case 'exec-file': {
        const filePath = rest[0]
        if (!filePath) {
          throw new Error('Usage: node scripts/db-admin.mjs exec-file <path>')
        }
        await execFile(admin, filePath, { consoleObj, cwd })
        break
      }
      case 'health': {
        const health = await admin.health()
        consoleObj.log(JSON.stringify(health, null, 2))
        break
      }
      case 'migrate':
        await migrate(admin)
        break
      case 'reset':
        await admin.reset()
        consoleObj.log('Database reset completed.')
        break
      case 'seed':
        await seedDatabase(admin, {
          consoleObj,
          cwd,
          readSeedSql: readSeedSqlImpl,
        })
        break
      case 'wait': {
        const timeoutMs = Number(rest[0] ?? DEFAULT_TIMEOUT_MS)
        await waitForDatabase(
          admin,
          Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
        )
        break
      }
    }
    return 0
  } catch (error) {
    consoleObj.error(error instanceof Error ? error.message : error)
    return 1
  } finally {
    await admin?.close()
  }
}

const isMainEntry =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  const exitCode = await main(process.argv.slice(2))
  process.exit(exitCode)
}
