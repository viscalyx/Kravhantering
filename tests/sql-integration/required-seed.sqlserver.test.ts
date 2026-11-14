import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getRequirementListColumnDefaults,
  updateRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import {
  main,
  resetSqlServerDatabase,
  runSqlServerMigrations,
  seedSqlServerDatabase,
} from '@/scripts/db-sqlserver-admin.mjs'
import { resolveSqlIntegrationTestsUrl } from './helpers/sql-test-database'

describe('required seed command', () => {
  let source: ReturnType<typeof createAppDataSource>
  const database = () => source
  const reset = async () => {
    await resetSqlServerDatabase(resolveSqlIntegrationTestsUrl())
    await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
      expectedRuntimeUsers: [],
    })
  }
  beforeEach(async () => {
    await reset()
    source = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
    await source.initialize()
  })
  afterEach(async () => {
    await source?.destroy()
  })
  afterAll(reset)
  const run = async () => {
    const result = await seedSqlServerDatabase(
      resolveSqlIntegrationTestsUrl(),
      {
        configureReadonlyAccess: false,
      },
    )
    if (!result.required)
      throw new Error('Missing required reconciliation report')
    return { ...result, required: result.required }
  }

  it('reports committed outcomes and makes an identical rerun a no-op', async () => {
    const first = await run()
    expect(first.required.counts.inserted).toBeGreaterThan(0)
    const before = await database().query(
      'SELECT * FROM ai_safety_rule_terms ORDER BY id',
    )
    const second = await run()
    expect(second.required).toMatchObject({
      transaction: 'committed',
      counts: { inserted: 0, updated: 0, skipped: 0 },
    })
    expect(second.required.counts.unchanged).toBeGreaterThan(0)
    expect(
      await database().query('SELECT * FROM ai_safety_rule_terms ORDER BY id'),
    ).toEqual(before)
  })

  it('preserves logical identities, settings and custom AI term overrides during adoption', async () => {
    await run()
    await database().query(
      `UPDATE ai_run_profiles SET id = '20000000-0000-4000-8000-000000000001', queue_capacity = 77, configuration_version = 8 WHERE profile_key = 'generation_without_images'`,
    )
    await database().query(
      `UPDATE archiving_retention_policies SET age_days = 999, is_enabled = 0 WHERE policy_key = 'unused_taxonomy_delete'`,
    )
    await database().query(
      `UPDATE requirement_statuses SET name_en = N'Custom draft', color = N'#abcdef', sort_order = 99, is_system = 0 WHERE id = 1`,
    )
    await database().query(
      `UPDATE application_settings SET csv_export_max_items = 17 WHERE id = 1`,
    )
    await database().query(
      `UPDATE ai_settings SET mcp_import_max_rows = 31 WHERE id = 1`,
    )
    const [term] = await database().query(
      'SELECT TOP (1) * FROM ai_safety_rule_terms ORDER BY id',
    )
    await database().transaction(async manager => {
      await manager.query(
        `SET IDENTITY_INSERT ai_safety_rules ON;
        INSERT INTO ai_safety_rules (id, rule_id, category, name_sv, name_en, description_sv, description_en, pattern_kind, window_chars, sort_order, created_at, updated_at)
        SELECT 900, rule_id + '_moved', category, name_sv, name_en, description_sv, description_en, pattern_kind, window_chars, sort_order, created_at, updated_at FROM ai_safety_rules WHERE id = @0;
        SET IDENTITY_INSERT ai_safety_rules OFF;
        UPDATE ai_safety_rule_terms SET rule_id = 900 WHERE rule_id = @0;
        DELETE FROM ai_safety_rules WHERE id = @0;
        UPDATE ai_safety_rules SET rule_id = LEFT(rule_id, LEN(rule_id) - 6) WHERE id = 900;`,
        [term.rule_id],
      )
      await manager.query(
        `INSERT INTO ai_safety_rule_terms (rule_id, term_type, term_text, normalized_term, direction, standard_direction, is_standard, is_active, sort_order, created_at, updated_at)
        VALUES (900, @0, N'Company only', N'company only', N'output', N'output', 0, 0, 999, '2020-01-01', '2020-01-01')`,
        [term.term_type],
      )
    })
    const [custom] = await database().query(
      `SELECT * FROM ai_safety_rule_terms WHERE normalized_term = N'company only'`,
    )
    const columns = await getRequirementListColumnDefaults(database())
    await updateRequirementListColumnDefaults(
      database(),
      columns.map((column, index) => ({
        ...column,
        sortOrder: columns.length - index,
        defaultVisible: column.columnId === 'description',
      })),
    )
    const savedLayout = await database().query(
      'SELECT * FROM requirement_list_column_defaults ORDER BY id',
    )
    await database().query(
      `UPDATE ai_safety_rule_terms SET is_standard = 0, is_active = 0, direction = N'output', sort_order = 999, updated_at = '2020-01-01' WHERE id = @0`,
      [term.id],
    )
    const policies = await database().query(
      'SELECT * FROM archiving_retention_policies ORDER BY id',
    )
    const profiles = await database().query(
      'SELECT * FROM ai_run_profiles ORDER BY profile_key',
    )
    const app = await database().query('SELECT * FROM application_settings')
    const ai = await database().query('SELECT * FROM ai_settings')

    const result = await run()
    expect(result.required.counts.updated).toBe(2)
    expect(
      await database().query(
        'SELECT * FROM requirement_list_column_defaults ORDER BY id',
      ),
    ).toEqual(savedLayout)
    expect(
      await database().query(
        'SELECT * FROM ai_safety_rule_terms WHERE id = @0',
        [custom.id],
      ),
    ).toEqual([custom])
    expect(
      await database().query(
        'SELECT rule_id FROM ai_safety_rule_terms WHERE id = @0',
        [term.id],
      ),
    ).toEqual([{ rule_id: 900 }])
    expect(
      await database().query(
        'SELECT * FROM archiving_retention_policies ORDER BY id',
      ),
    ).toEqual(policies)
    expect(
      await database().query(
        'SELECT * FROM ai_run_profiles ORDER BY profile_key',
      ),
    ).toEqual(profiles)
    expect(
      await database().query('SELECT * FROM application_settings'),
    ).toEqual(app)
    expect(await database().query('SELECT * FROM ai_settings')).toEqual(ai)
    expect(
      await database().query(
        'SELECT name_en, color, sort_order, is_system FROM requirement_statuses WHERE id = 1',
      ),
    ).toEqual([
      {
        name_en: 'Custom draft',
        color: '#abcdef',
        sort_order: 99,
        is_system: true,
      },
    ])
    const [adopted] = await database().query(
      'SELECT * FROM ai_safety_rule_terms WHERE id = @0',
      [term.id],
    )
    expect(adopted).toMatchObject({
      is_standard: true,
      is_active: false,
      direction: 'output',
      created_at: term.created_at,
      sort_order: term.sort_order,
    })
    expect(adopted.updated_at.getTime()).toBeGreaterThan(
      new Date('2020-01-01').getTime(),
    )
    expect((await run()).required.counts.updated).toBe(0)
  })

  it('restores missing fixed identities and accepts natural identities under different numeric IDs', async () => {
    await run()
    await database().transaction(async manager => {
      await manager.query(
        `DELETE FROM requirement_status_transitions WHERE from_requirement_status_id = 2 AND to_requirement_status_id = 4`,
      )
      await manager.query(`SET IDENTITY_INSERT requirement_status_transitions ON;
        INSERT INTO requirement_status_transitions (id, from_requirement_status_id, to_requirement_status_id) VALUES (900, 2, 4);
        SET IDENTITY_INSERT requirement_status_transitions OFF;`)
      await manager.query(
        `DELETE FROM archiving_retention_policies WHERE policy_key = 'unused_taxonomy_delete'`,
      )
      await manager.query(`SET IDENTITY_INSERT archiving_retention_policies ON;
        INSERT INTO archiving_retention_policies (id, policy_key, information_set, action, age_days, status_condition, is_enabled, created_at, updated_at)
        VALUES (901, 'unused_taxonomy_delete', N'Custom', 'delete', 901, N'Custom', 0, '2020-01-01', '2020-01-01');
        SET IDENTITY_INSERT archiving_retention_policies OFF;`)
      await manager.query(
        'DELETE FROM specification_item_statuses WHERE id = 6',
      )
      await manager.query(
        'UPDATE specification_item_statuses SET sort_order = 6 WHERE id = 2',
      )
      await manager.query('DELETE FROM priority_levels WHERE id = 1')
      await manager.query(
        'DELETE FROM specification_lifecycle_statuses WHERE id = 3',
      )
    })
    const result = await run()
    expect(result.required.counts.inserted).toBe(3)
    expect(
      await database().query(
        `SELECT id, age_days FROM archiving_retention_policies WHERE policy_key = 'unused_taxonomy_delete'`,
      ),
    ).toEqual([{ id: 901, age_days: 901 }])
    expect(
      await database().query(
        'SELECT id FROM requirement_status_transitions WHERE from_requirement_status_id = 2 AND to_requirement_status_id = 4',
      ),
    ).toEqual([{ id: 900 }])
    expect(
      await database().query(
        'SELECT id, sort_order FROM specification_item_statuses WHERE id IN (2, 6) ORDER BY id',
      ),
    ).toEqual([
      { id: 2, sort_order: 6 },
      { id: 6, sort_order: 7 },
    ])
  })

  it('rolls back ordinary and AI changes after a later AI write fails', async () => {
    await run()
    await database().query(
      'UPDATE requirement_statuses SET is_system = 0 WHERE id = 1',
    )
    await database().query(
      `UPDATE ai_safety_rules SET name_en = N'Needs synchronization'`,
    )
    await database().query(`UPDATE ai_safety_rule_terms SET is_standard = 0`)
    const beforeRules = await database().query(
      'SELECT * FROM ai_safety_rules ORDER BY id',
    )
    const beforeTerms = await database().query(
      'SELECT * FROM ai_safety_rule_terms ORDER BY id',
    )
    // A database failure after earlier rule and term writes exercises the real driver.
    await database().query(`CREATE TRIGGER seed_test_late_failure ON ai_safety_rule_terms AFTER UPDATE AS
      BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id = (SELECT MAX(id) FROM ai_safety_rule_terms))
        THROW 51000, 'seed test late AI failure', 1; END`)
    try {
      const failure = await run().catch(error => error)
      expect(failure.message).toContain('seed test late AI failure')
      // The trigger aborts the server transaction before TypeORM's rollback.
      // A failed rollback acknowledgement must not claim a confirmed outcome.
      expect(failure.rollbackError).toBeDefined()
      expect(failure.seedCommandResult).toMatchObject({
        status: 'failed',
        required: { transaction: 'unknown' },
        counts: { inserted: 0, updated: 0, unchanged: 0, skipped: 0 },
      })
      expect(
        await database().query(
          'SELECT is_system FROM requirement_statuses WHERE id = 1',
        ),
      ).toEqual([{ is_system: false }])
      expect(
        await database().query('SELECT * FROM ai_safety_rules ORDER BY id'),
      ).toEqual(beforeRules)
      expect(
        await database().query(
          'SELECT * FROM ai_safety_rule_terms ORDER BY id',
        ),
      ).toEqual(beforeTerms)
    } finally {
      await database().query('DROP TRIGGER seed_test_late_failure')
    }
    expect((await run()).required.counts.updated).toBeGreaterThan(2)
  })

  it('returns parseable failure evidence and rolls back a conflicting fixed priority mapping', async () => {
    await run()
    await database().query(
      `UPDATE priority_levels SET code = N'CUSTOM' WHERE id = 1`,
    )
    await database().query(
      'UPDATE requirement_statuses SET is_system = 0 WHERE id = 1',
    )
    const output: string[] = []
    const diagnostics: string[] = []
    const exit = await main(['seed:required', '--json'], {
      configureReadonlyAccess: false,
      env: {
        ...process.env,
        DB_MIGRATION_USER: '',
        DB_MIGRATION_PASSWORD: '',
        DATABASE_URL: resolveSqlIntegrationTestsUrl(),
        DB_SEED_RUN_ID: 'seed-test-conflict',
        RELEASE_VERSION: 'test-release',
      },
      consoleObj: {
        log: (text: string) => output.push(text),
        error: (text: string) => diagnostics.push(text),
      },
    })
    expect(exit).toBe(1)
    const report = JSON.parse(output.join(''))
    expect(report).toMatchObject({
      version: 1,
      status: 'failed',
      runId: 'seed-test-conflict',
      release: 'test-release',
      required: { transaction: 'rolled_back' },
      error: {
        code: 'REQUIRED_SEED_CONFLICT',
        logicalRecord: 'priority_levels:id=1',
      },
    })
    expect(report.counts).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    })
    expect(diagnostics.join('\n')).toContain('0 inserted, 0 updated/repaired')
    expect(
      await database().query(
        'SELECT is_system FROM requirement_statuses WHERE id = 1',
      ),
    ).toEqual([{ is_system: false }])
  })

  it('rejects a missing fixed status whose shipped name is held by another ID', async () => {
    await run()
    await database().transaction(async manager => {
      await manager.query(
        'DELETE FROM specification_item_statuses WHERE id = 6',
      )
      await manager.query(`SET IDENTITY_INSERT specification_item_statuses ON;
        INSERT INTO specification_item_statuses (id, name_sv, name_en, color, sort_order) VALUES (906, N'Ej tillämpbar', N'Not Applicable', N'#6b7280', 6);
        SET IDENTITY_INSERT specification_item_statuses OFF;`)
    })
    const failure = await run().catch(error => error)
    expect(failure.seedCommandResult).toMatchObject({
      status: 'failed',
      required: { transaction: 'rolled_back' },
      error: {
        code: 'REQUIRED_SEED_CONFLICT',
        logicalRecord: 'specification_item_statuses:id=6',
      },
    })
    expect(failure.message).toContain('id=906')
    expect(
      await database().query(
        'SELECT id FROM specification_item_statuses WHERE name_en = @0',
        ['Not Applicable'],
      ),
    ).toEqual([{ id: 906 }])
  })
})
