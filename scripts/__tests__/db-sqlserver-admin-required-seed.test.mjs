import { describe, expect, it, vi } from 'vitest'
import { main, seedSqlServerDatabase } from '../db-sqlserver-admin.mjs'

const url = 'mssql://test:public-test-password@localhost/seed_tests'
const env = {
  DATABASE_URL: url,
  DB_MIGRATION_USER: '',
  DB_MIGRATION_PASSWORD: '',
  DB_SEED_RUN_ID: 'test-run',
  RELEASE_VERSION: 'test-release',
}

function database(options = {}) {
  let nextId = 0
  let runnerNumber = 0
  class Source {
    initialize = vi.fn(async () => {
      if (options.initializeError) throw options.initializeError
    })
    destroy = vi.fn(async () => {
      if (options.destroyError) throw options.destroyError
    })
    createQueryRunner() {
      const currentRunner = ++runnerNumber
      return {
        isTransactionActive: true,
        connect: async () => {
          if (options.connectError) throw options.connectError
        },
        startTransaction: async () => {},
        commitTransaction: async () => {
          if (options.commitError) throw options.commitError
        },
        rollbackTransaction: async () => {
          if (options.rollbackError) throw options.rollbackError
        },
        release: async () => {
          if (
            options.releaseError &&
            (!options.releaseAfter || options.releaseAfter === currentRunner)
          )
            throw options.releaseError
        },
        query: async (sql, params) => {
          const result = options.queryResult?.(sql, params)
          if (result !== undefined) return result
          if (options.failTable && sql.includes(`[${options.failTable}]`))
            throw options.queryError
          if (sql.startsWith('SELECT [completed_at]'))
            return options.missingState
              ? []
              : [{ completed_at: options.completedAt ?? null }]
          if (sql.includes('OUTPUT INSERTED.'))
            return options.invalidInsertResult ? [] : [{ id: ++nextId }]
          return []
        },
      }
    }
  }
  return {
    dataSourceCtor: Source,
    configureReadonlyAccess: false,
    env: { ...env },
  }
}

describe('required seed command results', () => {
  it('emits one JSON document and a separate human summary with run correlation', async () => {
    const log = vi.fn()
    const error = vi.fn()
    const exit = await main(['seed:required', '--json'], {
      ...database(),
      consoleObj: { log, error },
    })
    expect(exit).toBe(0)
    expect(log).toHaveBeenCalledOnce()
    const report = JSON.parse(log.mock.calls[0][0])
    expect(report).toMatchObject({
      version: 1,
      status: 'completed',
      runId: 'test-run',
      release: 'test-release',
      required: { transaction: 'committed' },
    })
    expect(report.counts.inserted).toBeGreaterThan(35)
    expect(report.insertedRows).toBe(report.counts.inserted)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        `${report.counts.inserted} inserted, 0 updated/repaired`,
      ),
    )
    expect(report.completedAt).toEqual(expect.any(String))
  })

  it('preserves the original SQL failure when rollback, release and destruction also fail', async () => {
    const original = new Error('SQL failed')
    const rollbackError = new Error('rollback unavailable')
    const releaseError = new Error('release unavailable')
    const cleanupError = new Error('destroy unavailable')
    const failure = await seedSqlServerDatabase(
      url,
      database({
        failTable: 'ai_safety_rules',
        queryError: original,
        rollbackError,
        releaseError,
        destroyError: cleanupError,
      }),
    ).catch(error => error)
    expect(failure.cause).toBe(original)
    expect(failure.rollbackError).toBe(rollbackError)
    expect(failure.releaseError).toBe(releaseError)
    expect(failure.cleanupError).toBe(cleanupError)
    expect(failure.seedCommandResult.required.transaction).toBe('unknown')
    expect(failure.seedCommandResult.counts).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    })
  })

  it('does not claim rollback or committed counts when commit acknowledgement fails', async () => {
    const original = new Error('commit acknowledgement lost')
    const failure = await seedSqlServerDatabase(
      url,
      database({ commitError: original }),
    ).catch(error => error)
    expect(failure).toBe(original)
    expect(failure.seedCommandResult.required.transaction).toBe('unknown')
    expect(failure.seedCommandResult.counts.inserted).toBe(0)
  })

  it.each(['releaseError', 'destroyError'])(
    'retains committed counts on %s',
    async field => {
      const original = new Error('cleanup unavailable')
      const failure = await seedSqlServerDatabase(
        url,
        database({ [field]: original }),
      ).catch(error => error)
      expect(failure).toBe(original)
      expect(failure.seedCommandResult).toMatchObject({
        status: 'failed',
        required: { transaction: 'committed' },
      })
      expect(failure.seedCommandResult.counts.inserted).toBeGreaterThan(35)
    },
  )

  it.each(['initializeError', 'connectError'])(
    'reports no writes on %s',
    async field => {
      const failure = await seedSqlServerDatabase(
        url,
        database({ [field]: new Error('connection unavailable') }),
      ).catch(error => error)
      expect(failure.seedCommandResult.required.transaction).toBe('not_started')
      expect(failure.seedCommandResult.counts.inserted).toBe(0)
    },
  )

  it('rejects an insert result that cannot establish the saved identity', async () => {
    const failure = await seedSqlServerDatabase(
      url,
      database({ invalidInsertResult: true }),
    ).catch(error => error)
    expect(failure.message).toContain('exactly one persisted ID')
    expect(failure.seedCommandResult.required.transaction).toBe('rolled_back')
  })

  it('returns parseable evidence when configuration resolution fails', async () => {
    const log = vi.fn()
    const error = vi.fn()
    const exit = await main(['seed:required', '--json'], {
      env: { ...env, DB_MIGRATION_USER: 'incomplete' },
      consoleObj: { log, error },
    })
    expect(exit).toBe(1)
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      status: 'failed',
      phase: 'prepare',
      error: { code: 'SEED_CONFIGURATION_FAILED' },
    })
  })
})

describe('optional seed command results', () => {
  it('dispatches production initialization with parseable committed evidence', async () => {
    const log = vi.fn()
    const error = vi.fn()
    const dependencies = database()
    const exit = await main(['seed:optional', '--json'], {
      ...dependencies,
      env: { ...dependencies.env, KRAVHANTERING_DB_ADMIN_IMAGE: 'db-job' },
      consoleObj: { log, error },
    })
    expect(exit).toBe(0)
    expect(log).toHaveBeenCalledOnce()
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      operation: 'seed:optional',
      status: 'completed',
      optional: { transaction: 'committed', initialization: 'initialized' },
      counts: { inserted: 61, unchanged: 0 },
    })
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('initialization: initialized'),
    )
  })

  it('accepts an equivalent logical entry under another ID', async () => {
    const result = await seedSqlServerDatabase(url, {
      ...database({
        queryResult: (sql, params) =>
          sql.includes('FROM [requirement_types]') && params?.[0] === 1
            ? [{ id: 901, name_sv: 'Funktionellt', name_en: 'Functional' }]
            : undefined,
      }),
      profile: 'optional',
    })
    expect(result.optional.entries).toContainEqual({
      table: 'requirement_types',
      identity: 'id=1',
      id: 901,
      outcome: 'unchanged',
    })
    expect(result.counts).toMatchObject({ inserted: 60, unchanged: 1 })
  })

  it.each([
    [{ id: 1, name_sv: 'Egen', name_en: 'Custom' }],
    [
      { id: 901, name_sv: 'Funktionellt', name_en: 'Functional' },
      { id: 902, name_sv: 'Funktionellt', name_en: 'Functional' },
    ],
  ])('rejects an inconsistent or ambiguous entry', async (...rows) => {
    const failure = await seedSqlServerDatabase(url, {
      ...database({
        queryResult: (sql, params) =>
          sql.includes('FROM [requirement_types]') && params?.[0] === 1
            ? rows
            : undefined,
      }),
      profile: 'optional',
    }).catch(error => error)
    expect(failure.seedCommandResult).toMatchObject({
      status: 'failed',
      optional: { transaction: 'rolled_back', initialization: 'incomplete' },
      counts: { inserted: 0 },
      error: { code: 'OPTIONAL_SEED_CONFLICT' },
    })
  })

  it('reports a completed initialization as a no-op', async () => {
    const result = await seedSqlServerDatabase(url, {
      ...database({ completedAt: new Date() }),
      profile: 'optional',
    })
    expect(result.optional).toMatchObject({
      initialization: 'already_complete',
      transaction: 'committed',
      entries: [],
    })
    expect(result.counts).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    })
  })

  it('rejects initialization without migrated state', async () => {
    const failure = await seedSqlServerDatabase(url, {
      ...database({ missingState: true }),
      profile: 'optional',
    }).catch(error => error)
    expect(failure.seedCommandResult).toMatchObject({
      status: 'failed',
      optional: { transaction: 'rolled_back', initialization: 'incomplete' },
      counts: { inserted: 0 },
    })
  })

  it.each(['commitError', 'releaseError', 'destroyError'])(
    'preserves the optional transaction outcome on %s',
    async field => {
      const failure = await seedSqlServerDatabase(url, {
        ...database({ [field]: new Error('connection failure') }),
        profile: 'optional',
      }).catch(error => error)
      const uncertain = field === 'commitError'
      expect(failure.seedCommandResult).toMatchObject({
        status: 'failed',
        optional: {
          transaction: uncertain ? 'unknown' : 'committed',
          initialization: uncertain ? 'unknown' : 'initialized',
        },
        counts: { inserted: uncertain ? 0 : 61 },
      })
    },
  )

  it('returns parseable optional configuration failures', async () => {
    const log = vi.fn()
    expect(
      await main(['seed:optional', '--json'], {
        env: { ...env, DB_MIGRATION_USER: 'incomplete' },
        consoleObj: { log, error: vi.fn() },
      }),
    ).toBe(1)
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      operation: 'seed:optional',
      status: 'failed',
      optional: { transaction: 'not_started' },
    })
  })
})
