import type { SqlServerDatabase } from '@/lib/db'

export {
  inspectExpiredRequirementImportValidationSessions,
  purgeExpiredRequirementImportValidationSessions,
} from '@/lib/transient-cleanup/requirement-import-validation-sessions'

import { toIsoString } from '@/lib/typeorm/value-mappers'

export interface RequirementImportValidationSessionRecord {
  createdAt: string
  creatorPrincipalFingerprint: string
  destinationId: number
  destinationKind: string
  destinationSnapshotJson: string
  executionResultJson: string | null
  expiresAt: string
  id: number
  payloadHash: string
  referenceDataFingerprint: string
  reservedBytes: number
  submittedPayloadJson: string
  tokenHash: string
  updatedAt: string
  validationResultJson: string
}

export interface RequirementImportValidationSessionCreateData {
  creatorPrincipalFingerprint: string
  destinationId: number
  destinationKind: string
  destinationSnapshotJson: string
  executionResultJson?: string | null
  expiresAt: Date
  payloadHash: string
  referenceDataFingerprint: string
  reservedBytes: number
  submittedPayloadJson: string
  tokenHash: string
  validationResultJson: string
}

export const REQUIREMENT_IMPORT_VALIDATION_SESSION_QUOTA_CODES = [
  'import_validation_principal_session_quota_exceeded',
  'import_validation_creation_rate_exceeded',
  'import_validation_destination_session_quota_exceeded',
  'import_validation_storage_quota_exceeded',
] as const

export type RequirementImportValidationSessionQuotaCode =
  (typeof REQUIREMENT_IMPORT_VALIDATION_SESSION_QUOTA_CODES)[number]

export interface RequirementImportValidationSessionQuotaRejection {
  code: RequirementImportValidationSessionQuotaCode
  retryAfterSeconds?: number
}

export type RequirementImportValidationSessionCreateResult =
  | { rejection: RequirementImportValidationSessionQuotaRejection }
  | { session: RequirementImportValidationSessionRecord }

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

interface RequirementImportValidationSessionDbRow
  extends Omit<
    RequirementImportValidationSessionRecord,
    'createdAt' | 'expiresAt' | 'updatedAt'
  > {
  createdAt: Date | string
  expiresAt: Date | string
  updatedAt: Date | string
}

interface QuotaSettingsRow {
  maxActiveSessionsPerDestination: number | string
  maxActiveSessionsPerPrincipal: number | string
  maxCreationsPerWindow: number | string
  maxReservedBytes: number | string
}

interface QuotaClockRow {
  now: Date | string
  windowEnd: Date | string
  windowStart: Date | string
}

interface QuotaUsageRow {
  destinationActiveSessions: number | string
  principalActiveSessions: number | string
  reservedBytes: number | string
}

interface RateBucketRow {
  successfulCreations: number | string
}

interface AdvisoryQuotaRow
  extends QuotaSettingsRow,
    QuotaUsageRow,
    RateBucketRow {
  now: Date | string
  windowEnd: Date | string
}

export interface RequirementImportValidationSessionQuotaInput {
  creatorPrincipalFingerprint: string
  destinationId: number
  destinationKind: string
  requestedReservedBytes: number
}

function mapSession(
  row: RequirementImportValidationSessionDbRow,
): RequirementImportValidationSessionRecord {
  return {
    createdAt: toIsoString(row.createdAt),
    creatorPrincipalFingerprint: row.creatorPrincipalFingerprint,
    destinationId: Number(row.destinationId),
    destinationKind: row.destinationKind,
    destinationSnapshotJson: row.destinationSnapshotJson,
    executionResultJson: row.executionResultJson,
    expiresAt: toIsoString(row.expiresAt),
    id: Number(row.id),
    payloadHash: row.payloadHash,
    referenceDataFingerprint: row.referenceDataFingerprint,
    reservedBytes: Number(row.reservedBytes),
    submittedPayloadJson: row.submittedPayloadJson,
    tokenHash: row.tokenHash,
    updatedAt: toIsoString(row.updatedAt),
    validationResultJson: row.validationResultJson,
  }
}

const SESSION_SELECT = `
  SELECT
    id,
    token_hash AS tokenHash,
    creator_principal_fingerprint AS creatorPrincipalFingerprint,
    payload_hash AS payloadHash,
    destination_kind AS destinationKind,
    destination_id AS destinationId,
    reference_data_fingerprint AS referenceDataFingerprint,
    reserved_bytes AS reservedBytes,
    destination_snapshot_json AS destinationSnapshotJson,
    submitted_payload_json AS submittedPayloadJson,
    validation_result_json AS validationResultJson,
    execution_result_json AS executionResultJson,
    expires_at AS expiresAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM requirement_import_validation_sessions
`

function boundedRetryAfterSeconds(now: Date, windowEnd: Date): number {
  return Math.max(
    1,
    Math.min(600, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000)),
  )
}

function quotaRejection(
  settings: QuotaSettingsRow,
  usage: QuotaUsageRow,
  successfulCreations: number,
  requestedReservedBytes: number,
  clock: { now: Date; windowEnd: Date },
): RequirementImportValidationSessionQuotaRejection | null {
  if (
    Number(usage.principalActiveSessions) >=
    Number(settings.maxActiveSessionsPerPrincipal)
  ) {
    return { code: 'import_validation_principal_session_quota_exceeded' }
  }
  if (successfulCreations >= Number(settings.maxCreationsPerWindow)) {
    return {
      code: 'import_validation_creation_rate_exceeded',
      retryAfterSeconds: boundedRetryAfterSeconds(clock.now, clock.windowEnd),
    }
  }
  if (
    Number(usage.destinationActiveSessions) >=
    Number(settings.maxActiveSessionsPerDestination)
  ) {
    return { code: 'import_validation_destination_session_quota_exceeded' }
  }
  if (
    Number(usage.reservedBytes) + requestedReservedBytes >
    Number(settings.maxReservedBytes)
  ) {
    return { code: 'import_validation_storage_quota_exceeded' }
  }
  return null
}

export async function checkRequirementImportValidationSessionQuotaAdvisory(
  executor: QueryExecutor,
  input: RequirementImportValidationSessionQuotaInput,
): Promise<RequirementImportValidationSessionQuotaRejection | null> {
  const rows = await executor.query<AdvisoryQuotaRow[]>(
    `DECLARE @now datetime2(3) = SYSUTCDATETIME();
     DECLARE @window_start datetime2(3) = DATEADD(
       minute,
       (DATEDIFF_BIG(minute, CONVERT(datetime2(3), '1970-01-01'), @now) / 10) * 10,
       CONVERT(datetime2(3), '1970-01-01')
     );
     SELECT
       settings.mcp_import_max_active_sessions_per_destination AS maxActiveSessionsPerDestination,
       settings.mcp_import_max_active_sessions_per_principal AS maxActiveSessionsPerPrincipal,
       settings.mcp_import_max_creations_per_window AS maxCreationsPerWindow,
       settings.mcp_import_max_reserved_bytes AS maxReservedBytes,
       (SELECT COUNT_BIG(*)
        FROM requirement_import_validation_sessions
        WHERE creator_principal_fingerprint = @0
          AND expires_at > @now) AS principalActiveSessions,
       (SELECT COUNT_BIG(*)
        FROM requirement_import_validation_sessions
        WHERE destination_kind = @1
          AND destination_id = @2
          AND expires_at > @now) AS destinationActiveSessions,
       (SELECT COALESCE(SUM(reserved_bytes), CONVERT(bigint, 0))
        FROM requirement_import_validation_sessions
        WHERE expires_at > @now) AS reservedBytes,
       COALESCE((
         SELECT successful_creations
         FROM requirement_import_validation_rate_buckets
         WHERE principal_fingerprint = @0
           AND window_started_at = @window_start
       ), 0) AS successfulCreations,
       @now AS now,
       DATEADD(minute, 10, @window_start) AS windowEnd
     FROM ai_settings settings
     WHERE settings.id = 1`,
    [
      input.creatorPrincipalFingerprint,
      input.destinationKind,
      input.destinationId,
    ],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('MCP import-validation quota settings are missing')
  }
  return quotaRejection(
    row,
    row,
    Number(row.successfulCreations),
    input.requestedReservedBytes,
    { now: new Date(row.now), windowEnd: new Date(row.windowEnd) },
  )
}

export async function createRequirementImportValidationSessionAtomically(
  db: SqlServerDatabase,
  data: RequirementImportValidationSessionCreateData,
  beforeCreate?: (executor: QueryExecutor) => Promise<void>,
): Promise<RequirementImportValidationSessionCreateResult> {
  return db.transaction('SERIALIZABLE', async manager => {
    const lockRows = await manager.query<
      Array<{ lockResult: number | string }>
    >(
      `DECLARE @lock_result int;
       EXEC @lock_result = sys.sp_getapplock
         @Resource = N'kravhantering:mcp-import-validation-quota:v1',
         @LockMode = N'Exclusive',
         @LockOwner = N'Transaction',
         @LockTimeout = 10000;
       SELECT @lock_result AS lockResult;`,
    )
    if (Number(lockRows[0]?.lockResult ?? -999) < 0) {
      throw new Error('Failed to acquire MCP import-validation quota lock')
    }

    // Resolve application settings before acquiring the AI settings update lock.
    await beforeCreate?.(manager)

    const settingsRows = await manager.query<QuotaSettingsRow[]>(
      `SELECT TOP (1)
         mcp_import_max_active_sessions_per_destination AS maxActiveSessionsPerDestination,
         mcp_import_max_active_sessions_per_principal AS maxActiveSessionsPerPrincipal,
         mcp_import_max_creations_per_window AS maxCreationsPerWindow,
         mcp_import_max_reserved_bytes AS maxReservedBytes
       FROM ai_settings WITH (UPDLOCK, HOLDLOCK)
       WHERE id = 1`,
    )
    const settings = settingsRows[0]
    if (!settings) {
      throw new Error('MCP import-validation quota settings are missing')
    }

    const clockRows = await manager.query<QuotaClockRow[]>(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @window_start datetime2(3) = DATEADD(
         minute,
         (DATEDIFF_BIG(minute, CONVERT(datetime2(3), '1970-01-01'), @now) / 10) * 10,
         CONVERT(datetime2(3), '1970-01-01')
       );
       SELECT
         @now AS now,
         @window_start AS windowStart,
         DATEADD(minute, 10, @window_start) AS windowEnd;`,
    )
    const clockRow = clockRows[0]
    if (!clockRow) {
      throw new Error('MCP import-validation quota clock is unavailable')
    }
    const clock = {
      now: new Date(clockRow.now),
      windowEnd: new Date(clockRow.windowEnd),
      windowStart: new Date(clockRow.windowStart),
    }

    const usageRows = await manager.query<QuotaUsageRow[]>(
      `SELECT
         (SELECT COUNT_BIG(*)
          FROM requirement_import_validation_sessions WITH (UPDLOCK, HOLDLOCK)
          WHERE creator_principal_fingerprint = @0
            AND expires_at > @3) AS principalActiveSessions,
         (SELECT COUNT_BIG(*)
          FROM requirement_import_validation_sessions WITH (UPDLOCK, HOLDLOCK)
          WHERE destination_kind = @1
            AND destination_id = @2
            AND expires_at > @3) AS destinationActiveSessions,
         (SELECT COALESCE(SUM(reserved_bytes), CONVERT(bigint, 0))
          FROM requirement_import_validation_sessions WITH (UPDLOCK, HOLDLOCK)
          WHERE expires_at > @3) AS reservedBytes`,
      [
        data.creatorPrincipalFingerprint,
        data.destinationKind,
        data.destinationId,
        clock.now,
      ],
    )
    const usage = usageRows[0]
    if (!usage) {
      throw new Error('MCP import-validation quota usage is unavailable')
    }

    const rateRows = await manager.query<RateBucketRow[]>(
      `SELECT successful_creations AS successfulCreations
       FROM requirement_import_validation_rate_buckets WITH (UPDLOCK, HOLDLOCK)
       WHERE principal_fingerprint = @0
         AND window_started_at = @1`,
      [data.creatorPrincipalFingerprint, clock.windowStart],
    )
    const successfulCreations = Number(rateRows[0]?.successfulCreations ?? 0)
    const rejection = quotaRejection(
      settings,
      usage,
      successfulCreations,
      data.reservedBytes,
      clock,
    )
    if (rejection) return { rejection }

    const rows = await manager.query<RequirementImportValidationSessionDbRow[]>(
      `INSERT INTO requirement_import_validation_sessions (
         token_hash,
         creator_principal_fingerprint,
         payload_hash,
         destination_kind,
         destination_id,
         reference_data_fingerprint,
         reserved_bytes,
         destination_snapshot_json,
         submitted_payload_json,
         validation_result_json,
         execution_result_json,
         expires_at,
         created_at,
         updated_at
       )
       OUTPUT
         inserted.id AS id,
         inserted.token_hash AS tokenHash,
         inserted.creator_principal_fingerprint AS creatorPrincipalFingerprint,
         inserted.payload_hash AS payloadHash,
         inserted.destination_kind AS destinationKind,
         inserted.destination_id AS destinationId,
         inserted.reference_data_fingerprint AS referenceDataFingerprint,
         inserted.reserved_bytes AS reservedBytes,
         inserted.destination_snapshot_json AS destinationSnapshotJson,
         inserted.submitted_payload_json AS submittedPayloadJson,
         inserted.validation_result_json AS validationResultJson,
         inserted.execution_result_json AS executionResultJson,
         inserted.expires_at AS expiresAt,
         inserted.created_at AS createdAt,
         inserted.updated_at AS updatedAt
       VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @12)`,
      [
        data.tokenHash,
        data.creatorPrincipalFingerprint,
        data.payloadHash,
        data.destinationKind,
        data.destinationId,
        data.referenceDataFingerprint,
        data.reservedBytes,
        data.destinationSnapshotJson,
        data.submittedPayloadJson,
        data.validationResultJson,
        data.executionResultJson ?? null,
        data.expiresAt,
        clock.now,
      ],
    )
    const row = rows[0]
    if (!row) {
      throw new Error('Failed to create requirement import validation session')
    }

    await manager.query(
      `UPDATE requirement_import_validation_rate_buckets
       SET successful_creations = successful_creations + 1,
           expires_at = @2,
           updated_at = @3
       WHERE principal_fingerprint = @0
         AND window_started_at = @1;
       IF @@ROWCOUNT = 0
         INSERT INTO requirement_import_validation_rate_buckets (
           principal_fingerprint,
           window_started_at,
           successful_creations,
           expires_at,
           created_at,
           updated_at
         ) VALUES (@0, @1, 1, @2, @3, @3);`,
      [
        data.creatorPrincipalFingerprint,
        clock.windowStart,
        new Date(clock.windowEnd.getTime() + 10 * 60 * 1000),
        clock.now,
      ],
    )
    return { session: mapSession(row) }
  })
}

export async function getOwnedRequirementImportValidationSession(
  executor: QueryExecutor,
  tokenHash: string,
  creatorPrincipalFingerprint: string,
  options: { lockForUpdate?: boolean } = {},
): Promise<RequirementImportValidationSessionRecord | null> {
  const lockHint = options.lockForUpdate ? ' WITH (UPDLOCK, HOLDLOCK)' : ''
  const rows = await executor.query<RequirementImportValidationSessionDbRow[]>(
    `
      ${SESSION_SELECT.replace(
        'FROM requirement_import_validation_sessions',
        `FROM requirement_import_validation_sessions${lockHint}`,
      )}
      WHERE token_hash = @0
        AND creator_principal_fingerprint = @1
        AND expires_at > SYSUTCDATETIME()
    `,
    [tokenHash, creatorPrincipalFingerprint],
  )
  return rows[0] ? mapSession(rows[0]) : null
}

export async function updateRequirementImportValidationSessionExecutionResult(
  executor: QueryExecutor,
  id: number,
  executionResultJson: string,
  updatedAt: Date,
): Promise<void> {
  await executor.query(
    `
      UPDATE requirement_import_validation_sessions
      SET
        execution_result_json = @0,
        updated_at = @1
      WHERE id = @2
    `,
    [executionResultJson, updatedAt, id],
  )
}
