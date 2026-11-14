import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  assertRuntimePermissionStatus,
  bootstrapSqlServerDatabase,
  createBootstrapAdminConnectionString,
  ensureReadonlySqlServerAccess,
  getSqlServerDatabaseUrl,
  getSqlServerMigrationStatus,
  main,
  parseBoolean,
  parseInteger,
  parseSqlServerConnectionString,
  resetDemoSqlServerData,
  runSqlServerMigrations,
  seedSqlServerDatabase,
  waitForSqlServer,
} from '../db-sqlserver-admin.mjs'

const connection = 'mssql://job:Secret123!@db/site'
const adminEnv = {
  DATABASE_URL: connection,
  DB_BOOTSTRAP_ADMIN_PASSWORD: 'Admin123!',
  DB_BOOTSTRAP_APP_USER: 'runtime',
  DB_BOOTSTRAP_APP_PASSWORD: 'App123!',
  DB_RUNTIME_USER: 'runtime',
}

function migrationSeam({ descriptors = [], executed = [], pending = [] } = {}) {
  const destroy = vi.fn(async () => undefined)
  const runMigrations = vi.fn(async () => [])
  class FakeDataSource {
    options = {}
    initialize = vi.fn(async () => undefined)
    destroy = destroy
    runMigrations = runMigrations
  }
  class FakeMigrationExecutor {
    async getExecutedMigrations() {
      return executed
    }
    async getPendingMigrations() {
      return pending
    }
  }
  return {
    dataSourceCtor: FakeDataSource,
    migrationExecutorCtor: FakeMigrationExecutor,
    migrationDescriptors: descriptors,
    destroy,
    runMigrations,
    env: {},
  }
}

function descriptor(name, timestamp, sequence) {
  return {
    name,
    timestamp,
    sequence,
    fileName: `${name}.mjs`,
    classRef: class {},
  }
}

const environmentDirectory = mkdtempSync(join(tmpdir(), 'db-admin-coverage-'))
beforeEach(() => {
  // CLI tests must not consume credentials from the developer checkout.
  vi.spyOn(process, 'cwd').mockReturnValue(environmentDirectory)
})
afterAll(() => rmSync(environmentDirectory, { recursive: true, force: true }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('SQL Server connection validation', () => {
  it.each(['unknown', '  maybe  '])(
    'uses the caller boolean default for %s',
    value => {
      expect(parseBoolean(value, true)).toBe(true)
      expect(parseBoolean(value, false)).toBe(false)
    },
  )

  it.each(['0', '-1', 'invalid', ' '])(
    'uses the caller integer default for %s',
    value => {
      expect(parseInteger(value, 1433)).toBe(1433)
    },
  )

  it('accepts the SQL Server scheme with secure defaults and the master database', () => {
    expect(
      getSqlServerDatabaseUrl({ DATABASE_URL: 'sqlserver://reader:secret@db' }),
    ).toBe('sqlserver://reader:secret@db')
    expect(
      parseSqlServerConnectionString('sqlserver://reader:secret@db', {}),
    ).toEqual({
      connectionTimeout: 15000,
      database: 'master',
      encrypt: true,
      password: 'secret',
      port: 1433,
      requestTimeout: 15000,
      server: 'db',
      trustServerCertificate: false,
      username: 'reader',
    })
  })

  it('rejects a connection scheme belonging to a different database driver', () => {
    expect(() =>
      parseSqlServerConnectionString('postgres://reader:secret@db/site', {}),
    ).toThrow('Unsupported SQL Server connection scheme: postgres:')
  })

  it('requires bootstrap credentials before preparing an administrative connection', () => {
    expect(() => createBootstrapAdminConnectionString(connection, {})).toThrow(
      'DB_BOOTSTRAP_ADMIN_USER and DB_BOOTSTRAP_ADMIN_PASSWORD (or MSSQL_SA_PASSWORD) are required',
    )
  })

  it.each([
    [
      { DB_BOOTSTRAP_APP_PASSWORD: '' },
      'DB_BOOTSTRAP_APP_USER and DB_BOOTSTRAP_APP_PASSWORD are required',
    ],
    [
      { DB_BOOTSTRAP_APP_USER: '' },
      'DB_BOOTSTRAP_APP_USER and DB_BOOTSTRAP_APP_PASSWORD are required',
    ],
    [
      { DB_BOOTSTRAP_APP_PASSWORD: 'RUNTIME-secret123!' },
      'password contains the login name',
    ],
  ])(
    'rejects unusable runtime bootstrap credentials before connecting',
    async (overrides, message) => {
      const connectImpl = vi.fn()
      await expect(
        bootstrapSqlServerDatabase(connection, {
          connectImpl,
          env: { ...adminEnv, ...overrides },
        }),
      ).rejects.toThrow(message)
      expect(connectImpl).not.toHaveBeenCalled()
    },
  )

  it('does not configure read-only access using the administrative identity', async () => {
    const connectImpl = vi.fn()
    await expect(
      ensureReadonlySqlServerAccess(connection, {
        connectImpl,
        env: { DATABASE_READONLY_URL: connection },
      }),
    ).resolves.toEqual({ configured: false })
    expect(connectImpl).not.toHaveBeenCalled()
  })

  it('rejects a read-only password containing its login name before connecting', async () => {
    const connectImpl = vi.fn()
    await expect(
      ensureReadonlySqlServerAccess(connection, {
        connectImpl,
        env: { DATABASE_READONLY_URL: 'mssql://reader:READER123!@db/site' },
      }),
    ).rejects.toThrow('password that contains the login name')
    expect(connectImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['login', 0, new Error('permission denied')],
    ['login', 0, 'permission denied'],
    ['database-user', 1, new Error('permission denied')],
    ['database-user', 1, 'permission denied'],
  ])(
    'identifies a failed read-only %s setup and closes opened pools',
    async (stage, successfulConnections, failure) => {
      const close = vi.fn(async () => undefined)
      const query = vi.fn(async () => undefined)
      const connectImpl = vi.fn()
      if (successfulConnections)
        connectImpl.mockResolvedValueOnce({ close, request: () => ({ query }) })
      connectImpl.mockRejectedValueOnce(failure)
      await expect(
        ensureReadonlySqlServerAccess(connection, {
          connectImpl,
          env: { DATABASE_READONLY_URL: 'mssql://reader:Secret123!@db/site' },
        }),
      ).rejects.toThrow(
        `Read-only SQL Server ${stage} setup failed for reader: permission denied`,
      )
      expect(close).toHaveBeenCalledTimes(successfulConnections)
      expect(connectImpl).toHaveBeenCalledTimes(successfulConnections + 1)
    },
  )
})

describe('migration status and preflight boundaries', () => {
  it('reports an empty migration bundle as incompatible and closes its connection', async () => {
    const seam = migrationSeam()
    const report = await getSqlServerMigrationStatus(connection, seam)
    expect(report).toMatchObject({
      compatible: false,
      expectedHead: null,
      observedHead: null,
      bundledMigrationCount: 0,
      problems: [{ code: 'target_schema_version_missing' }],
    })
    expect(seam.destroy).toHaveBeenCalledOnce()
  })

  it('orders executed migrations by database execution id before timestamp', async () => {
    const first = descriptor('First', 1700000000000, 1)
    const second = descriptor('Second', 1700000000001, 2)
    const seam = migrationSeam({
      descriptors: [second, first],
      executed: [
        { id: 1, name: 'Second', timestamp: second.timestamp },
        { id: 2, name: 'First' },
      ],
      pending: [{ name: 'Second' }],
    })
    const report = await getSqlServerMigrationStatus(connection, seam)
    expect(report.observedHead).toMatchObject({
      id: 2,
      name: 'First',
      timestamp: first.timestamp,
    })
    expect(report.expectedHead.name).toBe('Second')
    expect(report.pendingMigrations).toEqual([
      {
        fileName: 'Second.mjs',
        name: 'Second',
        sequence: 2,
        timestamp: second.timestamp,
      },
    ])
  })

  it('reports unknown migration history deterministically when execution ids are unavailable', async () => {
    const seam = migrationSeam({
      descriptors: [descriptor('Bundled', 1700000000000, 1)],
      executed: [
        { name: 'UnknownA' },
        { name: 'UnknownB' },
        { name: 'Timestamped', timestamp: 1800000000000 },
        { name: 'Older', timestamp: 1600000000000 },
      ],
      pending: [{ name: 'Unbundled' }],
    })
    const report = await getSqlServerMigrationStatus(connection, seam)
    expect(report.compatible).toBe(false)
    expect(report.unknownMigrations.map(item => item.name)).toEqual([
      'Timestamped',
      'Older',
      'UnknownB',
      'UnknownA',
    ])
    expect(report.observedHead).toEqual({
      id: null,
      name: 'Timestamped',
      timestamp: 1800000000000,
    })
    expect(report.pendingMigrations).toEqual([
      { name: 'Unbundled', timestamp: null },
    ])
    expect(report.problems).toEqual([
      {
        code: 'database_schema_version_unknown',
        message:
          'The database contains migration names that are not bundled with this db-job image.',
        migrations: ['Timestamped', 'Older', 'UnknownB', 'UnknownA'],
      },
    ])
  })

  it('uses sequence and name to resolve equal or unavailable bundled timestamps', async () => {
    const seam = migrationSeam({
      descriptors: [
        descriptor('Zulu', null, undefined),
        descriptor('Alpha', null, undefined),
        descriptor('First', 1700000000000, 1),
        descriptor('Second', 1700000000000, 2),
      ],
    })
    const report = await getSqlServerMigrationStatus(connection, seam)
    expect(report.expectedHead).toEqual({
      name: 'Second',
      fileName: 'Second.mjs',
      sequence: 2,
      timestamp: 1700000000000,
    })
  })

  it('refuses to migrate an incompatible bundle before executing database changes', async () => {
    const seam = migrationSeam()
    await expect(runSqlServerMigrations(connection, seam)).rejects.toThrow(
      'migration preflight failed for site: target_schema_version_missing',
    )
    expect(seam.runMigrations).not.toHaveBeenCalled()
    expect(seam.destroy).toHaveBeenCalledOnce()
  })

  it('fails the post-check when the migration driver does not record the target head', async () => {
    const seam = migrationSeam({
      descriptors: [descriptor('Target', 1700000000000, 1)],
    })
    const reconcileRuntimePermissionsImpl = vi.fn()
    await expect(
      runSqlServerMigrations(connection, {
        ...seam,
        reconcileRuntimePermissionsImpl,
      }),
    ).rejects.toThrow('expected Target, observed none')
    expect(seam.runMigrations).toHaveBeenCalledOnce()
    expect(reconcileRuntimePermissionsImpl).not.toHaveBeenCalled()
    expect(seam.destroy).toHaveBeenCalledOnce()
  })
})

describe('permission and reset failure contracts', () => {
  it('reports an isolated missing grant without inventing other permission failures', () => {
    const status = {
      role: { present: true },
      missingGrants: [{}],
      unexpectedGrants: [],
      unexpectedParentRoles: [],
      runtimeUsers: [
        {
          name: 'runtime',
          present: true,
          member: true,
          defaultSchema: 'dbo',
          legacyRoles: [],
        },
      ],
    }
    expect(() => assertRuntimePermissionStatus(status)).toThrow(
      'SQL runtime permission verification failed: 1 manifest grant(s) are missing.',
    )
  })

  it.each([null, {}, { query: undefined }])(
    'rejects a reset executor without a query interface',
    async executor => {
      await expect(resetDemoSqlServerData(executor)).rejects.toThrow(
        'requires a DataSource, QueryRunner, or EntityManager',
      )
    },
  )

  it('rejects unsafe table identifiers without sending SQL to the database', async () => {
    const query = vi.fn()
    await expect(
      resetDemoSqlServerData(
        { query },
        { demoResetTables: ['requirements]; DROP TABLE users;--'] },
      ),
    ).rejects.toThrow('Unsafe SQL Server table name')
    expect(query).not.toHaveBeenCalled()
  })

  it('propagates an EntityManager query failure to its transaction owner', async () => {
    const failure = new Error('permission denied')
    const query = vi.fn().mockRejectedValue(failure)
    await expect(
      resetDemoSqlServerData({ query }, { demoResetTables: ['requirements'] }),
    ).rejects.toBe(failure)
    expect(query).toHaveBeenCalledOnce()
  })

  it('rejects an unsupported seed profile before constructing a connection', async () => {
    const dataSourceCtor = vi.fn()
    await expect(
      seedSqlServerDatabase(connection, {
        profile: 'untrusted',
        dataSourceCtor,
      }),
    ).rejects.toThrow('Unsupported SQL Server seed profile: untrusted')
    expect(dataSourceCtor).not.toHaveBeenCalled()
  })
})

describe('administration CLI failure reporting', () => {
  it.each([
    ['health', 'SQL Server health check failed.'],
    ['reset', 'SQL Server reset failed.'],
    ['bootstrap', 'SQL Server bootstrap failed.'],
    ['migration-status', 'SQL Server migration status failed.'],
    ['migrate', 'SQL Server migrate failed.'],
    ['seed:required', 'SQL Server required seed failed.'],
    ['seed:demo', 'SQL Server demo seed failed.'],
    ['demo:clear', 'SQL Server demo clear failed.'],
  ])(
    'returns failure and a usable diagnostic for %s',
    async (command, fallback) => {
      for (const failure of [new Error('database unavailable'), null]) {
        const consoleObj = { error: vi.fn(), log: vi.fn() }
        const reject = vi.fn().mockRejectedValue(failure)
        class FailingDataSource {
          initialize = reject
        }
        const exitCode = await main(
          [command, '--confirm-clear-non-required-data'],
          {
            consoleObj,
            env: { ...adminEnv },
            connectImpl: reject,
            dataSourceCtor: FailingDataSource,
            migrationDescriptors: [],
            seedRequiredDatabaseImpl: vi.fn(),
            seedDemoDatabaseImpl: vi.fn(),
          },
        )
        expect(exitCode).toBe(1)
        expect(consoleObj.error).toHaveBeenCalledWith(
          expect.stringContaining(
            failure instanceof Error
              ? 'database unavailable'
              : command === 'migrate'
                ? String(failure)
                : fallback,
          ),
        )
        expect(consoleObj.log).not.toHaveBeenCalled()
      }
    },
  )

  it('reports health success with the connected database identity', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const close = vi.fn(async () => undefined)
    await expect(
      main(['health'], {
        consoleObj,
        env: { ...adminEnv },
        connectImpl: async () => ({
          close,
          request: () => ({ query: async () => ({ recordset: [{ ok: 1 }] }) }),
        }),
      }),
    ).resolves.toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      'SQL Server is healthy (db/site).',
    )
    expect(close).toHaveBeenCalledOnce()
  })

  it.each([new Error('connection refused'), null])(
    'terminates readiness polling at its deadline',
    async failure => {
      let now = 0
      const healthCheckImpl = vi.fn(async () => {
        now = 10
        throw failure
      })
      const sleepImpl = vi.fn()
      await expect(
        waitForSqlServer(connection, {
          healthCheckImpl,
          sleepImpl,
          nowImpl: () => now,
          timeoutMs: 10,
        }),
      ).rejects.toThrow(
        failure instanceof Error
          ? 'SQL Server did not become ready in time: connection refused'
          : 'SQL Server did not become ready in time.',
      )
      expect(healthCheckImpl).toHaveBeenCalledOnce()
      expect(sleepImpl).not.toHaveBeenCalled()
    },
  )

  it('returns a wait failure when administrative credentials are missing', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    await expect(
      main(['wait'], { consoleObj, env: { DATABASE_URL: connection } }),
    ).resolves.toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('are required for SQL Server bootstrap'),
    )
  })

  it.each([undefined, '0', '1001', '1.5', 'no'])(
    'rejects an invalid rotation batch size before accessing secrets',
    async batchSize => {
      const rotateAiProviderSecretRootForConnectionImpl = vi.fn()
      const consoleObj = { error: vi.fn(), log: vi.fn() }
      const args = [
        'provider-secret-root-rotate',
        '--from-root-key-version',
        'old',
        '--batch-size',
      ]
      if (batchSize !== undefined) args.push(batchSize)
      await expect(
        main(args, {
          consoleObj,
          env: { ...adminEnv },
          rotateAiProviderSecretRootForConnectionImpl,
        }),
      ).resolves.toBe(1)
      expect(consoleObj.error).toHaveBeenCalledWith(
        '--batch-size must be an integer from 1 through 1000.',
      )
      expect(rotateAiProviderSecretRootForConnectionImpl).not.toHaveBeenCalled()
    },
  )

  it('requires the source root key version before rotating secrets', async () => {
    const rotateAiProviderSecretRootForConnectionImpl = vi.fn()
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    await expect(
      main(['provider-secret-root-rotate'], {
        consoleObj,
        env: { ...adminEnv },
        rotateAiProviderSecretRootForConnectionImpl,
      }),
    ).resolves.toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      '--from-root-key-version requires a value.',
    )
    expect(rotateAiProviderSecretRootForConnectionImpl).not.toHaveBeenCalled()
  })

  it('prints SQL diagnostic fields when setup fails after reaching the server', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const failure = Object.assign(new Error('setup denied'), {
      code: 'EPERM',
      number: 229,
      originalError: 'SQL permission denied',
    })
    await expect(
      main(['setup'], {
        consoleObj,
        env: { ...adminEnv },
        healthCheckImpl: async () => ({ ok: true }),
        resetSqlServerDatabaseImpl: async () => {
          throw failure
        },
      }),
    ).resolves.toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith('setup denied')
    expect(consoleObj.error).toHaveBeenCalledWith(
      'SQL Server error details: {"code":"EPERM","number":229}',
    )
    expect(consoleObj.error).toHaveBeenCalledWith(
      'Original error: SQL permission denied',
    )
  })
})
