import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import {
  drizzle as drizzleSqliteProxy,
  type SqliteRemoteDatabase,
} from 'drizzle-orm/sqlite-proxy'
import * as schema from '@/drizzle/schema'

type AppSchema = typeof schema
type BetterSqliteDatabase = BetterSQLite3Database<AppSchema> & {
  $client: BetterSqlite3.Database
}
type RemoteSqliteDatabase = SqliteRemoteDatabase<AppSchema>

export type Database = BaseSQLiteDatabase<'sync' | 'async', unknown, AppSchema>

const DATABASE_URL_ERROR =
  'DATABASE_URL is required. Point it to the SQLite proxy service (for example http://127.0.0.1:9000) or to a local SQLite file.'
const nodeRequire = createRequire(import.meta.url)

declare global {
  var __kravhanteringDbCache: Map<string, Database> | undefined
}

function getDbCache(): Map<string, Database> {
  globalThis.__kravhanteringDbCache ??= new Map<string, Database>()
  return globalThis.__kravhanteringDbCache
}

function normalizeDatabaseUrl(connectionString?: string): string {
  const value = connectionString?.trim()
  if (!value) {
    throw new Error(DATABASE_URL_ERROR)
  }

  return value
}

function isHttpDatabaseUrl(connectionString: string): boolean {
  return (
    connectionString.startsWith('http://') ||
    connectionString.startsWith('https://')
  )
}

function resolveSqliteFilePath(connectionString: string): string {
  if (connectionString === ':memory:') {
    return connectionString
  }

  if (connectionString.startsWith('file:')) {
    const url = new URL(connectionString)
    const filePath = decodeURIComponent(url.pathname)
    return isAbsolute(filePath)
      ? filePath
      : resolve(/* turbopackIgnore: true */ process.cwd(), filePath)
  }

  return isAbsolute(connectionString)
    ? connectionString
    : resolve(/* turbopackIgnore: true */ process.cwd(), connectionString)
}

function createBetterSqliteDatabase(
  connectionString: string,
): BetterSqliteDatabase {
  const filePath = resolveSqliteFilePath(connectionString)
  const BetterSqlite3 = nodeRequire(
    'better-sqlite3',
  ) as typeof import('better-sqlite3')
  const drizzleBetterSqliteModule = nodeRequire(
    'drizzle-orm/better-sqlite3',
  ) as typeof import('drizzle-orm/better-sqlite3')
  const drizzleBetterSqlite3 = drizzleBetterSqliteModule.drizzle

  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true })
  }

  const sqlite = new BetterSqlite3(filePath)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')

  return drizzleBetterSqlite3(sqlite, { schema })
}

function normalizeProxyBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

async function postProxy<T>(
  endpoint: string,
  payload: unknown,
  options?: { baseUrl: string; transactionId?: string | null },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options?.transactionId) {
    headers['x-sqlite-transaction-id'] = options.transactionId
  }

  const response = await fetch(`${options?.baseUrl ?? ''}${endpoint}`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers,
    method: 'POST',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `SQLite proxy request to ${endpoint} failed with ${response.status}: ${body}`,
    )
  }

  return (await response.json()) as T
}

function createRemoteSqliteDatabase(
  connectionString: string,
): RemoteSqliteDatabase {
  const baseUrl = normalizeProxyBaseUrl(connectionString)
  let transactionId: string | null = null

  const executeQuery = async (
    sql: string,
    params: unknown[],
    method: 'run' | 'all' | 'values' | 'get',
  ) => {
    const statement = sql.trim().toLowerCase()
    const opensTransaction =
      transactionId == null && statement.startsWith('begin')

    if (opensTransaction) {
      transactionId = randomUUID()
    }

    try {
      return await postProxy<{ rows: unknown[] }>(
        '/query',
        { method, params, sql },
        { baseUrl, transactionId },
      )
    } catch (error) {
      if (opensTransaction) {
        transactionId = null
      }
      throw error
    } finally {
      if (statement.startsWith('commit') || statement.startsWith('rollback')) {
        transactionId = null
      }
    }
  }

  const executeBatch = async (
    queries: {
      method: 'run' | 'all' | 'values' | 'get'
      params: unknown[]
      sql: string
    }[],
  ) =>
    postProxy<{ rows: unknown[] }[]>(
      '/batch',
      { queries },
      { baseUrl, transactionId },
    )

  return drizzleSqliteProxy(executeQuery, executeBatch, { schema })
}

function createDatabase(connectionString: string): Database {
  return isHttpDatabaseUrl(connectionString)
    ? createRemoteSqliteDatabase(connectionString)
    : createBetterSqliteDatabase(connectionString)
}

export function getDb(connectionString = process.env.DATABASE_URL): Database {
  const normalizedUrl = normalizeDatabaseUrl(connectionString)
  const cache = getDbCache()
  const cached = cache.get(normalizedUrl)

  if (cached) {
    return cached
  }

  const db = createDatabase(normalizedUrl)
  cache.set(normalizedUrl, db)
  return db
}

export async function getRequestDatabase(): Promise<Database> {
  return getDb()
}

export function getSessionName(db: Database): string | undefined {
  return (
    db as {
      session?: {
        constructor?: {
          name?: string
        }
      }
    }
  ).session?.constructor?.name
}

export function isBetterSqliteSession(db: Database): boolean {
  return getSessionName(db) === 'BetterSQLiteSession'
}

export function isRemoteSqliteSession(db: Database): boolean {
  return getSessionName(db) === 'SQLiteRemoteSession'
}
