import type {
  ExpiredTransientStateBacklog,
  TransientCleanupBatchResult,
} from './requirement-import-validation-sessions'

export type TransientCleanupOutcome = 'failure' | 'success'

export interface TransientCleanupTarget {
  inspect(): Promise<ExpiredTransientStateBacklog>
  kind: string
  purgeBatch(limit: number): Promise<TransientCleanupBatchResult>
}

export interface TransientCleanupLogEvent {
  deletedRows: number
  durationMs: number
  event:
    | 'transient_cleanup.run.completed'
    | 'transient_cleanup.target.completed'
  expiredRowCount: number | null
  expiredStoredBytes: number | null
  failureCode?: 'target_execution_failed'
  kind: string
  oldestExpiredAgeMs: number | null
  operation: 'transient_state_cleanup'
  outcome: TransientCleanupOutcome
  remainingExpiredRowCount: number | null
}

export interface TransientCleanupTargetResult {
  deletedRows: number
  durationMs: number
  failureCode?: 'target_execution_failed'
  initialExpiredRowCount: number | null
  initialExpiredStoredBytes: number | null
  initialOldestExpiredAgeMs: number | null
  kind: string
  outcome: TransientCleanupOutcome
  remainingExpiredRowCount: number | null
}

export interface TransientCleanupRunResult {
  deletedRows: number
  durationMs: number
  outcome: TransientCleanupOutcome
  targets: TransientCleanupTargetResult[]
}

export interface TransientCleanupRunOptions {
  backlogTarget: number
  batchSize: number
  record?: (event: TransientCleanupLogEvent) => void
  workLimit: number
}

function recordSafely(
  record: TransientCleanupRunOptions['record'],
  event: TransientCleanupLogEvent,
): void {
  try {
    record?.(event)
  } catch {
    // Cleanup must not fail because its telemetry destination is unavailable.
  }
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return minimum
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}

async function inspectAfterFailure(
  target: TransientCleanupTarget,
): Promise<ExpiredTransientStateBacklog | null> {
  try {
    return await target.inspect()
  } catch {
    return null
  }
}

export async function runTransientStateCleanup(
  targets: readonly TransientCleanupTarget[],
  options: TransientCleanupRunOptions,
): Promise<TransientCleanupRunResult> {
  const startedAt = Date.now()
  const batchSize = boundedInteger(options.batchSize, 1, 500)
  const backlogTarget = boundedInteger(
    options.backlogTarget,
    0,
    Number.MAX_SAFE_INTEGER,
  )
  let remainingWork = boundedInteger(
    options.workLimit,
    1,
    Number.MAX_SAFE_INTEGER,
  )
  const results: TransientCleanupTargetResult[] = []

  for (const target of targets) {
    const targetStartedAt = Date.now()
    let deletedRows = 0
    let initial: ExpiredTransientStateBacklog | null = null
    let current: ExpiredTransientStateBacklog | null = null
    let outcome: TransientCleanupOutcome = 'success'
    let failureCode: 'target_execution_failed' | undefined

    try {
      initial = await target.inspect()
      current = initial
      let estimatedExpiredRowCount = current.expiredRowCount
      let attemptedPurge = false
      while (remainingWork > 0 && estimatedExpiredRowCount > backlogTarget) {
        const limit = Math.min(
          batchSize,
          remainingWork,
          estimatedExpiredRowCount - backlogTarget,
        )
        attemptedPurge = true
        const batch = await target.purgeBatch(limit)
        const boundedDeletedRows = boundedInteger(batch.deletedRows, 0, limit)
        deletedRows += boundedDeletedRows
        remainingWork -= boundedDeletedRows
        estimatedExpiredRowCount -= boundedDeletedRows
        if (boundedDeletedRows === 0) break
      }
      if (attemptedPurge) current = await target.inspect()
    } catch {
      outcome = 'failure'
      failureCode = 'target_execution_failed'
      current = await inspectAfterFailure(target)
    }

    const targetResult: TransientCleanupTargetResult = {
      deletedRows,
      durationMs: Date.now() - targetStartedAt,
      ...(failureCode ? { failureCode } : {}),
      initialExpiredRowCount: initial?.expiredRowCount ?? null,
      initialExpiredStoredBytes: initial?.expiredStoredBytes ?? null,
      initialOldestExpiredAgeMs: initial?.oldestExpiredAgeMs ?? null,
      kind: target.kind,
      outcome,
      remainingExpiredRowCount: current?.expiredRowCount ?? null,
    }
    results.push(targetResult)
    recordSafely(options.record, {
      deletedRows,
      durationMs: targetResult.durationMs,
      event: 'transient_cleanup.target.completed',
      expiredRowCount: initial?.expiredRowCount ?? null,
      expiredStoredBytes: initial?.expiredStoredBytes ?? null,
      ...(failureCode ? { failureCode } : {}),
      kind: target.kind,
      oldestExpiredAgeMs: initial?.oldestExpiredAgeMs ?? null,
      operation: 'transient_state_cleanup',
      outcome,
      remainingExpiredRowCount: current?.expiredRowCount ?? null,
    })
  }

  const outcome = results.some(result => result.outcome === 'failure')
    ? 'failure'
    : 'success'
  const result: TransientCleanupRunResult = {
    deletedRows: results.reduce((sum, target) => sum + target.deletedRows, 0),
    durationMs: Date.now() - startedAt,
    outcome,
    targets: results,
  }
  recordSafely(options.record, {
    deletedRows: result.deletedRows,
    durationMs: result.durationMs,
    event: 'transient_cleanup.run.completed',
    expiredRowCount: null,
    expiredStoredBytes: null,
    kind: 'all',
    oldestExpiredAgeMs: null,
    operation: 'transient_state_cleanup',
    outcome,
    remainingExpiredRowCount: null,
  })
  return result
}
