import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DataSource, MigrationExecutor } from 'typeorm'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = resolve(SCRIPT_DIR, '../typeorm/migrations')
export const REQUIRED_SEED_FILE = resolve(
  SCRIPT_DIR,
  '../typeorm/seed-required.mjs',
)
export const DEMO_SEED_FILE = resolve(SCRIPT_DIR, '../typeorm/seed.mjs')
export const DEMO_RESET_TABLES = Object.freeze([
  'rfi_question_suggestions',
  'specification_rfi_question_items',
  'specification_rfi_lists',
  'rfi_question_version_requirements',
  'rfi_question_version_requirement_packages',
  'rfi_question_version_requirement_selection_questions',
  'rfi_question_versions',
  'rfi_questions',
  'rfi_question_sequences',
  'requirement_version_requirement_packages',
  'specification_requirement_selection_answers',
  'requirement_selection_answer_requirements',
  'requirement_selection_answer_packages',
  'requirement_selection_question_visibility_conditions',
  'requirement_selection_question_visibility_groups',
  'requirement_selection_answers',
  'requirement_selection_questions',
  'requirement_selection_question_sequences',
  'requirement_package_co_authors',
  'requirement_packages',
  'requirement_version_norm_references',
  'deviations',
  'requirements_specification_items',
  'improvement_suggestions',
  'requirement_versions',
  'specification_local_requirement_norm_references',
  'specification_local_requirement_deviations',
  'specification_local_requirements',
  'requirements',
  'specification_needs_references',
  'action_audit_events',
  'access_review_items',
  'access_review_runs',
  'specification_co_authors',
  'requirements_specifications',
  'hsa_id_prefixes',
  'requirement_area_co_authors',
  'requirement_areas',
  'requirement_responsibility_people',
  'archiving_retention_exceptions',
  'archiving_retention_runs',
  'norm_references',
])

/**
 * Discover migration filenames in `typeorm/migrations/` with deterministic
 * filename ordering. TypeORM still orders execution by the timestamp suffix in
 * the migration class/name.
 */
export function listMigrationFilenames(directory = MIGRATIONS_DIR) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.mjs'))
    .sort()
}

/**
 * Dynamically import every migration module in `typeorm/migrations/` and
 * return descriptors for the exported migration classes.
 */
export async function loadMigrationDescriptors(directory = MIGRATIONS_DIR) {
  const filenames = listMigrationFilenames(directory)
  const descriptors = []
  const seen = new Set()
  for (const [fileIndex, filename] of filenames.entries()) {
    const moduleUrl = pathToFileURL(resolve(directory, filename)).href
    const module = await import(moduleUrl)
    for (const exported of Object.values(module)) {
      if (typeof exported === 'function' && !seen.has(exported)) {
        seen.add(exported)
        descriptors.push(
          createMigrationDescriptor(exported, filename, fileIndex),
        )
      }
    }
  }
  return descriptors
}

/**
 * Dynamically import every migration module in `typeorm/migrations/` and
 * return the exported migration classes (anything exported as a function).
 */
export async function loadMigrationClasses(directory = MIGRATIONS_DIR) {
  return (await loadMigrationDescriptors(directory)).map(
    descriptor => descriptor.classRef,
  )
}

let cachedMigrationDescriptorsPromise

async function getMigrationDescriptors() {
  if (!cachedMigrationDescriptorsPromise) {
    cachedMigrationDescriptorsPromise = loadMigrationDescriptors()
  }
  return cachedMigrationDescriptorsPromise
}

async function getMigrationClasses() {
  return (await getMigrationDescriptors()).map(
    descriptor => descriptor.classRef,
  )
}

export async function loadSeedProfile(profile, options = {}) {
  if (profile === 'required') {
    const seedFile = options.requiredSeedPath ?? REQUIRED_SEED_FILE
    if (!existsSync(seedFile)) {
      throw new Error(
        `Required seed file is missing: ${seedFile}. Provide a valid --requiredSeedPath or create the default required seed file at ${REQUIRED_SEED_FILE}.`,
      )
    }
    const module = await import(pathToFileURL(seedFile).href)
    return module.seedRequiredDatabase
  }

  if (profile === 'demo') {
    const seedFile = options.demoSeedPath ?? DEMO_SEED_FILE
    if (!existsSync(seedFile)) {
      throw new Error(
        'seed:demo requires demo seed files mounted into /workspace/typeorm. The production db-job image contains only required seed data. Use seed:required for production.',
      )
    }
    const module = await import(pathToFileURL(seedFile).href)
    return module.seedDemoDatabase
  }

  throw new Error(`Unsupported SQL Server seed profile: ${profile}`)
}

export const DEFAULT_BROWSE_CONNECTION_NAME =
  'Kravhantering SQL Server (read-only)'
export const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000
export const DEFAULT_PORT = 1433
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const DEFAULT_WAIT_RETRY_MS = 1_000
export const DEFAULT_WAIT_TIMEOUT_MS = 30_000
const DB_ADMIN_IMAGE_ENV = 'KRAVHANTERING_DB_ADMIN_IMAGE'
const DB_JOB_IMAGE_KIND = 'db-job'
const CORE_COMMANDS = Object.freeze([
  'health',
  'wait',
  'reset',
  'bootstrap',
  'migration-status',
  'migrate',
  'seed:required',
])
const DEMO_DATA_COMMANDS = Object.freeze(['seed:demo', 'demo:clear', 'setup'])
const AUXILIARY_COMMANDS = Object.freeze(['browse-config'])
const CONFIRM_CLEAR_NON_REQUIRED_DATA_FLAG = '--confirm-clear-non-required-data'

function isProductionDbJobImage(env) {
  return env[DB_ADMIN_IMAGE_ENV] === DB_JOB_IMAGE_KIND
}

function commandUsage(env) {
  const commands = [
    ...CORE_COMMANDS,
    ...(isProductionDbJobImage(env) ? [] : DEMO_DATA_COMMANDS),
    ...AUXILIARY_COMMANDS,
  ]
  return `Usage: node scripts/db-sqlserver-admin.mjs <${commands.join('|')}>`
}

function isSupportedCommand(command, env) {
  return [
    ...CORE_COMMANDS,
    ...(isProductionDbJobImage(env) ? [] : DEMO_DATA_COMMANDS),
    ...AUXILIARY_COMMANDS,
  ].includes(command)
}

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
  const candidates = readonly ? [env.DATABASE_READONLY_URL] : [env.DATABASE_URL]

  return (
    candidates
      .map(value => value?.trim())
      .find(value => value && isSqlServerUrl(value)) ?? null
  )
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
    : (env.DB_PASSWORD ?? env.MSSQL_SA_PASSWORD)

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
  url.searchParams.set('trustServerCertificate', String(trustServerCertificate))

  return url.toString()
}

export function getSqlServerDatabaseUrl(env = process.env, options = {}) {
  const readonly = options.readonly ?? false
  const resolved =
    getExplicitSqlServerDatabaseUrl(env, options) ??
    buildSqlServerDatabaseUrlFromParts(env, options)

  if (!resolved) {
    const variableName = readonly
      ? 'DATABASE_READONLY_URL, or DB_HOST/DB_PORT/DB_NAME/DB_READONLY_USER/DB_READONLY_PASSWORD'
      : 'DATABASE_URL, or DB_HOST/DB_PORT/DB_NAME with DB_USER/DB_PASSWORD (or MSSQL_SA_PASSWORD for the default sa login)'

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

function createMasterConnectionString(connectionString) {
  const url = new URL(connectionString)
  url.pathname = '/master'
  return url.toString()
}

function buildMigrationDataSourceOptions(
  connectionString,
  migrationClasses,
  env = process.env,
) {
  const parsed = parseSqlServerConnectionString(connectionString, env)

  return {
    connectionTimeout: parsed.connectionTimeout,
    logging: false,
    migrations: migrationClasses,
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

function createMigrationDescriptor(MigrationClass, fileName, fileIndex) {
  let instance
  try {
    instance = new MigrationClass()
  } catch {
    instance = null
  }
  const name = instance?.name ?? MigrationClass.name
  const timestamp = Number.parseInt(name.match(/(\d{13})$/u)?.[1] ?? '', 10)

  if (!name) {
    throw new Error(`Unable to determine migration name for ${fileName}`)
  }

  return {
    classRef: MigrationClass,
    fileName,
    name,
    sequence: fileIndex + 1,
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
  }
}

function migrationHeadFromDescriptor(descriptor) {
  if (!descriptor) return null
  return {
    fileName: descriptor.fileName,
    name: descriptor.name,
    sequence: descriptor.sequence,
    timestamp: descriptor.timestamp,
  }
}

function compareMigrationHeadsByExecutionOrder(left, right) {
  const leftTimestamp = typeof left.timestamp === 'number' ? left.timestamp : -1
  const rightTimestamp =
    typeof right.timestamp === 'number' ? right.timestamp : -1
  if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp

  const leftSequence = typeof left.sequence === 'number' ? left.sequence : -1
  const rightSequence = typeof right.sequence === 'number' ? right.sequence : -1
  if (leftSequence !== rightSequence) return leftSequence - rightSequence

  return String(left.name ?? '').localeCompare(String(right.name ?? ''))
}

function migrationHeadFromExecutedMigration(migration, descriptorsByName) {
  if (!migration) return null
  const descriptor = descriptorsByName.get(migration.name)
  return {
    ...(descriptor ? migrationHeadFromDescriptor(descriptor) : {}),
    id: typeof migration.id === 'number' ? migration.id : null,
    name: migration.name,
    timestamp:
      typeof migration.timestamp === 'number'
        ? migration.timestamp
        : (descriptor?.timestamp ?? null),
  }
}

function normalizeExecutedMigrations(migrations = []) {
  return [...migrations].sort((left, right) => {
    const leftId = typeof left.id === 'number' ? left.id : -1
    const rightId = typeof right.id === 'number' ? right.id : -1
    if (leftId !== rightId) return rightId - leftId
    const leftTimestamp =
      typeof left.timestamp === 'number' ? left.timestamp : -1
    const rightTimestamp =
      typeof right.timestamp === 'number' ? right.timestamp : -1
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
    return String(right.name ?? '').localeCompare(String(left.name ?? ''))
  })
}

function normalizePendingMigrations(migrations = [], descriptorsByName) {
  return migrations.map(migration => {
    const descriptor = descriptorsByName.get(migration.name)
    return {
      ...(descriptor ? migrationHeadFromDescriptor(descriptor) : {}),
      name: migration.name,
      timestamp:
        typeof migration.timestamp === 'number'
          ? migration.timestamp
          : (descriptor?.timestamp ?? null),
    }
  })
}

function buildMigrationStateReport({
  database,
  executedMigrations,
  migrationDescriptors,
  pendingMigrations,
}) {
  const descriptorsByName = new Map(
    migrationDescriptors.map(descriptor => [descriptor.name, descriptor]),
  )
  const bundledMigrations = migrationDescriptors
    .map(migrationHeadFromDescriptor)
    .sort(compareMigrationHeadsByExecutionOrder)
  const expectedHead = bundledMigrations.at(-1) ?? null
  const executed = normalizeExecutedMigrations(executedMigrations)
  const observedHead = migrationHeadFromExecutedMigration(
    executed[0],
    descriptorsByName,
  )
  const unknownMigrations = executed
    .filter(migration => !descriptorsByName.has(migration.name))
    .map(migration =>
      migrationHeadFromExecutedMigration(migration, descriptorsByName),
    )
  const problems = []

  if (!expectedHead) {
    problems.push({
      code: 'target_schema_version_missing',
      message: 'The db-job image does not contain any TypeORM migrations.',
    })
  }

  if (unknownMigrations.length > 0) {
    problems.push({
      code: 'database_schema_version_unknown',
      message:
        'The database contains migration names that are not bundled with this db-job image.',
      migrations: unknownMigrations.map(migration => migration.name),
    })
  }

  return {
    compatible: problems.length === 0,
    database,
    expectedHead,
    observedHead,
    pendingMigrations: normalizePendingMigrations(
      pendingMigrations,
      descriptorsByName,
    ),
    bundledMigrationCount: bundledMigrations.length,
    executedMigrationCount: executed.length,
    unknownMigrations,
    problems,
  }
}

function assertMigrationStateCompatible(report) {
  if (report.compatible) return
  const codes = report.problems.map(problem => problem.code).join(', ')
  throw new Error(
    `SQL Server migration preflight failed for ${report.database}: ${codes}.`,
  )
}

function assertPostMigrationHeadMatchesTarget(report) {
  if (report.observedHead?.name === report.expectedHead?.name) return
  throw new Error(
    `SQL Server migration post-check failed for ${report.database}: expected ${report.expectedHead?.name ?? 'none'}, observed ${report.observedHead?.name ?? 'none'}.`,
  )
}

async function inspectMigrationState(
  dataSource,
  connectionString,
  options = {},
) {
  const MigrationExecutorCtor =
    options.migrationExecutorCtor ?? MigrationExecutor
  const env = options.env ?? process.env
  const migrationDescriptors =
    options.migrationDescriptors ?? (await getMigrationDescriptors())
  const executor = new MigrationExecutorCtor(dataSource)
  const executedMigrations = await executor.getExecutedMigrations()
  const pendingMigrations = await executor.getPendingMigrations()

  return buildMigrationStateReport({
    database: parseSqlServerConnectionString(connectionString, env).database,
    executedMigrations,
    migrationDescriptors,
    pendingMigrations,
  })
}

export async function getSqlServerMigrationStatus(
  connectionString,
  options = {},
) {
  const DataSourceCtor = options.dataSourceCtor ?? DataSource
  const env = options.env ?? process.env
  const migrationDescriptors =
    options.migrationDescriptors ?? (await getMigrationDescriptors())
  const migrationClasses = migrationDescriptors.map(
    descriptor => descriptor.classRef,
  )
  const dataSource = new DataSourceCtor(
    buildMigrationDataSourceOptions(connectionString, migrationClasses, env),
  )

  await dataSource.initialize()

  try {
    return await inspectMigrationState(dataSource, connectionString, {
      ...options,
      migrationDescriptors,
    })
  } finally {
    if (typeof dataSource.destroy === 'function') {
      await dataSource.destroy()
    }
  }
}

async function defaultConnect(config) {
  const mssqlModule = await import('mssql')
  const connect =
    mssqlModule.connect ?? mssqlModule.default?.connect ?? mssqlModule.default

  if (typeof connect !== 'function') {
    throw new Error('Unable to load the mssql driver connect() function.')
  }

  return connect(config)
}

async function withPool(
  connectionString,
  connectImpl,
  callback,
  env = process.env,
) {
  const pool = await connectImpl(createMssqlConfig(connectionString, env))

  try {
    return await callback(pool)
  } finally {
    await pool.close()
  }
}

function containsSqlServerLoginName(password, username) {
  const normalizedPassword = String(password ?? '').toLowerCase()
  const normalizedUsername = String(username ?? '')
    .trim()
    .toLowerCase()

  return (
    normalizedUsername.length >= 3 &&
    normalizedPassword.includes(normalizedUsername)
  )
}

export async function resetSqlServerDatabase(connectionString, options = {}) {
  const connectImpl = options.connectImpl ?? defaultConnect
  const env = options.env ?? process.env
  const parsed = parseSqlServerConnectionString(connectionString, env)
  const masterConnectionString = createMasterConnectionString(connectionString)

  return withPool(
    masterConnectionString,
    connectImpl,
    async pool => {
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
    },
    env,
  )
}

function requireSqlServerPasswordPolicySafe(password, username, context) {
  if (containsSqlServerLoginName(password, username)) {
    throw new Error(
      `${context} failed for ${username}: password contains the login name. SQL Server password policy commonly rejects that.`,
    )
  }
}

function bootstrapPrincipalFromEnv(env, options) {
  const username = env[options.userEnv]?.trim() || options.defaultUsername
  const password = env[options.passwordEnv] ?? options.defaultPassword

  if (!username || !password) {
    throw new Error(
      `${options.userEnv} and ${options.passwordEnv} are required for SQL Server bootstrap.`,
    )
  }

  requireSqlServerPasswordPolicySafe(
    password,
    username,
    'SQL Server bootstrap login setup',
  )

  return {
    password,
    roles: options.roles,
    username,
  }
}

export function createBootstrapAdminConnectionString(
  connectionString,
  env = process.env,
  options = {},
) {
  const adminUsername = env.DB_BOOTSTRAP_ADMIN_USER?.trim() || 'sa'
  const adminPassword = env.DB_BOOTSTRAP_ADMIN_PASSWORD ?? env.MSSQL_SA_PASSWORD

  if (!adminUsername || !adminPassword) {
    throw new Error(
      'DB_BOOTSTRAP_ADMIN_USER and DB_BOOTSTRAP_ADMIN_PASSWORD (or MSSQL_SA_PASSWORD) are required for SQL Server bootstrap.',
    )
  }

  const url = new URL(connectionString)
  url.username = adminUsername
  url.password = adminPassword
  url.pathname = `/${encodeURIComponent(options.database ?? 'master')}`
  return url.toString()
}

function buildBootstrapLoginSql(principals) {
  return principals
    .map(principal => {
      const escapedLoginName = quoteSqlServerIdentifier(principal.username)
      const escapedLoginNameLiteral = `N'${escapeSqlServerStringLiteral(principal.username)}'`
      const escapedPassword = `'${escapeSqlServerStringLiteral(principal.password)}'`
      return `
      IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = ${escapedLoginNameLiteral})
      BEGIN
        ALTER LOGIN ${escapedLoginName} WITH PASSWORD = ${escapedPassword}
      END
      ELSE
      BEGIN
        CREATE LOGIN ${escapedLoginName} WITH PASSWORD = ${escapedPassword}
      END`
    })
    .join('\n')
}

function buildBootstrapUserSql(principals) {
  return principals
    .map(principal => {
      const escapedUserName = quoteSqlServerIdentifier(principal.username)
      const escapedUserNameLiteral = `N'${escapeSqlServerStringLiteral(principal.username)}'`
      const roleSql = principal.roles
        .map(role => {
          const escapedRole = quoteSqlServerIdentifier(role)
          const escapedRoleLiteral = `N'${escapeSqlServerStringLiteral(role)}'`
          return `
      IF NOT EXISTS (
        SELECT 1
        FROM sys.database_role_members AS members
        INNER JOIN sys.database_principals AS roles
          ON members.role_principal_id = roles.principal_id
        INNER JOIN sys.database_principals AS principals
          ON members.member_principal_id = principals.principal_id
        WHERE roles.name = ${escapedRoleLiteral}
          AND principals.name = ${escapedUserNameLiteral}
      )
      BEGIN
        ALTER ROLE ${escapedRole} ADD MEMBER ${escapedUserName}
      END`
        })
        .join('\n')

      return `
      IF DATABASE_PRINCIPAL_ID(${escapedUserNameLiteral}) IS NULL
      BEGIN
        CREATE USER ${escapedUserName} FOR LOGIN ${escapedUserName}
      END
${roleSql}`
    })
    .join('\n')
}

export async function bootstrapSqlServerDatabase(
  connectionString,
  options = {},
) {
  const connectImpl = options.connectImpl ?? defaultConnect
  const env = options.env ?? process.env
  const parsed = parseSqlServerConnectionString(connectionString, env)
  const adminConnectionString = createBootstrapAdminConnectionString(
    connectionString,
    env,
  )
  const adminDatabaseConnectionString = createBootstrapAdminConnectionString(
    connectionString,
    env,
    { database: parsed.database },
  )
  const principals = [
    bootstrapPrincipalFromEnv(env, {
      defaultPassword: parsed.password,
      defaultUsername: parsed.username,
      passwordEnv: 'DB_PASSWORD',
      roles: ['db_owner'],
      userEnv: 'DB_USER',
    }),
    bootstrapPrincipalFromEnv(env, {
      defaultPassword: env.DB_BOOTSTRAP_APP_PASSWORD,
      defaultUsername: env.DB_BOOTSTRAP_APP_USER,
      passwordEnv: 'DB_BOOTSTRAP_APP_PASSWORD',
      roles: ['db_datareader', 'db_datawriter'],
      userEnv: 'DB_BOOTSTRAP_APP_USER',
    }),
  ]

  await withPool(
    adminConnectionString,
    connectImpl,
    async pool => {
      const request = pool.request()
      request.input('databaseName', parsed.database)

      await request.query(`
      IF DB_ID(@databaseName) IS NULL
      BEGIN
        DECLARE @createSql nvarchar(max) =
          N'CREATE DATABASE ' + QUOTENAME(@databaseName) + N';'
        EXEC sp_executesql @createSql
      END

${buildBootstrapLoginSql(principals)}
    `)
    },
    env,
  )

  await withPool(
    adminDatabaseConnectionString,
    connectImpl,
    async pool => {
      await pool.request().query(buildBootstrapUserSql(principals))
    },
    env,
  )

  return {
    appUser: principals[1].username,
    database: parsed.database,
    jobUser: principals[0].username,
    server: parsed.server,
  }
}

export async function runSqlServerMigrations(connectionString, options = {}) {
  const DataSourceCtor = options.dataSourceCtor ?? DataSource
  const env = options.env ?? process.env
  const migrationDescriptors =
    options.migrationDescriptors ?? (await getMigrationDescriptors())
  const migrationClasses = migrationDescriptors.map(
    descriptor => descriptor.classRef,
  )
  const dataSource = new DataSourceCtor(
    buildMigrationDataSourceOptions(connectionString, migrationClasses, env),
  )

  await dataSource.initialize()

  try {
    const preflight = await inspectMigrationState(
      dataSource,
      connectionString,
      {
        ...options,
        migrationDescriptors,
      },
    )
    assertMigrationStateCompatible(preflight)

    const migrations = await dataSource.runMigrations()
    const postMigration = await inspectMigrationState(
      dataSource,
      connectionString,
      {
        ...options,
        migrationDescriptors,
      },
    )
    assertMigrationStateCompatible(postMigration)
    assertPostMigrationHeadMatchesTarget(postMigration)

    return {
      database: parseSqlServerConnectionString(connectionString, env).database,
      migration: {
        applied: migrations.map(migration => ({
          name: migration.name,
          timestamp:
            typeof migration.timestamp === 'number'
              ? migration.timestamp
              : null,
        })),
      },
      migrationsApplied: migrations.length,
      postMigration,
      preflight,
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
  let masterConnectionString
  let databaseConnectionString

  try {
    masterConnectionString = createBootstrapAdminConnectionString(
      connectionString,
      env,
    )
    databaseConnectionString = createBootstrapAdminConnectionString(
      connectionString,
      env,
      { database: main.database },
    )
  } catch {
    masterConnectionString = createMasterConnectionString(connectionString)
    databaseConnectionString = connectionString
  }

  try {
    await withPool(
      masterConnectionString,
      connectImpl,
      async pool => {
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
      },
      env,
    )
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Read-only SQL Server login setup failed for ${readonly.username}: ${details}`,
    )
  }

  try {
    await withPool(
      databaseConnectionString,
      connectImpl,
      async pool => {
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
      },
      env,
    )
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
  const DataSourceCtor = options.dataSourceCtor ?? DataSource
  const env = options.env ?? process.env
  const profile = options.profile ?? 'required'
  const injectedSeedProfile =
    profile === 'required'
      ? (options.seedRequiredDatabaseImpl ?? options.seedDatabaseImpl)
      : profile === 'demo'
        ? (options.seedDemoDatabaseImpl ?? options.seedDatabaseImpl)
        : null
  if (profile !== 'required' && profile !== 'demo') {
    throw new Error(`Unsupported SQL Server seed profile: ${profile}`)
  }
  const seedProfile =
    injectedSeedProfile ??
    (await (options.loadSeedProfileImpl ?? loadSeedProfile)(profile))
  const migrationClasses = await getMigrationClasses()
  const dataSource = new DataSourceCtor(
    buildMigrationDataSourceOptions(connectionString, migrationClasses, env),
  )

  await dataSource.initialize()
  let insertedRows = 0
  let resetTables = 0

  try {
    if (profile === 'demo') {
      const result = await resetDemoSqlServerData(dataSource, options)
      resetTables = result.tablesCleared
    }
    insertedRows = await seedProfile(dataSource)
  } finally {
    if (typeof dataSource.destroy === 'function') {
      await dataSource.destroy()
    }
  }

  const readonlyAccess =
    options.configureReadonlyAccess === false
      ? { configured: false }
      : await ensureReadonlySqlServerAccess(connectionString, options)

  return {
    demoResetTables: resetTables,
    insertedRows,
    profile,
    readonlyAccessConfigured: readonlyAccess.configured,
  }
}

export async function clearDemoSqlServerData(connectionString, options = {}) {
  const DataSourceCtor = options.dataSourceCtor ?? DataSource
  const env = options.env ?? process.env
  const migrationClasses = await getMigrationClasses()
  const dataSource = new DataSourceCtor(
    buildMigrationDataSourceOptions(connectionString, migrationClasses, env),
  )
  let initialized = false

  try {
    await dataSource.initialize()
    initialized = true
    return await resetDemoSqlServerData(dataSource, options)
  } finally {
    if (initialized && typeof dataSource.destroy === 'function') {
      await dataSource.destroy()
    }
  }
}

function assertSafeTableName(table) {
  if (!/^[a-z][a-z0-9_]*$/u.test(table)) {
    throw new Error(`Unsafe SQL Server table name for demo reset: ${table}`)
  }
}

async function reseedIdentityIfPresent(query, table) {
  assertSafeTableName(table)
  await query(
    `IF EXISTS (
       SELECT 1 FROM sys.identity_columns ic
       JOIN sys.tables t ON t.object_id = ic.object_id
       WHERE t.name = '${table}'
     )
     AND (SELECT last_value FROM sys.identity_columns ic
       JOIN sys.tables t ON t.object_id = ic.object_id
       WHERE t.name = '${table}') IS NOT NULL
       DBCC CHECKIDENT ('${table}', RESEED, 0) WITH NO_INFOMSGS`,
  )
}

export async function resetDemoSqlServerData(executor, options = {}) {
  const tables = options.demoResetTables ?? DEMO_RESET_TABLES
  const runner =
    typeof executor?.createQueryRunner === 'function'
      ? executor.createQueryRunner()
      : null
  const target = runner ?? executor
  const query = target?.query
    ? (sql, params) =>
        params === undefined ? target.query(sql) : target.query(sql, params)
    : null
  if (!query) {
    throw new Error(
      'resetDemoSqlServerData requires a DataSource, QueryRunner, or EntityManager with a .query method',
    )
  }

  let startedTransaction = false
  if (runner) {
    await runner.connect()
    if (typeof runner.startTransaction === 'function') {
      await runner.startTransaction()
      startedTransaction = true
    }
  }

  try {
    for (const table of tables) {
      assertSafeTableName(table)
      await query(`DELETE FROM [${table}]`)
      await reseedIdentityIfPresent(query, table)
    }
    if (startedTransaction && runner) {
      await runner.commitTransaction()
      startedTransaction = false
    }
  } catch (error) {
    if (startedTransaction && runner) {
      try {
        await runner.rollbackTransaction()
      } finally {
        startedTransaction = false
      }
    }
    throw error
  } finally {
    if (runner) {
      await runner.release()
    }
  }

  return {
    tablesCleared: tables.length,
  }
}

export async function healthCheckSqlServer(connectionString, options = {}) {
  const connectImpl = options.connectImpl ?? defaultConnect
  const env = options.env ?? process.env

  return withPool(
    connectionString,
    connectImpl,
    async pool => {
      const result = await pool.request().query('SELECT 1 AS ok')

      return {
        database: createMssqlConfig(connectionString, env).database,
        ok: Array.isArray(result.recordset) && result.recordset.length > 0,
        server: createMssqlConfig(connectionString, env).server,
      }
    },
    env,
  )
}

export async function waitForSqlServer(connectionString, options = {}) {
  const healthCheckImpl = options.healthCheckImpl ?? healthCheckSqlServer
  const nowImpl = options.nowImpl ?? Date.now
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_WAIT_RETRY_MS
  const sleepImpl =
    options.sleepImpl ??
    (delayMs =>
      new Promise(resolvePromise => setTimeout(resolvePromise, delayMs)))
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
  const jsonOutput = args.includes('--json')
  if (!command) {
    consoleObj.error(commandUsage(env))
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

  if (!isSupportedCommand(command, env)) {
    if (isProductionDbJobImage(env) && DEMO_DATA_COMMANDS.includes(command)) {
      consoleObj.error(
        `${command} is only available from local source workflows or the kravhantering-demo-seed image. Use bootstrap, migration-status, migrate and seed:required in the production db-job image.`,
      )
      return 1
    }
    consoleObj.error(commandUsage(env))
    return 1
  }

  if (
    command === 'demo:clear' &&
    !args.includes(CONFIRM_CLEAR_NON_REQUIRED_DATA_FLAG)
  ) {
    consoleObj.error(
      `demo:clear requires ${CONFIRM_CLEAR_NON_REQUIRED_DATA_FLAG}. This clears non-required SQL Server data.`,
    )
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
        error instanceof Error
          ? error.message
          : 'SQL Server health check failed.',
      )
      return 1
    }
  }

  if (command === 'wait') {
    const masterConnectionString =
      createMasterConnectionString(connectionString)

    try {
      const result = await waitForSqlServer(
        masterConnectionString,
        dependencies,
      )
      consoleObj.log(
        `SQL Server is ready (${result.server}/${result.database}).`,
      )
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
      const result = await resetSqlServerDatabase(
        connectionString,
        dependencies,
      )
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

  if (command === 'bootstrap') {
    try {
      const result = await bootstrapSqlServerDatabase(
        connectionString,
        dependencies,
      )
      consoleObj.log(
        `SQL Server database bootstrap completed (${result.server}/${result.database}; job user ${result.jobUser}; app user ${result.appUser}).`,
      )
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server bootstrap failed.',
      )
      return 1
    }
  }

  if (command === 'migration-status') {
    try {
      const result = await getSqlServerMigrationStatus(
        connectionString,
        dependencies,
      )
      consoleObj.log(JSON.stringify(result, null, 2))
      return result.compatible ? 0 : 1
    } catch (error) {
      consoleObj.error(
        error instanceof Error
          ? error.message
          : 'SQL Server migration status failed.',
      )
      return 1
    }
  }

  if (command === 'migrate') {
    try {
      const result = await runSqlServerMigrations(
        connectionString,
        dependencies,
      )
      if (jsonOutput) {
        consoleObj.log(JSON.stringify(result, null, 2))
      } else {
        consoleObj.log(
          `SQL Server migrations applied to ${result.database} (${result.migrationsApplied} migration${result.migrationsApplied === 1 ? '' : 's'}).`,
        )
      }
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error ? error.message : 'SQL Server migrate failed.',
      )
      return 1
    }
  }

  if (command === 'seed:required' || command === 'seed:demo') {
    const profile = command === 'seed:required' ? 'required' : 'demo'
    try {
      const result = await seedSqlServerDatabase(connectionString, {
        ...dependencies,
        profile,
      })
      consoleObj.log(
        `SQL Server ${profile} seed completed (${result.insertedRows} inserted row${result.insertedRows === 1 ? '' : 's'}).`,
      )
      if (profile === 'demo') {
        consoleObj.log(
          `SQL Server demo seed reset ${result.demoResetTables} non-required table${result.demoResetTables === 1 ? '' : 's'} before seeding.`,
        )
      }
      if (result.readonlyAccessConfigured) {
        consoleObj.log(
          'Configured read-only database access for browse tooling.',
        )
      }
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error
          ? error.message
          : `SQL Server ${profile} seed failed.`,
      )
      return 1
    }
  }

  if (command === 'demo:clear') {
    try {
      const result = await clearDemoSqlServerData(
        connectionString,
        dependencies,
      )
      consoleObj.log(
        `SQL Server demo data cleared (${result.tablesCleared} non-required table${result.tablesCleared === 1 ? '' : 's'}).`,
      )
      return 0
    } catch (error) {
      consoleObj.error(
        error instanceof Error
          ? error.message
          : 'SQL Server demo clear failed.',
      )
      return 1
    }
  }

  if (command === 'setup') {
    const masterConnectionString =
      createMasterConnectionString(connectionString)

    try {
      consoleObj.log(
        'Step 1/6: waiting for SQL Server to accept connections...',
      )
      await waitForSqlServer(masterConnectionString, dependencies)
      consoleObj.log('Step 2/6: resetting SQL Server database...')
      await resetSqlServerDatabase(connectionString, dependencies)
      consoleObj.log('Step 3/6: applying SQL Server migrations...')
      await runSqlServerMigrations(connectionString, dependencies)
      consoleObj.log('Step 4/6: seeding required SQL Server data...')
      const requiredResult = await seedSqlServerDatabase(connectionString, {
        ...dependencies,
        configureReadonlyAccess: false,
        profile: 'required',
      })
      consoleObj.log('Step 5/6: seeding demo SQL Server data...')
      const demoResult = await seedSqlServerDatabase(connectionString, {
        ...dependencies,
        configureReadonlyAccess: false,
        profile: 'demo',
      })
      consoleObj.log('Step 6/6: configuring read-only database access...')
      const readonlyAccess = await ensureReadonlySqlServerAccess(
        connectionString,
        dependencies,
      )
      consoleObj.log(
        `SQL Server setup completed (${requiredResult.insertedRows} required seed row${requiredResult.insertedRows === 1 ? '' : 's'}, ${demoResult.insertedRows} demo seed row${demoResult.insertedRows === 1 ? '' : 's'}).`,
      )
      if (readonlyAccess.configured) {
        consoleObj.log(
          'Configured read-only database access for browse tooling.',
        )
      }
      return 0
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SQL Server setup failed.'
      consoleObj.error(message)
      if (error instanceof Error && error.stack) {
        consoleObj.error(error.stack)
      }
      if (error && typeof error === 'object') {
        const extras = {}
        for (const key of [
          'code',
          'number',
          'state',
          'class',
          'serverName',
          'procName',
          'lineNumber',
        ]) {
          if (key in error) extras[key] = error[key]
        }
        if (Object.keys(extras).length > 0) {
          consoleObj.error(
            `SQL Server error details: ${JSON.stringify(extras)}`,
          )
        }
        if ('originalError' in error && error.originalError) {
          consoleObj.error(`Original error: ${String(error.originalError)}`)
        }
      }
      if (process.env.SEED_DEBUG !== '1' && process.env.SEED_DEBUG !== 'true') {
        consoleObj.error(
          'Hint: re-run with `SEED_DEBUG=1 npm run db:setup` for per-table seed progress.',
        )
      }
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
