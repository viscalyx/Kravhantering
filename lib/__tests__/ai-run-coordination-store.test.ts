import { describe, expect, it, vi } from 'vitest'
import type { AiRunIdentity } from '@/lib/ai/run-contracts'
import { createSqlServerAiRunCoordinationStore } from '@/lib/ai/run-coordination-store'
import type { SqlServerDatabase } from '@/lib/db'

const IDENTITY = {
  aiConnectionId: '10000000-0000-4000-8000-000000000001',
  aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: '30000000-0000-4000-8000-000000000001',
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
  it.each([
    [
      {
        activeConcurrency: '2',
        admissionStatus: 'queue_full',
        queueDepth: '3',
      },
      {
        activeConcurrency: 2,
        queueDepth: 3,
        retryAfterSeconds: 60,
        status: 'queue_full',
      },
    ],
    [
      { admissionStatus: 'breaker_open' },
      { retryAfterSeconds: 3600, status: 'breaker_open' },
    ],
    [undefined, { retryAfterSeconds: 3600, status: 'breaker_open' }],
  ] as const)('normalizes every admission result', async (row, expected) => {
    const { db } = database([[...(row ? [row] : [])]])

    await expect(
      createSqlServerAiRunCoordinationStore(db).enqueue({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        identity: IDENTITY,
        queueCapacity: 1,
        totalDeadlineAt: new Date('2026-08-19T12:20:00Z'),
      }),
    ).resolves.toEqual(expected)
  })

  it.each([
    [{ acquisitionStatus: 'waiting' }, { status: 'waiting' }],
    [{ acquisitionStatus: 'expired' }, { status: 'expired' }],
    [
      {
        acquisitionStatus: 'cancelled',
        cancellationReason: 'profile_suspended',
        cancellationRequestedAt: new Date('2026-08-20T12:00:00.000Z'),
      },
      {
        reason: 'profile_suspended',
        requestedAt: new Date('2026-08-20T12:00:00.000Z'),
        status: 'cancelled',
      },
    ],
    [
      { acquisitionStatus: 'breaker_open' },
      { retryAfterSeconds: 3600, status: 'breaker_open' },
    ],
    [
      {
        acquisitionStatus: 'acquired',
        activeConcurrency: '2',
        queueDepth: '3',
      },
      { activeConcurrency: 2, queueDepth: 3, status: 'acquired' },
    ],
    [{ acquisitionStatus: 'acquired' }, { status: 'acquired' }],
    [undefined, { status: 'waiting' }],
  ] as const)('normalizes every acquisition result', async (row, expected) => {
    const { db } = database([[...(row ? [row] : [])]])

    await expect(
      createSqlServerAiRunCoordinationStore(db).acquire({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseDurationMs: 30_000,
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual(expected)
  })

  it('atomically admits against breaker, FIFO queue capacity, and active concurrency', async () => {
    const { db, query, transaction } = database([
      [{ admissionStatus: 'queued' }],
    ])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.enqueue({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
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
    expect(sql).toContain(
      'INSERT INTO [ai_connection_model_operational_states]',
    )
    expect(sql).toContain('queue_full')
    expect(sql).toContain(
      '@running + @waiting_for_connection >= @connection_maximum_concurrency',
    )
    expect(sql).toContain(
      '@model_running + @waiting_for_model >= @model_maximum_concurrency',
    )
    expect(sql).toContain("[revision].[status] = N'verified'")
    expect(sql).toContain(
      "([status] <> N'running' AND [total_deadline_at] <= @now)",
    )
    expect(sql).not.toMatch(/prompt|image|result|content/u)
  })

  it('acquires only the FIFO head when effective distributed capacity is available', async () => {
    const { db, query } = database([[{ acquisitionStatus: 'acquired' }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.acquire({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
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
    expect(sql).toContain(
      "([status] <> N'running' AND [total_deadline_at] <= @now)",
    )
    expect(sql).toContain("N'cancelled' AS [acquisitionStatus]")
    expect(sql).toContain(
      '[cancellation_requested_at] AS [cancellationRequestedAt]',
    )
    expect(sql).toContain('[cancellation_reason] AS [cancellationReason]')
  })

  it('opens immediately for authentication and at five qualifying failures', async () => {
    const { db, query } = database([[{ breakerOpened: 1 }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.finish({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        failure: { category: 'authentication_failed', retryable: false },
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        outcome: 'failed',
      }),
    ).resolves.toMatchObject({ breakerOpened: true })

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain("@1 = N'authentication_failed'")
    expect(sql).toContain('[is_manual_recovery_required] = 1')
    expect(sql).toContain('[consecutive_failure_count] >= 4')
    expect(sql).toContain('[fencing_token] = @4')
    expect(sql).toContain('[lease_owner_id] = @5')
    expect(sql).toContain("[status] = N'running'")
    expect(sql).toContain('[lease_expires_at] > @now')
    expect(sql).toContain('DATEADD(minute, 60, @now)')
    expect(
      sql.match(/AND \[circuit_breaker_status\] = N'closed';/gu),
    ).toHaveLength(3)
  })

  it('returns complete state transitions for successful runs and probes', async () => {
    const state = {
      breakerOpened: 0,
      breakerStatus: 'closed',
      healthStateChanged: 1,
      healthStatus: 'healthy',
    }
    const { db, query } = database([[state], [state]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.finish({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        outcome: 'completed',
      }),
    ).resolves.toEqual({
      breakerOpened: false,
      breakerStatus: 'closed',
      healthStateChanged: true,
      healthStatus: 'healthy',
    })
    await expect(
      store.finishRecoveryProbe({
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        modelRevisionId: IDENTITY.aiConnectionModelRevisionId,
        probeRunId: '50000000-0000-4000-8000-000000000001',
        succeeded: true,
      }),
    ).resolves.toMatchObject({ healthStatus: 'healthy' })
    const finishProbeSql = String((query.mock.calls as unknown[][])[1]?.[0])
    expect(finishProbeSql).toContain("@previous_breaker <> N'open'")
  })

  it('fences renewals and retries by both invocation and lease ownership', async () => {
    const { db, query } = database([[{ renewed: 1 }], [{ requeued: 1 }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.renew({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseDurationMs: 30_000,
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBe(true)
    await expect(
      store.requeueForRetry({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        notBefore: new Date('2026-08-19T12:00:01Z'),
      }),
    ).resolves.toBe('applied')

    const calls = query.mock.calls as unknown[][]
    expect(String(calls[0]?.[0])).toContain('[fencing_token] = @3')
    expect(String(calls[1]?.[0])).toContain(
      '[lease_owner_id] = @2 AND [fencing_token] = @3',
    )
    expect(String(calls[1]?.[0])).toContain(
      '[lease_expires_at] > SYSUTCDATETIME()',
    )
  })

  it('returns the durable cancellation reason and SQL request time only for the exact live lease', async () => {
    const requestedAt = new Date('2026-08-20T12:00:00.000Z')
    const { db, query } = database([
      [
        {
          cancellationReason: 'connection_suspended',
          cancellationRequestedAt: requestedAt,
        },
      ],
    ])

    await expect(
      createSqlServerAiRunCoordinationStore(db).cancellationRequested?.({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseOwnerId: '50000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({
      reason: 'connection_suspended',
      requestedAt,
    })
    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain('[application_run_id] = @0')
    expect(sql).toContain('[fencing_token] = @1')
    expect(sql).toContain('[lease_owner_id] = @2')
    expect(sql).toContain("[status] = N'running'")
    expect(sql).toContain('[lease_expires_at] > SYSUTCDATETIME()')
  })

  it('polls only the exact fenced queued or retry-wait row when no lease owner is supplied', async () => {
    const requestedAt = new Date('2026-08-20T12:00:00.000Z')
    const { db, query } = database([
      [
        {
          cancellationReason: 'profile_suspended',
          cancellationRequestedAt: requestedAt,
        },
      ],
    ])

    await expect(
      createSqlServerAiRunCoordinationStore(db).cancellationRequested?.({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ reason: 'profile_suspended', requestedAt })
    const call = query.mock.calls[0] as unknown[]
    expect(call[1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
    ])
    expect(String(call[0])).toContain(
      "@2 IS NULL AND [status] IN (N'queued', N'retry_wait')",
    )
  })

  it('reports a lost lease when retry requeue is not applied', async () => {
    const { db } = database([[]])

    await expect(
      createSqlServerAiRunCoordinationStore(db).requeueForRetry({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        notBefore: new Date('2026-08-19T12:00:01Z'),
      }),
    ).resolves.toBe('lease_lost')
  })

  it('abandons only fenced queued or retry-wait rows without health mutation', async () => {
    const { db, query } = database([[]])

    await expect(
      createSqlServerAiRunCoordinationStore(db).abandon({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeUndefined()

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain("[status] IN (N'queued', N'retry_wait')")
    expect(sql).toContain('[fencing_token] = @1')
    expect(sql).not.toContain('ai_connection_model_operational_states')
  })

  it('reports a lost lease and ignores incomplete due-target rows', async () => {
    const { db } = database([
      [],
      [
        {},
        { adapterType: 'controlled_test', adapterVersion: '1' },
        {
          adapterType: 'controlled_test',
          adapterVersion: '1',
          aiConnectionId: 'connection',
        },
        {
          adapterType: 'controlled_test',
          adapterVersion: '1',
          aiConnectionId: 'connection',
          aiConnectionModelRevisionId: 'model',
        },
        {
          adapterType: 'controlled_test',
          adapterVersion: '1',
          aiConnectionId: 'connection',
          aiConnectionModelRevisionId: 'model',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile',
        },
        {
          adapterType: 'controlled_test',
          adapterVersion: '1',
          aiConnectionId: 'connection',
          aiConnectionModelRevisionId: 'model',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile',
          runType: 'generate_without_images',
        },
      ],
      [],
      [],
    ])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.renew({
        applicationRunId: '00000000-0000-4000-8000-000000000001',
        fencingToken: '40000000-0000-4000-8000-000000000001',
        leaseDurationMs: 30_000,
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBe(false)
    await expect(store.listDueRecoveryProbes(0)).resolves.toEqual([])
    await expect(
      store.acquireRecoveryProbe({
        identity: IDENTITY,
        leaseDurationMs: 1,
        leaseOwnerId: 'owner',
        modelRevisionId: 'model',
        probeRunId: 'probe',
      }),
    ).resolves.toBe(false)
    await expect(
      store.acquireManualRecoveryProbe({
        identity: IDENTITY,
        leaseDurationMs: 1,
        leaseOwnerId: 'owner',
        modelRevisionId: 'model',
        probeRunId: 'probe',
      }),
    ).resolves.toBeNull()
  })

  it('leases only eligible automatic recovery probes and stops after five', async () => {
    const { db, query } = database([[{ probeStatus: 'acquired' }]])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.acquireRecoveryProbe({
        identity: IDENTITY,
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
    expect(sql).toContain('[probe_connection].[maximum_concurrency]')
    expect(sql).toContain('[probe_revision].[maximum_concurrency]')
    expect(sql).toContain('INSERT INTO [ai_run_coordination_entries]')
    expect(sql).toContain("@2, @2, @4, @0, @5, @6, N'running'")
  })

  it('lists only bounded due open recovery targets with active dependencies', async () => {
    const { db, query } = database([
      [
        {
          adapterType: 'controlled_test',
          adapterVersion: '1',
          aiConnectionId: IDENTITY.aiConnectionId,
          aiConnectionModelRevisionId: IDENTITY.aiConnectionModelRevisionId,
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: IDENTITY.aiRunProfileId,
          inactivityTimeBudgetMs: 3_000,
          runType: 'generate_without_images',
          totalTimeBudgetMs: 10_000,
        },
      ],
    ])

    await expect(
      createSqlServerAiRunCoordinationStore(db).listDueRecoveryProbes(500),
    ).resolves.toEqual([
      {
        adapterType: 'controlled_test',
        adapterVersion: '1',
        identity: IDENTITY,
        inactivityTimeBudgetMs: 3_000,
        runType: 'generate_without_images',
        totalTimeBudgetMs: 10_000,
      },
    ])
    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain("[state].[circuit_breaker_status] = N'open'")
    expect(sql).toContain('[state].[next_recovery_at] <= SYSUTCDATETIME()')
    expect(sql).toContain('[connection].[adapter_key] AS [adapterType]')
    expect((query.mock.calls as unknown[][])[0]?.[1]).toEqual([100])
  })

  it('leases explicit manual probes independently from automatic eligibility', async () => {
    const { db, query } = database([
      [
        {
          breakerStatus: 'closed',
          healthStatus: 'healthy',
          probeStatus: 'acquired',
        },
      ],
    ])
    const store = createSqlServerAiRunCoordinationStore(db)

    await expect(
      store.acquireManualRecoveryProbe({
        identity: IDENTITY,
        leaseDurationMs: 30_000,
        leaseOwnerId: '40000000-0000-4000-8000-000000000001',
        modelRevisionId: IDENTITY.aiConnectionModelRevisionId,
        probeRunId: '50000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({
      breakerStatus: 'closed',
      healthStatus: 'healthy',
    })

    const sql = String((query.mock.calls as unknown[][])[0]?.[0])
    expect(sql).toContain("[circuit_breaker_status] IN (N'closed', N'open')")
    expect(sql).toContain(
      "WHEN [circuit_breaker_status] = N'open' THEN N'half_open'",
    )
    expect(sql).toContain('DELETED.[circuit_breaker_status]')
    expect(sql).toContain('INSERT INTO [ai_run_coordination_entries]')
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
    expect(sql).toContain(
      "@4 IN (N'authentication_failed', N'capability_mismatch')",
    )
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
