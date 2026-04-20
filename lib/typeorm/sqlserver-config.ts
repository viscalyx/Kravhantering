import type { DataSource, DataSourceOptions } from 'typeorm'
import { DataSource as TypeOrmDataSource } from 'typeorm'

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export interface SqlServerRuntimeEnv extends NodeJS.ProcessEnv {
  DATABASE_READONLY_URL?: string
  DATABASE_URL?: string
  DB_CONNECTION_TIMEOUT_MS?: string
  DB_ENCRYPT?: string
  DB_LOGGING?: string
  DB_REQUEST_TIMEOUT_MS?: string
  DB_TRUST_SERVER_CERTIFICATE?: string
  SQLSERVER_DATABASE_READONLY_URL?: string
  SQLSERVER_DATABASE_URL?: string
}

export interface BuildSqlServerDataSourceOptions {
  entities?: DataSourceOptions['entities']
  env?: SqlServerRuntimeEnv
  logging?: DataSourceOptions['logging']
  migrations?: DataSourceOptions['migrations']
  name?: string
  readonly?: boolean
  url?: string
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value == null || value.trim() === '') {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }

  return defaultValue
}

function parseInteger(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value == null || value.trim() === '') {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function isSqlServerUrl(value: string): boolean {
  return value.startsWith('mssql://') || value.startsWith('sqlserver://')
}

export function getSqlServerDatabaseUrl(
  env: SqlServerRuntimeEnv = process.env,
  readonly = false,
): string {
  const candidates = readonly
    ? [env.SQLSERVER_DATABASE_READONLY_URL, env.DATABASE_READONLY_URL]
    : [env.SQLSERVER_DATABASE_URL, env.DATABASE_URL]

  const resolved = candidates
    .map(value => value?.trim())
    .find(value => value && isSqlServerUrl(value))

  if (!resolved) {
    const variableName = readonly
      ? 'SQLSERVER_DATABASE_READONLY_URL or DATABASE_READONLY_URL'
      : 'SQLSERVER_DATABASE_URL or DATABASE_URL'

    throw new Error(
      `${variableName} must contain a SQL Server connection string using the mssql:// or sqlserver:// scheme.`,
    )
  }

  return resolved
}

export function buildSqlServerDataSourceOptions(
  options: BuildSqlServerDataSourceOptions = {},
): DataSourceOptions {
  const env = options.env ?? process.env
  const url = options.url ?? getSqlServerDatabaseUrl(env, options.readonly)
  const logging =
    options.logging ??
    (parseBoolean(env.DB_LOGGING, false) ? ['error'] : false)

  return {
    type: 'mssql',
    url,
    name:
      options.name ??
      (options.readonly ? 'kravhantering-readonly' : 'kravhantering-main'),
    synchronize: false,
    logging,
    entities: options.entities ?? [],
    migrations: options.migrations ?? ['typeorm/migrations/*.{js,ts}'],
    connectionTimeout: parseInteger(
      env.DB_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
    ),
    requestTimeout: parseInteger(
      env.DB_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    options: {
      enableArithAbort: true,
      encrypt: parseBoolean(env.DB_ENCRYPT, true),
      trustServerCertificate: parseBoolean(
        env.DB_TRUST_SERVER_CERTIFICATE,
        false,
      ),
    },
  }
}

export function createSqlServerDataSource(
  options: BuildSqlServerDataSourceOptions = {},
): DataSource {
  return new TypeOrmDataSource(buildSqlServerDataSourceOptions(options))
}
