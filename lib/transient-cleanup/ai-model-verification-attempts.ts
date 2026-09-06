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

interface DeletedRowsRow {
  deletedRows: number | string
}

function toNonNegativeNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export async function inspectExpiredAiModelVerificationAttempts(
  executor: TransientCleanupQueryExecutor,
): Promise<ExpiredTransientStateBacklog> {
  const rows = await executor.query<BacklogRow[]>(`
    SELECT
      COUNT_BIG(*) AS expiredRowCount,
      COALESCE(SUM(CONVERT(bigint,
        DATALENGTH(id) + DATALENGTH(ai_connection_id) + DATALENGTH(fingerprint) +
        DATALENGTH(payload_json) + DATALENGTH(created_at) + DATALENGTH(expires_at)
      )), CONVERT(bigint, 0)) AS expiredStoredBytes,
      DATEDIFF_BIG(
        millisecond,
        MIN(expires_at),
        SYSUTCDATETIME()
      ) AS oldestExpiredAgeMs
    FROM ai_model_verification_attempts WITH (READPAST, READCOMMITTEDLOCK)
    WHERE expires_at <= SYSUTCDATETIME()
  `)
  const row = rows[0]
  return {
    expiredRowCount: toNonNegativeNumber(row?.expiredRowCount ?? 0) ?? 0,
    expiredStoredBytes: toNonNegativeNumber(row?.expiredStoredBytes ?? 0) ?? 0,
    oldestExpiredAgeMs: toNonNegativeNumber(row?.oldestExpiredAgeMs ?? null),
  }
}

export async function purgeExpiredAiModelVerificationAttempts(
  executor: TransientCleanupQueryExecutor,
  limit = 100,
): Promise<TransientCleanupBatchResult> {
  const boundedLimit = Math.max(
    1,
    Math.min(500, Math.trunc(Number.isFinite(limit) ? limit : 1)),
  )
  const rows = await executor.query<DeletedRowsRow[]>(
    `;WITH expired AS (
       SELECT TOP (@0) id
       FROM ai_model_verification_attempts WITH (
         UPDLOCK, READPAST, READCOMMITTEDLOCK
       )
       WHERE expires_at <= SYSUTCDATETIME()
       ORDER BY expires_at, id
     )
     DELETE FROM expired;
     SELECT CONVERT(bigint, @@ROWCOUNT) AS deletedRows;`,
    [boundedLimit],
  )
  return {
    deletedRows: toNonNegativeNumber(rows[0]?.deletedRows ?? 0) ?? 0,
  }
}

export function createAiModelVerificationAttemptCleanupTarget(
  executor: TransientCleanupQueryExecutor,
): TransientCleanupTarget {
  return {
    inspect: () => inspectExpiredAiModelVerificationAttempts(executor),
    kind: 'ai_model_verification_attempts' as const,
    purgeBatch: (limit: number) =>
      purgeExpiredAiModelVerificationAttempts(executor, limit),
  }
}
