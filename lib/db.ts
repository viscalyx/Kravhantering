import type { DataSource, EntityManager } from 'typeorm'
import {
  createAppDataSource,
  createReadonlyBrowseDataSource,
} from '@/lib/typeorm/data-source'
import { getSqlServerDatabaseUrl } from '@/lib/typeorm/sqlserver-config'

export type SqlServerDatabase = DataSource
export type SqlServerEntityManager = EntityManager

declare global {
  var __kravhanteringSqlServerDataSourceCache:
    | Map<string, Promise<SqlServerDatabase>>
    | undefined
}

function getCache(): Map<string, Promise<SqlServerDatabase>> {
  globalThis.__kravhanteringSqlServerDataSourceCache ??= new Map<
    string,
    Promise<SqlServerDatabase>
  >()
  return globalThis.__kravhanteringSqlServerDataSourceCache
}

function normalize(connectionString?: string): string {
  const value = connectionString?.trim()
  if (!value) {
    throw new Error(
      'No SQL Server connection string is configured. Set DATABASE_URL or SQLSERVER_DATABASE_URL using the mssql:// or sqlserver:// scheme, or set DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.',
    )
  }
  return value
}

export function isSqlServerDatabaseUrl(connectionString: string): boolean {
  return (
    connectionString.startsWith('mssql://') ||
    connectionString.startsWith('sqlserver://')
  )
}

async function init(
  cacheKey: string,
  factory: () => SqlServerDatabase,
): Promise<SqlServerDatabase> {
  const cache = getCache()
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const promise = (async () => {
    const ds = factory()
    if (!ds.isInitialized) await ds.initialize()
    return ds
  })()
  cache.set(cacheKey, promise)
  try {
    return await promise
  } catch (error) {
    cache.delete(cacheKey)
    throw error
  }
}

export async function getSqlServerDataSource(
  connectionString = getSqlServerDatabaseUrl(process.env, false),
): Promise<SqlServerDatabase> {
  const url = normalize(connectionString)
  if (!isSqlServerDatabaseUrl(url)) {
    throw new Error(
      'getSqlServerDataSource() requires a SQL Server URL (mssql:// or sqlserver://).',
    )
  }
  return init(`main:${url}`, () => createAppDataSource({ url }))
}

export async function getReadonlySqlServerDataSource(
  connectionString = getSqlServerDatabaseUrl(process.env, true),
): Promise<SqlServerDatabase> {
  const url = normalize(connectionString)
  if (!isSqlServerDatabaseUrl(url)) {
    throw new Error(
      'getReadonlySqlServerDataSource() requires a SQL Server URL (mssql:// or sqlserver://).',
    )
  }
  return init(`readonly:${url}`, () => createReadonlyBrowseDataSource({ url }))
}

export async function getRequestSqlServerDataSource(): Promise<SqlServerDatabase> {
  return getSqlServerDataSource()
}
