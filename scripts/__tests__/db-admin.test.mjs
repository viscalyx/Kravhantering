import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAdminClient,
  createLocalAdmin,
  createRemoteAdmin,
  ensureMigrationsTable,
  execFile,
  getDatabaseUrl,
  getSortedMigrationFiles,
  hashSql,
  isHttpDatabaseUrl,
  loadEnvironmentFiles,
  main,
  migrate,
  normalizeBaseUrl,
  readAppliedMigrations,
  readSeedSql,
  resolveSqliteFilePath,
  SEED_SQL_FILE,
  seedDatabase,
  splitSqlStatements,
  stripWrappingQuotes,
  waitForDatabase,
} from '../db-admin.mjs'

function createTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('db-admin.mjs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('strips matching wrapping quotes only', () => {
    expect(stripWrappingQuotes('"value"')).toBe('value')
    expect(stripWrappingQuotes("'value'")).toBe('value')
    expect(stripWrappingQuotes('"value')).toBe('"value')
  })

  it('loads environment files in order without overwriting initial values', () => {
    const tempDir = createTempDir('db-admin-env-')
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

    try {
      writeFileSync(
        join(tempDir, '.env'),
        [
          '# ignored comment',
          'DATABASE_URL=file:./from-env.sqlite',
          'KEEP=from-env',
          'QUOTED="quoted"',
          'BAD_LINE',
        ].join('\n'),
      )
      writeFileSync(
        join(tempDir, '.env.local'),
        ['DATABASE_URL=file:./from-local.sqlite', "NEW_KEY='local-value'"].join(
          '\n',
        ),
      )

      const env = {
        KEEP: 'initial-value',
      }
      loadEnvironmentFiles(env)

      expect(env).toEqual({
        DATABASE_URL: 'file:./from-local.sqlite',
        KEEP: 'initial-value',
        NEW_KEY: 'local-value',
        QUOTED: 'quoted',
      })
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('reads and validates DATABASE_URL values', () => {
    expect(getDatabaseUrl({ DATABASE_URL: '  file:./dev.sqlite  ' })).toBe(
      'file:./dev.sqlite',
    )
    expect(() => getDatabaseUrl({})).toThrow(
      'DATABASE_URL is required for database administration commands.',
    )
  })

  it('detects HTTP database URLs and normalizes trailing slashes', () => {
    expect(isHttpDatabaseUrl('https://example.com')).toBe(true)
    expect(isHttpDatabaseUrl('file:./dev.sqlite')).toBe(false)
    expect(normalizeBaseUrl('http://db:9000/')).toBe('http://db:9000')
    expect(normalizeBaseUrl('http://db:9000')).toBe('http://db:9000')
  })

  it('resolves SQLite connection strings for memory, absolute, relative, and file URLs', () => {
    const cwdSpy = vi
      .spyOn(process, 'cwd')
      .mockReturnValue('/workspace/project')

    try {
      expect(resolveSqliteFilePath(':memory:')).toBe(':memory:')
      expect(resolveSqliteFilePath('/var/lib/app.sqlite')).toBe(
        '/var/lib/app.sqlite',
      )
      expect(resolveSqliteFilePath('tmp/dev.sqlite')).toBe(
        '/workspace/project/tmp/dev.sqlite',
      )
      expect(resolveSqliteFilePath('file:/var/lib/dev.sqlite')).toBe(
        '/var/lib/dev.sqlite',
      )
      expect(resolveSqliteFilePath('file:./tmp/dev.sqlite')).toBe(
        '/workspace/project/tmp/dev.sqlite',
      )
    } finally {
      cwdSpy.mockRestore()
    }
  })

  it('splits SQL on breakpoints or plain semicolons without breaking quoted semicolons', () => {
    expect(
      splitSqlStatements(
        'CREATE TABLE test(id integer);--> statement-breakpoint INSERT INTO test VALUES (1);',
      ),
    ).toEqual([
      'CREATE TABLE test(id integer);',
      'INSERT INTO test VALUES (1);',
    ])

    expect(
      splitSqlStatements(
        "INSERT INTO test VALUES ('a;still-a');\n-- keep comment;\nINSERT INTO test VALUES ('b');",
      ),
    ).toEqual([
      "INSERT INTO test VALUES ('a;still-a')",
      "-- keep comment;\nINSERT INTO test VALUES ('b')",
    ])
  })

  it('hashes SQL deterministically', () => {
    expect(hashSql('SELECT 1;')).toBe(hashSql('SELECT 1;'))
    expect(hashSql('SELECT 1;')).not.toBe(hashSql('SELECT 2;'))
  })

  it('reads and sorts migration files from the provided cwd', () => {
    const tempDir = createTempDir('db-admin-migrations-')

    try {
      const migrationsDir = join(tempDir, 'drizzle', 'migrations')
      mkdirSync(migrationsDir, { recursive: true })
      writeFileSync(join(migrationsDir, '0002_b.sql'), 'SELECT 2;')
      writeFileSync(join(migrationsDir, '0001_a.sql'), 'SELECT 1;')
      writeFileSync(join(migrationsDir, 'ignore.txt'), 'skip')

      expect(getSortedMigrationFiles(tempDir)).toEqual([
        '0001_a.sql',
        '0002_b.sql',
      ])
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('creates the migrations table through runStatements', async () => {
    const admin = {
      runStatements: vi.fn(async () => {}),
    }

    await ensureMigrationsTable(admin)

    expect(admin.runStatements).toHaveBeenCalledWith([
      expect.objectContaining({
        params: [],
        sql: expect.stringContaining(
          'CREATE TABLE IF NOT EXISTS __app_migrations',
        ),
      }),
    ])
  })

  it('reads applied migrations from object and array row shapes', async () => {
    const admin = {
      all: vi.fn(async () => [
        { hash: 'hash-a', name: '0001_a.sql' },
        ['0002_b.sql', 'hash-b'],
      ]),
    }

    const applied = await readAppliedMigrations(admin)

    expect(Array.from(applied.entries())).toEqual([
      ['0001_a.sql', 'hash-a'],
      ['0002_b.sql', 'hash-b'],
    ])
  })

  it('creates a local admin that can run statements and reset a file-backed database', async () => {
    const tempDir = createTempDir('db-admin-local-')

    try {
      const dbFile = join(tempDir, 'nested', 'dev.sqlite')
      const admin = createLocalAdmin(dbFile)

      await admin.runStatements([
        {
          params: [],
          sql: 'CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)',
        },
        { params: ['Ada'], sql: 'INSERT INTO test (name) VALUES (?)' },
      ])

      expect(await admin.all('SELECT name FROM test')).toEqual([
        { name: 'Ada' },
      ])
      expect(await admin.health()).toEqual({ dbFile, ok: true })
      expect(existsSync(dbFile)).toBe(true)

      await admin.reset()
      expect(existsSync(dbFile)).toBe(false)
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('creates a remote admin that targets the proxy endpoints and passes a timeout signal', async () => {
    const fetchMock = vi.fn(async (_url, init) => ({
      json: async () => ({ ok: true, rows: [{ id: 1 }] }),
      ok: true,
      text: async () => '',
      url: init?.url,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const admin = createRemoteAdmin('http://db:9000/')

    expect(await admin.all('SELECT 1', [1])).toEqual([{ id: 1 }])
    await admin.health()
    await admin.reset()
    await admin.execScript('SELECT 1;')
    await admin.runStatements([
      { params: [1], sql: 'INSERT INTO test VALUES (?)' },
    ])

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://db:9000/query',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://db:9000/healthz',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://db:9000/reset',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://db:9000/exec',
      expect.objectContaining({
        body: JSON.stringify({ sql: 'SELECT 1;' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://db:9000/batch',
      expect.objectContaining({
        body: JSON.stringify({
          queries: [
            {
              method: 'run',
              params: [1],
              sql: 'INSERT INTO test VALUES (?)',
            },
          ],
        }),
      }),
    )
  })

  it('aborts remote fetches when the timeout elapses', async () => {
    vi.useFakeTimers()

    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(_timeoutMs => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 5)
        return controller.signal
      })

    const fetchMock = vi.fn((_url, init) => {
      const signal = init?.signal

      return new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('request aborted'))
          return
        }

        signal?.addEventListener(
          'abort',
          () => reject(new Error('request aborted')),
          { once: true },
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const admin = createRemoteAdmin('http://db:9000')
    const healthPromise = admin.health()
    const healthExpectation =
      expect(healthPromise).rejects.toThrow('request aborted')
    await vi.advanceTimersByTimeAsync(5)

    await healthExpectation
    expect(timeoutSpy).toHaveBeenCalledWith(10_000)
  })

  it('selects local and remote admin clients based on the connection string', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: true }),
      ok: true,
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const remoteAdmin = createAdminClient('http://db:9000')
    await remoteAdmin.health()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const localAdmin = createAdminClient(':memory:')
    expect(await localAdmin.health()).toEqual({ dbFile: ':memory:', ok: true })
    await localAdmin.close()
  })

  it('reads seed SQL from disk', () => {
    const readFileSyncImpl = vi.fn(() => 'SELECT 1;')

    const sqlText = readSeedSql('/workspace', readFileSyncImpl)

    expect(sqlText).toBe('SELECT 1;')
    expect(readFileSyncImpl).toHaveBeenCalledWith(
      '/workspace/drizzle/seed.sql',
      'utf8',
    )
  })

  it('reports a missing seed SQL file clearly', () => {
    const readFileSyncImpl = vi.fn(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    expect(() => readSeedSql('/workspace', readFileSyncImpl)).toThrow(
      `Failed to read ${SEED_SQL_FILE}: ENOENT: no such file or directory`,
    )
  })

  it('reports an unreadable seed SQL file clearly', () => {
    const readFileSyncImpl = vi.fn(() => {
      throw new Error('EACCES: permission denied')
    })

    expect(() => readSeedSql('/workspace', readFileSyncImpl)).toThrow(
      `Failed to read ${SEED_SQL_FILE}: EACCES: permission denied`,
    )
  })

  it('executes SQL files from the provided cwd', async () => {
    const tempDir = createTempDir('db-admin-exec-file-')

    try {
      const sqlPath = join(tempDir, 'sql', 'seed.sql')
      mkdirSync(join(tempDir, 'sql'), { recursive: true })
      writeFileSync(sqlPath, 'SELECT 1;')

      const admin = {
        execScript: vi.fn(async () => {}),
      }
      const log = vi.fn()

      await execFile(admin, 'sql/seed.sql', {
        consoleObj: { log },
        cwd: tempDir,
      })

      expect(admin.execScript).toHaveBeenCalledWith('SELECT 1;')
      expect(log).toHaveBeenCalledWith('Executed SQL from sql/seed.sql')
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('seeds the database atomically through runStatements', async () => {
    const admin = {
      execScript: vi.fn(async () => {}),
      runStatements: vi.fn(async () => {}),
    }
    const log = vi.fn()
    const readSeedSqlMock = vi.fn(
      () =>
        "INSERT INTO test VALUES (1, 'alpha'); INSERT INTO test VALUES (2, 'beta');",
    )

    await seedDatabase(admin, {
      consoleObj: { log },
      cwd: '/workspace',
      readSeedSql: readSeedSqlMock,
    })

    expect(readSeedSqlMock).toHaveBeenCalledWith('/workspace')
    expect(admin.runStatements).toHaveBeenCalledWith([
      { params: [], sql: "INSERT INTO test VALUES (1, 'alpha')" },
      { params: [], sql: "INSERT INTO test VALUES (2, 'beta')" },
    ])
    expect(admin.execScript).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('Database seed completed.')
  })

  it('waits for the database until a health check succeeds', async () => {
    vi.useFakeTimers()
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined)
    const health = vi
      .fn()
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({ ok: true })

    try {
      const waitPromise = waitForDatabase({ health }, 2_000)
      await vi.advanceTimersByTimeAsync(1_000)
      await waitPromise

      expect(health).toHaveBeenCalledTimes(2)
      expect(consoleSpy).toHaveBeenCalledWith('Database is ready.')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('applies pending migrations from the provided cwd', async () => {
    const tempDir = createTempDir('db-admin-migrate-happy-')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/different-cwd')
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined)

    try {
      const migrationsDir = join(tempDir, 'drizzle', 'migrations')
      mkdirSync(migrationsDir, { recursive: true })
      writeFileSync(
        join(migrationsDir, '0002_create_test.sql'),
        [
          'CREATE TABLE sample (id INTEGER PRIMARY KEY, name TEXT);',
          '--> statement-breakpoint',
          "INSERT INTO sample (name) VALUES ('Ada');",
        ].join('\n'),
      )

      const admin = createLocalAdmin(':memory:')
      await migrate(admin, { cwd: tempDir })

      expect(await admin.all('SELECT name FROM sample')).toEqual([
        { name: 'Ada' },
      ])
      expect(Array.from((await readAppliedMigrations(admin)).keys())).toEqual([
        '0002_create_test.sql',
      ])
      await admin.close()
    } finally {
      consoleSpy.mockRestore()
      cwdSpy.mockRestore()
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('prints a no-op message when all migrations are already applied', async () => {
    const tempDir = createTempDir('db-admin-migrate-noop-')
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined)

    try {
      const migrationsDir = join(tempDir, 'drizzle', 'migrations')
      mkdirSync(migrationsDir, { recursive: true })
      writeFileSync(
        join(migrationsDir, '0001_init.sql'),
        'CREATE TABLE noop_test (id INTEGER PRIMARY KEY);',
      )

      const admin = createLocalAdmin(':memory:')
      await migrate(admin, { cwd: tempDir })
      consoleSpy.mockClear()

      await migrate(admin, { cwd: tempDir })

      expect(consoleSpy).toHaveBeenCalledWith('No pending migrations.')
      await admin.close()
    } finally {
      consoleSpy.mockRestore()
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('throws when an applied migration hash changes', async () => {
    const tempDir = createTempDir('db-admin-migrate-mismatch-')
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined)

    try {
      const migrationsDir = join(tempDir, 'drizzle', 'migrations')
      const migrationPath = join(migrationsDir, '0001_init.sql')
      mkdirSync(migrationsDir, { recursive: true })
      writeFileSync(
        migrationPath,
        'CREATE TABLE mismatch_test (id INTEGER PRIMARY KEY);',
      )

      const admin = createLocalAdmin(':memory:')
      await migrate(admin, { cwd: tempDir })
      writeFileSync(
        migrationPath,
        'CREATE TABLE mismatch_test (id INTEGER PRIMARY KEY, name TEXT);',
      )

      await expect(migrate(admin, { cwd: tempDir })).rejects.toThrow(
        'Migration 0001_init.sql was already applied with a different hash.',
      )
      await admin.close()
    } finally {
      consoleSpy.mockRestore()
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('runs the seed command with SQL loaded from disk', async () => {
    const admin = {
      close: vi.fn(async () => {}),
      runStatements: vi.fn(async () => {}),
    }
    const adminFactory = vi.fn(() => admin)
    const error = vi.fn()
    const log = vi.fn()
    const readSeedSqlMock = vi.fn(() => 'SELECT 1;')

    const exitCode = await main(['seed'], {
      adminFactory,
      consoleObj: { error, log },
      cwd: '/workspace',
      env: { DATABASE_URL: 'file:./tmp/dev.sqlite' },
      readSeedSql: readSeedSqlMock,
      loadEnvironmentFilesImpl: vi.fn(),
    })

    expect(exitCode).toBe(0)
    expect(adminFactory).toHaveBeenCalledWith('file:./tmp/dev.sqlite')
    expect(readSeedSqlMock).toHaveBeenCalledWith('/workspace')
    expect(admin.runStatements).toHaveBeenCalledWith([
      { params: [], sql: 'SELECT 1' },
    ])
    expect(log).toHaveBeenCalledWith('Database seed completed.')
    expect(admin.close).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('runs wait, health, reset, migrate, and exec-file commands', async () => {
    const tempDir = createTempDir('db-admin-main-commands-')
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined)

    try {
      const migrationsDir = join(tempDir, 'drizzle', 'migrations')
      const sqlDir = join(tempDir, 'sql')
      mkdirSync(migrationsDir, { recursive: true })
      mkdirSync(sqlDir, { recursive: true })
      writeFileSync(
        join(migrationsDir, '0001_init.sql'),
        'CREATE TABLE main_test (id INTEGER PRIMARY KEY);',
      )
      writeFileSync(join(sqlDir, 'extra.sql'), 'SELECT 1;')

      const baseAdmin = () => ({
        all: vi.fn(async () => []),
        close: vi.fn(async () => {}),
        execScript: vi.fn(async () => {}),
        health: vi.fn(async () => ({ ok: true })),
        reset: vi.fn(async () => ({ ok: true })),
        runStatements: vi.fn(async statements => {
          if (
            statements.some(statement =>
              statement.sql.includes('INSERT INTO __app_migrations'),
            )
          ) {
            return
          }
        }),
      })

      const healthAdmin = baseAdmin()
      const healthExitCode = await main(['health'], {
        adminFactory: vi.fn(() => healthAdmin),
        consoleObj: { error: vi.fn(), log: vi.fn() },
        env: { DATABASE_URL: ':memory:' },
        loadEnvironmentFilesImpl: vi.fn(),
      })
      expect(healthExitCode).toBe(0)
      expect(healthAdmin.health).toHaveBeenCalledTimes(1)

      const waitAdmin = baseAdmin()
      const waitLog = vi.fn()
      const waitExitCode = await main(['wait', '2500'], {
        adminFactory: vi.fn(() => waitAdmin),
        consoleObj: { error: vi.fn(), log: waitLog },
        env: { DATABASE_URL: ':memory:' },
        loadEnvironmentFilesImpl: vi.fn(),
      })
      expect(waitExitCode).toBe(0)
      expect(waitAdmin.health).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalledWith('Database is ready.')

      const resetAdmin = baseAdmin()
      const resetLog = vi.fn()
      const resetExitCode = await main(['reset'], {
        adminFactory: vi.fn(() => resetAdmin),
        consoleObj: { error: vi.fn(), log: resetLog },
        env: { DATABASE_URL: ':memory:' },
        loadEnvironmentFilesImpl: vi.fn(),
      })
      expect(resetExitCode).toBe(0)
      expect(resetAdmin.reset).toHaveBeenCalledTimes(1)
      expect(resetLog).toHaveBeenCalledWith('Database reset completed.')

      const migrateAdmin = baseAdmin()
      const migrateExitCode = await main(['migrate'], {
        adminFactory: vi.fn(() => migrateAdmin),
        consoleObj: { error: vi.fn(), log: vi.fn() },
        cwd: tempDir,
        env: { DATABASE_URL: ':memory:' },
        loadEnvironmentFilesImpl: vi.fn(),
      })
      expect(migrateExitCode).toBe(0)
      expect(migrateAdmin.runStatements).toHaveBeenCalled()

      const execAdmin = baseAdmin()
      const execLog = vi.fn()
      const execExitCode = await main(['exec-file', 'sql/extra.sql'], {
        adminFactory: vi.fn(() => execAdmin),
        consoleObj: { error: vi.fn(), log: execLog },
        cwd: tempDir,
        env: { DATABASE_URL: ':memory:' },
        loadEnvironmentFilesImpl: vi.fn(),
      })
      expect(execExitCode).toBe(0)
      expect(execAdmin.execScript).toHaveBeenCalledWith('SELECT 1;')
      expect(execLog).toHaveBeenCalledWith('Executed SQL from sql/extra.sql')
    } finally {
      consoleSpy.mockRestore()
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('returns usage errors for missing commands and missing exec-file paths', async () => {
    const emptyCommandError = vi.fn()
    const emptyCommandExitCode = await main([], {
      consoleObj: { error: emptyCommandError, log: vi.fn() },
      env: {},
      loadEnvironmentFilesImpl: vi.fn(),
    })

    expect(emptyCommandExitCode).toBe(1)
    expect(emptyCommandError).toHaveBeenCalledWith(
      'Usage: node scripts/db-admin.mjs <wait|health|reset|migrate|seed|exec-file>',
    )

    const admin = {
      close: vi.fn(async () => {}),
      execScript: vi.fn(async () => {}),
    }
    const missingArgError = vi.fn()
    const missingArgExitCode = await main(['exec-file'], {
      adminFactory: vi.fn(() => admin),
      consoleObj: { error: missingArgError, log: vi.fn() },
      env: { DATABASE_URL: ':memory:' },
      loadEnvironmentFilesImpl: vi.fn(),
    })

    expect(missingArgExitCode).toBe(1)
    expect(missingArgError).toHaveBeenCalledWith(
      'Usage: node scripts/db-admin.mjs exec-file <path>',
    )
    expect(admin.close).toHaveBeenCalledTimes(1)
  })

  it('prints usage for unsupported commands before requiring a database URL', async () => {
    const error = vi.fn()
    const loadEnvironmentFilesImpl = vi.fn()

    const exitCode = await main(['studio'], {
      consoleObj: { error, log: vi.fn() },
      env: {},
      loadEnvironmentFilesImpl,
    })

    expect(exitCode).toBe(1)
    expect(loadEnvironmentFilesImpl).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(
      'Usage: node scripts/db-admin.mjs <wait|health|reset|migrate|seed|exec-file>',
    )
  })

  it('awaits admin.close in finally when a command handler throws', async () => {
    let closeAwaited = false
    const admin = {
      close: vi.fn(async () => {
        await Promise.resolve()
        closeAwaited = true
      }),
      health: vi.fn(async () => {
        throw new Error('health failed')
      }),
    }
    const error = vi.fn()

    const exitCode = await main(['health'], {
      adminFactory: vi.fn(() => admin),
      consoleObj: { error, log: vi.fn() },
      env: { DATABASE_URL: ':memory:' },
      loadEnvironmentFilesImpl: vi.fn(),
    })

    expect(exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith('health failed')
    expect(admin.close).toHaveBeenCalledTimes(1)
    expect(closeAwaited).toBe(true)
  })
})
