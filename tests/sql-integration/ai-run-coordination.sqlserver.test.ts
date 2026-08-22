import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AiRunIdentity } from '@/lib/ai/run-contracts'
import { createSqlServerAiRunCoordinationStore } from '@/lib/ai/run-coordination-store'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'
import type { SqlServerDatabase } from '@/lib/db'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

async function createCoordinationFixture(db: SqlServerDatabase): Promise<{
  identity: AiRunIdentity
}> {
  const connection = (await db.query(
    `INSERT INTO ai_connections (
       administration_name, public_name, adapter_key, adapter_version,
       endpoint_url, authentication_type, tls_policy_key, egress_policy_key,
       data_policy_summary, lifecycle_status, configuration_version,
       maximum_concurrency, created_at, updated_at
     ) OUTPUT INSERTED.id AS id
     VALUES (@0, N'Coordination SQL', N'test', N'1',
       N'https://ai.example.test/v1', N'static_secret', N'public_web_pki',
       N'sql_test', N'No production data', N'active', 1, 1,
       SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [`Coordination ${randomUUID()}`],
  )) as Array<{ id: string }>
  const model = (await db.query(
    `INSERT INTO ai_connection_models (
       ai_connection_id, name, created_at, updated_at
     ) OUTPUT INSERTED.id AS id
     VALUES (@0, N'Coordination model', SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [connection[0]?.id],
  )) as Array<{ id: string }>
  const modelRevision = (await db.query(
    `INSERT INTO ai_connection_model_revisions (
       ai_connection_model_id, revision_number,
       connection_configuration_version, status, external_model_id,
       declared_capabilities_json, verified_capabilities_json, verified_at,
       maximum_concurrency, created_at, updated_at
     ) OUTPUT INSERTED.id AS id
     VALUES (@0, 1, 1, N'verified', N'external/sql-model', N'{}', N'{}',
       SYSUTCDATETIME(), 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [model[0]?.id],
  )) as Array<{ id: string }>
  const profileId = randomUUID()
  await db.query(
    `INSERT INTO ai_run_profiles (
       id, profile_key, ai_connection_model_revision_id,
       operational_status, created_at, updated_at
     ) VALUES (@0, N'generation_without_images', @1, N'enabled',
       SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [profileId, modelRevision[0]?.id],
  )
  return {
    identity: {
      aiConnectionId: connection[0]?.id,
      aiConnectionModelRevisionId: modelRevision[0]?.id,
      aiRunProfileConfigurationVersion: 1,
      aiRunProfileId: profileId,
    } as AiRunIdentity,
  }
}

async function createAdditionalModelIdentity(
  db: SqlServerDatabase,
  base: AiRunIdentity,
): Promise<AiRunIdentity> {
  const model = (await db.query(
    `INSERT INTO ai_connection_models (
       ai_connection_id, name, created_at, updated_at
     ) OUTPUT INSERTED.id AS id
     VALUES (@0, N'Additional coordination model',
       SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [base.aiConnectionId],
  )) as Array<{ id: string }>
  const modelRevision = (await db.query(
    `INSERT INTO ai_connection_model_revisions (
       ai_connection_model_id, revision_number,
       connection_configuration_version, status, external_model_id,
       declared_capabilities_json, verified_capabilities_json, verified_at,
       maximum_concurrency, created_at, updated_at
     ) OUTPUT INSERTED.id AS id
     VALUES (@0, 1, 1, N'verified', N'external/additional-sql-model', N'{}', N'{}',
       SYSUTCDATETIME(), 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [model[0]?.id],
  )) as Array<{ id: string }>
  const profileId = randomUUID()
  await db.query(
    `INSERT INTO ai_run_profiles (
       id, profile_key, ai_connection_model_revision_id,
       operational_status, created_at, updated_at
     ) VALUES (@0, N'invalid_json_repair', @1, N'enabled',
       SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [profileId, modelRevision[0]?.id],
  )
  return {
    aiConnectionId: base.aiConnectionId,
    aiConnectionModelRevisionId: modelRevision[0]?.id,
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: profileId,
  } as AiRunIdentity
}

describe('AI run coordination against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it('rejects queue admission for a revision requiring new verification', async () => {
    const db = appDb()
    const { identity } = await createCoordinationFixture(db)
    await db.query(
      `UPDATE [ai_connection_model_revisions]
       SET [status] = N'new_revision_required'
       WHERE [id] = @0`,
      [identity.aiConnectionModelRevisionId],
    )

    await expect(
      createSqlServerAiRunCoordinationStore(db).enqueue({
        applicationRunId: randomUUID(),
        fencingToken: randomUUID(),
        identity,
        queueCapacity: 1,
        totalDeadlineAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toEqual({ retryAfterSeconds: 3600, status: 'breaker_open' })

    const rows = (await db.query(
      `SELECT COUNT(*) AS [rowCount]
       FROM [ai_run_coordination_entries]
       WHERE [ai_connection_model_revision_id] = @0`,
      [identity.aiConnectionModelRevisionId],
    )) as Array<{ rowCount: number }>
    expect(Number(rows[0]?.rowCount ?? 0)).toBe(0)
  })

  it('does not lease a queued run after its model revision loses verification', async () => {
    const db = appDb()
    const { identity } = await createCoordinationFixture(db)
    const store = createSqlServerAiRunCoordinationStore(db)
    const applicationRunId = randomUUID()
    const fencingToken = randomUUID()
    await expect(
      store.enqueue({
        applicationRunId,
        fencingToken,
        identity,
        queueCapacity: 1,
        totalDeadlineAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toEqual({ status: 'queued' })
    await db.query(
      `UPDATE [ai_connection_model_revisions]
       SET [status] = N'new_revision_required'
       WHERE [id] = @0`,
      [identity.aiConnectionModelRevisionId],
    )

    await expect(
      store.acquire({
        applicationRunId,
        fencingToken,
        leaseDurationMs: 30_000,
        leaseOwnerId: randomUUID(),
      }),
    ).resolves.toEqual({ status: 'expired' })
  })

  it('atomically requests exact profile and connection cancellation without overwriting the first cause', async () => {
    const db = appDb()
    const { identity } = await createCoordinationFixture(db)
    const sibling = await createAdditionalModelIdentity(db, identity)
    const coordination = createSqlServerAiRunCoordinationStore(db)
    const admin = createSqlServerAiAdminStore(db, async () => undefined)
    const firstRun = randomUUID()
    const firstFence = randomUUID()
    const secondRun = randomUUID()
    const secondFence = randomUUID()
    const queuedProfileRun = randomUUID()
    const queuedProfileFence = randomUUID()
    const deadline = new Date(Date.now() + 60_000)
    await coordination.enqueue({
      applicationRunId: firstRun,
      fencingToken: firstFence,
      identity,
      queueCapacity: 10,
      totalDeadlineAt: deadline,
    })
    await coordination.acquire({
      applicationRunId: firstRun,
      fencingToken: firstFence,
      leaseDurationMs: 30_000,
      leaseOwnerId: firstFence,
    })
    await coordination.enqueue({
      applicationRunId: secondRun,
      fencingToken: secondFence,
      identity: sibling,
      queueCapacity: 10,
      totalDeadlineAt: deadline,
    })
    await coordination.enqueue({
      applicationRunId: queuedProfileRun,
      fencingToken: queuedProfileFence,
      identity,
      queueCapacity: 10,
      totalDeadlineAt: deadline,
    })
    const profileRows = (await db.query(
      `SELECT [revision_token] AS [revisionToken]
       FROM [ai_run_profiles] WHERE [profile_key] = N'generation_without_images'`,
    )) as Array<{ revisionToken: string }>
    await admin.setRunProfileOperationalStatus({
      profileKey: 'generation_without_images',
      revisionToken: profileRows[0]?.revisionToken ?? '',
      status: 'suspended',
    })
    await expect(
      coordination.cancellationRequested?.({
        applicationRunId: firstRun,
        fencingToken: firstFence,
        leaseOwnerId: firstFence,
      }),
    ).resolves.toEqual({
      reason: 'profile_suspended',
      requestedAt: expect.any(Date),
    })
    await expect(
      coordination.cancellationRequested?.({
        applicationRunId: queuedProfileRun,
        fencingToken: queuedProfileFence,
      }),
    ).resolves.toEqual({
      reason: 'profile_suspended',
      requestedAt: expect.any(Date),
    })
    const beforeConnectionSuspension = (await db.query(
      `SELECT [cancellation_reason] AS [cancellationReason]
       FROM [ai_run_coordination_entries]
       WHERE [application_run_id] IN (@0, @1, @2)
       ORDER BY [application_run_id]`,
      [firstRun, secondRun, queuedProfileRun],
    )) as Array<{ cancellationReason: string | null }>
    expect(
      beforeConnectionSuspension.map(row => row.cancellationReason),
    ).toEqual(
      expect.arrayContaining([null, 'profile_suspended', 'profile_suspended']),
    )

    const connectionRows = (await db.query(
      `SELECT [revision_token] AS [revisionToken]
       FROM [ai_connections] WHERE [id] = @0`,
      [identity.aiConnectionId],
    )) as Array<{ revisionToken: string }>
    await admin.setConnectionLifecycle({
      connectionId: identity.aiConnectionId,
      revisionToken: connectionRows[0]?.revisionToken ?? '',
      status: 'suspended',
    })
    const afterConnectionSuspension = (await db.query(
      `SELECT [application_run_id] AS [applicationRunId],
         [cancellation_reason] AS [cancellationReason]
       FROM [ai_run_coordination_entries]
       WHERE [application_run_id] IN (@0, @1, @2)`,
      [firstRun, secondRun, queuedProfileRun],
    )) as Array<{ applicationRunId: string; cancellationReason: string }>
    expect(afterConnectionSuspension).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationRunId: firstRun,
          cancellationReason: 'profile_suspended',
        }),
        expect.objectContaining({
          applicationRunId: secondRun,
          cancellationReason: 'connection_suspended',
        }),
        expect.objectContaining({
          applicationRunId: queuedProfileRun,
          cancellationReason: 'profile_suspended',
        }),
      ]),
    )
    await expect(
      coordination.cancellationRequested?.({
        applicationRunId: secondRun,
        fencingToken: secondFence,
      }),
    ).resolves.toEqual({
      reason: 'connection_suspended',
      requestedAt: expect.any(Date),
    })
    await expect(
      coordination.acquire({
        applicationRunId: secondRun,
        fencingToken: secondFence,
        leaseDurationMs: 30_000,
        leaseOwnerId: secondFence,
      }),
    ).resolves.toEqual({
      reason: 'connection_suspended',
      requestedAt: expect.any(Date),
      status: 'cancelled',
    })
  })

  it('enforces distributed capacity, bounded queueing, and lease transfer', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const deadline = new Date(Date.now() + 60_000)
    const first = randomUUID()
    const firstFence = randomUUID()
    const second = randomUUID()
    const secondFence = randomUUID()
    const third = randomUUID()
    const thirdFence = randomUUID()
    const fourth = randomUUID()
    const fourthFence = randomUUID()

    await expect(
      store.enqueue({
        applicationRunId: first,
        fencingToken: firstFence,
        identity,
        queueCapacity: 0,
        totalDeadlineAt: deadline,
      }),
    ).resolves.toEqual({ status: 'queued' })
    await expect(
      store.enqueue({
        applicationRunId: second,
        fencingToken: secondFence,
        identity,
        queueCapacity: 0,
        totalDeadlineAt: deadline,
      }),
    ).resolves.toMatchObject({ status: 'queue_full' })

    await expect(
      store.acquire({
        applicationRunId: first,
        fencingToken: firstFence,
        leaseDurationMs: 30_000,
        leaseOwnerId: firstFence,
      }),
    ).resolves.toMatchObject({ activeConcurrency: 1, status: 'acquired' })
    await expect(
      store.enqueue({
        applicationRunId: third,
        fencingToken: thirdFence,
        identity,
        queueCapacity: 1,
        totalDeadlineAt: deadline,
      }),
    ).resolves.toEqual({ status: 'queued' })
    await expect(
      store.enqueue({
        applicationRunId: fourth,
        fencingToken: fourthFence,
        identity,
        queueCapacity: 1,
        totalDeadlineAt: deadline,
      }),
    ).resolves.toMatchObject({ status: 'queue_full' })

    await store.finish({
      applicationRunId: first,
      fencingToken: firstFence,
      leaseOwnerId: firstFence,
      outcome: 'completed',
    })
    await expect(
      store.acquire({
        applicationRunId: third,
        fencingToken: thirdFence,
        leaseDurationMs: 30_000,
        leaseOwnerId: thirdFence,
      }),
    ).resolves.toMatchObject({ activeConcurrency: 1, status: 'acquired' })
    await store.finish({
      applicationRunId: third,
      fencingToken: thirdFence,
      leaseOwnerId: thirdFence,
      outcome: 'completed',
    })
  })

  it('keeps a past-deadline running row while its lease is live', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const runningId = randomUUID()
    const runningFence = randomUUID()
    await store.enqueue({
      applicationRunId: runningId,
      fencingToken: runningFence,
      identity,
      queueCapacity: 1,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.acquire({
      applicationRunId: runningId,
      fencingToken: runningFence,
      leaseDurationMs: 30_000,
      leaseOwnerId: runningFence,
    })
    await appDb().query(
      `UPDATE [ai_run_coordination_entries]
       SET [created_at] = DATEADD(minute, -2, SYSUTCDATETIME()),
           [total_deadline_at] = DATEADD(minute, -1, SYSUTCDATETIME())
       WHERE [application_run_id] = @0`,
      [runningId],
    )
    const queuedId = randomUUID()
    const queuedFence = randomUUID()
    await expect(
      store.enqueue({
        applicationRunId: queuedId,
        fencingToken: queuedFence,
        identity,
        queueCapacity: 1,
        totalDeadlineAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toEqual({ status: 'queued' })
    await expect(
      appDb().query(
        `SELECT [status] FROM [ai_run_coordination_entries]
         WHERE [application_run_id] = @0`,
        [runningId],
      ),
    ).resolves.toEqual([{ status: 'running' }])

    await expect(
      store.finish({
        applicationRunId: runningId,
        fencingToken: runningFence,
        failure: { category: 'deadline_exceeded', retryable: false },
        leaseOwnerId: runningFence,
        outcome: 'failed',
      }),
    ).resolves.toMatchObject({
      breakerOpened: false,
      healthStatus: 'degraded',
    })
    await expect(
      appDb().query(
        `SELECT [consecutive_failure_count] AS [consecutiveFailureCount]
         FROM [ai_connection_model_operational_states]
         WHERE [ai_connection_model_revision_id] = @0`,
        [identity.aiConnectionModelRevisionId],
      ),
    ).resolves.toEqual([{ consecutiveFailureCount: 1 }])
    await store.abandon({
      applicationRunId: queuedId,
      fencingToken: queuedFence,
    })
  })

  it('keeps a healthy closed breaker closed during a manual probe', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const initializationRunId = randomUUID()
    const initializationFence = randomUUID()
    await store.enqueue({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      identity,
      queueCapacity: 0,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.acquire({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      leaseDurationMs: 30_000,
      leaseOwnerId: initializationFence,
    })
    await store.finish({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      leaseOwnerId: initializationFence,
      outcome: 'completed',
    })
    const probeOwner = randomUUID()
    const probeRunId = randomUUID()

    await expect(
      store.acquireManualRecoveryProbe({
        identity,
        leaseDurationMs: 30_000,
        leaseOwnerId: probeOwner,
        modelRevisionId: identity.aiConnectionModelRevisionId,
        probeRunId,
      }),
    ).resolves.toEqual({
      breakerStatus: 'closed',
      healthStatus: 'healthy',
    })
    await expect(
      appDb().query(
        `SELECT [circuit_breaker_status] AS [breakerStatus],
                [circuit_open_reason] AS [circuitOpenReason]
         FROM [ai_connection_model_operational_states]
         WHERE [ai_connection_model_revision_id] = @0`,
        [identity.aiConnectionModelRevisionId],
      ),
    ).resolves.toEqual([{ breakerStatus: 'closed', circuitOpenReason: null }])
    await store.finishRecoveryProbe({
      leaseOwnerId: probeOwner,
      modelRevisionId: identity.aiConnectionModelRevisionId,
      probeRunId,
      succeeded: true,
    })
  })

  it('opens after five qualifying failures and safely reclaims recovery leases', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const applicationRunId = randomUUID()
      const fencingToken = randomUUID()
      await store.enqueue({
        applicationRunId,
        fencingToken,
        identity,
        queueCapacity: 0,
        totalDeadlineAt: new Date(Date.now() + 60_000),
      })
      await store.acquire({
        applicationRunId,
        fencingToken,
        leaseDurationMs: 30_000,
        leaseOwnerId: fencingToken,
      })
      await expect(
        store.finish({
          applicationRunId,
          fencingToken,
          failure: { category: 'connection_unavailable', retryable: true },
          leaseOwnerId: fencingToken,
          outcome: 'failed',
        }),
      ).resolves.toMatchObject({ breakerOpened: attempt === 5 })
    }

    await appDb().query(
      `UPDATE ai_connection_model_operational_states
       SET next_recovery_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE ai_connection_model_revision_id = @0`,
      [identity.aiConnectionModelRevisionId],
    )
    const firstOwner = randomUUID()
    const firstProbe = randomUUID()
    await expect(
      store.acquireRecoveryProbe({
        identity,
        leaseDurationMs: 30_000,
        leaseOwnerId: firstOwner,
        modelRevisionId: identity.aiConnectionModelRevisionId,
        probeRunId: firstProbe,
      }),
    ).resolves.toBe(true)
    await appDb().query(
      `UPDATE ai_connection_model_operational_states
       SET lease_expires_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE ai_connection_model_revision_id = @0`,
      [identity.aiConnectionModelRevisionId],
    )
    const secondOwner = randomUUID()
    const secondProbe = randomUUID()
    await expect(
      store.acquireRecoveryProbe({
        identity,
        leaseDurationMs: 30_000,
        leaseOwnerId: secondOwner,
        modelRevisionId: identity.aiConnectionModelRevisionId,
        probeRunId: secondProbe,
      }),
    ).resolves.toBe(true)
    await store.finishRecoveryProbe({
      failure: { category: 'authentication_failed', retryable: false },
      leaseOwnerId: secondOwner,
      modelRevisionId: identity.aiConnectionModelRevisionId,
      probeRunId: secondProbe,
      succeeded: false,
    })

    const rows = (await appDb().query(
      `SELECT circuit_breaker_status AS circuitBreakerStatus,
              circuit_open_reason AS circuitOpenReason,
              is_manual_recovery_required AS isManualRecoveryRequired,
              next_recovery_at AS nextRecoveryAt
       FROM ai_connection_model_operational_states
       WHERE ai_connection_model_revision_id = @0`,
      [identity.aiConnectionModelRevisionId],
    )) as Array<{
      circuitBreakerStatus: string
      circuitOpenReason: string
      isManualRecoveryRequired: boolean
      nextRecoveryAt: Date | null
    }>
    expect(rows).toEqual([
      {
        circuitBreakerStatus: 'open',
        circuitOpenReason: 'authentication_failed',
        isManualRecoveryRequired: true,
        nextRecoveryAt: null,
      },
    ])
  })

  it('counts recovery leases when acquired and refuses a sixth crashed probe', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const initializationRunId = randomUUID()
    const initializationFence = randomUUID()
    await store.enqueue({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      identity,
      queueCapacity: 0,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.finish({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      leaseOwnerId: initializationFence,
      outcome: 'completed',
    })
    await appDb().query(
      `UPDATE ai_connection_model_operational_states
       SET health_status = N'unavailable', circuit_breaker_status = N'open',
           circuit_open_reason = N'connection_unavailable',
           automatic_recovery_attempt_count = 4,
           next_recovery_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE ai_connection_model_revision_id = @0`,
      [identity.aiConnectionModelRevisionId],
    )

    await expect(
      store.acquireRecoveryProbe({
        identity,
        leaseDurationMs: 30_000,
        leaseOwnerId: randomUUID(),
        modelRevisionId: identity.aiConnectionModelRevisionId,
        probeRunId: randomUUID(),
      }),
    ).resolves.toBe(true)
    await appDb().query(
      `UPDATE ai_connection_model_operational_states
       SET lease_expires_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE ai_connection_model_revision_id = @0`,
      [identity.aiConnectionModelRevisionId],
    )
    await expect(
      store.acquireRecoveryProbe({
        identity,
        leaseDurationMs: 30_000,
        leaseOwnerId: randomUUID(),
        modelRevisionId: identity.aiConnectionModelRevisionId,
        probeRunId: randomUUID(),
      }),
    ).resolves.toBe(false)

    await expect(
      appDb().query(
        `SELECT circuit_breaker_status AS circuitBreakerStatus,
                automatic_recovery_attempt_count AS automaticRecoveryAttemptCount,
                is_manual_recovery_required AS isManualRecoveryRequired
         FROM ai_connection_model_operational_states
         WHERE ai_connection_model_revision_id = @0`,
        [identity.aiConnectionModelRevisionId],
      ),
    ).resolves.toEqual([
      {
        automaticRecoveryAttemptCount: 5,
        circuitBreakerStatus: 'open',
        isManualRecoveryRequired: true,
      },
    ])
  })

  it('prevents duplicate and stale workers from mutating the current run', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const applicationRunId = randomUUID()
    const firstFence = randomUUID()
    const replacementFence = randomUUID()
    const deadline = new Date(Date.now() + 60_000)

    await store.enqueue({
      applicationRunId,
      fencingToken: firstFence,
      identity,
      queueCapacity: 2,
      totalDeadlineAt: deadline,
    })
    await expect(
      store.enqueue({
        applicationRunId,
        fencingToken: replacementFence,
        identity,
        queueCapacity: 2,
        totalDeadlineAt: deadline,
      }),
    ).rejects.toThrow()
    await store.finish({
      applicationRunId,
      fencingToken: replacementFence,
      leaseOwnerId: replacementFence,
      outcome: 'failed',
    })
    await expect(
      appDb().query(
        `SELECT LOWER(CONVERT(nvarchar(36), fencing_token)) AS fencingToken,
                status
         FROM ai_run_coordination_entries
         WHERE application_run_id = @0`,
        [applicationRunId],
      ),
    ).resolves.toEqual([{ fencingToken: firstFence, status: 'queued' }])

    await store.acquire({
      applicationRunId,
      fencingToken: firstFence,
      leaseDurationMs: 30_000,
      leaseOwnerId: firstFence,
    })
    await appDb().query(
      `UPDATE ai_run_coordination_entries
       SET lease_expires_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE application_run_id = @0`,
      [applicationRunId],
    )
    await store.enqueue({
      applicationRunId,
      fencingToken: replacementFence,
      identity,
      queueCapacity: 2,
      totalDeadlineAt: deadline,
    })
    await expect(
      store.requeueForRetry({
        applicationRunId,
        fencingToken: firstFence,
        leaseOwnerId: firstFence,
        notBefore: new Date(),
      }),
    ).resolves.toBe('lease_lost')
    await store.finish({
      applicationRunId,
      fencingToken: firstFence,
      leaseOwnerId: firstFence,
      outcome: 'failed',
    })

    await expect(
      appDb().query(
        `SELECT LOWER(CONVERT(nvarchar(36), fencing_token)) AS fencingToken,
                status
         FROM ai_run_coordination_entries
         WHERE application_run_id = @0`,
        [applicationRunId],
      ),
    ).resolves.toEqual([{ fencingToken: replacementFence, status: 'queued' }])
    await store.finish({
      applicationRunId,
      fencingToken: replacementFence,
      leaseOwnerId: replacementFence,
      outcome: 'cancelled',
    })
  })

  it('does not finalize an expired running lease before replacement', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const applicationRunId = randomUUID()
    const fencingToken = randomUUID()
    const leaseOwnerId = randomUUID()
    await store.enqueue({
      applicationRunId,
      fencingToken,
      identity,
      queueCapacity: 0,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.acquire({
      applicationRunId,
      fencingToken,
      leaseDurationMs: 30_000,
      leaseOwnerId,
    })
    await appDb().query(
      `UPDATE ai_run_coordination_entries
       SET lease_expires_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE application_run_id = @0`,
      [applicationRunId],
    )

    await store.finish({
      applicationRunId,
      fencingToken,
      failure: { category: 'connection_unavailable', retryable: true },
      leaseOwnerId,
      outcome: 'failed',
    })

    await expect(
      appDb().query(
        `SELECT entry.status,
                state.health_status AS healthStatus,
                state.consecutive_failure_count AS consecutiveFailureCount
         FROM ai_run_coordination_entries AS entry
         INNER JOIN ai_connection_model_operational_states AS state
           ON state.ai_connection_model_revision_id = entry.ai_connection_model_revision_id
         WHERE entry.application_run_id = @0`,
        [applicationRunId],
      ),
    ).resolves.toEqual([
      {
        consecutiveFailureCount: 0,
        healthStatus: 'unknown',
        status: 'running',
      },
    ])
  })

  it('does not requeue an expired running lease', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const applicationRunId = randomUUID()
    const fencingToken = randomUUID()
    const leaseOwnerId = randomUUID()
    await store.enqueue({
      applicationRunId,
      fencingToken,
      identity,
      queueCapacity: 0,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.acquire({
      applicationRunId,
      fencingToken,
      leaseDurationMs: 30_000,
      leaseOwnerId,
    })
    await appDb().query(
      `UPDATE ai_run_coordination_entries
       SET lease_expires_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE application_run_id = @0`,
      [applicationRunId],
    )

    await expect(
      store.requeueForRetry({
        applicationRunId,
        fencingToken,
        leaseOwnerId,
        notBefore: new Date(Date.now() + 1_000),
      }),
    ).resolves.toBe('lease_lost')
    await expect(
      appDb().query(
        `SELECT status FROM ai_run_coordination_entries
         WHERE application_run_id = @0`,
        [applicationRunId],
      ),
    ).resolves.toEqual([{ status: 'running' }])
  })

  it('abandons queued and retry-wait rows without changing model health', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const queuedRunId = randomUUID()
    const queuedFence = randomUUID()
    await store.enqueue({
      applicationRunId: queuedRunId,
      fencingToken: queuedFence,
      identity,
      queueCapacity: 2,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })

    await store.abandon({
      applicationRunId: queuedRunId,
      fencingToken: queuedFence,
    })

    const retryRunId = randomUUID()
    const retryFence = randomUUID()
    await store.enqueue({
      applicationRunId: retryRunId,
      fencingToken: retryFence,
      identity,
      queueCapacity: 2,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.acquire({
      applicationRunId: retryRunId,
      fencingToken: retryFence,
      leaseDurationMs: 30_000,
      leaseOwnerId: retryFence,
    })
    await expect(
      store.requeueForRetry({
        applicationRunId: retryRunId,
        fencingToken: retryFence,
        leaseOwnerId: retryFence,
        notBefore: new Date(Date.now() + 1_000),
      }),
    ).resolves.toBe('applied')
    await store.abandon({
      applicationRunId: retryRunId,
      fencingToken: retryFence,
    })

    await expect(
      appDb().query(
        `SELECT application_run_id AS applicationRunId
         FROM ai_run_coordination_entries
         WHERE application_run_id IN (@0, @1)`,
        [queuedRunId, retryRunId],
      ),
    ).resolves.toEqual([])
    await expect(
      appDb().query(
        `SELECT health_status AS healthStatus,
                circuit_breaker_status AS breakerStatus,
                consecutive_failure_count AS consecutiveFailureCount
         FROM ai_connection_model_operational_states
         WHERE ai_connection_model_revision_id = @0`,
        [identity.aiConnectionModelRevisionId],
      ),
    ).resolves.toEqual([
      {
        breakerStatus: 'closed',
        consecutiveFailureCount: 0,
        healthStatus: 'unknown',
      },
    ])
  })

  it('reserves connection capacity while a recovery probe is running', async () => {
    const { identity } = await createCoordinationFixture(appDb())
    const competingIdentity = await createAdditionalModelIdentity(
      appDb(),
      identity,
    )
    const store = createSqlServerAiRunCoordinationStore(appDb())
    const initializationRunId = randomUUID()
    const initializationFence = randomUUID()
    await store.enqueue({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      identity,
      queueCapacity: 0,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })
    await store.acquire({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      leaseDurationMs: 30_000,
      leaseOwnerId: initializationFence,
    })
    await store.finish({
      applicationRunId: initializationRunId,
      fencingToken: initializationFence,
      leaseOwnerId: initializationFence,
      outcome: 'completed',
    })
    await appDb().query(
      `UPDATE ai_connection_model_operational_states
       SET health_status = N'unavailable', circuit_breaker_status = N'open',
           circuit_open_reason = N'connection_unavailable',
           next_recovery_at = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE ai_connection_model_revision_id = @0`,
      [identity.aiConnectionModelRevisionId],
    )
    const probeOwner = randomUUID()
    const probeRunId = randomUUID()
    await expect(
      store.acquireRecoveryProbe({
        identity,
        leaseDurationMs: 30_000,
        leaseOwnerId: probeOwner,
        modelRevisionId: identity.aiConnectionModelRevisionId,
        probeRunId,
      }),
    ).resolves.toBe(true)
    const competingRunId = randomUUID()
    const competingFence = randomUUID()
    await store.enqueue({
      applicationRunId: competingRunId,
      fencingToken: competingFence,
      identity: competingIdentity,
      queueCapacity: 1,
      totalDeadlineAt: new Date(Date.now() + 60_000),
    })

    await expect(
      store.acquire({
        applicationRunId: competingRunId,
        fencingToken: competingFence,
        leaseDurationMs: 30_000,
        leaseOwnerId: competingFence,
      }),
    ).resolves.toEqual({ status: 'waiting' })
    await store.finishRecoveryProbe({
      leaseOwnerId: probeOwner,
      modelRevisionId: identity.aiConnectionModelRevisionId,
      probeRunId,
      succeeded: true,
    })
    await expect(
      store.acquire({
        applicationRunId: competingRunId,
        fencingToken: competingFence,
        leaseDurationMs: 30_000,
        leaseOwnerId: competingFence,
      }),
    ).resolves.toMatchObject({ status: 'acquired' })
  })
})
