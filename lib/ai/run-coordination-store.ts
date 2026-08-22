import type {
  AiManualRecoveryProbeAcquisition,
  AiOperationalStateTransition,
  AiRecoveryProbeTarget,
  AiRunAcquireResult,
  AiRunAdmissionResult,
  AiRunCoordinationStore,
} from '@/lib/ai/run-coordinator'
import type { SqlServerDatabase } from '@/lib/db'

interface CoordinationRow {
  acquisitionStatus?: AiRunAcquireResult['status']
  activeConcurrency?: number | string
  adapterType?: string
  adapterVersion?: string
  admissionStatus?: AiRunAdmissionResult['status']
  aiConnectionId?: string
  aiConnectionModelRevisionId?: string
  aiRunProfileConfigurationVersion?: number | string
  aiRunProfileId?: string
  breakerOpened?: boolean | number
  breakerStatus?: AiOperationalStateTransition['breakerStatus']
  cancellationReason?:
    | 'connection_retired'
    | 'connection_suspended'
    | 'profile_suspended'
  cancellationRequestedAt?: Date | string
  healthStateChanged?: boolean | number
  healthStatus?: AiOperationalStateTransition['healthStatus']
  inactivityTimeBudgetMs?: number | string
  probeStatus?: 'acquired' | 'unavailable'
  queueDepth?: number | string
  renewed?: boolean | number
  requeued?: boolean | number
  runType?: AiRecoveryProbeTarget['runType']
  totalTimeBudgetMs?: number | string
}

export type SqlServerAiRunCoordinationStore = AiRunCoordinationStore

function transition(
  row: CoordinationRow | undefined,
): AiOperationalStateTransition {
  return {
    breakerOpened: Boolean(row?.breakerOpened),
    ...(row?.breakerStatus ? { breakerStatus: row.breakerStatus } : {}),
    healthStateChanged: Boolean(row?.healthStateChanged),
    ...(row?.healthStatus ? { healthStatus: row.healthStatus } : {}),
  }
}

function admission(row: CoordinationRow | undefined): AiRunAdmissionResult {
  if (row?.admissionStatus === 'queued') return { status: 'queued' }
  if (row?.admissionStatus === 'queue_full') {
    return {
      activeConcurrency: Number(row.activeConcurrency ?? 0),
      queueDepth: Number(row.queueDepth ?? 0),
      retryAfterSeconds: 60,
      status: 'queue_full',
    }
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
  if (
    row?.acquisitionStatus === 'cancelled' &&
    row.cancellationReason &&
    row.cancellationRequestedAt
  ) {
    return {
      reason: row.cancellationReason,
      requestedAt: new Date(row.cancellationRequestedAt),
      status: 'cancelled',
    }
  }
  if (row?.acquisitionStatus === 'breaker_open') {
    return { retryAfterSeconds: 3600, status: 'breaker_open' }
  }
  return { status: 'waiting' }
}

const ENQUEUE_SQL = `
  SET NOCOUNT ON;
  DECLARE @now datetime2(3) = SYSUTCDATETIME();

  DELETE FROM [ai_run_coordination_entries]
  WHERE ([status] <> N'running' AND [total_deadline_at] <= @now)
     OR ([status] = N'running' AND [lease_expires_at] <= @now);

  IF NOT EXISTS (
    SELECT 1
    FROM [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @2
  )
    INSERT INTO [ai_connection_model_operational_states] (
      [ai_connection_model_revision_id], [updated_at]
    ) VALUES (@2, @now);

  IF NOT EXISTS (
    SELECT 1
    FROM [ai_connection_model_revisions] AS [revision]
    INNER JOIN [ai_connection_models] AS [model]
      ON [model].[id] = [revision].[ai_connection_model_id]
    INNER JOIN [ai_connections] AS [connection]
      ON [connection].[id] = [model].[ai_connection_id]
    INNER JOIN [ai_run_profiles] AS [profile]
      ON [profile].[id] = @3
    WHERE [revision].[id] = @2 AND [connection].[id] = @1
      AND [revision].[status] = N'verified'
      AND [connection].[lifecycle_status] = N'active'
      AND [profile].[operational_status] = N'enabled'
      AND [profile].[ai_connection_model_revision_id] = @2
      AND [profile].[configuration_version] = @7
  )
  BEGIN
    SELECT N'breaker_open' AS [admissionStatus];
    RETURN;
  END;

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
    WHERE [ai_run_profile_id] = @3
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
    SELECT N'queue_full' AS [admissionStatus], @running AS [activeConcurrency],
           @waiting_for_connection AS [queueDepth];
    RETURN;
  END;

  INSERT INTO [ai_run_coordination_entries] (
    [application_run_id], [fencing_token], [ai_connection_id],
    [ai_connection_model_revision_id], [ai_run_profile_id],
    [ai_run_profile_configuration_version],
    [status], [not_before], [total_deadline_at], [created_at], [updated_at]
  ) VALUES (@0, @6, @1, @2, @3, @7, N'queued', @now, @4, @now, @now);
  SELECT N'queued' AS [admissionStatus];`

const ACQUIRE_SQL = `
  SET NOCOUNT ON;
  DECLARE @now datetime2(3) = SYSUTCDATETIME();
  DELETE FROM [ai_run_coordination_entries]
  WHERE ([status] <> N'running' AND [total_deadline_at] <= @now)
     OR ([status] = N'running' AND [lease_expires_at] <= @now);

  IF NOT EXISTS (SELECT 1 FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK) WHERE [application_run_id] = @0 AND [fencing_token] = @3)
  BEGIN SELECT N'expired' AS [acquisitionStatus]; RETURN; END;
  IF EXISTS (
    SELECT 1 FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
    WHERE [application_run_id] = @0 AND [fencing_token] = @3
      AND [cancellation_requested_at] IS NOT NULL
  ) BEGIN
    SELECT N'cancelled' AS [acquisitionStatus],
      [cancellation_requested_at] AS [cancellationRequestedAt],
      [cancellation_reason] AS [cancellationReason]
    FROM [ai_run_coordination_entries]
    WHERE [application_run_id] = @0 AND [fencing_token] = @3;
    RETURN;
  END;

  DECLARE @connection_id uniqueidentifier;
  DECLARE @model_revision_id uniqueidentifier;
  DECLARE @queue_sequence bigint;
  DECLARE @not_before datetime2(3);
  SELECT @connection_id = [ai_connection_id],
         @model_revision_id = [ai_connection_model_revision_id],
         @queue_sequence = [queue_sequence], @not_before = [not_before]
  FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
  WHERE [application_run_id] = @0 AND [fencing_token] = @3;

  IF NOT EXISTS (
    SELECT 1
    FROM [ai_connection_model_revisions] WITH (UPDLOCK, HOLDLOCK)
    WHERE [id] = @model_revision_id AND [status] = N'verified'
  ) BEGIN
    DELETE FROM [ai_run_coordination_entries]
    WHERE [application_run_id] = @0 AND [fencing_token] = @3
      AND [status] IN (N'queued', N'retry_wait');
    SELECT N'expired' AS [acquisitionStatus];
    RETURN;
  END;

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
  WHERE [application_run_id] = @0 AND [fencing_token] = @3;
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
    WHERE [application_run_id] = @0 AND [fencing_token] = @4
      AND [lease_owner_id] = @5 AND [status] = N'running'
      AND [lease_expires_at] > @now
  );
  DECLARE @was_open bit = COALESCE((
    SELECT CASE WHEN [circuit_breaker_status] = N'open' THEN 1 ELSE 0 END
    FROM [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ai_connection_model_revision_id] = @model_revision_id
  ), 0);
  DECLARE @previous_health nvarchar(24);
  DECLARE @previous_breaker nvarchar(24);
  SELECT @previous_health = [health_status],
         @previous_breaker = [circuit_breaker_status]
  FROM [ai_connection_model_operational_states]
  WHERE [ai_connection_model_revision_id] = @model_revision_id;

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

  DELETE FROM [ai_run_coordination_entries]
  WHERE [application_run_id] = @0 AND [fencing_token] = @4
    AND [lease_owner_id] = @5 AND [status] = N'running'
    AND [lease_expires_at] > @now;
  SELECT CASE WHEN @was_open = 0 AND EXISTS (
    SELECT 1 FROM [ai_connection_model_operational_states]
    WHERE [ai_connection_model_revision_id] = @model_revision_id
      AND [circuit_breaker_status] = N'open'
  ) THEN 1 ELSE 0 END AS [breakerOpened],
    CASE WHEN [health_status] <> @previous_health
           OR [circuit_breaker_status] <> @previous_breaker
         THEN 1 ELSE 0 END AS [healthStateChanged],
    [health_status] AS [healthStatus],
    [circuit_breaker_status] AS [breakerStatus]
  FROM [ai_connection_model_operational_states]
  WHERE [ai_connection_model_revision_id] = @model_revision_id;`

export function createSqlServerAiRunCoordinationStore(
  db: SqlServerDatabase,
): SqlServerAiRunCoordinationStore {
  return {
    async abandon(input): Promise<void> {
      await db.query(
        `DELETE FROM [ai_run_coordination_entries]
         WHERE [application_run_id] = @0 AND [fencing_token] = @1
           AND [status] IN (N'queued', N'retry_wait')`,
        [input.applicationRunId, input.fencingToken],
      )
    },

    async acquireManualRecoveryProbe(
      input,
    ): Promise<AiManualRecoveryProbeAcquisition | null> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(
          `SET NOCOUNT ON;
           DECLARE @now datetime2(3) = SYSUTCDATETIME();
           DELETE FROM [ai_run_coordination_entries]
           WHERE [status] = N'running' AND [lease_expires_at] <= @now;
           DELETE [entry]
           FROM [ai_run_coordination_entries] AS [entry]
           INNER JOIN [ai_connection_model_operational_states] AS [state]
             ON [state].[lease_run_id] = [entry].[application_run_id]
           WHERE [state].[ai_connection_model_revision_id] = @0
             AND [state].[lease_expires_at] <= @now
             AND [entry].[status] = N'running';
           DECLARE @acquired TABLE (
             [probeStatus] nvarchar(24), [healthStatus] nvarchar(24),
             [breakerStatus] nvarchar(24)
           );
           UPDATE [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
           SET [circuit_breaker_status] = CASE
                 WHEN [circuit_breaker_status] = N'open' THEN N'half_open'
                 ELSE [circuit_breaker_status]
               END,
               [circuit_open_reason] = CASE
                 WHEN [circuit_breaker_status] = N'open'
                   THEN COALESCE([circuit_open_reason], N'manual_health_check')
                 ELSE [circuit_open_reason]
               END,
               [lease_owner_id] = @1, [lease_run_id] = @2,
               [lease_expires_at] = DATEADD(millisecond, @3, @now),
               [updated_at] = @now, [revision_token] = NEWID()
           OUTPUT N'acquired', DELETED.[health_status],
             DELETED.[circuit_breaker_status]
           INTO @acquired ([probeStatus], [healthStatus], [breakerStatus])
           WHERE [ai_connection_model_revision_id] = @0
             AND [circuit_breaker_status] IN (N'closed', N'open')
             AND ([lease_expires_at] IS NULL OR [lease_expires_at] <= @now)
             AND EXISTS (
               SELECT 1
               FROM [ai_connection_model_revisions] AS [probe_revision]
               INNER JOIN [ai_connection_models] AS [probe_model]
                 ON [probe_model].[id] = [probe_revision].[ai_connection_model_id]
               INNER JOIN [ai_connections] AS [probe_connection]
                 ON [probe_connection].[id] = [probe_model].[ai_connection_id]
               WHERE [probe_revision].[id] = @0
                 AND (
                   SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
                   WHERE [ai_connection_id] = [probe_connection].[id]
                     AND [status] = N'running' AND [lease_expires_at] > @now
                 ) < [probe_connection].[maximum_concurrency]
                 AND ([probe_revision].[maximum_concurrency] IS NULL OR (
                   SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
                   WHERE [ai_connection_model_revision_id] = @0
                     AND [status] = N'running' AND [lease_expires_at] > @now
                 ) < [probe_revision].[maximum_concurrency])
             );
           IF EXISTS (SELECT 1 FROM @acquired)
             INSERT INTO [ai_run_coordination_entries] (
               [application_run_id], [fencing_token], [ai_connection_id],
               [ai_connection_model_revision_id], [ai_run_profile_id],
               [ai_run_profile_configuration_version],
               [status], [attempt_count], [lease_owner_id], [lease_expires_at],
               [not_before], [total_deadline_at], [created_at], [updated_at]
             ) VALUES (
               @2, @2, @4, @0, @5, @6, N'running', 1, @1,
               DATEADD(millisecond, @3, @now), @now,
               DATEADD(millisecond, @3, @now), @now, @now
             );
           SELECT [probeStatus], [healthStatus], [breakerStatus]
           FROM @acquired;`,
          [
            input.modelRevisionId,
            input.leaseOwnerId,
            input.probeRunId,
            input.leaseDurationMs,
            input.identity.aiConnectionId,
            input.identity.aiRunProfileId,
            input.identity.aiRunProfileConfigurationVersion,
          ],
        ),
      )
      const acquired = rows[0]
      if (
        acquired?.probeStatus !== 'acquired' ||
        !acquired.breakerStatus ||
        !acquired.healthStatus
      ) {
        return null
      }
      return {
        breakerStatus: acquired.breakerStatus,
        healthStatus: acquired.healthStatus,
      }
    },

    async cancellationRequested(input) {
      const leaseOwnerId = input.leaseOwnerId ?? null
      const rows = await db.query<CoordinationRow[]>(
        `SELECT [cancellation_reason] AS [cancellationReason],
                [cancellation_requested_at] AS [cancellationRequestedAt]
         FROM [ai_run_coordination_entries]
         WHERE [application_run_id] = @0 AND [fencing_token] = @1
           AND ((@2 IS NULL AND [status] IN (N'queued', N'retry_wait'))
             OR (@2 IS NOT NULL AND [lease_owner_id] = @2
               AND [status] = N'running'
               AND [lease_expires_at] > SYSUTCDATETIME()))`,
        [input.applicationRunId, input.fencingToken, leaseOwnerId],
      )
      const row = rows[0]
      return row?.cancellationReason && row.cancellationRequestedAt
        ? {
            reason: row.cancellationReason,
            requestedAt: new Date(row.cancellationRequestedAt),
          }
        : null
    },

    async enqueue(input): Promise<AiRunAdmissionResult> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(ENQUEUE_SQL, [
          input.applicationRunId,
          input.identity.aiConnectionId,
          input.identity.aiConnectionModelRevisionId,
          input.identity.aiRunProfileId,
          input.totalDeadlineAt,
          input.queueCapacity,
          input.fencingToken,
          input.identity.aiRunProfileConfigurationVersion,
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
          input.fencingToken,
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
           AND [fencing_token] = @3
           AND [status] = N'running' AND [lease_expires_at] > SYSUTCDATETIME()`,
        [
          input.applicationRunId,
          input.leaseOwnerId,
          input.leaseDurationMs,
          input.fencingToken,
        ],
      )
      return Boolean(rows[0]?.renewed)
    },

    async requeueForRetry(input): Promise<'applied' | 'lease_lost'> {
      const rows = await db.query<CoordinationRow[]>(
        `UPDATE [ai_run_coordination_entries]
         SET [status] = N'retry_wait', [not_before] = @1,
             [lease_owner_id] = NULL, [lease_expires_at] = NULL,
             [updated_at] = SYSUTCDATETIME()
         OUTPUT 1 AS [requeued]
         WHERE [application_run_id] = @0 AND [status] = N'running'
           AND [lease_owner_id] = @2 AND [fencing_token] = @3
           AND [lease_expires_at] > SYSUTCDATETIME()`,
        [
          input.applicationRunId,
          input.notBefore,
          input.leaseOwnerId,
          input.fencingToken,
        ],
      )
      return rows[0]?.requeued ? 'applied' : 'lease_lost'
    },

    async finish(input): Promise<AiOperationalStateTransition> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(FINISH_SQL, [
          input.applicationRunId,
          input.failure?.category ?? null,
          input.failure?.retryable ? 1 : 0,
          input.outcome,
          input.fencingToken,
          input.leaseOwnerId,
        ]),
      )
      return transition(rows[0])
    },

    async listDueRecoveryProbes(limit): Promise<AiRecoveryProbeTarget[]> {
      const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
      const rows = await db.query<CoordinationRow[]>(
        `SELECT TOP (@0)
           [connection].[id] AS [aiConnectionId],
           [state].[ai_connection_model_revision_id] AS [aiConnectionModelRevisionId],
           [profile].[id] AS [aiRunProfileId],
           [profile].[configuration_version] AS [aiRunProfileConfigurationVersion],
           [connection].[adapter_version] AS [adapterVersion],
           [connection].[adapter_key] AS [adapterType],
           CASE [profile].[profile_key]
             WHEN N'generation_without_images' THEN N'generate_without_images'
             WHEN N'generation_with_images' THEN N'generate_with_images'
             WHEN N'invalid_json_repair' THEN N'repair_invalid_import_json'
           END AS [runType],
           [profile].[total_time_budget_seconds] * 1000 AS [totalTimeBudgetMs],
           [profile].[inactivity_time_budget_seconds] * 1000 AS [inactivityTimeBudgetMs]
         FROM [ai_connection_model_operational_states] AS [state]
         INNER JOIN [ai_connection_model_revisions] AS [model_revision]
           ON [model_revision].[id] = [state].[ai_connection_model_revision_id]
         INNER JOIN [ai_connection_models] AS [model]
           ON [model].[id] = [model_revision].[ai_connection_model_id]
         INNER JOIN [ai_connections] AS [connection]
           ON [connection].[id] = [model].[ai_connection_id]
         INNER JOIN [ai_run_profiles] AS [profile]
           ON [profile].[ai_connection_model_revision_id] = [state].[ai_connection_model_revision_id]
         WHERE [state].[circuit_breaker_status] = N'open'
           AND [state].[next_recovery_at] <= SYSUTCDATETIME()
           AND [state].[automatic_recovery_attempt_count] < 5
           AND [state].[is_manual_recovery_required] = 0
           AND [state].[circuit_open_reason] IN
             (N'connection_unavailable', N'deadline_exceeded', N'adapter_failure')
           AND [connection].[lifecycle_status] = N'active'
           AND [model_revision].[status] = N'verified'
           AND [profile].[operational_status] = N'enabled'
         ORDER BY [state].[next_recovery_at],
                  [state].[ai_connection_model_revision_id]`,
        [boundedLimit],
      )
      return rows.flatMap(row =>
        row.adapterType &&
        row.adapterVersion &&
        row.aiConnectionId &&
        row.aiConnectionModelRevisionId &&
        row.aiRunProfileConfigurationVersion !== undefined &&
        row.aiRunProfileId &&
        row.runType &&
        row.inactivityTimeBudgetMs !== undefined &&
        row.totalTimeBudgetMs !== undefined
          ? [
              {
                adapterType: row.adapterType,
                adapterVersion: row.adapterVersion,
                identity: {
                  aiConnectionId: row.aiConnectionId,
                  aiConnectionModelRevisionId: row.aiConnectionModelRevisionId,
                  aiRunProfileConfigurationVersion: Number(
                    row.aiRunProfileConfigurationVersion,
                  ),
                  aiRunProfileId: row.aiRunProfileId,
                },
                inactivityTimeBudgetMs: Number(row.inactivityTimeBudgetMs),
                runType: row.runType,
                totalTimeBudgetMs: Number(row.totalTimeBudgetMs),
              } as AiRecoveryProbeTarget,
            ]
          : [],
      )
    },

    async acquireRecoveryProbe(input): Promise<boolean> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(
          `SET NOCOUNT ON;
           DECLARE @now datetime2(3) = SYSUTCDATETIME();
           DELETE FROM [ai_run_coordination_entries]
           WHERE [status] = N'running' AND [lease_expires_at] <= @now;
           DELETE [entry]
           FROM [ai_run_coordination_entries] AS [entry]
           INNER JOIN [ai_connection_model_operational_states] AS [state]
             ON [state].[lease_run_id] = [entry].[application_run_id]
           WHERE [state].[ai_connection_model_revision_id] = @0
             AND [state].[lease_expires_at] <= @now
             AND [entry].[status] = N'running';
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
           DECLARE @acquired TABLE ([probeStatus] nvarchar(24));
           UPDATE [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
           SET [circuit_breaker_status] = N'half_open', [lease_owner_id] = @1,
               [lease_run_id] = @2,
               [automatic_recovery_attempt_count] =
                 [automatic_recovery_attempt_count] + 1,
               [lease_expires_at] = DATEADD(millisecond, @3, @now),
               [updated_at] = @now, [revision_token] = NEWID()
           OUTPUT N'acquired' INTO @acquired ([probeStatus])
           WHERE [ai_connection_model_revision_id] = @0
             AND (
               ([circuit_breaker_status] = N'open' AND [next_recovery_at] <= @now)
               OR ([circuit_breaker_status] = N'half_open' AND [lease_expires_at] <= @now)
             )
             AND [circuit_open_reason] NOT IN (N'authentication_failed', N'capability_mismatch', N'attestation_invalid', N'administratively_suspended', N'security_blocked')
             AND [automatic_recovery_attempt_count] < 5
             AND [is_manual_recovery_required] = 0
             AND ([lease_expires_at] IS NULL OR [lease_expires_at] <= @now)
             AND EXISTS (
               SELECT 1
               FROM [ai_connection_model_revisions] AS [probe_revision]
               INNER JOIN [ai_connection_models] AS [probe_model]
                 ON [probe_model].[id] = [probe_revision].[ai_connection_model_id]
               INNER JOIN [ai_connections] AS [probe_connection]
                 ON [probe_connection].[id] = [probe_model].[ai_connection_id]
               WHERE [probe_revision].[id] = @0
                 AND (
                   SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
                   WHERE [ai_connection_id] = [probe_connection].[id]
                     AND [status] = N'running' AND [lease_expires_at] > @now
                 ) < [probe_connection].[maximum_concurrency]
                 AND ([probe_revision].[maximum_concurrency] IS NULL OR (
                   SELECT COUNT(*) FROM [ai_run_coordination_entries] WITH (UPDLOCK, HOLDLOCK)
                   WHERE [ai_connection_model_revision_id] = @0
                     AND [status] = N'running' AND [lease_expires_at] > @now
                 ) < [probe_revision].[maximum_concurrency])
             );
           IF EXISTS (SELECT 1 FROM @acquired)
             INSERT INTO [ai_run_coordination_entries] (
               [application_run_id], [fencing_token], [ai_connection_id],
               [ai_connection_model_revision_id], [ai_run_profile_id],
               [ai_run_profile_configuration_version],
               [status], [attempt_count], [lease_owner_id], [lease_expires_at],
               [not_before], [total_deadline_at], [created_at], [updated_at]
             ) VALUES (
               @2, @2, @4, @0, @5, @6, N'running', 1, @1,
               DATEADD(millisecond, @3, @now), @now,
               DATEADD(millisecond, @3, @now), @now, @now
             );
           SELECT [probeStatus] FROM @acquired;`,
          [
            input.modelRevisionId,
            input.leaseOwnerId,
            input.probeRunId,
            input.leaseDurationMs,
            input.identity.aiConnectionId,
            input.identity.aiRunProfileId,
            input.identity.aiRunProfileConfigurationVersion,
          ],
        ),
      )
      return rows[0]?.probeStatus === 'acquired'
    },

    async finishRecoveryProbe(input): Promise<AiOperationalStateTransition> {
      const rows = await db.transaction('SERIALIZABLE', manager =>
        manager.query<CoordinationRow[]>(
          `SET NOCOUNT ON;
           DECLARE @now datetime2(3) = SYSUTCDATETIME();
           DECLARE @previous_health nvarchar(24);
           DECLARE @previous_breaker nvarchar(24);
           SELECT @previous_health = [health_status],
                  @previous_breaker = [circuit_breaker_status]
           FROM [ai_connection_model_operational_states] WITH (UPDLOCK, HOLDLOCK)
           WHERE [ai_connection_model_revision_id] = @0
             AND [lease_owner_id] = @1 AND [lease_run_id] = @2
             AND [lease_expires_at] > @now;
           IF @previous_health IS NULL RETURN;
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
               AND [lease_owner_id] = @1 AND [lease_run_id] = @2
               AND [lease_expires_at] > @now;
           ELSE IF @4 IN (N'authentication_failed', N'capability_mismatch')
             UPDATE [ai_connection_model_operational_states]
             SET [health_status] = N'unavailable', [circuit_breaker_status] = N'open',
                 [circuit_open_reason] = @4,
                 [is_manual_recovery_required] = 1, [next_recovery_at] = NULL,
                 [lease_owner_id] = NULL, [lease_run_id] = NULL,
                 [lease_expires_at] = NULL, [last_health_evidence_at] = @now,
                 [updated_at] = @now, [revision_token] = NEWID()
             WHERE [ai_connection_model_revision_id] = @0
               AND [lease_owner_id] = @1 AND [lease_run_id] = @2
               AND [lease_expires_at] > @now;
           ELSE
             UPDATE [ai_connection_model_operational_states]
             SET [health_status] = N'unavailable', [circuit_breaker_status] = N'open',
                 [is_manual_recovery_required] = CASE WHEN [automatic_recovery_attempt_count] >= 5 THEN 1 ELSE 0 END,
                 [next_recovery_at] = CASE WHEN [automatic_recovery_attempt_count] >= 5 THEN NULL ELSE DATEADD(minute, 60, @now) END,
                 [lease_owner_id] = NULL, [lease_run_id] = NULL,
                 [lease_expires_at] = NULL, [last_health_evidence_at] = @now,
                 [updated_at] = @now, [revision_token] = NEWID()
             WHERE [ai_connection_model_revision_id] = @0
               AND [lease_owner_id] = @1 AND [lease_run_id] = @2
               AND [lease_expires_at] > @now;
           DELETE FROM [ai_run_coordination_entries]
           WHERE [application_run_id] = @2 AND [fencing_token] = @2
             AND [lease_owner_id] = @1 AND [status] = N'running'
             AND [lease_expires_at] > @now;
           SELECT CASE WHEN @previous_breaker <> N'open'
                          AND [circuit_breaker_status] = N'open'
                       THEN 1 ELSE 0 END AS [breakerOpened],
                  CASE WHEN [health_status] <> @previous_health
                         OR [circuit_breaker_status] <> @previous_breaker
                       THEN 1 ELSE 0 END AS [healthStateChanged],
                  [health_status] AS [healthStatus],
                  [circuit_breaker_status] AS [breakerStatus]
           FROM [ai_connection_model_operational_states]
           WHERE [ai_connection_model_revision_id] = @0;`,
          [
            input.modelRevisionId,
            input.leaseOwnerId,
            input.probeRunId,
            input.succeeded ? 1 : 0,
            input.failure?.category ?? null,
          ],
        ),
      )
      return transition(rows[0])
    },
  }
}
