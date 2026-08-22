import { describe, expect, it } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

async function createConnection(db: SqlServerDatabase): Promise<string> {
  const rows = (await db.query(
    `INSERT INTO ai_connections (
       administration_name, public_name, adapter_key, adapter_version,
       endpoint_url, authentication_type, tls_policy_key, egress_policy_key,
       data_policy_summary, lifecycle_status, configuration_version,
       maximum_concurrency, created_at, updated_at
     )
     OUTPUT INSERTED.id AS id
     VALUES (
       N'SQL test connection', N'SQL test', N'test', N'1',
       N'https://ai.example.test/v1', N'static_secret', N'public_web_pki',
       N'sql_test', N'No production data', N'draft', 1, 4,
       SYSUTCDATETIME(), SYSUTCDATETIME()
     )`,
  )) as Array<{ id: string }>
  return rows[0]?.id as string
}

async function createModel(
  db: SqlServerDatabase,
  connectionId: string,
  name: string,
): Promise<string> {
  const rows = (await db.query(
    `INSERT INTO ai_connection_models (
       ai_connection_id, name, created_at, updated_at
     )
     OUTPUT INSERTED.id AS id
     VALUES (@0, @1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [connectionId, name],
  )) as Array<{ id: string }>
  return rows[0]?.id as string
}

async function createModelRevision(
  db: SqlServerDatabase,
  modelId: string,
  revisionNumber: number,
): Promise<string> {
  const rows = (await db.query(
    `INSERT INTO ai_connection_model_revisions (
       ai_connection_model_id, revision_number,
       connection_configuration_version, status, external_model_id,
       declared_capabilities_json, created_at, updated_at
     )
     OUTPUT INSERTED.id AS id
     VALUES (@0, @1, 1, N'new_revision_required', N'external/shared-model', N'{}',
       SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [modelId, revisionNumber],
  )) as Array<{ id: string }>
  return rows[0]?.id as string
}

describe('AI connections data model against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it('allows immutable-column updates that match no model revisions', async () => {
    await expect(
      appDb().query(
        `UPDATE ai_connection_model_revisions
         SET external_model_id = N'never-applied'
         WHERE id = @0`,
        [crypto.randomUUID()],
      ),
    ).resolves.toBeUndefined()
  })

  it('keeps external model identifiers out of internal identity and immutable after revision creation', async () => {
    const connectionId = await createConnection(appDb())
    const firstModelId = await createModel(
      appDb(),
      connectionId,
      'First display name',
    )
    const secondModelId = await createModel(
      appDb(),
      connectionId,
      'Second display name',
    )
    const firstRevisionId = await createModelRevision(appDb(), firstModelId, 1)
    await createModelRevision(appDb(), secondModelId, 1)

    await expect(
      appDb().query(
        `UPDATE ai_connection_model_revisions
         SET external_model_id = N'external/changed-model'
         WHERE id = @0`,
        [firstRevisionId],
      ),
    ).rejects.toThrow('AI connection model revision content is immutable')

    await appDb().query(
      `UPDATE ai_connection_models
       SET name = N'Renamed display name', revision_token = NEWID(),
           updated_at = SYSUTCDATETIME()
       WHERE id = @0`,
      [firstModelId],
    )
    const renamed = (await appDb().query(
      'SELECT name FROM ai_connection_models WHERE id = @0',
      [firstModelId],
    )) as Array<{ name: string }>
    expect(renamed).toEqual([{ name: 'Renamed display name' }])
  })

  it('keeps ended model revisions irreversible', async () => {
    const connectionId = await createConnection(appDb())
    const modelId = await createModel(appDb(), connectionId, 'Draft model')
    const revisionId = await createModelRevision(appDb(), modelId, 1)
    await appDb().query(
      `UPDATE ai_connection_model_revisions
       SET status = N'ended', ended_at = SYSUTCDATETIME(),
           revision_token = NEWID(),
           updated_at = SYSUTCDATETIME()
       WHERE id = @0`,
      [revisionId],
    )
    await expect(
      appDb().query(
        `UPDATE ai_connection_model_revisions
         SET status = N'new_revision_required', ended_at = NULL,
             revision_token = NEWID(),
             updated_at = SYSUTCDATETIME()
         WHERE id = @0`,
        [revisionId],
      ),
    ).rejects.toThrow('Ended AI model revisions cannot be restored')
  })

  it('stores one directly configurable fenced row per stable profile', async () => {
    const connectionId = await createConnection(appDb())
    const modelId = await createModel(appDb(), connectionId, 'Profile model')
    const modelRevisionId = await createModelRevision(appDb(), modelId, 1)
    const profileId = crypto.randomUUID()
    await appDb().query(
      `INSERT INTO ai_run_profiles (
         id, profile_key, ai_connection_model_revision_id,
         configuration_version, operational_status,
         total_time_budget_seconds, inactivity_time_budget_seconds,
         queue_capacity, maximum_output_tokens, maximum_output_bytes,
         maximum_retained_memory_bytes, maximum_buffered_events,
         created_at, updated_at
       ) VALUES (
         @0, N'generation_without_images', @1, 1, N'enabled',
         1200, 300, 10, 8192, 4194304, 8388608, 32,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [profileId, modelRevisionId],
    )

    await appDb().query(
      `UPDATE ai_run_profiles
       SET total_time_budget_seconds = 900, queue_capacity = 5,
         configuration_version = configuration_version + 1,
         revision_token = NEWID(), updated_at = SYSUTCDATETIME()
       WHERE id = @0`,
      [profileId],
    )
    const rows = (await appDb().query(
      `SELECT configuration_version AS configurationVersion,
         queue_capacity AS queueCapacity,
         ai_connection_model_revision_id AS modelRevisionId
       FROM ai_run_profiles WHERE id = @0`,
      [profileId],
    )) as Array<{
      configurationVersion: number
      modelRevisionId: string
      queueCapacity: number
    }>
    expect(rows).toEqual([
      expect.objectContaining({
        configurationVersion: 2,
        modelRevisionId,
        queueCapacity: 5,
      }),
    ])
    await expect(
      appDb().query(
        'UPDATE ai_run_profiles SET configuration_version = 0 WHERE id = @0',
        [profileId],
      ),
    ).rejects.toThrow('chk_ai_run_profiles_configuration_version')
    await expect(
      appDb().query('DELETE FROM ai_connection_model_revisions WHERE id = @0', [
        modelRevisionId,
      ]),
    ).rejects.toThrow(/reference|conflict|fk_ai_run_profiles/u)
  })

  it('binds one independent operational state row to an exact model revision', async () => {
    const connectionId = await createConnection(appDb())
    const modelId = await createModel(appDb(), connectionId, 'State model')
    const modelRevisionId = await createModelRevision(appDb(), modelId, 1)
    const insertState = () =>
      appDb().query(
        `INSERT INTO ai_connection_model_operational_states (
           ai_connection_model_revision_id, updated_at
         ) VALUES (@0, SYSUTCDATETIME())`,
        [modelRevisionId],
      )

    await insertState()
    await expect(insertState()).rejects.toThrow(
      'uq_ai_connection_model_operational_states_revision',
    )

    const rows = (await appDb().query(
      `SELECT health_status AS healthStatus,
              circuit_breaker_status AS circuitBreakerStatus
       FROM ai_connection_model_operational_states
       WHERE ai_connection_model_revision_id = @0`,
      [modelRevisionId],
    )) as Array<{ circuitBreakerStatus: string; healthStatus: string }>
    expect(rows).toEqual([
      { circuitBreakerStatus: 'closed', healthStatus: 'unknown' },
    ])
  })
})
