import { EntitySchema } from 'typeorm'

export interface RequirementImportValidationSessionEntity {
  createdAt: Date
  destinationId: number
  destinationKind: string
  destinationSnapshotJson: string
  executionResultJson: string | null
  expiresAt: Date
  id: number
  payloadHash: string
  referenceDataFingerprint: string
  submittedPayloadJson: string
  tokenHash: string
  updatedAt: Date
  validationResultJson: string
}

export const requirementImportValidationSessionEntity =
  new EntitySchema<RequirementImportValidationSessionEntity>({
    name: 'RequirementImportValidationSession',
    tableName: 'requirement_import_validation_sessions',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      tokenHash: {
        length: 64,
        name: 'token_hash',
        type: 'nvarchar',
      },
      payloadHash: {
        length: 64,
        name: 'payload_hash',
        type: 'nvarchar',
      },
      destinationKind: {
        length: 40,
        name: 'destination_kind',
        type: 'nvarchar',
      },
      destinationId: {
        name: 'destination_id',
        type: 'int',
      },
      referenceDataFingerprint: {
        length: 64,
        name: 'reference_data_fingerprint',
        type: 'nvarchar',
      },
      destinationSnapshotJson: {
        length: 'MAX',
        name: 'destination_snapshot_json',
        type: 'nvarchar',
      },
      submittedPayloadJson: {
        length: 'MAX',
        name: 'submitted_payload_json',
        type: 'nvarchar',
      },
      validationResultJson: {
        length: 'MAX',
        name: 'validation_result_json',
        type: 'nvarchar',
      },
      executionResultJson: {
        length: 'MAX',
        name: 'execution_result_json',
        nullable: true,
        type: 'nvarchar',
      },
      expiresAt: { name: 'expires_at', type: 'datetime2' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        columns: ['tokenHash'],
        name: 'uq_requirement_import_validation_sessions_token_hash',
        unique: true,
      },
      {
        columns: ['expiresAt'],
        name: 'idx_requirement_import_validation_sessions_expires_at',
      },
    ],
    checks: [
      {
        expression:
          "[destination_kind] IN (N'requirements_library', N'requirements_specification')",
        name: 'chk_requirement_import_validation_sessions_destination_kind',
      },
      {
        expression: '[destination_id] > 0',
        name: 'chk_requirement_import_validation_sessions_destination_id',
      },
      {
        expression: 'LEN([token_hash]) = 64',
        name: 'chk_requirement_import_validation_sessions_token_hash',
      },
      {
        expression: 'LEN([payload_hash]) = 64',
        name: 'chk_requirement_import_validation_sessions_payload_hash',
      },
      {
        expression: 'LEN([reference_data_fingerprint]) = 64',
        name: 'chk_requirement_import_validation_sessions_reference_data_fingerprint',
      },
      {
        expression: '[expires_at] > [created_at]',
        name: 'chk_requirement_import_validation_sessions_expires_at',
      },
      {
        expression: 'ISJSON([destination_snapshot_json]) = 1',
        name: 'chk_requirement_import_validation_sessions_destination_snapshot_json',
      },
      {
        expression: 'ISJSON([submitted_payload_json]) = 1',
        name: 'chk_requirement_import_validation_sessions_submitted_payload_json',
      },
      {
        expression: 'ISJSON([validation_result_json]) = 1',
        name: 'chk_requirement_import_validation_sessions_validation_result_json',
      },
      {
        expression:
          '[execution_result_json] IS NULL OR ISJSON([execution_result_json]) = 1',
        name: 'chk_requirement_import_validation_sessions_execution_result_json',
      },
    ],
  })
