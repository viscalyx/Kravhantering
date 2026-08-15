import { recordSecurityEvent } from '../auth/audit'
import type {
  ExpiredTransientStateBacklog,
  TransientCleanupBatchResult,
  TransientCleanupQueryExecutor,
} from './requirement-import-validation-sessions'
import type { TransientCleanupTarget } from './runner'

interface LifecycleRow {
  captureWindowId: number | string
  deletedRows?: number | string
  direction: string
  expiresAt?: Date | string
  operation: string
}

interface BacklogRow {
  expiredRowCount: number | string
  expiredStoredBytes: number | string
  oldestExpiredAgeMs: number | string | null
}

interface DeletedEvidenceRow {
  captureWindowId: number | string
}

function nonNegative(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function recordLifecycle(
  event: 'ai.forensic_capture.expired' | 'ai.forensic_evidence.purged',
  row: LifecycleRow,
): void {
  recordSecurityEvent({
    actor: { source: 'anonymous' },
    detail: {
      captureWindowId: nonNegative(row.captureWindowId),
      direction: row.direction,
      ...(row.deletedRows == null
        ? {}
        : { deletedRows: nonNegative(row.deletedRows) }),
      ...(row.expiresAt == null
        ? {}
        : {
            expiresAt:
              row.expiresAt instanceof Date
                ? row.expiresAt.toISOString()
                : new Date(row.expiresAt).toISOString(),
          }),
      operation: row.operation,
    },
    event,
    outcome: 'success',
    request: {
      method: 'SYSTEM',
      path: '/scheduled/ai-forensic-evidence-cleanup',
    },
  })
}

export async function inspectExpiredAiForensicEvidence(
  executor: TransientCleanupQueryExecutor,
): Promise<ExpiredTransientStateBacklog> {
  const rows = await executor.query<BacklogRow[]>(`
    SELECT
      COUNT_BIG(*) AS expiredRowCount,
      COALESCE(SUM(CONVERT(bigint, DATALENGTH(evidence.evidence_json))), 0)
        AS expiredStoredBytes,
      DATEDIFF_BIG(
        millisecond,
        MIN(COALESCE(capture.stopped_at, capture.expires_at)),
        SYSUTCDATETIME()
      ) AS oldestExpiredAgeMs
    FROM ai_forensic_capture_windows AS capture
    LEFT JOIN ai_forensic_evidence_events AS evidence
      ON evidence.ai_forensic_capture_window_id = capture.id
    WHERE (
        capture.expiry_audited_at IS NULL
        AND capture.stopped_at IS NULL
        AND capture.expires_at <= SYSUTCDATETIME()
      ) OR (
        capture.purged_at IS NULL
        AND COALESCE(capture.stopped_at, capture.expires_at)
          <= DATEADD(hour, -72, SYSUTCDATETIME())
      )
  `)
  const row = rows[0]
  return {
    expiredRowCount: nonNegative(row?.expiredRowCount),
    expiredStoredBytes: nonNegative(row?.expiredStoredBytes),
    oldestExpiredAgeMs:
      row?.oldestExpiredAgeMs == null
        ? null
        : nonNegative(row.oldestExpiredAgeMs),
  }
}

export async function purgeExpiredAiForensicEvidence(
  executor: TransientCleanupQueryExecutor,
  limit = 100,
): Promise<TransientCleanupBatchResult> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
  const expired = await executor.query<LifecycleRow[]>(
    `
      ;WITH expired AS (
        SELECT TOP (@0) *
        FROM ai_forensic_capture_windows WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE expiry_audited_at IS NULL
          AND stopped_at IS NULL
          AND expires_at <= SYSUTCDATETIME()
        ORDER BY expires_at, id
      )
      UPDATE expired
      SET expiry_audited_at = SYSUTCDATETIME(),
          is_open = NULL
      OUTPUT INSERTED.id AS captureWindowId, INSERTED.operation,
        INSERTED.direction, INSERTED.expires_at AS expiresAt;
    `,
    [boundedLimit],
  )
  for (const row of expired) {
    recordLifecycle('ai.forensic_capture.expired', row)
  }

  const deletedEvidence = await executor.query<DeletedEvidenceRow[]>(
    `
      ;WITH due_events AS (
        SELECT TOP (@0) evidence.id
        FROM ai_forensic_evidence_events AS evidence WITH (
          UPDLOCK, READPAST, ROWLOCK
        )
        INNER JOIN ai_forensic_capture_windows AS capture
          ON capture.id = evidence.ai_forensic_capture_window_id
        WHERE capture.purged_at IS NULL
          AND COALESCE(capture.stopped_at, capture.expires_at)
            <= DATEADD(hour, -72, SYSUTCDATETIME())
        ORDER BY capture.expires_at, evidence.id
      )
      DELETE evidence
      OUTPUT DELETED.ai_forensic_capture_window_id AS captureWindowId
      FROM ai_forensic_evidence_events AS evidence
      INNER JOIN due_events ON due_events.id = evidence.id;
    `,
    [boundedLimit],
  )
  const deletedByCapture = new Map<number, number>()
  for (const row of deletedEvidence) {
    const id = nonNegative(row.captureWindowId)
    deletedByCapture.set(id, (deletedByCapture.get(id) ?? 0) + 1)
  }

  const purged = await executor.query<LifecycleRow[]>(
    `
      ;WITH completed AS (
        SELECT TOP (@0) capture.*
        FROM ai_forensic_capture_windows AS capture WITH (
          UPDLOCK, READPAST, ROWLOCK
        )
        WHERE capture.purged_at IS NULL
          AND COALESCE(capture.stopped_at, capture.expires_at)
            <= DATEADD(hour, -72, SYSUTCDATETIME())
          AND NOT EXISTS (
            SELECT 1 FROM ai_forensic_evidence_events AS evidence
            WHERE evidence.ai_forensic_capture_window_id = capture.id
          )
        ORDER BY capture.expires_at, capture.id
      )
      UPDATE completed
      SET purged_at = SYSUTCDATETIME(), is_open = NULL
      OUTPUT INSERTED.id AS captureWindowId, INSERTED.operation,
        INSERTED.direction;
    `,
    [boundedLimit],
  )
  for (const row of purged) {
    recordLifecycle('ai.forensic_evidence.purged', {
      ...row,
      deletedRows: deletedByCapture.get(nonNegative(row.captureWindowId)) ?? 0,
    })
  }
  return {
    deletedRows: Math.max(deletedEvidence.length, purged.length),
  }
}

export function createAiForensicEvidenceCleanupTarget(
  executor: TransientCleanupQueryExecutor,
): TransientCleanupTarget {
  return {
    inspect: () => inspectExpiredAiForensicEvidence(executor),
    kind: 'ai_forensic_evidence' as const,
    purgeBatch: (limit: number) =>
      purgeExpiredAiForensicEvidence(executor, limit),
  }
}
