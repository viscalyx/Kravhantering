import type {
  ExpiredTransientStateBacklog,
  TransientCleanupBatchResult,
  TransientCleanupQueryExecutor,
} from './requirement-import-validation-sessions'
import type { TransientCleanupTarget } from './runner'

interface BacklogRow {
  expiredRowCount: number | string
  expiredStoredBytes: number | string
  oldestExpiredAgeMs: number | string | null
}

function nonNegative(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

const EXPIRED_PREDICATE = `
  ([status] <> N'running' AND [total_deadline_at] <= SYSUTCDATETIME())
  OR ([status] = N'running' AND [lease_expires_at] <= SYSUTCDATETIME())
`

export async function inspectExpiredAiRunCoordinationEntries(
  executor: TransientCleanupQueryExecutor,
): Promise<ExpiredTransientStateBacklog> {
  const rows = await executor.query<BacklogRow[]>(`
    SELECT COUNT_BIG(*) AS expiredRowCount,
      COALESCE(SUM(CONVERT(bigint,
        DATALENGTH([id]) + DATALENGTH([application_run_id]) +
        DATALENGTH([fencing_token]) +
        DATALENGTH([ai_connection_id]) +
        DATALENGTH([ai_connection_model_revision_id]) +
        DATALENGTH([ai_run_profile_id]) +
        DATALENGTH([ai_run_profile_configuration_version]) +
        DATALENGTH([queue_sequence]) + DATALENGTH([status]) +
        DATALENGTH([attempt_count]) + DATALENGTH([not_before]) +
        DATALENGTH([total_deadline_at]) +
        COALESCE(DATALENGTH([lease_owner_id]), 0) +
        COALESCE(DATALENGTH([lease_expires_at]), 0) +
        DATALENGTH([created_at]) + DATALENGTH([updated_at])
      )), CONVERT(bigint, 0)) AS expiredStoredBytes,
      DATEDIFF_BIG(millisecond,
        MIN(CASE
          WHEN [status] = N'running' AND [lease_expires_at] < [total_deadline_at]
            THEN [lease_expires_at]
          ELSE [total_deadline_at]
        END), SYSUTCDATETIME()) AS oldestExpiredAgeMs
    FROM [ai_run_coordination_entries]
    WHERE ${EXPIRED_PREDICATE}
  `)
  return {
    expiredRowCount: nonNegative(rows[0]?.expiredRowCount ?? 0) ?? 0,
    expiredStoredBytes: nonNegative(rows[0]?.expiredStoredBytes ?? 0) ?? 0,
    oldestExpiredAgeMs: nonNegative(rows[0]?.oldestExpiredAgeMs ?? null),
  }
}

export async function purgeExpiredAiRunCoordinationEntries(
  executor: TransientCleanupQueryExecutor,
  limit = 100,
): Promise<TransientCleanupBatchResult> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
  const rows = await executor.query<Array<{ deletedRows: number | string }>>(
    `;WITH expired AS (
       SELECT TOP (@0) [id]
       FROM [ai_run_coordination_entries] WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE ${EXPIRED_PREDICATE}
       ORDER BY [total_deadline_at], [queue_sequence]
     )
     DELETE FROM expired;
     SELECT CONVERT(bigint, @@ROWCOUNT) AS deletedRows;`,
    [boundedLimit],
  )
  return { deletedRows: nonNegative(rows[0]?.deletedRows ?? 0) ?? 0 }
}

export function createAiRunCoordinationCleanupTarget(
  executor: TransientCleanupQueryExecutor,
): TransientCleanupTarget {
  return {
    inspect: () => inspectExpiredAiRunCoordinationEntries(executor),
    kind: 'ai_run_coordination_entries',
    purgeBatch: (limit: number) =>
      purgeExpiredAiRunCoordinationEntries(executor, limit),
  }
}
