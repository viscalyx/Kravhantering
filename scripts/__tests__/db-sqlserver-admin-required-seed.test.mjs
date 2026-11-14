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
        query: async sql => {
          if (options.failTable && sql.includes(`[${options.failTable}]`))
            throw options.queryError
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
      legacyOptional: { transaction: 'committed' },
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

  it('retains committed required work when the separate compatibility phase fails', async () => {
    const result = await seedSqlServerDatabase(
      url,
      database({
        failTable: 'specification_implementation_types',
        queryError: new Error('optional write failed'),
      }),
    ).catch(error => error.seedCommandResult)
    expect(result).toMatchObject({
      status: 'failed',
      phase: 'legacy_optional',
      required: { transaction: 'committed' },
      legacyOptional: { transaction: 'rolled_back', counts: { inserted: 0 } },
    })
    expect(result.counts).toEqual(result.required.counts)
    expect(result.counts.inserted).toBeGreaterThan(35)
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

  it('includes optional committed work when its post-commit release fails', async () => {
    const failure = await seedSqlServerDatabase(
      url,
      database({
        releaseError: new Error('second release failed'),
        releaseAfter: 2,
      }),
    ).catch(error => error)
    const report = failure.seedCommandResult
    expect(report.legacyOptional).toMatchObject({
      transaction: 'committed',
      counts: { inserted: 61 },
    })
    expect(report.counts.inserted - report.required.counts.inserted).toBe(61)
    expect(report.status).toBe('failed')
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
