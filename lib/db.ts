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
import type { DataSource } from 'typeorm'
import * as schema from '@/drizzle/schema'
import {
  createAppDataSource,
  createReadonlyBrowseDataSource,
} from '@/lib/typeorm/data-source'
import {
  getSqlServerDatabaseUrl,
  tryGetSqlServerDatabaseUrl,
} from '@/lib/typeorm/sqlserver-config'

type AppSchema = typeof schema
type BetterSqliteDatabase = BetterSQLite3Database<AppSchema> & {
  $client: BetterSqlite3.Database
}
type RemoteSqliteDatabase = SqliteRemoteDatabase<AppSchema>
type ProxyQueryMethod = 'run' | 'all' | 'values' | 'get'

interface ExecuteBatchOptions {
  method: ProxyQueryMethod
  params: unknown[]
  sql: string
}

interface ExecuteBatchResult {
  rows: unknown[]
}

interface ExecuteQueryOptions {
  method: ProxyQueryMethod
  params: unknown[]
  sql: string
}

interface PostProxyOptions {
  baseUrl: string
  timeoutMs?: number
  transactionId?: string | null
}

interface TimeoutSignal {
  clear(): void
  signal: AbortSignal
}

export type Database = BaseSQLiteDatabase<'sync' | 'async', unknown, AppSchema>
export type DatabaseProviderKind = 'legacy-sqlite' | 'sqlserver-typeorm'
export type AppDatabaseConnection = Database | SqlServerDatabase
export type SqlServerDatabase = DataSource

const DATABASE_URL_ERROR =
  'No database connection is configured. Set DATABASE_URL for the legacy SQLite path, or configure SQL Server using DATABASE_URL/SQLSERVER_DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.'
const DEFAULT_PROXY_TIMEOUT_MS = 10_000
const LEGACY_SQLITE_ONLY_ERROR =
  'getDb() and getRequestDatabase() still serve the legacy SQLite/Drizzle path only. Use getSqlServerDataSource() or getRequestSqlServerDataSource() for the SQL Server + TypeORM path.'
const nodeRequire = createRequire(import.meta.url)

declare global {
  var __kravhanteringDbCache: Map<string, Database> | undefined
  var __kravhanteringSqlServerDataSourceCache:
    | Map<string, Promise<SqlServerDatabase>>
    | undefined
}

function getDbCache(): Map<string, Database> {
  globalThis.__kravhanteringDbCache ??= new Map<string, Database>()
  return globalThis.__kravhanteringDbCache
}

function getSqlServerDataSourceCache(): Map<string, Promise<SqlServerDatabase>> {
  globalThis.__kravhanteringSqlServerDataSourceCache ??= new Map<
    string,
    Promise<SqlServerDatabase>
  >()
  return globalThis.__kravhanteringSqlServerDataSourceCache
}

function normalizeDatabaseUrl(connectionString?: string): string {
  const value = connectionString?.trim()
  if (!value) {
    throw new Error(DATABASE_URL_ERROR)
  }

  return value
}

function resolveDefaultDatabaseUrl(
  connectionString = process.env.DATABASE_URL,
): string {
  const trimmed = connectionString?.trim()
  if (trimmed) {
    return normalizeDatabaseUrl(trimmed)
  }

  const sqlServerConnectionString = tryGetSqlServerDatabaseUrl(process.env, false)
  if (sqlServerConnectionString) {
    return sqlServerConnectionString
  }

  throw new Error(DATABASE_URL_ERROR)
}

function isHttpDatabaseUrl(connectionString: string): boolean {
  return (
    connectionString.startsWith('http://') ||
    connectionString.startsWith('https://')
  )
}

export function isSqlServerDatabaseUrl(connectionString: string): boolean {
  return (
    connectionString.startsWith('mssql://') ||
    connectionString.startsWith('sqlserver://')
  )
}

export function getDatabaseProviderKind(
  connectionString = process.env.DATABASE_URL,
): DatabaseProviderKind {
  const normalizedUrl = resolveDefaultDatabaseUrl(connectionString)
  return isSqlServerDatabaseUrl(normalizedUrl)
    ? 'sqlserver-typeorm'
    : 'legacy-sqlite'
}

function resolveSqliteFilePath(connectionString: string): string {
  if (connectionString === ':memory:') {
    return connectionString
  }

  if (connectionString.startsWith('file:')) {
    const pathPart = connectionString.slice(5)
    if (!pathPart.startsWith('/') && !pathPart.startsWith('//')) {
      return resolve(
        /* turbopackIgnore: true */ process.cwd(),
        decodeURIComponent(pathPart),
      )
    }

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

function createTimeoutSignal(timeoutMs: number): TimeoutSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return {
      clear() {},
      signal: AbortSignal.timeout(timeoutMs),
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  return {
    clear() {
      clearTimeout(timeoutId)
    },
    signal: controller.signal,
  }
}

async function postProxy<T>(
  endpoint: string,
  payload: unknown,
  options: PostProxyOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.transactionId) {
    headers['x-sqlite-transaction-id'] = options.transactionId
  }

  const timeoutSignal = createTimeoutSignal(
    options.timeoutMs ?? DEFAULT_PROXY_TIMEOUT_MS,
  )

  let response: Response
  try {
    response = await fetch(`${options.baseUrl}${endpoint}`, {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers,
      method: 'POST',
      signal: timeoutSignal.signal,
    })
  } finally {
    timeoutSignal.clear()
  }

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
    method: ProxyQueryMethod,
  ): Promise<ExecuteBatchResult> => {
    const statement = sql.trim().toLowerCase()
    const opensTransaction =
      transactionId == null && statement.startsWith('begin')

    if (opensTransaction) {
      transactionId = randomUUID()
    }

    try {
      const queryOptions: ExecuteQueryOptions = {
        method,
        params,
        sql,
      }

      return await postProxy<ExecuteBatchResult>('/query', queryOptions, {
        baseUrl,
        transactionId,
      })
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
    queries: ExecuteBatchOptions[],
  ): Promise<ExecuteBatchResult[]> =>
    postProxy<ExecuteBatchResult[]>(
      '/batch',
      { queries },
      { baseUrl, transactionId },
    )

  return drizzleSqliteProxy(executeQuery, executeBatch, { schema })
}

export function getDb(connectionString = process.env.DATABASE_URL): Database {
  const normalizedUrl = resolveDefaultDatabaseUrl(connectionString)

  if (isSqlServerDatabaseUrl(normalizedUrl)) {
    throw new Error(LEGACY_SQLITE_ONLY_ERROR)
  }

  if (isHttpDatabaseUrl(normalizedUrl)) {
    return createRemoteSqliteDatabase(normalizedUrl)
  }

  const cache = getDbCache()
  const cached = cache.get(normalizedUrl)

  if (cached) {
    return cached
  }

  const db = createBetterSqliteDatabase(normalizedUrl)
  cache.set(normalizedUrl, db)
  return db
}

async function initializeSqlServerDataSource(
  cacheKey: string,
  factory: () => SqlServerDatabase,
): Promise<SqlServerDatabase> {
  const cache = getSqlServerDataSourceCache()
  const cached = cache.get(cacheKey)

  if (cached) {
    return cached
  }

  const initializationPromise = (async () => {
    const dataSource = factory()

    if (!dataSource.isInitialized) {
      await dataSource.initialize()
    }

    return dataSource
  })()

  cache.set(cacheKey, initializationPromise)

  try {
    return await initializationPromise
  } catch (error) {
    cache.delete(cacheKey)
    throw error
  }
}

export async function getSqlServerDataSource(
  connectionString = getSqlServerDatabaseUrl(process.env, false),
): Promise<SqlServerDatabase> {
  const normalizedUrl = normalizeDatabaseUrl(connectionString)

  if (!isSqlServerDatabaseUrl(normalizedUrl)) {
    throw new Error(
      'getSqlServerDataSource() requires a SQL Server connection string using the mssql:// or sqlserver:// scheme.',
    )
  }

  return initializeSqlServerDataSource(`main:${normalizedUrl}`, () =>
    createAppDataSource({ url: normalizedUrl }),
  )
}

export async function getReadonlySqlServerDataSource(
  connectionString = getSqlServerDatabaseUrl(process.env, true),
): Promise<SqlServerDatabase> {
  const normalizedUrl = normalizeDatabaseUrl(connectionString)

  if (!isSqlServerDatabaseUrl(normalizedUrl)) {
    throw new Error(
      'getReadonlySqlServerDataSource() requires a SQL Server connection string using the mssql:// or sqlserver:// scheme.',
    )
  }

  return initializeSqlServerDataSource(`readonly:${normalizedUrl}`, () =>
    createReadonlyBrowseDataSource({ url: normalizedUrl }),
  )
}

export async function getRequestDatabase(): Promise<Database> {
  const sqlServerConnectionString = tryGetSqlServerDatabaseUrl(process.env, false)

  if (sqlServerConnectionString) {
    throw new Error(LEGACY_SQLITE_ONLY_ERROR)
  }

  return getDb(process.env.DATABASE_URL)
}

export async function getRequestSqlServerDataSource(): Promise<SqlServerDatabase> {
  return getSqlServerDataSource()
}

export async function getRequestDatabaseConnection(): Promise<AppDatabaseConnection> {
  return getDatabaseProviderKind() === 'sqlserver-typeorm'
    ? getRequestSqlServerDataSource()
    : getRequestDatabase()
}

export function isSqlServerDatabaseConnection(
  db: AppDatabaseConnection,
): db is SqlServerDatabase {
  return (
    typeof db === 'object' &&
    db !== null &&
    'getRepository' in db &&
    typeof db.getRepository === 'function' &&
    'query' in db &&
    typeof db.query === 'function'
  )
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
  return '$client' in db
}

export function isRemoteSqliteSession(db: Database): boolean {
  return !('$client' in db)
}
