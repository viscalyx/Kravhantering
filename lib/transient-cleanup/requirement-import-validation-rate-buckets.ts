import type {
  ExpiredTransientStateBacklog,
  TransientCleanupBatchResult,
  TransientCleanupQueryExecutor,
} from './requirement-import-validation-sessions'

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

export async function inspectExpiredRequirementImportValidationRateBuckets(
  executor: TransientCleanupQueryExecutor,
): Promise<ExpiredTransientStateBacklog> {
  const rows = await executor.query<BacklogRow[]>(`
    SELECT
      COUNT_BIG(*) AS expiredRowCount,
      COALESCE(SUM(CONVERT(bigint,
        DATALENGTH(id) +
        DATALENGTH(principal_fingerprint) +
        DATALENGTH(window_started_at) +
        DATALENGTH(successful_creations) +
        DATALENGTH(expires_at) +
        DATALENGTH(created_at) +
        DATALENGTH(updated_at)
      )), CONVERT(bigint, 0)) AS expiredStoredBytes,
      DATEDIFF_BIG(
        millisecond,
        MIN(expires_at),
        SYSUTCDATETIME()
      ) AS oldestExpiredAgeMs
    FROM requirement_import_validation_rate_buckets
    WHERE expires_at <= SYSUTCDATETIME()
  `)
  const row = rows[0]
  return {
    expiredRowCount: toNonNegativeNumber(row?.expiredRowCount ?? 0) ?? 0,
    expiredStoredBytes: toNonNegativeNumber(row?.expiredStoredBytes ?? 0) ?? 0,
    oldestExpiredAgeMs: toNonNegativeNumber(row?.oldestExpiredAgeMs ?? null),
  }
}

export async function purgeExpiredRequirementImportValidationRateBuckets(
  executor: TransientCleanupQueryExecutor,
  limit = 100,
): Promise<TransientCleanupBatchResult> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
  const rows = await executor.query<DeletedRowsRow[]>(
    `;WITH expired AS (
       SELECT TOP (@0) id
       FROM requirement_import_validation_rate_buckets WITH (
         UPDLOCK, READPAST, ROWLOCK
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

export function createRequirementImportValidationRateBucketCleanupTarget(
  executor: TransientCleanupQueryExecutor,
) {
  return {
    inspect: () =>
      inspectExpiredRequirementImportValidationRateBuckets(executor),
    kind: 'requirement_import_validation_rate_buckets' as const,
    purgeBatch: (limit: number) =>
      purgeExpiredRequirementImportValidationRateBuckets(executor, limit),
  }
}
