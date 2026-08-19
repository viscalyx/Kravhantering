import { describe, expect, it, vi } from 'vitest'
import { sqlServerEntities } from '@/lib/typeorm/entities'
import { RUNTIME_PERMISSION_MANIFEST } from '@/typeorm/runtime-permission-manifest.mjs'
import { seedDemoDatabase, seedRequiredDatabase } from '@/typeorm/seed.mjs'

interface SeedRow {
  row: Record<string, unknown>
  table: string
}

function collectSeedRows(): {
  executor: { query: ReturnType<typeof vi.fn> }
  rows: SeedRow[]
} {
  const rows: SeedRow[] = []
  const executor = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT @@ROWCOUNT AS [affectedRows]')) {
        return [{ affectedRows: 1 }]
      }
      const match = sql.match(/INSERT INTO \[([^\]]+)\] \(([^)]+)\) VALUES/)
      if (!match) return
      const columns = match[2]
        .split(',')
        .map(column => column.trim().replace(/^\[|\]$/g, ''))
      rows.push({
        row: Object.fromEntries(
          columns.map((column, index) => [column, params[index]]),
        ),
        table: match[1],
      })
    }),
  }

  return { executor, rows }
}

function rowsFor(rows: SeedRow[], table: string): Record<string, unknown>[] {
  return rows.filter(row => row.table === table).map(row => row.row)
}

describe('AI connections data model migration', () => {
  it('creates revision-bound AI administration and operational state', async () => {
    const migration = await import(
      '@/typeorm/migrations/0060_ai_connections_data_model.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    for (const table of [
      'ai_connections',
      'ai_connection_attestations',
      'ai_connection_verification_evidence',
      'ai_connection_models',
      'ai_connection_model_revisions',
      'ai_connection_model_verification_evidence',
      'ai_run_profiles',
      'ai_run_profile_revisions',
      'ai_connection_model_operational_states',
    ]) {
      expect(sql).toContain(`CREATE TABLE [${table}]`)
    }

    expect(sql).toContain('[id] uniqueidentifier NOT NULL')
    expect(sql).toContain(
      '[revision_token] uniqueidentifier NOT NULL CONSTRAINT',
    )
    expect(sql).toContain('[external_model_id] nvarchar(450) NOT NULL')
    expect(sql).toContain(
      'CONSTRAINT [uq_ai_connection_model_revisions_model_revision] UNIQUE ([ai_connection_model_id], [revision_number])',
    )
    expect(sql).toContain(
      'CREATE UNIQUE INDEX [uq_ai_run_profile_revisions_active_profile]',
    )
    expect(sql).toContain("WHERE [status] = N'active'")
    expect(sql).toContain(
      'CREATE UNIQUE INDEX [uq_ai_run_profile_revisions_draft_profile]',
    )
    expect(sql).toContain("WHERE [status] = N'draft'")
    expect(sql).toContain(
      'FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION',
    )
    expect(sql).toContain(
      'CONSTRAINT [chk_ai_connection_model_revisions_declared_capabilities_json]',
    )
    expect(sql).toContain(
      'CONSTRAINT [chk_ai_run_profile_revisions_capability_policy_json]',
    )
    expect(sql).toContain(
      'CREATE TRIGGER [trg_ai_connection_model_revisions_immutable]',
    )
    expect(sql).toContain(
      'CREATE TRIGGER [trg_ai_run_profile_revisions_immutable]',
    )
    expect(sql).toContain(
      'CREATE TRIGGER [trg_ai_connection_model_revisions_delete_drafts_only]',
    )
    expect(sql).toContain(
      'CREATE TRIGGER [trg_ai_run_profile_revisions_delete_drafts_only]',
    )
    expect(sql).toContain('[maximum_concurrency] int NOT NULL')
    expect(sql).toContain('[is_personal_data_processed] bit NULL')
    expect(sql).toContain(
      '[responsible_organization_unit_reference] uniqueidentifier NULL',
    )
    expect(sql).toContain('[incident_response_reference] uniqueidentifier NULL')
    expect(sql).not.toContain('[responsible_owner]')
    expect(sql).not.toContain('[incident_contact]')
  })

  it('mirrors every migration check in the new EntitySchema metadata', async () => {
    const migration = await import(
      '@/typeorm/migrations/0060_ai_connections_data_model.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    const migrationChecks = [
      ...sql.matchAll(/CONSTRAINT \[(chk_ai_[a-z0-9_]+)\]/gu),
    ].map(match => match[1])
    const aiTables = new Set([
      'ai_connections',
      'ai_connection_attestations',
      'ai_connection_verification_evidence',
      'ai_connection_models',
      'ai_connection_model_revisions',
      'ai_connection_model_verification_evidence',
      'ai_run_profiles',
      'ai_run_profile_revisions',
      'ai_connection_model_operational_states',
    ])
    const entityChecks = sqlServerEntities
      .filter(
        entity =>
          typeof entity.options.tableName === 'string' &&
          aiTables.has(entity.options.tableName),
      )
      .flatMap(entity => entity.options.checks ?? [])
      .map(check => check.name)

    expect(entityChecks.sort()).toEqual(
      expect.arrayContaining(migrationChecks.sort()),
    )
  })

  it('drops the AI data model in dependency order', async () => {
    const migration = await import(
      '@/typeorm/migrations/0060_ai_connections_data_model.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().down(queryRunner)

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    )
    expect(statements[0]).toContain(
      'DROP TABLE [ai_connection_model_operational_states]',
    )
    expect(statements.at(-1)).toContain('DROP TABLE [ai_connections]')
  })
})

describe('AI connection seed profiles', () => {
  it('keeps required seed unconfigured with only the three empty profile slots', async () => {
    const { executor, rows } = collectSeedRows()

    await seedRequiredDatabase(executor)

    expect(rowsFor(rows, 'ai_run_profiles')).toEqual([
      expect.objectContaining({
        profile_key: 'generation_without_images',
      }),
      expect.objectContaining({
        profile_key: 'generation_with_images',
      }),
      expect.objectContaining({ profile_key: 'invalid_json_repair' }),
    ])
    expect(rowsFor(rows, 'ai_connections')).toHaveLength(0)
    expect(rowsFor(rows, 'ai_connection_models')).toHaveLength(0)
    expect(rowsFor(rows, 'ai_run_profile_revisions')).toHaveLength(0)
    const profileInsert = executor.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO [ai_run_profiles]'),
    )
    expect(String(profileInsert?.[0])).not.toContain('IDENTITY_INSERT')
  })

  it('creates only unverified OpenRouter drafts in demo seed', async () => {
    const { executor, rows } = collectSeedRows()

    await seedRequiredDatabase(executor)
    await seedDemoDatabase(executor)

    expect(rowsFor(rows, 'ai_connections')).toEqual([
      expect.objectContaining({
        adapter_key: 'openrouter',
        lifecycle_status: 'draft',
      }),
    ])
    expect(rowsFor(rows, 'ai_connection_attestations')).toEqual([
      expect.objectContaining({
        incident_response_reference: null,
        responsible_organization_unit_reference: null,
        status: 'draft',
      }),
    ])
    const profileRevisions = rowsFor(rows, 'ai_run_profile_revisions')
    expect(profileRevisions).toHaveLength(3)
    expect(
      profileRevisions.every(
        revision =>
          revision.status === 'draft' &&
          revision.ai_connection_model_revision_id == null,
      ),
    ).toBe(true)
    expect(rowsFor(rows, 'ai_connection_models')).toHaveLength(0)
    expect(rowsFor(rows, 'ai_connection_model_revisions')).toHaveLength(0)
    expect(rowsFor(rows, 'ai_connection_verification_evidence')).toHaveLength(0)
    expect(
      rowsFor(rows, 'ai_connection_model_verification_evidence'),
    ).toHaveLength(0)
    expect(
      rowsFor(rows, 'ai_connection_model_operational_states'),
    ).toHaveLength(0)
    const connectionInsert = executor.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO [ai_connections]'),
    )
    expect(String(connectionInsert?.[0])).not.toContain('IDENTITY_INSERT')
  })
})

describe('AI connection runtime permissions', () => {
  it('keeps evidence append-only and lets guarded draft revisions be deleted', () => {
    const permissions = new Map(
      RUNTIME_PERMISSION_MANIFEST.map(entry => [
        entry.object,
        [...entry.permissions],
      ]),
    )

    expect(permissions.get('dbo.ai_connection_verification_evidence')).toEqual([
      'SELECT',
      'INSERT',
    ])
    expect(
      permissions.get('dbo.ai_connection_model_verification_evidence'),
    ).toEqual(['SELECT', 'INSERT'])
    expect(permissions.get('dbo.ai_connection_model_revisions')).toEqual([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
    ])
    expect(permissions.get('dbo.ai_run_profile_revisions')).toEqual([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
    ])
  })
})
