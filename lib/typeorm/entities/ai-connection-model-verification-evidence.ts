import { EntitySchema } from 'typeorm'
import type { AiConnectionModelRevisionEntity } from './ai-connection-model-revision'
import type {
  AiConnectionVerificationEvidenceEntity,
  AiVerificationOutcome,
} from './ai-connection-verification-evidence'

export interface AiConnectionModelVerificationEvidenceEntity {
  connectionEvidence: AiConnectionVerificationEvidenceEntity
  detailsJson: string
  evidenceFingerprint: string
  failureCategory: string | null
  id: string
  modelRevision: AiConnectionModelRevisionEntity
  outcome: AiVerificationOutcome
  profileCompatibilityJson: string
  testSuiteVersion: string
  verifiedAt: Date
  verifiedCapabilitiesJson: string
}

export const aiConnectionModelVerificationEvidenceEntity =
  new EntitySchema<AiConnectionModelVerificationEvidenceEntity>({
    name: 'AiConnectionModelVerificationEvidence',
    tableName: 'ai_connection_model_verification_evidence',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      outcome: { length: 24, name: 'outcome', type: 'nvarchar' },
      testSuiteVersion: {
        length: 100,
        name: 'test_suite_version',
        type: 'nvarchar',
      },
      verifiedCapabilitiesJson: {
        length: 'MAX',
        name: 'verified_capabilities_json',
        type: 'nvarchar',
      },
      profileCompatibilityJson: {
        length: 'MAX',
        name: 'profile_compatibility_json',
        type: 'nvarchar',
      },
      evidenceFingerprint: {
        length: 64,
        name: 'evidence_fingerprint',
        type: 'char',
      },
      failureCategory: {
        length: 80,
        name: 'failure_category',
        nullable: true,
        type: 'nvarchar',
      },
      detailsJson: {
        length: 'MAX',
        name: 'details_json',
        type: 'nvarchar',
      },
      verifiedAt: { name: 'verified_at', precision: 3, type: 'datetime2' },
    },
    relations: {
      modelRevision: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_connection_model_verification_evidence_ai_connection_model_revision_id',
          name: 'ai_connection_model_revision_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnectionModelRevision',
        type: 'many-to-one',
      },
      connectionEvidence: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_connection_model_verification_evidence_ai_connection_verification_evidence_id',
          name: 'ai_connection_verification_evidence_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnectionVerificationEvidence',
        type: 'many-to-one',
      },
    },
    indices: [
      {
        columns: ['modelRevision', 'verifiedAt'],
        name: 'idx_ai_connection_model_verification_evidence_revision',
      },
    ],
    checks: [
      {
        expression: "[outcome] IN (N'passed', N'failed')",
        name: 'chk_ai_connection_model_verification_evidence_outcome',
      },
      {
        expression: 'ISJSON([verified_capabilities_json]) = 1',
        name: 'chk_ai_connection_model_verification_evidence_capabilities_json',
      },
      {
        expression: "[evidence_fingerprint] NOT LIKE '%[^0-9a-f]%'",
        name: 'chk_ai_connection_model_verification_evidence_fingerprint',
      },
      {
        expression: 'ISJSON([details_json]) = 1',
        name: 'chk_ai_connection_model_verification_evidence_details_json',
      },
      {
        expression: 'ISJSON([profile_compatibility_json]) = 1',
        name: 'chk_ai_connection_model_verification_evidence_profile_compatibility_json',
      },
    ],
  })
