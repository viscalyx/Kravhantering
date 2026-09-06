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
  configurationVersion: number
  createdAt: Date
  id: string
  inactivityTimeBudgetSeconds: number
  maximumBufferedEvents: number
  maximumOutputBytes: number
  maximumOutputTokens: number
  maximumRetainedMemoryBytes: number
  modelRevisionId: string | null
  operationalStatus: 'enabled' | 'suspended'
  queueCapacity: number
  revisionToken: string
  totalTimeBudgetSeconds: number
  updatedAt: Date
}

interface ProfileSnapshot {
  profile: ProfileRow
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
    `SELECT [id],
       [ai_connection_model_revision_id] AS [modelRevisionId],
       [configuration_version] AS [configurationVersion],
       [operational_status] AS [operationalStatus],
       [total_time_budget_seconds] AS [totalTimeBudgetSeconds],
       [inactivity_time_budget_seconds] AS [inactivityTimeBudgetSeconds],
       [queue_capacity] AS [queueCapacity],
       [maximum_output_tokens] AS [maximumOutputTokens],
       [maximum_output_bytes] AS [maximumOutputBytes],
       [maximum_retained_memory_bytes] AS [maximumRetainedMemoryBytes],
       [maximum_buffered_events] AS [maximumBufferedEvents],
       [created_at] AS [createdAt], [updated_at] AS [updatedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_run_profiles]
     WHERE [profile_key] = N'generation_without_images'`,
  )) as ProfileRow[]
  const profile = profiles[0]
  if (!profile) throw new Error('ADMIN-20 fixed run profile is missing.')
  return { profile }
}

async function removeFixtureConnections(db: DataSource) {
  const connectionRows = (await db.query(
    `SELECT [id] FROM [ai_connections]
     WHERE [administration_name] = @0`,
    [ADMIN_20_CONNECTION_NAME],
  )) as Array<{ id: string }>
  for (const { id } of connectionRows) {
    await db.query(
      `UPDATE [profile]
       SET [ai_connection_model_revision_id] = NULL,
         [configuration_version] = [configuration_version] + 1,
         [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
       FROM [ai_run_profiles] AS [profile]
       INNER JOIN [ai_connection_model_revisions] AS [revision]
         ON [revision].[id] = [profile].[ai_connection_model_revision_id]
       INNER JOIN [ai_connection_models] AS [model]
         ON [model].[id] = [revision].[ai_connection_model_id]
       WHERE [model].[ai_connection_id] = @0`,
      [id],
    )

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
      `DELETE [revision]
       FROM [ai_connection_model_revisions] AS [revision]
       INNER JOIN [ai_connection_models] AS [model]
         ON [model].[id] = [revision].[ai_connection_model_id]
       WHERE [model].[ai_connection_id] = @0`,
      [id],
    )
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
      'ai_model_verification_attempts',
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
  const profile = snapshot.profile
  await db.query(
    `UPDATE [ai_run_profiles]
     SET [ai_connection_model_revision_id] = @1,
       [configuration_version] = @2, [operational_status] = @3,
       [total_time_budget_seconds] = @4,
       [inactivity_time_budget_seconds] = @5, [queue_capacity] = @6,
       [maximum_output_tokens] = @7, [maximum_output_bytes] = @8,
       [maximum_retained_memory_bytes] = @9,
       [maximum_buffered_events] = @10, [created_at] = @11,
       [updated_at] = @12, [revision_token] = @13
     WHERE [id] = @0`,
    [
      profile.id,
      profile.modelRevisionId,
      profile.configurationVersion,
      profile.operationalStatus,
      profile.totalTimeBudgetSeconds,
      profile.inactivityTimeBudgetSeconds,
      profile.queueCapacity,
      profile.maximumOutputTokens,
      profile.maximumOutputBytes,
      profile.maximumRetainedMemoryBytes,
      profile.maximumBufferedEvents,
      profile.createdAt,
      profile.updatedAt,
      profile.revisionToken,
    ],
  )
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
