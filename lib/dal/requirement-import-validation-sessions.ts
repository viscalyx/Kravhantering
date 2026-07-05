import type { SqlServerDatabase } from '@/lib/db'
import { toIsoString } from '@/lib/typeorm/value-mappers'

export interface RequirementImportValidationSessionRecord {
  createdAt: string
  destinationId: number
  destinationKind: string
  destinationSnapshotJson: string
  executionResultJson: string | null
  expiresAt: string
  id: number
  payloadHash: string
  referenceDataFingerprint: string
  submittedPayloadJson: string
  tokenHash: string
  updatedAt: string
  validationResultJson: string
}

export interface RequirementImportValidationSessionCreateData {
  destinationId: number
  destinationKind: string
  destinationSnapshotJson: string
  executionResultJson?: string | null
  expiresAt: Date
  payloadHash: string
  referenceDataFingerprint: string
  submittedPayloadJson: string
  tokenHash: string
  validationResultJson: string
}

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

function mapSession(
  row: RequirementImportValidationSessionDbRow,
): RequirementImportValidationSessionRecord {
  return {
    createdAt: toIsoString(row.createdAt),
    destinationId: Number(row.destinationId),
    destinationKind: row.destinationKind,
    destinationSnapshotJson: row.destinationSnapshotJson,
    executionResultJson: row.executionResultJson,
    expiresAt: toIsoString(row.expiresAt),
    id: Number(row.id),
    payloadHash: row.payloadHash,
    referenceDataFingerprint: row.referenceDataFingerprint,
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
    payload_hash AS payloadHash,
    destination_kind AS destinationKind,
    destination_id AS destinationId,
    reference_data_fingerprint AS referenceDataFingerprint,
    destination_snapshot_json AS destinationSnapshotJson,
    submitted_payload_json AS submittedPayloadJson,
    validation_result_json AS validationResultJson,
    execution_result_json AS executionResultJson,
    expires_at AS expiresAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM requirement_import_validation_sessions
`

export async function createRequirementImportValidationSession(
  db: SqlServerDatabase,
  data: RequirementImportValidationSessionCreateData,
): Promise<RequirementImportValidationSessionRecord> {
  const now = new Date()
  const rows = await db.query<RequirementImportValidationSessionDbRow[]>(
    `
      INSERT INTO requirement_import_validation_sessions (
        token_hash,
        payload_hash,
        destination_kind,
        destination_id,
        reference_data_fingerprint,
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
        inserted.payload_hash AS payloadHash,
        inserted.destination_kind AS destinationKind,
        inserted.destination_id AS destinationId,
        inserted.reference_data_fingerprint AS referenceDataFingerprint,
        inserted.destination_snapshot_json AS destinationSnapshotJson,
        inserted.submitted_payload_json AS submittedPayloadJson,
        inserted.validation_result_json AS validationResultJson,
        inserted.execution_result_json AS executionResultJson,
        inserted.expires_at AS expiresAt,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @10)
    `,
    [
      data.tokenHash,
      data.payloadHash,
      data.destinationKind,
      data.destinationId,
      data.referenceDataFingerprint,
      data.destinationSnapshotJson,
      data.submittedPayloadJson,
      data.validationResultJson,
      data.executionResultJson ?? null,
      data.expiresAt,
      now,
    ],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('Failed to create requirement import validation session')
  }
  return mapSession(row)
}

export async function getRequirementImportValidationSessionByTokenHash(
  executor: QueryExecutor,
  tokenHash: string,
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
        AND expires_at > SYSUTCDATETIME()
    `,
    [tokenHash],
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

export async function purgeExpiredRequirementImportValidationSessions(
  db: SqlServerDatabase,
  limit = 100,
): Promise<void> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
  await db.query(
    `
      DELETE TOP (${boundedLimit})
      FROM requirement_import_validation_sessions
      WHERE expires_at <= SYSUTCDATETIME()
    `,
  )
}
