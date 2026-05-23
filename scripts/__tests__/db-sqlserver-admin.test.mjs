import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bootstrapSqlServerDatabase,
  buildReadonlyBrowseConfig,
  createBootstrapAdminConnectionString,
  createMssqlConfig,
  ensureReadonlySqlServerAccess,
  formatReadonlyBrowseConfig,
  getSqlServerDatabaseUrl,
  healthCheckSqlServer,
  listMigrationFilenames,
  loadMigrationClasses,
  loadSeedProfile,
  MIGRATIONS_DIR,
  main,
  parseSqlServerConnectionString,
  resetSqlServerDatabase,
  runSqlServerMigrations,
  seedSqlServerDatabase,
  stripWrappingQuotes,
  waitForSqlServer,
} from '../db-sqlserver-admin.mjs'

describe('db-sqlserver-admin.mjs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('strips matching wrapping quotes only', () => {
    expect(stripWrappingQuotes('"value"')).toBe('value')
    expect(stripWrappingQuotes("'value'")).toBe('value')
    expect(stripWrappingQuotes('"value')).toBe('"value')
  })

  it('prefers SQLSERVER_DATABASE_URL over a legacy DATABASE_URL', () => {
    expect(
      getSqlServerDatabaseUrl({
        DATABASE_URL: 'postgres://legacy.example.invalid/kravhantering',
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      }),
    ).toBe(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
    )
  })

  it('derives the main SQL Server URL from DB_* parts when no explicit URL is set', () => {
    expect(
      getSqlServerDatabaseUrl({
        DB_ENCRYPT: 'true',
        DB_HOST: 'db',
        DB_NAME: 'kravhantering',
        DB_PORT: '1433',
        DB_TRUST_SERVER_CERTIFICATE: 'true',
        MSSQL_SA_PASSWORD: 'Password123!',
      }),
    ).toBe(
      'mssql://sa:Password123!@db:1433/kravhantering?encrypt=true&trustServerCertificate=true',
    )
  })

  it('derives the readonly SQL Server URL from DB_* parts when no explicit URL is set', () => {
    expect(
      getSqlServerDatabaseUrl(
        {
          DB_ENCRYPT: 'true',
          DB_HOST: 'db',
          DB_NAME: 'kravhantering',
          DB_PORT: '1433',
          DB_READONLY_PASSWORD: 'Readonly123!',
          DB_READONLY_USER: 'readonly',
          DB_TRUST_SERVER_CERTIFICATE: 'true',
        },
        { readonly: true },
      ),
    ).toBe(
      'mssql://readonly:Readonly123!@db:1433/kravhantering?encrypt=true&trustServerCertificate=true',
    )
  })

  it('parses SQL Server connection strings into stable config fields', () => {
    expect(
      parseSqlServerConnectionString(
        'mssql://reader:Secret123!@db.internal:1444/kravhantering?encrypt=false&trustServerCertificate=true&requestTimeout=9000',
      ),
    ).toEqual({
      connectionTimeout: 15000,
      database: 'kravhantering',
      encrypt: false,
      password: 'Secret123!',
      port: 1444,
      requestTimeout: 9000,
      server: 'db.internal',
      trustServerCertificate: true,
      username: 'reader',
    })
  })

  it('falls back to env defaults for encrypt and trustServerCertificate', () => {
    expect(
      parseSqlServerConnectionString(
        'mssql://reader:Secret123!@db.internal:1444/kravhantering',
        {
          DB_ENCRYPT: 'true',
          DB_REQUEST_TIMEOUT_MS: '9000',
          DB_TRUST_SERVER_CERTIFICATE: 'true',
        },
      ),
    ).toEqual({
      connectionTimeout: 15000,
      database: 'kravhantering',
      encrypt: true,
      password: 'Secret123!',
      port: 1444,
      requestTimeout: 9000,
      server: 'db.internal',
      trustServerCertificate: true,
      username: 'reader',
    })
  })

  it('reads encrypt query params case-insensitively', () => {
    expect(
      parseSqlServerConnectionString(
        'mssql://reader:Secret123!@db.internal:1444/kravhantering?Encrypt=false&TrustServerCertificate=true',
      ),
    ).toMatchObject({
      encrypt: false,
      trustServerCertificate: true,
    })
  })

  it('creates mssql driver config with SQL Server defaults', () => {
    expect(
      createMssqlConfig(
        'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      ),
    ).toMatchObject({
      database: 'kravhantering',
      options: {
        enableArithAbort: true,
        encrypt: true,
        trustServerCertificate: true,
      },
      password: 'Password123!',
      port: 1433,
      server: '127.0.0.1',
      user: 'sa',
    })
  })

  it('builds a read-only browse config without exposing the password', () => {
    const passwordToken = '$' + '{env:DATABASE_READONLY_PASSWORD}'
    const config = buildReadonlyBrowseConfig({
      DATABASE_READONLY_PASSWORD_ENV: 'DATABASE_READONLY_PASSWORD',
      SQLSERVER_DATABASE_READONLY_URL:
        'mssql://readonly:Secret123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      SQLSERVER_BROWSE_CONNECTION_NAME: 'Read-only local SQL Server',
    })

    expect(config).toEqual({
      database: 'kravhantering',
      driver: 'MSSQL',
      name: 'Read-only local SQL Server',
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      password: passwordToken,
      port: 1433,
      previewLimit: 100,
      server: '127.0.0.1',
      username: 'readonly',
    })
    expect(formatReadonlyBrowseConfig(config)).toContain(
      `"password": "${passwordToken}"`,
    )
  })

  it('builds a read-only browse config from derived DB_* values', () => {
    const config = buildReadonlyBrowseConfig({
      DB_ENCRYPT: 'true',
      DB_HOST: 'db',
      DB_NAME: 'kravhantering',
      DB_PORT: '1433',
      DB_READONLY_PASSWORD: 'Readonly123!',
      DB_READONLY_USER: 'readonly',
      DB_TRUST_SERVER_CERTIFICATE: 'true',
    })

    expect(config).toEqual({
      database: 'kravhantering',
      driver: 'MSSQL',
      name: 'Kravhantering SQL Server (read-only)',
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code SQLTools placeholder syntax
      password: '${env:DB_READONLY_PASSWORD}',
      port: 1433,
      previewLimit: 100,
      server: 'db',
      username: 'readonly',
    })
  })

  it('runs a SQL Server health check through an injected pool', async () => {
    const query = vi.fn(async () => ({ recordset: [{ ok: 1 }] }))
    const request = vi.fn(() => ({ query }))
    const close = vi.fn(async () => {})
    const connectImpl = vi.fn(async () => ({
      close,
      request,
    }))

    const result = await healthCheckSqlServer(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      { connectImpl },
    )

    expect(query).toHaveBeenCalledWith('SELECT 1 AS ok')
    expect(close).toHaveBeenCalled()
    expect(result).toEqual({
      database: 'kravhantering',
      ok: true,
      server: '127.0.0.1',
    })
  })

  it('retries until SQL Server becomes ready', async () => {
    const healthCheckImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('not ready yet'))
      .mockResolvedValueOnce({
        database: 'kravhantering',
        ok: true,
        server: '127.0.0.1',
      })
    const sleepImpl = vi.fn(async () => {})
    let now = 0

    const result = await waitForSqlServer('mssql://unused', {
      healthCheckImpl,
      nowImpl: () => (now += 100),
      retryDelayMs: 10,
      sleepImpl,
      timeoutMs: 5_000,
    })

    expect(healthCheckImpl).toHaveBeenCalledTimes(2)
    expect(sleepImpl).toHaveBeenCalledWith(10)
    expect(result.ok).toBe(true)
  })

  it('prints browse config output for the CLI command', async () => {
    const error = vi.fn()
    const log = vi.fn()

    const exitCode = await main(['browse-config'], {
      consoleObj: { error, log },
      env: {
        SQLSERVER_DATABASE_READONLY_URL:
          'mssql://readonly:Secret123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      },
    })

    expect(exitCode).toBe(0)
    expect(error).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[1][0]).toContain('"username": "readonly"')
  })

  it('resets the database by connecting to master and issuing drop/create SQL', async () => {
    const query = vi.fn(async () => undefined)
    const request = vi.fn(() => ({
      input: vi.fn().mockReturnThis(),
      query,
    }))
    const close = vi.fn(async () => {})
    const connectImpl = vi.fn(async () => ({
      close,
      request,
    }))

    const result = await resetSqlServerDatabase(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      { connectImpl },
    )

    expect(connectImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        database: 'master',
      }),
    )
    expect(query.mock.calls[0][0]).toContain('DROP DATABASE')
    expect(query.mock.calls[0][0]).toContain('CREATE DATABASE')
    expect(result).toEqual({
      database: 'kravhantering',
      server: '127.0.0.1',
    })
  })

  it('bootstraps the database and runtime principals with the admin login', async () => {
    const queries = []
    const request = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(async sql => {
        queries.push(sql)
      }),
    }
    const connectImpl = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      request: vi.fn(() => request),
    }))
    const env = {
      DB_BOOTSTRAP_ADMIN_PASSWORD: 'AdminPassword1!',
      DB_BOOTSTRAP_ADMIN_USER: 'sa',
      DB_BOOTSTRAP_APP_PASSWORD: 'AppPassword1!',
      DB_BOOTSTRAP_APP_USER: 'kravhantering_app',
      DB_PASSWORD: 'JobPassword1!',
      DB_USER: 'kravhantering_job',
    }

    const result = await bootstrapSqlServerDatabase(
      'mssql://kravhantering_job:JobPassword1!@sqlserver:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      { connectImpl, env },
    )

    expect(
      createBootstrapAdminConnectionString(
        'mssql://kravhantering_job:JobPassword1!@sqlserver:1433/kravhantering?encrypt=true',
        env,
      ),
    ).toBe('mssql://sa:AdminPassword1!@sqlserver:1433/master?encrypt=true')
    expect(connectImpl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        database: 'master',
        password: 'AdminPassword1!',
        user: 'sa',
      }),
    )
    expect(
      createBootstrapAdminConnectionString(
        'mssql://kravhantering_job:JobPassword1!@sqlserver:1433/kravhantering?encrypt=true',
        env,
        { database: 'kravhantering' },
      ),
    ).toBe(
      'mssql://sa:AdminPassword1!@sqlserver:1433/kravhantering?encrypt=true',
    )
    expect(connectImpl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        database: 'kravhantering',
        password: 'AdminPassword1!',
        user: 'sa',
      }),
    )
    expect(queries[0]).toContain('CREATE DATABASE')
    expect(queries[0]).toContain('CREATE LOGIN [kravhantering_job]')
    expect(queries[0]).toContain('CREATE LOGIN [kravhantering_app]')
    expect(queries[1]).toContain('ALTER ROLE [db_owner]')
    expect(queries[1]).toContain('ALTER ROLE [db_datareader]')
    expect(queries[1]).toContain('ALTER ROLE [db_datawriter]')
    expect(result).toEqual({
      appUser: 'kravhantering_app',
      database: 'kravhantering',
      jobUser: 'kravhantering_job',
      server: 'sqlserver',
    })
  })

  it('runs registered TypeORM migrations through an injected DataSource', async () => {
    let dataSourceOptions
    const destroy = vi.fn(async () => undefined)
    const initialize = vi.fn(async () => undefined)
    const runMigrations = vi.fn(async () => [{ name: 'InitialMigration' }])
    class FakeDataSource {
      constructor(options) {
        dataSourceOptions = options
      }
      destroy = destroy
      initialize = initialize
      runMigrations = runMigrations
    }

    const result = await runSqlServerMigrations(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      { dataSourceCtor: FakeDataSource },
    )

    expect(initialize).toHaveBeenCalled()
    const expectedMigrationNames = (await loadMigrationClasses()).map(
      migration => migration.name,
    )
    expect(expectedMigrationNames.length).toBeGreaterThanOrEqual(4)
    expect(
      dataSourceOptions.migrations.map(migration => migration.name),
    ).toEqual(expectedMigrationNames)
    expect(runMigrations).toHaveBeenCalled()
    expect(destroy).toHaveBeenCalled()
    expect(result).toEqual({
      database: 'kravhantering',
      migrationsApplied: 1,
    })
  })

  it('runs the selected SQL Server seed profile through an injected DataSource', async () => {
    let dataSourceOptions
    const destroy = vi.fn(async () => undefined)
    const initialize = vi.fn(async () => undefined)
    const seedDemoDatabaseImpl = vi.fn(async () => 7)
    class FakeDataSource {
      constructor(options) {
        dataSourceOptions = options
      }
      destroy = destroy
      initialize = initialize
    }

    const result = await seedSqlServerDatabase(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      {
        configureReadonlyAccess: false,
        dataSourceCtor: FakeDataSource,
        profile: 'demo',
        seedDemoDatabaseImpl,
      },
    )

    expect(initialize).toHaveBeenCalled()
    expect(dataSourceOptions.type).toBe('mssql')
    expect(seedDemoDatabaseImpl).toHaveBeenCalledWith(
      expect.any(FakeDataSource),
    )
    expect(destroy).toHaveBeenCalled()
    expect(result).toEqual({
      insertedRows: 7,
      profile: 'demo',
      readonlyAccessConfigured: false,
    })
  })

  it('uses bootstrap admin credentials when configuring read-only access', async () => {
    const query = vi.fn(async () => undefined)
    const connectImpl = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      request: vi.fn(() => ({ query })),
    }))

    const result = await ensureReadonlySqlServerAccess(
      'mssql://kravhantering_job:JobPassword1!@sqlserver:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      {
        connectImpl,
        env: {
          DB_BOOTSTRAP_ADMIN_PASSWORD: 'AdminPassword1!',
          DB_BOOTSTRAP_ADMIN_USER: 'sa',
          DB_HOST: 'sqlserver',
          DB_NAME: 'kravhantering',
          DB_PORT: '1433',
          DB_READONLY_PASSWORD: 'BrowseOnly!Passw0rd7',
          DB_READONLY_USER: 'readonly',
        },
      },
    )

    expect(connectImpl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        database: 'master',
        password: 'AdminPassword1!',
        user: 'sa',
      }),
    )
    expect(connectImpl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        database: 'kravhantering',
        password: 'AdminPassword1!',
        user: 'sa',
      }),
    )
    expect(query).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      configured: true,
      username: 'readonly',
    })
  })

  it('loads required and demo seed profiles from separate entrypoints', async () => {
    await expect(loadSeedProfile('required')).resolves.toBeTypeOf('function')
    await expect(loadSeedProfile('demo')).resolves.toBeTypeOf('function')
    await expect(
      loadSeedProfile('demo', { demoSeedPath: '/tmp/missing-seed-demo.mjs' }),
    ).rejects.toThrow(
      'seed:demo is not available in the production db-job image',
    )
    await expect(loadSeedProfile('unknown')).rejects.toThrow(
      'Unsupported SQL Server seed profile: unknown',
    )
  })

  it('uses the dynamic seed loader when no seed implementation is injected', async () => {
    let dataSourceOptions
    const destroy = vi.fn(async () => undefined)
    const initialize = vi.fn(async () => undefined)
    const loadedSeedProfile = vi.fn(async () => 9)
    const loadSeedProfileImpl = vi.fn(async () => loadedSeedProfile)
    class FakeDataSource {
      constructor(options) {
        dataSourceOptions = options
      }
      destroy = destroy
      initialize = initialize
    }

    const result = await seedSqlServerDatabase(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      {
        configureReadonlyAccess: false,
        dataSourceCtor: FakeDataSource,
        loadSeedProfileImpl,
        profile: 'required',
      },
    )

    expect(loadSeedProfileImpl).toHaveBeenCalledWith('required')
    expect(loadedSeedProfile).toHaveBeenCalledWith(expect.any(FakeDataSource))
    expect(dataSourceOptions.type).toBe('mssql')
    expect(result).toEqual({
      insertedRows: 9,
      profile: 'required',
      readonlyAccessConfigured: false,
    })
  })

  it('prints explicit seed profile output for CLI seed commands', async () => {
    const error = vi.fn()
    const log = vi.fn()
    class FakeDataSource {
      destroy = vi.fn(async () => undefined)
      initialize = vi.fn(async () => undefined)
    }

    const requiredExitCode = await main(['seed:required'], {
      consoleObj: { error, log },
      dataSourceCtor: FakeDataSource,
      env: {
        DATABASE_READONLY_URL: '',
        DB_READONLY_PASSWORD: '',
        DB_READONLY_USER: '',
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        SQLSERVER_DATABASE_READONLY_URL: '',
      },
      seedRequiredDatabaseImpl: vi.fn(async () => 3),
    })
    const demoExitCode = await main(['seed:demo'], {
      consoleObj: { error, log },
      dataSourceCtor: FakeDataSource,
      env: {
        DATABASE_READONLY_URL: '',
        DB_READONLY_PASSWORD: '',
        DB_READONLY_USER: '',
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        SQLSERVER_DATABASE_READONLY_URL: '',
      },
      seedDemoDatabaseImpl: vi.fn(async () => 4),
    })

    expect(requiredExitCode).toBe(0)
    expect(demoExitCode).toBe(0)
    expect(error).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      'SQL Server required seed completed (3 inserted rows).',
    )
    expect(log).toHaveBeenCalledWith(
      'SQL Server demo seed completed (4 inserted rows).',
    )
  })

  it('runs setup with required seed before demo seed', async () => {
    const events = []
    const error = vi.fn()
    const log = vi.fn()
    const healthCheckImpl = vi.fn(async () => {
      events.push('wait')
      return {
        database: 'master',
        ok: true,
        server: '127.0.0.1',
      }
    })
    const request = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(async () => {
        events.push('reset')
      }),
    }
    const connectImpl = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      request: vi.fn(() => request),
    }))
    const runMigrations = vi.fn(async () => {
      events.push('migrate')
      return [{ name: 'InitialMigration' }]
    })
    class FakeDataSource {
      destroy = vi.fn(async () => undefined)
      initialize = vi.fn(async () => undefined)
      runMigrations = runMigrations
    }

    const exitCode = await main(['setup'], {
      connectImpl,
      consoleObj: { error, log },
      dataSourceCtor: FakeDataSource,
      env: {
        DATABASE_READONLY_URL: '',
        DB_READONLY_PASSWORD: '',
        DB_READONLY_USER: '',
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        SQLSERVER_DATABASE_READONLY_URL: '',
      },
      healthCheckImpl,
      seedDemoDatabaseImpl: vi.fn(async () => {
        events.push('demo')
        return 11
      }),
      seedRequiredDatabaseImpl: vi.fn(async () => {
        events.push('required')
        return 5
      }),
    })

    expect(exitCode).toBe(0)
    expect(error).not.toHaveBeenCalled()
    expect(events).toEqual(['wait', 'reset', 'migrate', 'required', 'demo'])
    expect(log).toHaveBeenCalledWith(
      'Step 4/6: seeding required SQL Server data...',
    )
    expect(log).toHaveBeenCalledWith(
      'Step 5/6: seeding demo SQL Server data...',
    )
    expect(log).toHaveBeenCalledWith(
      'SQL Server setup completed (5 required seed rows, 11 demo seed rows).',
    )
  })

  it('waits against master for the CLI wait command', async () => {
    const error = vi.fn()
    const log = vi.fn()
    const healthCheckImpl = vi.fn(async () => ({
      database: 'master',
      ok: true,
      server: '127.0.0.1',
    }))

    const exitCode = await main(['wait'], {
      consoleObj: { error, log },
      env: {
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      },
      healthCheckImpl,
    })

    expect(exitCode).toBe(0)
    expect(healthCheckImpl).toHaveBeenCalledWith(
      'mssql://sa:Password123!@127.0.0.1:1433/master?encrypt=true&trustServerCertificate=true',
      expect.objectContaining({
        healthCheckImpl,
      }),
    )
    expect(log).toHaveBeenCalledWith('SQL Server is ready (127.0.0.1/master).')
  })

  it('prints usage for unsupported commands', async () => {
    const error = vi.fn()

    const exitCode = await main(['reset'], {
      consoleObj: { error, log: vi.fn() },
      env: {
        DATABASE_URL: '',
        DB_HOST: '',
        DB_NAME: '',
        DB_PASSWORD: '',
        DB_PORT: '',
        DB_USER: '',
        MSSQL_SA_PASSWORD: '',
        SQLSERVER_DATABASE_URL: '',
      },
    })

    expect(exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('SQLSERVER_DATABASE_URL or DATABASE_URL'),
    )
  })

  it('prints usage when the command is unknown', async () => {
    const error = vi.fn()

    const exitCode = await main(['unknown'], {
      consoleObj: { error, log: vi.fn() },
      env: {
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      },
    })

    expect(exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'Usage: node scripts/db-sqlserver-admin.mjs <health|wait|reset|bootstrap|migrate|seed:required|seed:demo|setup|browse-config>',
    )
  })

  it('rejects the removed generic seed command', async () => {
    const error = vi.fn()

    const exitCode = await main(['seed'], {
      consoleObj: { error, log: vi.fn() },
      env: {
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      },
    })

    expect(exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'Usage: node scripts/db-sqlserver-admin.mjs <health|wait|reset|bootstrap|migrate|seed:required|seed:demo|setup|browse-config>',
    )
  })

  it('registers every migration file from typeorm/migrations/ (no manual list to drift)', async () => {
    const filenames = listMigrationFilenames(MIGRATIONS_DIR)
    expect(filenames.length).toBeGreaterThanOrEqual(4)
    expect(filenames).toEqual([...filenames].sort())

    const loaded = await loadMigrationClasses()
    expect(loaded.length).toBe(filenames.length)
    for (const migration of loaded) {
      expect(typeof migration).toBe('function')
      expect(migration.name).toMatch(/\d{13}$/)
    }
  })
})
