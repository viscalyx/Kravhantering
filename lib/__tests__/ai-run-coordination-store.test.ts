import { describe, expect, it, vi } from 'vitest'
import type { AiRunIdentity } from '@/lib/ai/run-contracts'
import { createSqlServerAiRunCoordinationStore } from '@/lib/ai/run-coordination-store'
import type { SqlServerDatabase } from '@/lib/db'

const IDENTITY = {
  aiConnectionId: '10000000-0000-4000-8000-000000000001',
  aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
  aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000001',
} as AiRunIdentity

function database(results: unknown[][]) {
  const query = vi.fn(async () => results.shift() ?? [])
  const manager = { query }
  const transaction = vi.fn(async (_isolation, use) => use(manager))
  return {
    db: { query, transaction } as unknown as SqlServerDatabase,
    query,
    transaction,
  }
}

describe('SQL Server AI run coordination store', () => {
  it('atomically admits against breaker, FIFO queue capacity, and active concurrency', async () => {
    const { db, query, transaction } = database([
      [{ admissionStatus: 'queued' }],
    ])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.enqueue({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        identity: IDENTITY,
        queueCapacity: 10,
        totalDeadlineAt: new Date('2026-08-19T12:20:00Z'),
      }),
    ).resolves.toEqual({ status: 'queued' })

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toMatch(/UPDLOCK, HOLDLOCK/u)
    expect(sql).toContain('queue_full')
    expect(sql).toContain(
      '@running + @waiting_for_connection >= @connection_maximum_concurrency',
    )
    expect(sql).toContain(
      '@model_running + @waiting_for_model >= @model_maximum_concurrency',
    )
    expect(sql).not.toMatch(/prompt|image|result|content/u)
  })

  it('acquires only the FIFO head when effective distributed capacity is available', async () => {
    const { db, query } = database([[{ acquisitionStatus: 'acquired' }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.acquire({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        leaseDurationMs: 30_000,
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ status: 'acquired' })

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain('MIN([queue_sequence])')
    expect(sql).toContain('@connection_maximum_concurrency')
    expect(sql).toContain('@model_maximum_concurrency')
    expect(sql).toContain(
      '[ai_connection_model_revision_id] = @model_revision_id',
    )
    expect(sql).toContain('[lease_expires_at]')
  })

  it('opens immediately for authentication and at five qualifying failures', async () => {
    const { db, query } = database([[{ breakerOpened: 1 }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.finish({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        failure: { category: 'authentication_failed', retryable: false },
        outcome: 'failed',
      }),
    ).resolves.toEqual({ breakerOpened: true })

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain("@1 = N'authentication_failed'")
    expect(sql).toContain('[is_manual_recovery_required] = 1')
    expect(sql).toContain('[consecutive_failure_count] >= 4')
    expect(sql).toContain('DATEADD(minute, 60, @now)')
    expect(
      sql.match(/AND \[circuit_breaker_status\] = N'closed';/gu),
    ).toHaveLength(3)
  })

  it('leases only eligible automatic recovery probes and stops after five', async () => {
    const { db, query } = database([[{ probeStatus: 'acquired' }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.acquireRecoveryProbe({
        leaseDurationMs: 30_000,
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        modelRevisionId: IDENTITY.aiConnectionModelRevisionId,
        probeRunId: '50000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBe(true)

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain(
      "NOT IN (N'authentication_failed', N'capability_mismatch'",
    )
    expect(sql).toContain('[automatic_recovery_attempt_count] < 5')
    expect(sql).toContain('[automatic_recovery_attempt_count] + 1')
    expect(sql).toContain('[automatic_recovery_attempt_count] >= 5;')
    expect(sql).toContain('[lease_expires_at] <= @now')
    expect(sql).toContain("[circuit_breaker_status] = N'half_open'")
  })

  it('turns an authentication failure during recovery into manual recovery', async () => {
    const { db, query } = database([[]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await store.finishRecoveryProbe({
      failure: { category: 'authentication_failed', retryable: false },
      leaseOwnerId: '40000000-0000-4000-8000-000000000001',
      modelRevisionId: IDENTITY.aiConnectionModelRevisionId,
      probeRunId: '50000000-0000-4000-8000-000000000001',
      succeeded: false,
    })

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    const parameters = (query.mock.calls as unknown[][])[0]?.[1]
    expect(sql).toContain("@4 = N'authentication_failed'")
    expect(sql).toContain('[is_manual_recovery_required] = 1')
    expect(parameters).toEqual([
      IDENTITY.aiConnectionModelRevisionId,
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      0,
      'authentication_failed',
    ])
  })
})
