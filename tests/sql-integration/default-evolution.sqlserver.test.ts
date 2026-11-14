import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import {
  loadMigrationDescriptors,
  main,
  resetSqlServerDatabase,
  runSqlServerMigrations,
  seedSqlServerDatabase,
} from '@/scripts/db-sqlserver-admin.mjs'
import { evolveDefaults } from '@/typeorm/default-evolution-v1.mjs'
import { resolveSqlIntegrationTestsUrl } from './helpers/sql-test-database'

// Test-only release fixtures exercise real catalog fields without shipping new defaults.
class AddCatalog1800000000000 {
  name = 'AddCatalog1800000000000'
  async up(runner: Parameters<typeof evolveDefaults>[0]) {
    await evolveDefaults(runner, this.name, [
      {
        logicalId: 'type:functional',
        table: 'requirement_types',
        values: { id: 1, name_sv: 'Funktionellt', name_en: 'Functional' },
        unique: ['name_sv', 'name_en'],
      },
      {
        logicalId: 'quality:suitability',
        table: 'quality_characteristics',
        values: {
          id: 1,
          name_sv: 'Funktionell lämplighet',
          name_en: 'Functional suitability',
          requirement_type_id: 1,
          parent_id: null,
          chapter_id: '3.1',
        },
        unique: ['name_sv', 'name_en'],
        dependencies: { requirement_type_id: 'type:functional' },
      },
      {
        logicalId: 'quality:completeness',
        table: 'quality_characteristics',
        values: {
          id: 2,
          name_sv: 'Funktionell fullständighet',
          name_en: 'Functional completeness',
          requirement_type_id: 1,
          parent_id: 1,
          chapter_id: '3.1.1',
        },
        unique: ['name_sv', 'name_en'],
        dependencies: {
          requirement_type_id: 'type:functional',
          parent_id: 'quality:suitability',
        },
      },
    ])
  }
}

class ChangeCatalog1800000001000 {
  name = 'ChangeCatalog1800000001000'
  async up(runner: Parameters<typeof evolveDefaults>[0]) {
    await evolveDefaults(runner, this.name, [
      {
        logicalId: 'quality:suitability',
        table: 'quality_characteristics',
        identity: { id: 1 },
        previous: {
          name_sv: 'Funktionell lämplighet',
          name_en: 'Functional suitability',
          requirement_type_id: 1,
          parent_id: null,
          chapter_id: '3.1',
        },
        values: {
          name_en: 'Functional suitability revised',
          chapter_id: '3.2',
        },
      },
    ])
    // Removal from a fresh catalog has the explicit upgrade decision: retain stored entries.
  }
}

class FailCatalog1800000002000 {
  name = 'FailCatalog1800000002000'
  async up(runner: Parameters<typeof evolveDefaults>[0]) {
    await runner.query('CREATE TABLE migration_failure_probe (id int NOT NULL)')
    await runner.query("THROW 51000, 'unexpected evolution failure', 1")
  }
}

class RequiredConflict1800000003000 {
  name = 'RequiredConflict1800000003000'
  async up(runner: Parameters<typeof evolveDefaults>[0]) {
    await evolveDefaults(runner, this.name, [
      {
        logicalId: 'implementation:procurement',
        table: 'specification_implementation_types',
        values: { id: 1, name_sv: 'Upphandling', name_en: 'Procurement' },
        unique: ['name_sv', 'name_en'],
      },
      {
        logicalId: 'priority:P1',
        table: 'priority_levels',
        required: true,
        values: { id: 1, code: 'P1' },
        unique: ['code'],
      },
    ])
  }
}

describe('one-time default evolution through the migration command', () => {
  let source: ReturnType<typeof createAppDataSource>
  beforeEach(async () => {
    await resetSqlServerDatabase(resolveSqlIntegrationTestsUrl())
    await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
      expectedRuntimeUsers: [],
    })
    source = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
    await source.initialize()
  })
  afterEach(async () => {
    if (source?.isInitialized) await source.destroy()
  })

  async function migrate(
    classes: Array<typeof AddCatalog1800000000000> = [AddCatalog1800000000000],
    realPermissions = false,
  ) {
    const output: string[] = []
    const diagnostics: string[] = []
    const descriptors = await loadMigrationDescriptors()
    const exit = await main(['migrate', '--json'], {
      env: {
        ...process.env,
        DATABASE_URL: resolveSqlIntegrationTestsUrl(),
        DB_MIGRATION_USER: '',
        DB_MIGRATION_PASSWORD: '',
        DB_RUNTIME_USER: 'evolution_runtime',
        DB_MIGRATION_RUN_ID: 'evolution-run',
        RELEASE_VERSION: 'fixture-release',
      },
      migrationDescriptors: [
        ...descriptors,
        ...classes.map((classRef, index) => ({
          name: classRef.name,
          timestamp: Number(classRef.name.slice(-13)),
          sequence: 72 + index,
          fileName: `fixture_${index}.mjs`,
          classRef,
        })),
      ],
      reconcileRuntimePermissionsImpl: realPermissions
        ? undefined
        : async () => ({ compatible: true }),
      consoleObj: {
        log: (value: string) => output.push(value),
        error: (value: string) => diagnostics.push(value),
      },
    })
    return { exit, report: JSON.parse(output.join('')), diagnostics }
  }

  it('records optional conflicts and dependent omissions once, even if the conflict disappears', async () => {
    await source.query(`SET IDENTITY_INSERT requirement_types ON;
      INSERT INTO requirement_types (id, name_sv, name_en) VALUES (1, N'Egen', N'Custom');
      SET IDENTITY_INSERT requirement_types OFF;`)
    const first = await migrate()
    expect(first.exit).toBe(0)
    expect(first.report).toMatchObject({
      status: 'completed_with_omissions',
      migration: {
        transaction: 'committed',
        counts: { inserted: 0, skipped: 3 },
      },
    })
    expect(first.report.migration.entries[1]).toMatchObject({
      logicalId: 'quality:suitability',
      dependencyCause: 'type:functional',
      automaticRetry: false,
      actionRequired: false,
    })
    expect(first.diagnostics.join('')).toContain('No automatic retry')
    expect(await source.query('SELECT name_en FROM requirement_types')).toEqual(
      [{ name_en: 'Custom' }],
    )
    expect(
      await source.query('SELECT id FROM quality_characteristics'),
    ).toEqual([])
    await source.query('DELETE FROM requirement_types')
    const later = await migrate()
    expect(later.exit).toBe(0)
    expect(later.report.migrationsApplied).toBe(0)
    expect(await source.query('SELECT id FROM requirement_types')).toEqual([])
    expect(first.report.migration.counts.skipped).toBe(3)
  })
  it.each(['untouched', 'customized', 'structural', 'missing'])(
    'changes coupled values only on an untouched safely identified record: %s',
    async state => {
      expect((await migrate()).exit).toBe(0)
      if (state === 'customized')
        await source.query(
          "UPDATE quality_characteristics SET name_en = N'Administrator name' WHERE id = 1",
        )
      if (state === 'structural')
        await source.query(
          "UPDATE quality_characteristics SET chapter_id = N'custom-chapter' WHERE id = 1",
        )
      if (state === 'missing')
        await source.query('DELETE FROM quality_characteristics')
      const result = await migrate([
        AddCatalog1800000000000,
        ChangeCatalog1800000001000,
      ])
      expect(result.exit).toBe(0)
      expect(result.report.migration.counts.updated).toBe(
        state === 'untouched' ? 1 : 0,
      )
      const rows = await source.query(
        'SELECT name_en, chapter_id FROM quality_characteristics WHERE id = 1',
      )
      expect(rows).toEqual(
        state === 'missing'
          ? []
          : [
              {
                name_en:
                  state === 'untouched'
                    ? 'Functional suitability revised'
                    : state === 'customized'
                      ? 'Administrator name'
                      : 'Functional suitability',
                chapter_id:
                  state === 'untouched'
                    ? '3.2'
                    : state === 'structural'
                      ? 'custom-chapter'
                      : '3.1',
              },
            ],
      )
      // The retained entry and its references survive the catalog-removal decision.
      expect(await source.query('SELECT id FROM requirement_types')).toEqual([
        { id: 1 },
      ])
    },
  )

  it('preserves equivalent surrogate identities and resolves child references to them', async () => {
    await source.query(`SET IDENTITY_INSERT requirement_types ON;
      INSERT INTO requirement_types (id, name_sv, name_en) VALUES (901, N'Funktionellt', N'Functional');
      SET IDENTITY_INSERT requirement_types OFF;
      SET IDENTITY_INSERT quality_characteristics ON;
      INSERT INTO quality_characteristics (id, name_sv, name_en, requirement_type_id, parent_id, chapter_id)
        VALUES (902, N'Funktionell lämplighet', N'Functional suitability', 901, NULL, N'3.1');
      SET IDENTITY_INSERT quality_characteristics OFF;`)
    const result = await migrate()
    expect(result.exit).toBe(0)
    expect(result.report.migration.counts).toEqual({
      inserted: 1,
      unchanged: 2,
      skipped: 0,
      updated: 0,
    })
    expect(
      await source.query(
        'SELECT requirement_type_id, parent_id FROM quality_characteristics WHERE id = 2',
      ),
    ).toEqual([{ requirement_type_id: 901, parent_id: 902 }])
  })

  it.each([50, 71])(
    'supports skipping releases from migration %i',
    async count => {
      await source.destroy()
      await resetSqlServerDatabase(resolveSqlIntegrationTestsUrl())
      await runSqlServerMigrations(resolveSqlIntegrationTestsUrl(), {
        migrationDescriptors: (await loadMigrationDescriptors()).slice(
          0,
          count,
        ),
        expectedRuntimeUsers: [],
        reconcileRuntimePermissionsImpl: async () => ({}),
      })
      source = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
      await source.initialize()
      const result = await migrate([
        AddCatalog1800000000000,
        ChangeCatalog1800000001000,
      ])
      expect(result.exit).toBe(0)
      expect(result.report.migration.counts).toEqual({
        inserted: 3,
        updated: 1,
        unchanged: 0,
        skipped: 0,
      })
      expect(
        await source.query(
          'SELECT name_en, chapter_id FROM quality_characteristics WHERE id = 1',
        ),
      ).toEqual([
        { name_en: 'Functional suitability revised', chapter_id: '3.2' },
      ])
    },
  )

  it('rolls back all pending schema, catalog writes and history on unexpected database failure', async () => {
    const result = await migrate([
      AddCatalog1800000000000,
      FailCatalog1800000002000,
    ])
    expect(result.exit).toBe(1)
    expect(result.report).toMatchObject({
      status: 'failed',
      phase: 'migrations',
      migrationsApplied: 0,
      migration: {
        transaction: 'rolled_back',
        applied: [],
        entries: [],
        counts: { inserted: 0 },
      },
      permissions: { status: 'not_started' },
      error: {
        message: expect.stringContaining('unexpected evolution failure'),
      },
    })
    expect(await source.query('SELECT id FROM requirement_types')).toEqual([])
    expect(
      await source.query(
        'SELECT name FROM migrations WHERE timestamp >= 1800000000000',
      ),
    ).toEqual([])
    expect(
      await source.query(
        "SELECT name FROM sys.tables WHERE name = 'migration_failure_probe'",
      ),
    ).toEqual([])
    expect(result.diagnostics.join('')).toContain(
      'unexpected evolution failure',
    )
  })

  it('retains committed history when actual permission reconciliation fails, then reports a no-op retry separately', async () => {
    const first = await migrate([AddCatalog1800000000000], true)
    expect(first.exit).toBe(1)
    expect(first.report).toMatchObject({
      phase: 'permissions',
      migration: { transaction: 'committed', counts: { inserted: 3 } },
      permissions: { status: 'failed' },
      migrationsApplied: 1,
    })
    expect(await source.query('SELECT id FROM requirement_types')).toEqual([
      { id: 1 },
    ])
    expect(
      await source.query(
        'SELECT name FROM migrations WHERE timestamp >= 1800000000000',
      ),
    ).toEqual([{ name: 'AddCatalog1800000000000' }])
    await source.query('CREATE USER evolution_runtime WITHOUT LOGIN')
    const second = await migrate([AddCatalog1800000000000], true)
    expect(second.exit).toBe(0)
    expect(second.report).toMatchObject({
      migrationsApplied: 0,
      permissions: { status: 'completed' },
    })
    expect(first.report.migrationsApplied).toBe(1)
  })

  it('keeps required identity conflicts as failures and rolls back earlier writes', async () => {
    await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
      configureReadonlyAccess: false,
    })
    await source.query(
      "UPDATE priority_levels SET code = N'CUSTOM' WHERE id = 1",
    )
    const result = await migrate([RequiredConflict1800000003000])
    expect(result.exit).toBe(1)
    expect(result.report).toMatchObject({
      migration: { transaction: 'rolled_back', entries: [] },
      error: { code: 'REQUIRED_DEFAULT_CONFLICT' },
    })
    expect(
      await source.query('SELECT id FROM specification_implementation_types'),
    ).toEqual([])
    expect(
      await source.query('SELECT code FROM priority_levels WHERE id = 1'),
    ).toEqual([{ code: 'CUSTOM' }])
  })

  it('leaves fresh-install defaults to the current initializer instead of historical evolution', async () => {
    await source.destroy()
    await resetSqlServerDatabase(resolveSqlIntegrationTestsUrl())
    const result = await migrate([
      AddCatalog1800000000000,
      ChangeCatalog1800000001000,
    ])
    expect(result.exit).toBe(0)
    expect(result.report.migration.entries).toEqual([])
    await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
      configureReadonlyAccess: false,
    })
    await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
      profile: 'optional',
      configureReadonlyAccess: false,
    })
    source = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
    await source.initialize()
    expect(
      await source.query(
        'SELECT name_en, chapter_id FROM quality_characteristics WHERE id = 1',
      ),
    ).toEqual([{ name_en: 'Functional suitability', chapter_id: '3.1' }])
  })
  it('rejects incomplete migration definitions instead of claiming optional omissions', async () => {
    const value = { id: 1, name_sv: 'Funktionellt', name_en: 'Functional' }
    const addition = {
      logicalId: 'type:functional',
      table: 'requirement_types',
      values: value,
    }
    const plans = [
      { changes: [addition, addition], reason: 'distinct logical identifiers' },
      {
        changes: [{ ...addition, dependencies: { id: 'missing' } }],
        reason: 'Unresolved default dependency',
      },
      {
        changes: [{ ...addition, values: { name_en: 'Functional' } }],
        reason: 'requires an intended ID',
      },
      {
        changes: [
          {
            ...addition,
            previous: { name_en: 'Old' },
            values: { name_en: 'New' },
          },
        ],
        reason: 'require identity and previous affected values',
      },
      {
        changes: [
          {
            ...addition,
            required: true,
            identity: { id: 999 },
            previous: { name_en: 'Old' },
            values: { name_en: 'New' },
          },
        ],
        reason: 'required_record_missing',
      },
      {
        changes: [{ ...addition, table: 'invalid table' }],
        reason: 'Invalid SQL identifier',
      },
    ]
    for (const { changes, reason } of plans) {
      class InvalidPlan1800000004000 {
        name = 'InvalidPlan1800000004000'
        async up(runner: Parameters<typeof evolveDefaults>[0]) {
          await evolveDefaults(runner, this.name, changes)
        }
      }
      const result = await migrate([InvalidPlan1800000004000])
      expect(result.exit).toBe(1)
      expect(result.report.migration).toMatchObject({
        transaction: 'rolled_back',
        entries: [],
      })
      expect(result.report.error.message).toContain(reason)
      expect(await source.query('SELECT id FROM requirement_types')).toEqual([])
    }
  })

  it('recognizes unchanged guarded fields including SQL nulls and bit values', async () => {
    await migrate()
    await seedSqlServerDatabase(resolveSqlIntegrationTestsUrl(), {
      configureReadonlyAccess: false,
    })
    class Unchanged1800000005000 {
      name = 'Unchanged1800000005000'
      async up(runner: Parameters<typeof evolveDefaults>[0]) {
        await evolveDefaults(runner, this.name, [
          {
            logicalId: 'quality:suitability',
            table: 'quality_characteristics',
            identity: { id: 1, parent_id: null },
            previous: { chapter_id: '3.1' },
            values: { chapter_id: '3.1' },
          },
          {
            logicalId: 'status:draft',
            table: 'requirement_statuses',
            identity: { id: 1 },
            previous: { is_system: true },
            values: { is_system: 1 },
          },
        ])
      }
    }
    const result = await migrate([
      AddCatalog1800000000000,
      Unchanged1800000005000,
    ])
    expect(result.exit).toBe(0)
    expect(result.report.migration.counts).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 2,
      skipped: 0,
    })
    expect(
      await source.query(
        'SELECT chapter_id FROM quality_characteristics WHERE id = 1',
      ),
    ).toEqual([{ chapter_id: '3.1' }])
  })
  it('omits a new dependent when a customized structural guard prevents its parent change', async () => {
    await migrate()
    await source.query(`SET IDENTITY_INSERT requirement_types ON;
      INSERT INTO requirement_types (id, name_sv, name_en) VALUES (2, N'Icke-funktionellt', N'Non-functional');
      SET IDENTITY_INSERT requirement_types OFF;
      DELETE FROM quality_characteristics WHERE id = 2;
      UPDATE quality_characteristics SET requirement_type_id = 2 WHERE id = 1;`)
    class Coupled1800000006000 {
      name = 'Coupled1800000006000'
      async up(runner: Parameters<typeof evolveDefaults>[0]) {
        await evolveDefaults(runner, this.name, [
          {
            logicalId: 'quality:parent',
            table: 'quality_characteristics',
            identity: { id: 1 },
            previous: {
              name_en: 'Functional suitability',
              requirement_type_id: 1,
              parent_id: null,
              chapter_id: '3.1',
            },
            values: { name_en: 'Functional suitability revised' },
          },
          {
            logicalId: 'quality:child',
            table: 'quality_characteristics',
            values: {
              id: 2,
              name_sv: 'Funktionell fullständighet',
              name_en: 'Functional completeness',
              requirement_type_id: 1,
              parent_id: 1,
              chapter_id: '3.1.1',
            },
            unique: ['name_sv', 'name_en'],
            dependencies: { parent_id: 'quality:parent' },
          },
        ])
      }
    }
    const result = await migrate([
      AddCatalog1800000000000,
      Coupled1800000006000,
    ])
    expect(result.exit).toBe(0)
    expect(result.report.migration.counts).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      skipped: 1,
    })
    expect(result.report.migration.entries[1]).toMatchObject({
      dependencyCause: 'quality:parent',
      reason: 'dependency_customized',
    })
    expect(
      await source.query(
        'SELECT requirement_type_id FROM quality_characteristics WHERE id = 1',
      ),
    ).toEqual([{ requirement_type_id: 2 }])
    expect(
      await source.query('SELECT id FROM quality_characteristics WHERE id = 2'),
    ).toEqual([])
  })
})
