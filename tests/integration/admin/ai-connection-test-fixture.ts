import { existsSync, readFileSync } from 'node:fs'
import type { DataSource } from 'typeorm'
import {
  createSqlServerDataSource,
  getSqlServerDatabaseUrl,
  type SqlServerRuntimeEnv,
} from '../../../lib/typeorm/sqlserver-config'

export const ADMIN_20_CONNECTION_NAME = 'PW ADMIN-20 kontrollerad anslutning'
export const ADMIN_20_MODEL_NAME = 'PW ADMIN-20 kontrollerad modell'

interface ProfileRow {
  createdAt: Date
  id: string
  operationalStatus: 'enabled' | 'suspended'
  revisionToken: string
  updatedAt: Date
}

interface ProfileRevisionRow {
  activatedAt: Date | null
  capabilityPolicyJson: string
  createdAt: Date
  id: string
  inactivityTimeBudgetSeconds: number
  modelRevisionId: string | null
  queueCapacity: number
  revisionNumber: number
  revisionToken: string
  status: 'active' | 'draft' | 'superseded'
  supersededAt: Date | null
  totalTimeBudgetSeconds: number
}

interface ProfileSnapshot {
  profile: ProfileRow
  revisions: ProfileRevisionRow[]
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const normalized = line.startsWith('export ')
          ? line.slice('export '.length).trim()
          : line
        const separatorIndex = normalized.indexOf('=')
        if (separatorIndex === -1) return null
        const key = normalized.slice(0, separatorIndex).trim()
        let value = normalized.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function sqlServerEnv(): SqlServerRuntimeEnv {
  const env = {
    ...readEnvFile('.env.prodlike'),
    ...readEnvFile('.env.sqlserver'),
    ...process.env,
  } as SqlServerRuntimeEnv
  return {
    ...env,
    DB_CONNECTION_TIMEOUT_MS: env.DB_CONNECTION_TIMEOUT_MS ?? '30000',
    DB_POOL_ACQUIRE_TIMEOUT_MS: env.DB_POOL_ACQUIRE_TIMEOUT_MS ?? '30000',
    DB_POOL_MAX: env.DB_POOL_MAX ?? '1',
    DB_POOL_MIN: env.DB_POOL_MIN ?? '0',
    DB_REQUEST_TIMEOUT_MS: env.DB_REQUEST_TIMEOUT_MS ?? '30000',
  }
}

async function openDatabase(): Promise<DataSource> {
  const env = sqlServerEnv()
  const dataSource = createSqlServerDataSource({
    env,
    url: getSqlServerDatabaseUrl(env),
  })
  return dataSource.initialize()
}

async function profileSnapshot(db: DataSource): Promise<ProfileSnapshot> {
  const profiles = (await db.query(
    `SELECT [id], [operational_status] AS [operationalStatus],
       [created_at] AS [createdAt], [updated_at] AS [updatedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_run_profiles]
     WHERE [profile_key] = N'generation_without_images'`,
  )) as ProfileRow[]
  const profile = profiles[0]
  if (!profile) throw new Error('ADMIN-20 fixed run profile is missing.')
  const revisions = (await db.query(
    `SELECT [id],
       [ai_connection_model_revision_id] AS [modelRevisionId],
       [revision_number] AS [revisionNumber], [status],
       [capability_policy_json] AS [capabilityPolicyJson],
       [total_time_budget_seconds] AS [totalTimeBudgetSeconds],
       [inactivity_time_budget_seconds] AS [inactivityTimeBudgetSeconds],
       [queue_capacity] AS [queueCapacity], [created_at] AS [createdAt],
       [activated_at] AS [activatedAt], [superseded_at] AS [supersededAt],
       [revision_token] AS [revisionToken]
     FROM [ai_run_profile_revisions]
     WHERE [ai_run_profile_id] = @0`,
    [profile.id],
  )) as ProfileRevisionRow[]
  return { profile, revisions }
}

async function withProfileTriggersDisabled(
  db: DataSource,
  operation: () => Promise<void>,
) {
  try {
    await db.query(
      'DISABLE TRIGGER [trg_ai_run_profile_revisions_immutable] ON [ai_run_profile_revisions]',
    )
    await db.query(
      'DISABLE TRIGGER [trg_ai_run_profile_revisions_delete_drafts_only] ON [ai_run_profile_revisions]',
    )
    await operation()
  } finally {
    await db.query(
      'ENABLE TRIGGER [trg_ai_run_profile_revisions_immutable] ON [ai_run_profile_revisions]',
    )
    await db.query(
      'ENABLE TRIGGER [trg_ai_run_profile_revisions_delete_drafts_only] ON [ai_run_profile_revisions]',
    )
  }
}

async function removeFixtureConnections(db: DataSource) {
  const connectionRows = (await db.query(
    `SELECT [id] FROM [ai_connections]
     WHERE [administration_name] = @0`,
    [ADMIN_20_CONNECTION_NAME],
  )) as Array<{ id: string }>
  for (const { id } of connectionRows) {
    await withProfileTriggersDisabled(db, async () => {
      const activeFixtureRows = (await db.query(
        `SELECT [revision].[ai_run_profile_id] AS [profileId]
         FROM [ai_run_profile_revisions] AS [revision]
         INNER JOIN [ai_connection_model_revisions] AS [model_revision]
           ON [model_revision].[id] = [revision].[ai_connection_model_revision_id]
         INNER JOIN [ai_connection_models] AS [model]
           ON [model].[id] = [model_revision].[ai_connection_model_id]
         WHERE [model].[ai_connection_id] = @0
           AND [revision].[status] = N'active'`,
        [id],
      )) as Array<{ profileId: string }>
      for (const { profileId } of activeFixtureRows) {
        await db.query(
          `UPDATE [ai_run_profile_revisions]
           SET [status] = N'superseded',
             [activated_at] = COALESCE([activated_at], SYSUTCDATETIME()),
             [superseded_at] = COALESCE([superseded_at], SYSUTCDATETIME())
           WHERE [ai_run_profile_id] = @0 AND [status] = N'active'`,
          [profileId],
        )
        const replacements = (await db.query(
          `SELECT TOP (1) [revision].[id]
           FROM [ai_run_profile_revisions] AS [revision]
           LEFT JOIN [ai_connection_model_revisions] AS [model_revision]
             ON [model_revision].[id] = [revision].[ai_connection_model_revision_id]
           LEFT JOIN [ai_connection_models] AS [model]
             ON [model].[id] = [model_revision].[ai_connection_model_id]
           WHERE [revision].[ai_run_profile_id] = @0
             AND [revision].[status] = N'superseded'
             AND ([model].[ai_connection_id] IS NULL OR [model].[ai_connection_id] <> @1)
           ORDER BY [revision].[revision_number] DESC`,
          [profileId, id],
        )) as Array<{ id: string }>
        if (replacements[0]) {
          await db.query(
            `UPDATE [ai_run_profile_revisions]
             SET [status] = N'active', [superseded_at] = NULL
             WHERE [id] = @0`,
            [replacements[0].id],
          )
        }
      }
      await db.query(
        `DELETE [revision]
         FROM [ai_run_profile_revisions] AS [revision]
         INNER JOIN [ai_connection_model_revisions] AS [model_revision]
           ON [model_revision].[id] = [revision].[ai_connection_model_revision_id]
         INNER JOIN [ai_connection_models] AS [model]
           ON [model].[id] = [model_revision].[ai_connection_model_id]
         WHERE [model].[ai_connection_id] = @0`,
        [id],
      )
    })

    await db.query(
      `DELETE [entry] FROM [ai_run_coordination_entries] AS [entry]
       WHERE [entry].[ai_connection_id] = @0`,
      [id],
    )
    await db.query(
      `DELETE [state]
       FROM [ai_connection_model_operational_states] AS [state]
       INNER JOIN [ai_connection_model_revisions] AS [revision]
         ON [revision].[id] = [state].[ai_connection_model_revision_id]
       INNER JOIN [ai_connection_models] AS [model]
         ON [model].[id] = [revision].[ai_connection_model_id]
       WHERE [model].[ai_connection_id] = @0`,
      [id],
    )
    await db.query(
      `DELETE [evidence]
       FROM [ai_connection_model_verification_evidence] AS [evidence]
       INNER JOIN [ai_connection_model_revisions] AS [revision]
         ON [revision].[id] = [evidence].[ai_connection_model_revision_id]
       INNER JOIN [ai_connection_models] AS [model]
         ON [model].[id] = [revision].[ai_connection_model_id]
       WHERE [model].[ai_connection_id] = @0`,
      [id],
    )
    await db.query(
      'DISABLE TRIGGER [trg_ai_connection_model_revisions_delete_drafts_only] ON [ai_connection_model_revisions]',
    )
    try {
      await db.query(
        `DELETE [revision]
         FROM [ai_connection_model_revisions] AS [revision]
         INNER JOIN [ai_connection_models] AS [model]
           ON [model].[id] = [revision].[ai_connection_model_id]
         WHERE [model].[ai_connection_id] = @0`,
        [id],
      )
    } finally {
      await db.query(
        'ENABLE TRIGGER [trg_ai_connection_model_revisions_delete_drafts_only] ON [ai_connection_model_revisions]',
      )
    }
    await db.query(
      'DISABLE TRIGGER [trg_ai_provider_secret_versions_delete_candidates_only] ON [ai_provider_secret_versions]',
    )
    try {
      await db.query(
        'DELETE FROM [ai_provider_secret_versions] WHERE [ai_connection_id] = @0',
        [id],
      )
    } finally {
      await db.query(
        'ENABLE TRIGGER [trg_ai_provider_secret_versions_delete_candidates_only] ON [ai_provider_secret_versions]',
      )
    }
    for (const table of [
      'ai_connection_models',
      'ai_connection_attestations',
      'ai_connection_verification_evidence',
    ]) {
      await db.query(`DELETE FROM [${table}] WHERE [ai_connection_id] = @0`, [
        id,
      ])
    }
    await db.query('DELETE FROM [ai_connections] WHERE [id] = @0', [id])
  }
}

async function restoreProfile(db: DataSource, snapshot: ProfileSnapshot) {
  await withProfileTriggersDisabled(db, async () => {
    const ids = JSON.stringify(snapshot.revisions.map(revision => revision.id))
    await db.query(
      `DELETE FROM [ai_run_profile_revisions]
       WHERE [ai_run_profile_id] = @0
         AND [id] NOT IN (
           SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(@1)
         )`,
      [snapshot.profile.id, ids],
    )
    await db.query(
      `UPDATE [ai_run_profile_revisions]
       SET [status] = N'superseded',
         [activated_at] = COALESCE([activated_at], SYSUTCDATETIME()),
         [superseded_at] = COALESCE([superseded_at], SYSUTCDATETIME())
       WHERE [ai_run_profile_id] = @0
         AND [ai_connection_model_revision_id] IS NOT NULL`,
      [snapshot.profile.id],
    )
    for (const revision of snapshot.revisions) {
      await db.query(
        `UPDATE [ai_run_profile_revisions]
         SET [ai_connection_model_revision_id] = @1, [revision_number] = @2,
           [status] = @3, [capability_policy_json] = @4,
           [total_time_budget_seconds] = @5,
           [inactivity_time_budget_seconds] = @6, [queue_capacity] = @7,
           [created_at] = @8, [activated_at] = @9, [superseded_at] = @10,
           [revision_token] = @11
         WHERE [id] = @0`,
        [
          revision.id,
          revision.modelRevisionId,
          revision.revisionNumber,
          revision.status,
          revision.capabilityPolicyJson,
          revision.totalTimeBudgetSeconds,
          revision.inactivityTimeBudgetSeconds,
          revision.queueCapacity,
          revision.createdAt,
          revision.activatedAt,
          revision.supersededAt,
          revision.revisionToken,
        ],
      )
    }
    await db.query(
      `UPDATE [ai_run_profiles]
       SET [operational_status] = @1, [created_at] = @2, [updated_at] = @3,
         [revision_token] = @4
       WHERE [id] = @0`,
      [
        snapshot.profile.id,
        snapshot.profile.operationalStatus,
        snapshot.profile.createdAt,
        snapshot.profile.updatedAt,
        snapshot.profile.revisionToken,
      ],
    )
  })
}

export async function prepareAdmin20Fixture(): Promise<() => Promise<void>> {
  const db = await openDatabase()
  try {
    await removeFixtureConnections(db)
    const snapshot = await profileSnapshot(db)
    return async () => {
      try {
        await restoreProfile(db, snapshot)
        await removeFixtureConnections(db)
      } finally {
        if (db.isInitialized) await db.destroy()
      }
    }
  } catch (error) {
    if (db.isInitialized) await db.destroy()
    throw error
  }
}
