import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildReadonlyBrowseConfig,
  createMssqlConfig,
  ensureReadonlySqlServerAccess,
  formatReadonlyBrowseConfig,
  getSqlServerDatabaseUrl,
  healthCheckSqlServer,
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

  it('prefers SQLSERVER_DATABASE_URL during the coexistence window', () => {
    expect(
      getSqlServerDatabaseUrl({
        DATABASE_URL: 'file:./dev.sqlite',
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
        'mssql://reader:Secret123!@db.internal:1444/kravhantering?Encrypted=false&TrustServerCertificate=true',
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
    expect(log.mock.calls[1][0]).toContain(
      '"username": "readonly"',
    )
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

  it('runs the initial TypeORM migration through an injected DataSource', async () => {
    const destroy = vi.fn(async () => undefined)
    const initialize = vi.fn(async () => undefined)
    const runMigrations = vi.fn(async () => [{ name: 'InitialMigration' }])
    class FakeDataSource {
      destroy = destroy
      initialize = initialize
      runMigrations = runMigrations
    }

    const result = await runSqlServerMigrations(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      { dataSourceCtor: FakeDataSource },
    )

    expect(initialize).toHaveBeenCalled()
    expect(runMigrations).toHaveBeenCalled()
    expect(destroy).toHaveBeenCalled()
    expect(result).toEqual({
      database: 'kravhantering',
      migrationsApplied: 1,
    })
  })

  it('seeds SQL Server from the legacy snapshot and enables readonly access', async () => {
    const query = vi.fn(async () => undefined)
    const requestFactory = vi.fn(() => ({
      input: vi.fn().mockReturnThis(),
      query,
    }))
    const begin = vi.fn(async () => undefined)
    const commit = vi.fn(async () => undefined)
    const rollback = vi.fn(async () => undefined)
    const close = vi.fn(async () => {})
    const connectImpl = vi.fn(async () => ({
      close,
      request: requestFactory,
      transaction: vi.fn(() => ({
        begin,
        commit,
        request: requestFactory,
        rollback,
      })),
    }))
    const sqlite = {
      close: vi.fn(),
    }

    const result = await seedSqlServerDatabase(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      {
        connectImpl,
        createLegacySqliteSnapshotImpl: vi.fn(() => sqlite),
        env: {
          DATABASE_READONLY_URL:
            'mssql://readonly:Readonly123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        },
        getLegacyTableMetadataImpl: vi.fn(() => [
          {
            columns: [
              { name: 'id', type: 'INTEGER' },
              { name: 'name_sv', type: 'TEXT' },
            ],
            foreignKeys: [],
            indexes: [],
            name: 'requirement_categories',
            primaryKey: ['id'],
          },
        ]),
        readLegacySeedRowsImpl: vi.fn(() => [
          { id: 1, name_sv: 'Sakerhet' },
          { id: 2, name_sv: 'Integration' },
        ]),
      },
    )

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('IDENTITY_INSERT [dbo].[requirement_categories] ON'),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO [dbo].[requirement_categories]'),
    )
    expect(result).toEqual({
      insertedRows: 2,
      readonlyAccessConfigured: true,
    })
    expect(begin).toHaveBeenCalled()
    expect(commit).toHaveBeenCalled()
    expect(rollback).not.toHaveBeenCalled()
    expect(sqlite.close).toHaveBeenCalled()
  })

  it('includes the failing insert SQL and parameters when seed insertion fails', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new Error(
          "Cannot insert explicit value for identity column in table 'deviations' when IDENTITY_INSERT is set to OFF.",
        ),
      )
      .mockResolvedValueOnce(undefined)
    const requestFactory = vi.fn(() => ({
      input: vi.fn().mockReturnThis(),
      query,
    }))
    const connectImpl = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      request: requestFactory,
      transaction: vi.fn(() => ({
        begin: vi.fn(async () => undefined),
        commit: vi.fn(async () => undefined),
        request: requestFactory,
        rollback: vi.fn(async () => undefined),
      })),
    }))
    const sqlite = {
      close: vi.fn(),
    }

    await expect(
      seedSqlServerDatabase(
        'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        {
          connectImpl,
          createLegacySqliteSnapshotImpl: vi.fn(() => sqlite),
          getLegacyTableMetadataImpl: vi.fn(() => [
            {
              columns: [
                { name: 'id', type: 'INTEGER' },
                { name: 'package_item_id', type: 'INTEGER' },
                { name: 'motivation', type: 'TEXT' },
              ],
              foreignKeys: [],
              indexes: [],
              name: 'deviations',
              primaryKey: ['id'],
            },
          ]),
          readLegacySeedRowsImpl: vi.fn(() => [
            { id: 1, motivation: 'Need deviation', package_item_id: 42 },
          ]),
        },
      ),
    ).rejects.toThrow(
      /identityInsertOnSql: SET IDENTITY_INSERT \[dbo\]\.\[deviations\] ON/,
    )
  })

  it('creates readonly SQL Server access when readonly credentials differ', async () => {
    const query = vi.fn(async () => undefined)
    const request = vi.fn(() => ({ query }))
    const close = vi.fn(async () => undefined)
    const connectImpl = vi.fn(async () => ({
      close,
      request,
    }))

    const result = await ensureReadonlySqlServerAccess(
      'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      {
        connectImpl,
        env: {
          DATABASE_READONLY_URL:
            'mssql://readonly:Readonly123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        },
      },
    )

    expect(result).toEqual({
      configured: true,
      username: 'readonly',
    })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('CREATE LOGIN'))
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ALTER ROLE db_datareader ADD MEMBER'),
    )
  })

  it('runs full setup through the CLI command', async () => {
    const error = vi.fn()
    const log = vi.fn()
    const healthCheckImpl = vi.fn(async () => ({
      database: 'kravhantering',
      ok: true,
      server: '127.0.0.1',
    }))
    class FakeDataSource {
      destroy = vi.fn(async () => undefined)
      initialize = vi.fn(async () => undefined)
      runMigrations = vi.fn(async () => [{ name: 'InitialMigration' }])
    }
    const query = vi.fn(async () => undefined)
    const requestFactory = vi.fn(() => ({
      input: vi.fn().mockReturnThis(),
      query,
    }))
    const connectImpl = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      request: requestFactory,
    }))

    const exitCode = await main(['setup'], {
      connectImpl,
      consoleObj: { error, log },
      createLegacySqliteSnapshotImpl: vi.fn(() => ({
        close: vi.fn(),
      })),
      dataSourceCtor: FakeDataSource,
      env: {
        DATABASE_READONLY_URL:
          'mssql://readonly:Readonly123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
        SQLSERVER_DATABASE_URL:
          'mssql://sa:Password123!@127.0.0.1:1433/kravhantering?encrypt=true&trustServerCertificate=true',
      },
      getLegacyTableMetadataImpl: vi.fn(() => []),
      healthCheckImpl,
      readLegacySeedRowsImpl: vi.fn(() => []),
    })

    expect(exitCode).toBe(0)
    expect(error).not.toHaveBeenCalled()
    expect(healthCheckImpl).toHaveBeenCalledWith(
      'mssql://sa:Password123!@127.0.0.1:1433/master?encrypt=true&trustServerCertificate=true',
      expect.objectContaining({
        healthCheckImpl,
      }),
    )
    expect(log).toHaveBeenCalledWith('SQL Server setup completed (0 inserted rows).')
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
      'Usage: node scripts/db-sqlserver-admin.mjs <health|wait|reset|migrate|seed|setup|browse-config>',
    )
  })
})
