import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import {
  loadMigrationDescriptors,
  main,
  resetSqlServerDatabase,
  runSqlServerMigrations,
  seedSqlServerDatabase,
} from '@/scripts/db-sqlserver-admin.mjs'
import { resolveSqlIntegrationTestsUrl } from './helpers/sql-test-database'

describe('one-time optional catalog command', () => {
  let source: ReturnType<typeof createAppDataSource>
  beforeEach(async () => {
    await resetSqlServerDatabase(resolveSqlIntegrationTestsUrl())
    await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
      expectedRuntimeUsers: [],
    })
    source = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
    await source.initialize()
  })
  afterEach(async () => source?.destroy())

  const initialize = async () => {
    const output: string[] = []
    const diagnostics: string[] = []
    const exit = await main(['seed:optional', '--json'], {
      configureReadonlyAccess: false,
      env: {
        ...process.env,
        DB_MIGRATION_USER: '',
        DB_MIGRATION_PASSWORD: '',
        DATABASE_URL: resolveSqlIntegrationTestsUrl(),
        DB_SEED_RUN_ID: 'optional-test',
        RELEASE_VERSION: 'test-release',
      },
      consoleObj: {
        log: (text: string) => output.push(text),
        error: (text: string) => diagnostics.push(text),
      },
    })
    return { exit, report: JSON.parse(output.join('')), diagnostics }
  }

  it('initializes a fresh database once and preserves later omissions', async () => {
    await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
      configureReadonlyAccess: false,
    })
    expect(await source.query('SELECT * FROM requirement_types')).toEqual([])
    const first = await initialize()
    expect(first.exit).toBe(0)
    expect(first.report).toMatchObject({
      version: 1,
      operation: 'seed:optional',
      runId: 'optional-test',
      release: 'test-release',
      optional: { transaction: 'committed', initialization: 'initialized' },
    })
    expect(first.report.counts.inserted).toBeGreaterThan(0)
    expect(await source.query('SELECT id FROM requirement_types')).toHaveLength(
      2,
    )
    await source.query(
      'DELETE FROM specification_implementation_types WHERE id = 1',
    )
    const second = await initialize()
    expect(second.report.optional.initialization).toBe('already_complete')
    expect(second.report.counts.inserted).toBe(0)
    await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
      configureReadonlyAccess: false,
    })
    expect(
      await source.query(
        'SELECT id FROM specification_implementation_types WHERE id = 1',
      ),
    ).toEqual([])
    expect(
      await source.query(
        'SELECT id FROM optional_catalog_initializations WHERE completed_at IS NOT NULL',
      ),
    ).toEqual([{ id: 1 }])
  })

  it('resolves equivalent type and parent entries under existing surrogate IDs', async () => {
    await source.query(`SET IDENTITY_INSERT requirement_types ON;
      INSERT INTO requirement_types (id, name_sv, name_en) VALUES (901, N'Funktionellt', N'Functional');
      SET IDENTITY_INSERT requirement_types OFF;
      SET IDENTITY_INSERT quality_characteristics ON;
      INSERT INTO quality_characteristics (id, name_sv, name_en, requirement_type_id, parent_id, chapter_id)
        VALUES (902, N'Funktionell lämplighet', N'Functional suitability', 901, NULL, N'3.1');
      SET IDENTITY_INSERT quality_characteristics OFF;`)
    const result = await initialize()
    expect(result.exit).toBe(0)
    expect(result.report.counts.unchanged).toBe(2)
    expect(
      await source.query(
        'SELECT requirement_type_id, parent_id FROM quality_characteristics WHERE id = 2',
      ),
    ).toEqual([{ requirement_type_id: 901, parent_id: 902 }])
    expect(
      await source.query('SELECT id FROM quality_characteristics'),
    ).toHaveLength(49)
  })

  it('rolls back catalog writes on conflict, then permits a corrected retry', async () => {
    await source.query(`SET IDENTITY_INSERT requirement_types ON;
      INSERT INTO requirement_types (id, name_sv, name_en) VALUES (1, N'Egen', N'Custom');
      SET IDENTITY_INSERT requirement_types OFF;`)
    const failed = await initialize()
    expect(failed.exit).toBe(1)
    expect(failed.report).toMatchObject({
      status: 'failed',
      counts: { inserted: 0 },
      optional: { transaction: 'rolled_back' },
      error: {
        code: 'OPTIONAL_SEED_CONFLICT',
        logicalRecord: 'requirement_types:id=1',
      },
    })
    expect(
      await source.query('SELECT id FROM specification_implementation_types'),
    ).toEqual([])
    expect(
      await source.query(
        'SELECT completed_at FROM optional_catalog_initializations',
      ),
    ).toEqual([{ completed_at: null }])
    await source.query('DELETE FROM requirement_types WHERE id = 1')
    expect((await initialize()).exit).toBe(0)
  })

  it('leaves completion unset after an unexpected late database failure', async () => {
    await source.query(`CREATE TRIGGER optional_test_failure ON quality_characteristics AFTER INSERT AS
      BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id = 49) THROW 51000, 'optional test failure', 1; END`)
    const failed = await initialize()
    expect(failed.exit).toBe(1)
    expect(failed.report.counts.inserted).toBe(0)
    expect(await source.query('SELECT id FROM requirement_types')).toEqual([])
    expect(
      await source.query(
        'SELECT completed_at FROM optional_catalog_initializations',
      ),
    ).toEqual([{ completed_at: null }])
    await source.query('DROP TRIGGER optional_test_failure')
    expect((await initialize()).exit).toBe(0)
  })

  it('recovers in another command process after interruption before completion', async () => {
    const start = (interrupt: boolean) =>
      fork(
        'tests/sql-integration/helpers/optional-initialization-worker.mjs',
        [],
        {
          silent: true,
          env: {
            ...process.env,
            DATABASE_URL: resolveSqlIntegrationTestsUrl(),
            DB_MIGRATION_USER: '',
            DB_MIGRATION_PASSWORD: '',
            INTERRUPT_OPTIONAL_INITIALIZATION: interrupt ? '1' : '0',
          },
        },
      )
    const interrupted = start(true)
    try {
      await Promise.race([
        once(interrupted, 'message'),
        once(interrupted, 'exit').then(() => {
          throw new Error('Initializer exited before interruption point')
        }),
      ])
    } finally {
      interrupted.kill('SIGKILL')
      await once(interrupted, 'exit')
    }
    expect(await source.query('SELECT id FROM requirement_types')).toEqual([])
    expect(
      await source.query(
        'SELECT completed_at FROM optional_catalog_initializations',
      ),
    ).toEqual([{ completed_at: null }])
    // A migration rerun must preserve the durable pending state.
    await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
      expectedRuntimeUsers: [],
    })
    const retry = start(false)
    let stdout = ''
    retry.stdout?.on('data', chunk => {
      stdout += chunk
    })
    expect((await once(retry, 'exit'))[0]).toBe(0)
    expect(JSON.parse(stdout).optional.initialization).toBe('initialized')
    expect(
      await source.query('SELECT id FROM quality_characteristics'),
    ).toHaveLength(49)
  })

  it.each([50, 70])(
    'preserves existing customization and omissions when upgrading from migration %i',
    async count => {
      await source.destroy()
      await resetSqlServerDatabase(resolveSqlIntegrationTestsUrl())
      const descriptors = await loadMigrationDescriptors()
      await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
        migrationDescriptors: descriptors.slice(0, count),
        expectedRuntimeUsers: [],
        reconcileRuntimePermissionsImpl: async () => ({}),
      })
      source = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
      await source.initialize()
      await source.query(`SET IDENTITY_INSERT specification_implementation_types ON;
      INSERT INTO specification_implementation_types (id, name_sv, name_en) VALUES (1, N'Egen', N'Custom');
      SET IDENTITY_INSERT specification_implementation_types OFF;`)
      await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
        expectedRuntimeUsers: [],
      })
      await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
        configureReadonlyAccess: false,
      })
      const result = await initialize()
      expect(result.exit).toBe(0)
      expect(result.report.optional.initialization).toBe('already_complete')
      expect(
        await source.query(
          'SELECT id, name_en FROM specification_implementation_types',
        ),
      ).toEqual([{ id: 1, name_en: 'Custom' }])
      expect(await source.query('SELECT id FROM requirement_types')).toEqual([])
      expect((await initialize()).report.counts.inserted).toBe(0)
    },
  )
})

import { fork } from 'node:child_process'
import { once } from 'node:events'
