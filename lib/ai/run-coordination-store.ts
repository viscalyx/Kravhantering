import type { AiRunFailure } from '@/lib/ai/run-contracts'
import type {
  AiRunAcquireResult,
  AiRunAdmissionResult,
  AiRunCoordinationStore,
} from '@/lib/ai/run-coordinator'
import type { SqlServerDatabase } from '@/lib/db'

interface CoordinationRow {
  acquisitionStatus?: AiRunAcquireResult['status']
  activeConcurrency?: number | string
  admissionStatus?: AiRunAdmissionResult['status']
  breakerOpened?: boolean | number
  probeStatus?: 'acquired' | 'unavailable'
  queueDepth?: number | string
  renewed?: boolean | number
}

export interface AiRecoveryProbeLeaseInput {
  leaseDurationMs: number
  leaseOwnerId: string
  modelRevisionId: string
  probeRunId: string
}

export interface AiRecoveryProbeResultInput {
  failure?: AiRunFailure
  leaseOwnerId: string
  modelRevisionId: string
  probeRunId: string
  succeeded: boolean
}

export interface SqlServerAiRunCoordinationStore
  extends AiRunCoordinationStore {
  acquireRecoveryProbe(input: AiRecoveryProbeLeaseInput): Promise<boolean>
  finishRecoveryProbe(input: AiRecoveryProbeResultInput): Promise<void>
}

function admission(row: CoordinationRow | undefined): AiRunAdmissionResult {
  if (row?.admissionStatus === 'queued') return { status: 'queued' }
  if (row?.admissionStatus === 'queue_full') {
    return { retryAfterSeconds: 60, status: 'queue_full' }
  }
  return { retryAfterSeconds: 3600, status: 'breaker_open' }
}

function acquisition(row: CoordinationRow | undefined): AiRunAcquireResult {
  if (row?.acquisitionStatus === 'acquired') {
    return {
      ...(row.activeConcurrency === undefined
        ? {}
        : { activeConcurrency: Number(row.activeConcurrency) }),
      ...(row.queueDepth === undefined
        ? {}
        : { queueDepth: Number(row.queueDepth) }),
      status: 'acquired',
    }
  }
  if (row?.acquisitionStatus === 'expired') return { status: 'expired' }
  if (row?.acquisitionStatus === 'breaker_open') {
    return { retryAfterSeconds: 3600, status: 'breaker_open' }
  }
  return { status: 'waiting' }
}

const ENQUEUE_SQL = `
  SET NOCOUNT ON;
  DECLARE @now datetime2(3) = SYSUTCDATETIME();

  DELETE FROM [ai_run_coordination_entries]
  WHERE [total_deadline_at] <= @now
     OR ([status] = N'running' AND [lease_expires_at] <= @now);

  IF EXISTS (
    SELECT 1
    FROM [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @2
      AND [circuit_breaker_status] IN (N'open', N'half_open')
  )
  BEGIN
    SELECT N'breaker_open' AS [admissionStatus];
    RETURN;
  END;

  DECLARE @running int = (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_id] = @1 AND [status] = N'running'
      AND [lease_expires_at] > @now
  );
  DECLARE @waiting int = (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_run_profile_revision_id] = @3
      AND [status] IN (N'queued', N'retry_wait')
  );
  DECLARE @waiting_for_connection int = (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_id] = @1
      AND [status] IN (N'queued', N'retry_wait')
  );
  DECLARE @connection_maximum_concurrency int;
  DECLARE @model_maximum_concurrency int;
  SELECT @connection_maximum_concurrency = [connection].[maximum_concurrency],
         @model_maximum_concurrency = [model_revision].[maximum_concurrency]
    FROM [ai_connection_model_revisions] AS [model_revision]
    INNER JOIN [ai_connection_models] AS [model]
      ON [model].[id] = [model_revision].[ai_connection_model_id]
    INNER JOIN [ai_connections] AS [connection]
      ON [connection].[id] = [model].[ai_connection_id]
    WHERE [model_revision].[id] = @2;
  DECLARE @model_running int = (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @2 AND [status] = N'running'
      AND [lease_expires_at] > @now
  );
  DECLARE @waiting_for_model int = (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @2
      AND [status] IN (N'queued', N'retry_wait')
  );
  IF (
    @running + @waiting_for_connection >= @connection_maximum_concurrency
    OR (@model_maximum_concurrency IS NOT NULL
      AND @model_running + @waiting_for_model >= @model_maximum_concurrency)
  ) AND @waiting >= @5
  BEGIN
    SELECT N'queue_full' AS [admissionStatus];
    RETURN;
  END;

  INSERT INTO [ai_run_coordination_entries] (
    [application_run_id], [ai_connection_id],
    [ai_connection_model_revision_id], [ai_run_profile_revision_id],
    [status], [not_before], [total_deadline_at], [created_at], [updated_at]
  ) VALUES (@0, @1, @2, @3, N'queued', @now, @4, @now, @now);
  SELECT N'queued' AS [admissionStatus];`

const ACQUIRE_SQL = `
  SET NOCOUNT ON;
  DECLARE @now datetime2(3) = SYSUTCDATETIME();
  DELETE FROM [ai_run_coordination_entries]
  WHERE [total_deadline_at] <= @now
     OR ([status] = N'running' AND [lease_expires_at] <= @now);

  IF NOT EXISTS (SELECT 1 FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK) WHERE [application_run_id] = @0)
  BEGIN SELECT N'expired' AS [acquisitionStatus]; RETURN; END;

  DECLARE @connection_id uniqueidentifier;
  DECLARE @model_revision_id uniqueidentifier;
  DECLARE @queue_sequence bigint;
  DECLARE @not_before datetime2(3);
  SELECT @connection_id = [ai_connection_id],
         @model_revision_id = [ai_connection_model_revision_id],
         @queue_sequence = [queue_sequence], @not_before = [not_before]
  FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
  WHERE [application_run_id] = @0;

  IF EXISTS (
    SELECT 1 FROM [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [circuit_breaker_status] IN (N'open', N'half_open')
  ) BEGIN SELECT N'breaker_open' AS [acquisitionStatus]; RETURN; END;
  IF @not_before > @now BEGIN SELECT N'waiting' AS [acquisitionStatus]; RETURN; END;

  DECLARE @connection_maximum_concurrency int;
  DECLARE @model_maximum_concurrency int;
  SELECT @connection_maximum_concurrency = [connection].[maximum_concurrency],
         @model_maximum_concurrency = [model_revision].[maximum_concurrency]
    FROM [ai_connection_model_revisions] AS [model_revision]
    INNER JOIN [ai_connection_models] AS [model]
      ON [model].[id] = [model_revision].[ai_connection_model_id]
    INNER JOIN [ai_connections] AS [connection]
      ON [connection].[id] = [model].[ai_connection_id]
    WHERE [model_revision].[id] = @model_revision_id;
  IF (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_id] = @connection_id AND [status] = N'running'
      AND [lease_expires_at] > @now
  ) >= @connection_maximum_concurrency
  BEGIN SELECT N'waiting' AS [acquisitionStatus]; RETURN; END;
  IF @model_maximum_concurrency IS NOT NULL AND (
    SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [status] = N'running' AND [lease_expires_at] > @now
  ) >= @model_maximum_concurrency
  BEGIN SELECT N'waiting' AS [acquisitionStatus]; RETURN; END;

  IF @queue_sequence <> (
    SELECT MIN([queue_sequence]) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_id] = @connection_id
      AND [status] IN (N'queued', N'retry_wait') AND [not_before] <= @now
  ) BEGIN SELECT N'waiting' AS [acquisitionStatus]; RETURN; END;

  UPDATE [ai_run_coordination_entries]
  SET [status] = N'running', [attempt_count] = [attempt_count] + 1,
      [lease_owner_id] = @1,
      [lease_expires_at] = DATEADD(millisecond, @2, @now), [updated_at] = @now
  WHERE [application_run_id] = @0;
  SELECT N'acquired' AS [acquisitionStatus],
    (SELECT COUNT(*) FROM [ai_run_coordination_entries]
     WHERE [ai_connection_id] = @connection_id AND [status] = N'running'
       AND [lease_expires_at] > @now) AS [activeConcurrency],
    (SELECT COUNT(*) FROM [ai_run_coordination_entries]
     WHERE [ai_connection_id] = @connection_id
       AND [status] IN (N'queued', N'retry_wait')) AS [queueDepth];`

const FINISH_SQL = `
  SET NOCOUNT ON;
  DECLARE @now datetime2(3) = SYSUTCDATETIME();
  DECLARE @model_revision_id uniqueidentifier = (
    SELECT [ai_connection_model_revision_id]
    FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [application_run_id] = @0
  );
  DECLARE @was_open bit = COALESCE((
    SELECT CASE WHEN [circuit_breaker_status] = N'open' THEN 1 ELSE 0 END
    FROM [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @model_revision_id
  ), 0);

  IF @3 = N'completed'
    UPDATE [ai_connection_model_operational_states]
    SET [health_status] = N'healthy', [circuit_breaker_status] = N'closed',
        [circuit_open_reason] = NULL, [consecutive_failure_count] = 0,
        [automatic_recovery_attempt_count] = 0,
        [is_manual_recovery_required] = 0, [last_health_evidence_at] = @now,
        [circuit_opened_at] = NULL, [next_recovery_at] = NULL,
        [updated_at] = @now, [revision_token] = NEWID()
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [circuit_breaker_status] = N'closed';
  ELSE IF @1 = N'authentication_failed'
    UPDATE [ai_connection_model_operational_states]
    SET [health_status] = N'unavailable', [circuit_breaker_status] = N'open',
        [circuit_open_reason] = @1, [consecutive_failure_count] = 5,
        [is_manual_recovery_required] = 1,
        [circuit_opened_at] = @now, [next_recovery_at] = NULL,
        [last_health_evidence_at] = @now,
        [updated_at] = @now, [revision_token] = NEWID()
    WHERE [ai_connection_model_revision_id] = @model_revision_id;
  ELSE IF @1 IN (N'connection_unavailable', N'deadline_exceeded')
       OR (@1 = N'adapter_failure' AND @2 = 1)
  BEGIN
    UPDATE [ai_connection_model_operational_states]
    SET [consecutive_failure_count] =
          CASE WHEN [consecutive_failure_count] < 5 THEN [consecutive_failure_count] + 1 ELSE 5 END,
        [health_status] = CASE WHEN [consecutive_failure_count] >= 4 THEN N'unavailable' ELSE N'degraded' END,
        [circuit_breaker_status] = CASE WHEN [consecutive_failure_count] >= 4 THEN N'open' ELSE N'closed' END,
        [circuit_open_reason] = CASE WHEN [consecutive_failure_count] >= 4 THEN @1 ELSE NULL END,
        [circuit_opened_at] = CASE WHEN [consecutive_failure_count] >= 4 THEN @now ELSE NULL END,
        [next_recovery_at] = CASE WHEN [consecutive_failure_count] >= 4 THEN DATEADD(minute, 60, @now) ELSE NULL END,
        [last_health_evidence_at] = @now, [updated_at] = @now,
        [revision_token] = NEWID()
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [circuit_breaker_status] = N'closed';
  END
  ELSE IF @3 = N'failed'
    UPDATE [ai_connection_model_operational_states]
    SET [health_status] = N'degraded', [last_health_evidence_at] = @now,
        [updated_at] = @now, [revision_token] = NEWID()
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [circuit_breaker_status] = N'closed';

  DELETE FROM [ai_run_coordination_entries] WHERE [application_run_id] = @0;
  SELECT CASE WHEN @was_open = 0 AND EXISTS (
    SELECT 1 FROM [ai_connection_model_operational_states]
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [circuit_breaker_status] = N'open'
  ) THEN 1 ELSE 0 END AS [breakerOpened];`

export function createSqlServerAiRunCoordinationStore(
  db: SqlServerDatabase,
): SqlServerAiRunCoordinationStore {
  return {
    async enqueue(input): Promise<AiRunAdmissionResult> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(ENQUEUE_SQL, [
          input.applicationRunId,
          input.identity.aiConnectionId,
          input.identity.aiConnectionModelRevisionId,
          input.identity.aiRunProfileRevisionId,
          input.totalDeadlineAt,
          input.queueCapacity,
        ]),
      )
      return admission(rows[0])
    },

    async acquire(input): Promise<AiRunAcquireResult> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(ACQUIRE_SQL, [
          input.applicationRunId,
          input.leaseOwnerId,
          input.leaseDurationMs,
        ]),
      )
      return acquisition(rows[0])
    },

    async renew(input): Promise<boolean> {
      const rows = await db.query<CoordinationRow[]>(
        `UPDATE [ai_run_coordination_entries]
         SET [lease_expires_at] = DATEADD(millisecond, @2, SYSUTCDATETIME()),
             [updated_at] = SYSUTCDATETIME()
         OUTPUT 1 AS [renewed]
         WHERE [application_run_id] = @0 AND [lease_owner_id] = @1
           AND [status] = N'running' AND [lease_expires_at] > SYSUTCDATETIME()`,
        [input.applicationRunId, input.leaseOwnerId, input.leaseDurationMs],
      )
      return Boolean(rows[0]?.renewed)
    },

    async requeueForRetry(input): Promise<void> {
      await db.query(
        `UPDATE [ai_run_coordination_entries]
         SET [status] = N'retry_wait', [not_before] = @1,
             [lease_owner_id] = NULL, [lease_expires_at] = NULL,
             [updated_at] = SYSUTCDATETIME()
         WHERE [application_run_id] = @0 AND [status] = N'running'`,
        [input.applicationRunId, input.notBefore],
      )
    },

    async finish(input): Promise<{ breakerOpened: boolean }> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(FINISH_SQL, [
          input.applicationRunId,
          input.failure?.category ?? null,
          input.failure?.retryable ? 1 : 0,
          input.outcome,
        ]),
      )
      return { breakerOpened: Boolean(rows[0]?.breakerOpened) }
    },

    async acquireRecoveryProbe(input): Promise<boolean> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(
          `SET NOCOUNT ON;
           DECLARE @now datetime2(3) = SYSUTCDATETIME();
           UPDATE [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
           SET [circuit_breaker_status] = N'open',
               [is_manual_recovery_required] = 1, [next_recovery_at] = NULL,
               [lease_owner_id] = NULL, [lease_run_id] = NULL,
               [lease_expires_at] = NULL, [updated_at] = @now,
               [revision_token] = NEWID()
           WHERE [ai_connection_model_revision_id] = @0
             AND [circuit_breaker_status] = N'half_open'
             AND [lease_expires_at] <= @now
             AND [automatic_recovery_attempt_count] >= 5;
           UPDATE [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
           SET [circuit_breaker_status] = N'half_open', [lease_owner_id] = @1,
               [lease_run_id] = @2,
               [automatic_recovery_attempt_count] =
                 [automatic_recovery_attempt_count] + 1,
               [lease_expires_at] = DATEADD(millisecond, @3, @now),
               [updated_at] = @now, [revision_token] = NEWID()
           OUTPUT N'acquired' AS [probeStatus]
           WHERE [ai_connection_model_revision_id] = @0
             AND (
               ([circuit_breaker_status] = N'open' AND [next_recovery_at] <= @now)
               OR ([circuit_breaker_status] = N'half_open' AND [lease_expires_at] <= @now)
             )
             AND [circuit_open_reason] NOT IN (N'authentication_failed', N'capability_mismatch', N'attestation_invalid', N'administratively_suspended', N'security_blocked')
             AND [automatic_recovery_attempt_count] < 5
             AND [is_manual_recovery_required] = 0
             AND ([lease_expires_at] IS NULL OR [lease_expires_at] <= @now);`,
          [
            input.modelRevisionId,
            input.leaseOwnerId,
            input.probeRunId,
            input.leaseDurationMs,
          ],
        ),
      )
      return rows[0]?.probeStatus === 'acquired'
    },

    async finishRecoveryProbe(input): Promise<void> {
      await db.transaction('SERIALIZABLE', manager =>
        manager.query(
          `SET NOCOUNT ON;
           DECLARE @now datetime2(3) = SYSUTCDATETIME();
           IF @3 = 1
             UPDATE [ai_connection_model_operational_states]
             SET [health_status] = N'healthy', [circuit_breaker_status] = N'closed',
                 [circuit_open_reason] = NULL, [consecutive_failure_count] = 0,
                 [automatic_recovery_attempt_count] = 0,
                 [is_manual_recovery_required] = 0, [last_health_evidence_at] = @now,
                 [circuit_opened_at] = NULL, [next_recovery_at] = NULL,
                 [lease_owner_id] = NULL, [lease_run_id] = NULL,
                 [lease_expires_at] = NULL, [updated_at] = @now,
                 [revision_token] = NEWID()
             WHERE [ai_connection_model_revision_id] = @0
               AND [lease_owner_id] = @1 AND [lease_run_id] = @2;
           ELSE IF @4 = N'authentication_failed'
             UPDATE [ai_connection_model_operational_states]
             SET [health_status] = N'unavailable', [circuit_breaker_status] = N'open',
                 [circuit_open_reason] = @4,
                 [is_manual_recovery_required] = 1, [next_recovery_at] = NULL,
                 [lease_owner_id] = NULL, [lease_run_id] = NULL,
                 [lease_expires_at] = NULL, [last_health_evidence_at] = @now,
                 [updated_at] = @now, [revision_token] = NEWID()
             WHERE [ai_connection_model_revision_id] = @0
               AND [lease_owner_id] = @1 AND [lease_run_id] = @2;
           ELSE
             UPDATE [ai_connection_model_operational_states]
             SET [health_status] = N'unavailable', [circuit_breaker_status] = N'open',
                 [is_manual_recovery_required] = CASE WHEN [automatic_recovery_attempt_count] >= 5 THEN 1 ELSE 0 END,
                 [next_recovery_at] = CASE WHEN [automatic_recovery_attempt_count] >= 5 THEN NULL ELSE DATEADD(minute, 60, @now) END,
                 [lease_owner_id] = NULL, [lease_run_id] = NULL,
                 [lease_expires_at] = NULL, [last_health_evidence_at] = @now,
                 [updated_at] = @now, [revision_token] = NEWID()
             WHERE [ai_connection_model_revision_id] = @0
               AND [lease_owner_id] = @1 AND [lease_run_id] = @2;`,
          [
            input.modelRevisionId,
            input.leaseOwnerId,
            input.probeRunId,
            input.succeeded ? 1 : 0,
            input.failure?.category ?? null,
          ],
        ),
      )
    },
  }
}
