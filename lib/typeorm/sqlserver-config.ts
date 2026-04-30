import { isIP } from 'node:net'
import type { DataSource, DataSourceOptions } from 'typeorm'
import { DataSource as TypeOrmDataSource } from 'typeorm'

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export interface SqlServerRuntimeEnv extends NodeJS.ProcessEnv {
  DATABASE_READONLY_URL?: string
  DATABASE_URL?: string
  DB_CONNECTION_TIMEOUT_MS?: string
  DB_ENCRYPT?: string
  DB_HOST?: string
  DB_LOGGING?: string
  DB_NAME?: string
  DB_PASSWORD?: string
  DB_PORT?: string
  DB_READONLY_PASSWORD?: string
  DB_READONLY_USER?: string
  DB_REQUEST_TIMEOUT_MS?: string
  DB_TRUST_SERVER_CERTIFICATE?: string
  DB_USER?: string
  MSSQL_SA_PASSWORD?: string
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

function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function isSqlServerUrl(value: string): boolean {
  return value.startsWith('mssql://') || value.startsWith('sqlserver://')
}

/**
 * Returns true when the given hostname is an IPv4 or IPv6 literal.
 * Delegates to Node's built-in `net.isIP`, which correctly handles IPv6
 * shorthand, embedded IPv4, and zone identifiers.  RFC 6066 forbids IP
 * addresses as TLS SNI values; tedious otherwise emits Node's DEP0123 warning.
 */
function isIpLiteral(hostname: string): boolean {
  if (!hostname) {
    return false
  }
  // The URL parser strips brackets from IPv6 hostnames, but be
  // defensive in case the raw env value still includes them.
  const stripped = hostname.replace(/^\[/, '').replace(/\]$/, '')
  return isIP(stripped) !== 0
}

function isIpHost(urlString: string): boolean {
  try {
    return isIpLiteral(new URL(urlString).hostname)
  } catch {
    return false
  }
}

function getExplicitSqlServerDatabaseUrl(
  env: SqlServerRuntimeEnv = process.env,
  readonly = false,
): string | null {
  const candidates = readonly
    ? [env.SQLSERVER_DATABASE_READONLY_URL, env.DATABASE_READONLY_URL]
    : [env.SQLSERVER_DATABASE_URL, env.DATABASE_URL]

  return (
    candidates
      .map(value => value?.trim())
      .find(value => value && isSqlServerUrl(value)) ?? null
  )
}

function buildSqlServerDatabaseUrlFromParts(
  env: SqlServerRuntimeEnv = process.env,
  readonly = false,
): string | null {
  const host = env.DB_HOST?.trim()
  const database = env.DB_NAME?.trim()
  const username = readonly
    ? env.DB_READONLY_USER?.trim()
    : env.DB_USER?.trim() || (env.MSSQL_SA_PASSWORD ? 'sa' : undefined)
  const password = readonly
    ? env.DB_READONLY_PASSWORD
    : (env.DB_PASSWORD ?? env.MSSQL_SA_PASSWORD)

  if (!host || !database || !username || !password) {
    return null
  }

  const port = parseInteger(env.DB_PORT, 1433)
  const encrypt = parseBoolean(env.DB_ENCRYPT, true)
  const trustServerCertificate = parseBoolean(
    env.DB_TRUST_SERVER_CERTIFICATE,
    false,
  )

  const url = new URL('mssql://placeholder')
  url.username = username
  url.password = password
  url.hostname = host
  url.port = String(port)
  url.pathname = `/${encodeURIComponent(database)}`
  url.searchParams.set('encrypt', String(encrypt))
  url.searchParams.set('trustServerCertificate', String(trustServerCertificate))

  return url.toString()
}

export function tryGetSqlServerDatabaseUrl(
  env: SqlServerRuntimeEnv = process.env,
  readonly = false,
): string | null {
  return (
    getExplicitSqlServerDatabaseUrl(env, readonly) ??
    buildSqlServerDatabaseUrlFromParts(env, readonly)
  )
}

export function getSqlServerDatabaseUrl(
  env: SqlServerRuntimeEnv = process.env,
  readonly = false,
): string {
  const resolved = tryGetSqlServerDatabaseUrl(env, readonly)

  if (!resolved) {
    const variableName = readonly
      ? 'SQLSERVER_DATABASE_READONLY_URL or DATABASE_READONLY_URL, or DB_HOST/DB_PORT/DB_NAME/DB_READONLY_USER/DB_READONLY_PASSWORD'
      : 'SQLSERVER_DATABASE_URL or DATABASE_URL, or DB_HOST/DB_PORT/DB_NAME with DB_USER/DB_PASSWORD (or MSSQL_SA_PASSWORD for the default sa login)'

    throw new Error(`${variableName} must be configured for SQL Server access.`)
  }

  return resolved
}

export function buildSqlServerDataSourceOptions(
  options: BuildSqlServerDataSourceOptions = {},
): DataSourceOptions {
  const env = options.env ?? process.env
  const url = options.url ?? getSqlServerDatabaseUrl(env, options.readonly)
  const logging =
    options.logging ?? (parseBoolean(env.DB_LOGGING, false) ? ['error'] : false)

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
      // When the host is an IP address, override the TLS SNI servername so
      // tedious does not pass the IP literal to `tls.connect`.  RFC 6066
      // forbids IP addresses as SNI values, and Node.js otherwise emits
      // DEP0123.  Tedious uses a truthy-check on `serverName`, so an empty
      // string is not enough — we substitute "localhost", which is safe
      // because `trustServerCertificate` is required for IP-based dev/test
      // connections anyway.
      ...(isIpHost(url)
        ? ({ serverName: 'localhost' } as Record<string, unknown>)
        : {}),
    },
  }
}

export function createSqlServerDataSource(
  options: BuildSqlServerDataSourceOptions = {},
): DataSource {
  return new TypeOrmDataSource(buildSqlServerDataSourceOptions(options))
}
