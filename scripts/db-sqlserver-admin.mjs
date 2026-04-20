#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataSource } from 'typeorm'
import {
  createLegacySqliteSnapshot,
  getLegacyTableMetadata,
  readLegacySeedRows,
} from './sqlserver-bootstrap.mjs'
import {
  InitialSqlServerSchema1713720000000,
} from '../typeorm/migrations/0001_initial_sqlserver.mjs'

export const DEFAULT_BROWSE_CONNECTION_NAME =
  'Kravhantering SQL Server (read-only)'
export const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000
export const DEFAULT_PORT = 1433
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const DEFAULT_WAIT_RETRY_MS = 1_000
export const DEFAULT_WAIT_TIMEOUT_MS = 30_000
const USAGE =
  'Usage: node scripts/db-sqlserver-admin.mjs <health|wait|reset|migrate|seed|setup|browse-config>'

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

export function parseBoolean(value, defaultValue) {
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

export function parseInteger(value, defaultValue) {
  if (value == null || value.trim() === '') {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function getSearchParamIgnoreCase(url, name) {
  const normalizedName = name.toLowerCase()

  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === normalizedName) {
      return value
    }
  }

  return null
}

export function isSqlServerUrl(connectionString) {
  return (
    connectionString.startsWith('mssql://') ||
    connectionString.startsWith('sqlserver://')
  )
}

function getExplicitSqlServerDatabaseUrl(env = process.env, options = {}) {
  const readonly = options.readonly ?? false
  const candidates = readonly
    ? [env.SQLSERVER_DATABASE_READONLY_URL, env.DATABASE_READONLY_URL]
    : [env.SQLSERVER_DATABASE_URL, env.DATABASE_URL]

  return (
    candidates
    .map(value => value?.trim())
    .find(value => value && isSqlServerUrl(value))
  ) ?? null
}

function buildSqlServerDatabaseUrlFromParts(env = process.env, options = {}) {
  const readonly = options.readonly ?? false
  const host = env.DB_HOST?.trim()
  const database = env.DB_NAME?.trim()
  const username = readonly
    ? env.DB_READONLY_USER?.trim()
    : env.DB_USER?.trim() || (env.MSSQL_SA_PASSWORD ? 'sa' : undefined)
  const password = readonly
    ? env.DB_READONLY_PASSWORD
    : env.DB_PASSWORD ?? env.MSSQL_SA_PASSWORD

  if (!host || !database || !username || !password) {
    return null
  }

  const port = parseInteger(env.DB_PORT, DEFAULT_PORT)
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
  url.searchParams.set(
    'trustServerCertificate',
    String(trustServerCertificate),
  )

  return url.toString()
}

export function getSqlServerDatabaseUrl(env = process.env, options = {}) {
  const readonly = options.readonly ?? false
  const resolved =
    getExplicitSqlServerDatabaseUrl(env, options) ??
    buildSqlServerDatabaseUrlFromParts(env, options)

  if (!resolved) {
    const variableName = readonly
      ? 'SQLSERVER_DATABASE_READONLY_URL or DATABASE_READONLY_URL, or DB_HOST/DB_PORT/DB_NAME/DB_READONLY_USER/DB_READONLY_PASSWORD'
      : 'SQLSERVER_DATABASE_URL or DATABASE_URL, or DB_HOST/DB_PORT/DB_NAME with DB_USER/DB_PASSWORD (or MSSQL_SA_PASSWORD for the default sa login)'

    throw new Error(
      `${variableName} is required for SQL Server administration commands.`,
    )
  }

  return resolved
}

export function parseSqlServerConnectionString(
  connectionString,
  env = process.env,
) {
  const url = new URL(connectionString)
  const protocol = url.protocol.replace(/:$/, '')

  if (!['mssql', 'sqlserver'].includes(protocol)) {
    throw new Error(
      `Unsupported SQL Server connection scheme: ${url.protocol}. Use mssql:// or sqlserver://.`,
    )
  }

  return {
    connectionTimeout: parseInteger(
      getSearchParamIgnoreCase(url, 'connectionTimeout') ??
        env.DB_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, '') || 'master'),
    encrypt: parseBoolean(
      getSearchParamIgnoreCase(url, 'encrypt') ?? env.DB_ENCRYPT,
      true,
    ),
    password: decodeURIComponent(url.password),
    port: url.port ? Number.parseInt(url.port, 10) : DEFAULT_PORT,
    requestTimeout: parseInteger(
      getSearchParamIgnoreCase(url, 'requestTimeout') ??
        env.DB_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    server: url.hostname || '127.0.0.1',
    trustServerCertificate: parseBoolean(
      getSearchParamIgnoreCase(url, 'trustServerCertificate') ??
        env.DB_TRUST_SERVER_CERTIFICATE,
      false,
    ),
    username: decodeURIComponent(url.username),
  }
}

export function createMssqlConfig(connectionString, env = process.env) {
  const parsed = parseSqlServerConnectionString(connectionString, env)

  return {
    connectionTimeout: parsed.connectionTimeout,
    database: parsed.database,
    options: {
      enableArithAbort: true,
      encrypt: parsed.encrypt,
      trustServerCertificate: parsed.trustServerCertificate,
    },
    password: parsed.password,
    pool: {
      idleTimeoutMillis: 1_000,
      max: 1,
      min: 0,
    },
    port: parsed.port,
    requestTimeout: parsed.requestTimeout,
    server: parsed.server,
    user: parsed.username,
  }
}

function quoteSqlServerIdentifier(name) {
  return `[${String(name).replaceAll(']', ']]')}]`
}

function escapeSqlServerStringLiteral(value) {
  return String(value).replaceAll("'", "''")
}

function getSqlServerSchemaName(env = process.env) {
  return env.DB_SCHEMA?.trim() || 'dbo'
}

function quoteQualifiedSqlServerTableName(tableName, env = process.env) {
  return `${quoteSqlServerIdentifier(getSqlServerSchemaName(env))}.${quoteSqlServerIdentifier(tableName)}`
}

function createMasterConnectionString(connectionString) {
  const url = new URL(connectionString)
  url.pathname = '/master'
  return url.toString()
}

function buildMigrationDataSourceOptions(
  connectionString,
  env = process.env,
) {
  const parsed = parseSqlServerConnectionString(connectionString, env)

  return {
    connectionTimeout: parsed.connectionTimeout,
    logging: false,
    migrations: [InitialSqlServerSchema1713720000000],
    options: {
      enableArithAbort: true,
      encrypt: parsed.encrypt,
      trustServerCertificate: parsed.trustServerCertificate,
    },
    requestTimeout: parsed.requestTimeout,
    synchronize: false,
    type: 'mssql',
    url: connectionString,
  }
}

async function defaultConnect(config) {
  const mssqlModule = await import('mssql')
  const connect =
    mssqlModule.connect ??
    mssqlModule.default?.connect ??
    mssqlModule.default

  if (typeof connect !== 'function') {
    throw new Error('Unable to load the mssql driver connect() function.')
  }

  return connect(config)
}

async function withPool(connectionString, connectImpl, callback, env = process.env) {
  const pool = await connectImpl(createMssqlConfig(connectionString, env))

  try {
    return await callback(pool)
  } finally {
    await pool.close()
  }
}

function hasIdentityPrimaryKey(tableMetadata) {
  if (tableMetadata.primaryKey.length !== 1) {
    return false
  }

  const primaryColumn = tableMetadata.columns.find(
    column => column.name === tableMetadata.primaryKey[0],
  )

  return String(primaryColumn?.type ?? '')
    .toLowerCase()
    .includes('int')
}

function normalizeSeedValue(value) {
  if (value === undefined) {
    return null
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  return value
}

function formatSeedDebugValue(value) {
  if (value == null) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  return value
}

function containsSqlServerLoginName(password, username) {
  const normalizedPassword = String(password ?? '').toLowerCase()
  const normalizedUsername = String(username ?? '').trim().toLowerCase()

  return normalizedUsername.length >= 3 &&
    normalizedPassword.includes(normalizedUsername)
}

export async function resetSqlServerDatabase(connectionString, options = {}) {
  const connectImpl = options.connectImpl ?? defaultConnect
  const env = options.env ?? process.env
  const parsed = parseSqlServerConnectionString(connectionString, env)
  const masterConnectionString = createMasterConnectionString(connectionString)

  return withPool(masterConnectionString, connectImpl, async pool => {
    const request = pool.request()
    request.input('databaseName', parsed.database)

    await request.query(`
      IF DB_ID(@databaseName) IS NOT NULL
      BEGIN
        DECLARE @dropSql nvarchar(max) =
          N'ALTER DATABASE ' + QUOTENAME(@databaseName) +
          N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ' +
          QUOTENAME(@databaseName) + N';'
        EXEC sp_executesql @dropSql
      END

      DECLARE @createSql nvarchar(max) =
        N'CREATE DATABASE ' + QUOTENAME(@databaseName) + N';'
      EXEC sp_executesql @createSql
    `)

    return {
      database: parsed.database,
      server: parsed.server,
    }
  }, env)
}

export async function runSqlServerMigrations(connectionString, options = {}) {
  const DataSourceCtor = options.dataSourceCtor ?? DataSource
  const env = options.env ?? process.env
  const dataSource = new DataSourceCtor(
    buildMigrationDataSourceOptions(connectionString, env),
  )

  await dataSource.initialize()

  try {
    const migrations = await dataSource.runMigrations()

    return {
      database: parseSqlServerConnectionString(connectionString, env).database,
      migrationsApplied: migrations.length,
    }
  } finally {
    if (typeof dataSource.destroy === 'function') {
      await dataSource.destroy()
    }
  }
}

export async function ensureReadonlySqlServerAccess(
  connectionString,
  options = {},
) {
  const env = options.env ?? process.env
  const connectImpl = options.connectImpl ?? defaultConnect
  let readonlyConnectionString

  try {
    readonlyConnectionString = getSqlServerDatabaseUrl(env, { readonly: true })
  } catch {
    return { configured: false }
  }

  const main = parseSqlServerConnectionString(connectionString, env)
  const readonly = parseSqlServerConnectionString(readonlyConnectionString, env)

  if (
    readonly.username === main.username &&
    readonly.password === main.password
  ) {
    return { configured: false }
  }

  if (containsSqlServerLoginName(readonly.password, readonly.username)) {
    throw new Error(
      `Read-only SQL Server login setup failed for ${readonly.username}: DB_READONLY_PASSWORD / DATABASE_READONLY_URL uses a password that contains the login name. SQL Server password policy commonly rejects that. Choose a more distinct password, for example one that does not include "${readonly.username}".`,
    )
  }

  const escapedLoginName = quoteSqlServerIdentifier(readonly.username)
  const escapedPassword = `'${escapeSqlServerStringLiteral(readonly.password)}'`
  const escapedUserName = quoteSqlServerIdentifier(readonly.username)
  const escapedUserNameLiteral = `N'${escapeSqlServerStringLiteral(readonly.username)}'`
  const masterConnectionString = createMasterConnectionString(connectionString)

  try {
    await withPool(masterConnectionString, connectImpl, async pool => {
      await pool.request().query(`
        IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = ${escapedUserNameLiteral})
        BEGIN
          ALTER LOGIN ${escapedLoginName} WITH PASSWORD = ${escapedPassword}
        END
        ELSE
        BEGIN
          CREATE LOGIN ${escapedLoginName} WITH PASSWORD = ${escapedPassword}
        END
      `)
    }, env)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Read-only SQL Server login setup failed for ${readonly.username}: ${details}`,
    )
  }

  try {
    await withPool(connectionString, connectImpl, async pool => {
      await pool.request().query(`
        IF DATABASE_PRINCIPAL_ID(${escapedUserNameLiteral}) IS NULL
        BEGIN
          CREATE USER ${escapedUserName} FOR LOGIN ${escapedLoginName}
        END

        IF NOT EXISTS (
          SELECT 1
          FROM sys.database_role_members AS members
          INNER JOIN sys.database_principals AS roles
            ON members.role_principal_id = roles.principal_id
          INNER JOIN sys.database_principals AS principals
            ON members.member_principal_id = principals.principal_id
          WHERE roles.name = N'db_datareader'
            AND principals.name = ${escapedUserNameLiteral}
        )
        BEGIN
          ALTER ROLE db_datareader ADD MEMBER ${escapedUserName}
        END

        GRANT VIEW DEFINITION TO ${escapedUserName}
      `)
    }, env)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Read-only SQL Server database-user setup failed for ${readonly.username}: ${details}`,
    )
  }

  return {
    configured: true,
    username: readonly.username,
  }
}

export async function seedSqlServerDatabase(connectionString, options = {}) {
  const connectImpl = options.connectImpl ?? defaultConnect
  const env = options.env ?? process.env
  const sqliteFactory =
    options.createLegacySqliteSnapshotImpl ?? createLegacySqliteSnapshot
  const metadataFactory =
    options.getLegacyTableMetadataImpl ?? getLegacyTableMetadata
  const seedRowReader = options.readLegacySeedRowsImpl ?? readLegacySeedRows
  const sqlite = sqliteFactory({
    cwd: options.cwd ?? process.cwd(),
    includeSeed: true,
  })

  try {
    const metadata = metadataFactory(sqlite)

    return await withPool(connectionString, connectImpl, async pool => {
      const transaction =
        typeof pool.transaction === 'function' ? pool.transaction() : null
      const requestFactory =
        transaction && typeof transaction.request === 'function'
          ? () => transaction.request()
          : () => pool.request()

      if (transaction && typeof transaction.begin === 'function') {
        await transaction.begin()
      }

      let insertedRows = 0

      try {
        for (const tableMetadata of metadata) {
          const qualifiedTableName = quoteQualifiedSqlServerTableName(
            tableMetadata.name,
            env,
          )
          await requestFactory().query(
            `ALTER TABLE ${qualifiedTableName} NOCHECK CONSTRAINT ALL`,
          )
        }

        for (const tableMetadata of metadata) {
          const rows = seedRowReader(sqlite, tableMetadata)

          if (rows.length === 0) {
            continue
          }

          const hasIdentity = hasIdentityPrimaryKey(tableMetadata)
          const qualifiedTableName = quoteQualifiedSqlServerTableName(
            tableMetadata.name,
            env,
          )
          const identityInsertOnSql =
            `SET IDENTITY_INSERT ${qualifiedTableName} ON`
          const identityInsertOffSql =
            `SET IDENTITY_INSERT ${qualifiedTableName} OFF`

          for (const row of rows) {
            const columns = tableMetadata.columns.filter(column =>
              Object.hasOwn(row, column.name),
            )
            const request = requestFactory()
            const parameterValues = {}
            const parameterTokens = columns.map((column, index) => {
              const parameterName = `p${index}`
              const normalizedValue = normalizeSeedValue(row[column.name])
              request.input(parameterName, normalizedValue)
              parameterValues[parameterName] = formatSeedDebugValue(normalizedValue)
              return `@${parameterName}`
            })
            const insertSql =
              `INSERT INTO ${qualifiedTableName} (${columns
                .map(column => quoteSqlServerIdentifier(column.name))
                .join(', ')}) VALUES (${parameterTokens.join(', ')})`
            const batchSql = hasIdentity
              ? `${identityInsertOnSql}; ${insertSql}; ${identityInsertOffSql};`
              : insertSql

            try {
              await request.query(batchSql)
            } catch (error) {
              const details =
                error instanceof Error ? error.message : String(error)
              throw new Error(
                [
                  `SQL Server seed failed for table ${tableMetadata.name}: ${details}`,
                  `identityInsertEnabled: ${String(hasIdentity)}`,
                  `identityInsertOnSql: ${identityInsertOnSql}`,
                  `insertSql: ${insertSql}`,
                  `batchSql: ${batchSql}`,
                  `parameters: ${JSON.stringify(parameterValues)}`,
                  `row: ${JSON.stringify(
                    columns.reduce((accumulator, column) => {
                      accumulator[column.name] = formatSeedDebugValue(
                        row[column.name],
                      )
                      return accumulator
                    }, {}),
                  )}`,
                ].join('\n'),
              )
            }

            insertedRows += 1
          }
        }

        for (const tableMetadata of metadata) {
          const qualifiedTableName = quoteQualifiedSqlServerTableName(
            tableMetadata.name,
            env,
          )
          await requestFactory().query(
            `ALTER TABLE ${qualifiedTableName} WITH CHECK CHECK CONSTRAINT ALL`,
          )
        }

        if (transaction && typeof transaction.commit === 'function') {
          await transaction.commit()
        }
      } catch (error) {
        if (transaction && typeof transaction.rollback === 'function') {
          await transaction.rollback()
        }
        throw error
      }

      const readonlyAccess = await ensureReadonlySqlServerAccess(
        connectionString,
        options,
      )

      return {
        insertedRows,
        readonlyAccessConfigured: readonlyAccess.configured,
      }
    }, env)
  } finally {
    sqlite.close()
  }
}

export async function healthCheckSqlServer(connectionString, options = {}) {
  const connectImpl = options.connectImpl ?? defaultConnect
  const env = options.env ?? process.env

  return withPool(connectionString, connectImpl, async pool => {
    const result = await pool.request().query('SELECT 1 AS ok')

    return {
      database: createMssqlConfig(connectionString, env).database,
      ok: Array.isArray(result.recordset) && result.recordset.length > 0,
      server: createMssqlConfig(connectionString, env).server,
    }
  }, env)
}

export async function waitForSqlServer(connectionString, options = {}) {
  const healthCheckImpl = options.healthCheckImpl ?? healthCheckSqlServer
  const nowImpl = options.nowImpl ?? Date.now
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_WAIT_RETRY_MS
  const sleepImpl =
    options.sleepImpl ??
    (delayMs => new Promise(resolvePromise => setTimeout(resolvePromise, delayMs)))
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS

  const deadline = nowImpl() + timeoutMs
  let lastError

  while (nowImpl() <= deadline) {
    try {
      return await healthCheckImpl(connectionString, options)
    } catch (error) {
      lastError = error
      if (nowImpl() >= deadline) {
        break
      }

      await sleepImpl(retryDelayMs)
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `SQL Server did not become ready in time: ${lastError.message}`
      : 'SQL Server did not become ready in time.',
  )
}

export function buildReadonlyBrowseConfig(env = process.env) {
  const connectionString = getSqlServerDatabaseUrl(env, { readonly: true })
  const parsed = parseSqlServerConnectionString(connectionString, env)
  const passwordEnvVar =
    env.DATABASE_READONLY_PASSWORD_ENV?.trim() || 'DB_READONLY_PASSWORD'

  return {
    database: parsed.database,
    driver: 'MSSQL',
    name:
      env.SQLSERVER_BROWSE_CONNECTION_NAME?.trim() ||
      DEFAULT_BROWSE_CONNECTION_NAME,
    password: `\${env:${passwordEnvVar}}`,
    port: parsed.port,
    previewLimit: 100,
    server: parsed.server,
    username: parsed.username,
    options: {
      encrypt: parsed.encrypt,
      trustServerCertificate: parsed.trustServerCertificate,
    },
  }
}

export function formatReadonlyBrowseConfig(config) {
  return JSON.stringify(config, null, 2)
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const env = dependencies.env ?? process.env

  loadEnvironmentFiles(env)

  const [command] = args
  if (!command) {
    consoleObj.error(USAGE)
    return 1
  }

  if (command === 'browse-config') {
    const config = buildReadonlyBrowseConfig(env)
    consoleObj.log(
      'Read-only SQLTools connection (password intentionally references an env var):',
    )
    consoleObj.log(formatReadonlyBrowseConfig(config))
    return 0
  }

  if (
    !['health', 'wait', 'reset', 'migrate', 'seed', 'setup'].includes(command)
  ) {
    consoleObj.error(USAGE)
    return 1
  }

  let connectionString

  try {
    connectionString = getSqlServerDatabaseUrl(env, { readonly: false })
  } catch (error) {
    consoleObj.error(
      error instanceof Error
        ? error.message
        : 'Failed to resolve the SQL Server connection string.',
    )
    return 1
  }

  if (command === 'health') {
    try {
      const result = await healthCheckSqlServer(connectionString, dependencies)
      consoleObj.log(
        `SQL Server is healthy (${result.server}/${result.database}).`,
      )
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server health check failed.',
      )
      return 1
    }
  }

  if (command === 'wait') {
    const masterConnectionString = createMasterConnectionString(connectionString)

    try {
      const result = await waitForSqlServer(
        masterConnectionString,
        dependencies,
      )
      consoleObj.log(`SQL Server is ready (${result.server}/${result.database}).`)
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server wait failed.',
      )
      return 1
    }
  }

  if (command === 'reset') {
    try {
      const result = await resetSqlServerDatabase(connectionString, dependencies)
      consoleObj.log(
        `SQL Server database reset (${result.server}/${result.database}).`,
      )
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server reset failed.',
      )
      return 1
    }
  }

  if (command === 'migrate') {
    try {
      const result = await runSqlServerMigrations(connectionString, dependencies)
      consoleObj.log(
        `SQL Server migrations applied to ${result.database} (${result.migrationsApplied} migration${result.migrationsApplied === 1 ? '' : 's'}).`,
      )
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server migrate failed.',
      )
      return 1
    }
  }

  if (command === 'seed') {
    try {
      const result = await seedSqlServerDatabase(connectionString, dependencies)
      consoleObj.log(
        `SQL Server seed completed (${result.insertedRows} inserted row${result.insertedRows === 1 ? '' : 's'}).`,
      )
      if (result.readonlyAccessConfigured) {
        consoleObj.log('Configured read-only database access for browse tooling.')
      }
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server seed failed.',
      )
      return 1
    }
  }

  if (command === 'setup') {
    const masterConnectionString = createMasterConnectionString(connectionString)

    try {
      consoleObj.log('Step 1/4: waiting for SQL Server to accept connections...')
      await waitForSqlServer(masterConnectionString, dependencies)
      consoleObj.log('Step 2/4: resetting SQL Server database...')
      await resetSqlServerDatabase(connectionString, dependencies)
      consoleObj.log('Step 3/4: applying SQL Server migrations...')
      await runSqlServerMigrations(connectionString, dependencies)
      consoleObj.log(
        'Step 4/4: seeding SQL Server data and configuring read-only access...',
      )
      const result = await seedSqlServerDatabase(connectionString, dependencies)
      consoleObj.log(
        `SQL Server setup completed (${result.insertedRows} inserted row${result.insertedRows === 1 ? '' : 's'}).`,
      )
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server setup failed.',
      )
      return 1
    }
  }
}

const isMainEntry =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  const exitCode = await main(process.argv.slice(2))
  process.exit(exitCode)
}
