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
     VALUES (@0, @1, 1, N'draft', N'external/shared-model', N'{}',
       SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [modelId, revisionNumber],
  )) as Array<{ id: string }>
  return rows[0]?.id as string
}

describe('AI connections data model against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

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

  it('deletes only unused model revision drafts', async () => {
    const connectionId = await createConnection(appDb())
    const modelId = await createModel(appDb(), connectionId, 'Draft model')
    const draftRevisionId = await createModelRevision(appDb(), modelId, 1)

    await appDb().query(
      'DELETE FROM ai_connection_model_revisions WHERE id = @0',
      [draftRevisionId],
    )

    const retainedRevisionId = await createModelRevision(appDb(), modelId, 2)
    await appDb().query(
      `UPDATE ai_connection_model_revisions
       SET status = N'verification_required', revision_token = NEWID(),
           updated_at = SYSUTCDATETIME()
       WHERE id = @0`,
      [retainedRevisionId],
    )
    await expect(
      appDb().query(
        `UPDATE ai_connection_model_revisions
         SET status = N'draft', revision_token = NEWID(),
             updated_at = SYSUTCDATETIME()
         WHERE id = @0`,
        [retainedRevisionId],
      ),
    ).rejects.toThrow('AI connection model revisions cannot return to draft')
    await expect(
      appDb().query('DELETE FROM ai_connection_model_revisions WHERE id = @0', [
        retainedRevisionId,
      ]),
    ).rejects.toThrow(
      'Only unused AI connection model revision drafts may be deleted',
    )
  })

  it('edits and replaces drafts while keeping active profile revisions immutable', async () => {
    const connectionId = await createConnection(appDb())
    const modelId = await createModel(appDb(), connectionId, 'Profile model')
    const modelRevisionId = await createModelRevision(appDb(), modelId, 1)
    const profileId = crypto.randomUUID()
    await appDb().query(
      `INSERT INTO ai_run_profiles (
         id, profile_key, operational_status, created_at, updated_at
       ) VALUES (
         @0, N'generation_without_images', N'enabled',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [profileId],
    )
    const insertRevision = (
      id: string,
      revision: number,
      status: string,
      selectedModelRevisionId: string | null,
    ) =>
      appDb().query(
        `INSERT INTO ai_run_profile_revisions (
           id, ai_run_profile_id, ai_connection_model_revision_id,
           revision_number, status, capability_policy_json,
           total_time_budget_seconds, inactivity_time_budget_seconds,
           queue_capacity, created_at, activated_at, superseded_at
         ) VALUES (
           @0, @1, @2, @3, @4, N'{"streaming":"required"}',
           1200, 300, 10, SYSUTCDATETIME(),
           CASE WHEN @4 = N'active' THEN SYSUTCDATETIME() ELSE NULL END, NULL
         )`,
        [id, profileId, selectedModelRevisionId, revision, status],
      )

    const activeId = crypto.randomUUID()
    const draftId = crypto.randomUUID()
    await insertRevision(activeId, 1, 'active', modelRevisionId)
    await insertRevision(draftId, 2, 'draft', null)
    await appDb().query(
      `UPDATE ai_run_profile_revisions
       SET ai_connection_model_revision_id = @0,
           capability_policy_json = N'{"streaming":"required","imageInput":"disabled"}',
           total_time_budget_seconds = 900,
           inactivity_time_budget_seconds = 300,
           queue_capacity = 5,
           revision_token = NEWID()
       WHERE id = @1`,
      [modelRevisionId, draftId],
    )
    await expect(
      insertRevision(crypto.randomUUID(), 3, 'active', modelRevisionId),
    ).rejects.toThrow('uq_ai_run_profile_revisions_active_profile')
    await expect(
      insertRevision(crypto.randomUUID(), 4, 'draft', null),
    ).rejects.toThrow('uq_ai_run_profile_revisions_draft_profile')

    await appDb().query('DELETE FROM ai_run_profile_revisions WHERE id = @0', [
      draftId,
    ])
    await expect(
      appDb().query(
        `UPDATE ai_run_profile_revisions
         SET status = N'draft', activated_at = NULL,
             revision_token = NEWID()
         WHERE id = @0`,
        [activeId],
      ),
    ).rejects.toThrow('AI run profile revisions cannot return to draft')
    await expect(
      appDb().query(
        `UPDATE ai_run_profile_revisions
         SET capability_policy_json = N'{"streaming":"disabled"}'
         WHERE id = @0`,
        [activeId],
      ),
    ).rejects.toThrow('AI run profile revision content is immutable')
    await expect(
      appDb().query('DELETE FROM ai_run_profile_revisions WHERE id = @0', [
        activeId,
      ]),
    ).rejects.toThrow('Only AI run profile revision drafts may be deleted')
    await insertRevision(crypto.randomUUID(), 5, 'draft', null)
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
