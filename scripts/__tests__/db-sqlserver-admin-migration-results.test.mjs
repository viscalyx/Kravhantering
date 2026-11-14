import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../db-sqlserver-admin.mjs'

const migration = { name: 'Example1700000000000', timestamp: 1700000000000 }

function command({
  permissionError,
  cleanupError,
  initializeError,
  migrationError,
  committedBeforeError,
  commitUncertain,
  entries = [],
  env = {},
  postCheckError,
} = {}) {
  const output = []
  const diagnostics = []
  let applied = false
  class Source {
    constructor(options) {
      this.options = options
    }
    async initialize() {
      if (initializeError) throw initializeError
    }
    async destroy() {
      if (cleanupError) throw cleanupError
    }
    async runMigrations() {
      this.options.kravhanteringMigrationEntries.push(...entries)
      if (commitUncertain || committedBeforeError)
        for (const subscriber of this.subscribers)
          subscriber.beforeTransactionCommit({
            queryRunner: { transactionDepth: 1 },
          })
      if (committedBeforeError)
        for (const subscriber of this.subscribers)
          subscriber.afterTransactionCommit({
            queryRunner: { transactionDepth: 1, isTransactionActive: false },
          })
      if (migrationError) {
        for (const subscriber of this.subscribers)
          subscriber.afterTransactionRollback({
            queryRunner: { transactionDepth: 1, isTransactionActive: false },
          })
        throw migrationError
      }
      applied = true
      return [migration]
    }
  }
  class Executor {
    async getExecutedMigrations() {
      if (applied && postCheckError) throw postCheckError
      return applied ? [migration] : []
    }
    async getPendingMigrations() {
      return applied ? [] : [migration]
    }
  }
  return main(['migrate', '--json'], {
    env: {
      DATABASE_URL: 'mssql://job:password@localhost:1433/test',
      DB_RUNTIME_USER: 'app',
      DB_MIGRATION_RUN_ID: 'deployment-attempt-1',
      RELEASE_VERSION: 'test-release',
      ...env,
    },
    dataSourceCtor: Source,
    migrationExecutorCtor: Executor,
    migrationDescriptors: [
      {
        ...migration,
        classRef: class {},
        fileName: '0001_example.mjs',
        fileIndex: 0,
      },
    ],
    reconcileRuntimePermissionsImpl: async () => {
      if (permissionError) throw permissionError
      return { compatible: true }
    },
    consoleObj: {
      log: value => output.push(value),
      error: value => diagnostics.push(value),
    },
  }).then(exit => ({ exit, output, diagnostics }))
}

describe('migration command evidence', () => {
  beforeEach(() =>
    vi
      .spyOn(process, 'cwd')
      .mockReturnValue('/tmp/kravhantering-test-without-env-files'),
  )
  afterEach(() => vi.restoreAllMocks())
  it('retains committed migrations and the original permission failure through cleanup failure', async () => {
    const result = await command({
      permissionError: new Error('permission failed'),
      cleanupError: new Error('cleanup failed'),
    })
    expect(result.exit).toBe(1)
    expect(JSON.parse(result.output.join(''))).toMatchObject({
      version: 1,
      operation: 'migrate',
      runId: 'deployment-attempt-1',
      release: 'test-release',
      status: 'failed',
      phase: 'permissions',
      migration: { transaction: 'committed', applied: [migration] },
      migrationsApplied: 1,
      permissions: { status: 'failed' },
      error: { message: 'permission failed' },
      cleanupError: { message: 'cleanup failed' },
    })
    expect(result.diagnostics.join('\n')).toContain('migrations: committed')
  })
  it.each([
    [
      { initializeError: new Error('connect failed') },
      'prepare',
      'not_started',
    ],
    [
      { migrationError: new Error('write failed') },
      'migrations',
      'rolled_back',
    ],
    [
      {
        migrationError: new Error('commit acknowledgement lost'),
        commitUncertain: true,
      },
      'migrations',
      'unknown',
    ],
    [
      {
        migrationError: new Error('runner release failed'),
        committedBeforeError: true,
      },
      'migrations',
      'committed',
    ],
    [
      { postCheckError: new Error('post-check failed') },
      'post_check',
      'committed',
    ],
    [{ cleanupError: new Error('cleanup failed') }, 'cleanup', 'committed'],
  ])(
    'reports phase and confirmed transaction outcome for %j',
    async (options, phase, transaction) => {
      const result = await command(options)
      const report = JSON.parse(result.output.join(''))
      expect(result.exit).toBe(1)
      expect(report).toMatchObject({
        status: 'failed',
        phase,
        migration: { transaction },
        migrationsApplied: transaction === 'committed' ? 1 : 0,
      })
      expect(report.completedAt).toEqual(expect.any(String))
    },
  )

  it('publishes expected omissions separately from successful inserts', async () => {
    const result = await command({
      entries: [
        { logicalId: 'catalog:parent', outcome: 'inserted' },
        {
          logicalId: 'catalog:child',
          outcome: 'skipped',
          reason: 'identity_conflict',
          dependencyCause: 'catalog:dependency',
          requiredAction: 'Use a deliberate later migration.',
          automaticRetry: false,
        },
      ],
    })
    expect(result.exit).toBe(0)
    expect(JSON.parse(result.output.join(''))).toMatchObject({
      status: 'completed_with_omissions',
      migration: { counts: { inserted: 1, skipped: 1 } },
    })
    expect(result.diagnostics.join('')).toContain(
      'catalog:child: identity_conflict (dependency: catalog:dependency)',
    )
    expect(result.diagnostics.join('')).toContain('No automatic retry')
  })

  it('does not publish attempted entries or omissions after rollback', async () => {
    const result = await command({
      migrationError: new Error('write failed'),
      entries: [{ outcome: 'inserted' }, { outcome: 'skipped' }],
    })
    expect(JSON.parse(result.output.join('')).migration).toMatchObject({
      entries: [],
      counts: { inserted: 0, skipped: 0 },
    })
  })

  it.each([{ DATABASE_URL: 'invalid' }, { DB_RUNTIME_USER: '' }])(
    'emits failure JSON before connection for %j',
    async env => {
      const result = await command({ env })
      expect(result.exit).toBe(1)
      expect(JSON.parse(result.output.join(''))).toMatchObject({
        status: 'failed',
        phase: 'prepare',
        migration: { transaction: 'not_started' },
      })
    },
  )
})
