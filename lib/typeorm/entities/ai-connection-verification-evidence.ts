import { EntitySchema } from 'typeorm'
import type { AiConnectionEntity } from './ai-connection'

export type AiVerificationOutcome = 'failed' | 'passed'

export interface AiConnectionVerificationEvidenceEntity {
  adapterVersion: string
  agentRuntimeVersion: string | null
  configurationFingerprint: string
  connection: AiConnectionEntity
  connectionConfigurationVersion: number
  detailsJson: string
  expiresAt: Date | null
  failureCategory: string | null
  id: string
  outcome: AiVerificationOutcome
  testSuiteVersion: string
  verifiedAt: Date
}

export const aiConnectionVerificationEvidenceEntity =
  new EntitySchema<AiConnectionVerificationEvidenceEntity>({
    name: 'AiConnectionVerificationEvidence',
    tableName: 'ai_connection_verification_evidence',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      connectionConfigurationVersion: {
        name: 'connection_configuration_version',
        type: 'int',
      },
      outcome: { length: 24, name: 'outcome', type: 'nvarchar' },
      testSuiteVersion: {
        length: 100,
        name: 'test_suite_version',
        type: 'nvarchar',
      },
      adapterVersion: {
        length: 100,
        name: 'adapter_version',
        type: 'nvarchar',
      },
      agentRuntimeVersion: {
        length: 100,
        name: 'agent_runtime_version',
        nullable: true,
        type: 'nvarchar',
      },
      configurationFingerprint: {
        length: 64,
        name: 'configuration_fingerprint',
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
      expiresAt: {
        name: 'expires_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
    },
    relations: {
      connection: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_connection_verification_evidence_ai_connection_id',
          name: 'ai_connection_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnection',
        type: 'many-to-one',
      },
    },
    indices: [
      {
        columns: ['connection', 'connectionConfigurationVersion', 'verifiedAt'],
        name: 'idx_ai_connection_verification_evidence_connection_version',
      },
    ],
    checks: [
      {
        expression: '[connection_configuration_version] >= 1',
        name: 'chk_ai_connection_verification_evidence_configuration_version',
      },
      {
        expression: "[outcome] IN (N'passed', N'failed')",
        name: 'chk_ai_connection_verification_evidence_outcome',
      },
      {
        expression: "[configuration_fingerprint] NOT LIKE '%[^0-9a-f]%'",
        name: 'chk_ai_connection_verification_evidence_fingerprint',
      },
      {
        expression: 'ISJSON([details_json]) = 1',
        name: 'chk_ai_connection_verification_evidence_details_json',
      },
      {
        expression: '[expires_at] IS NULL OR [expires_at] > [verified_at]',
        name: 'chk_ai_connection_verification_evidence_expiry',
      },
    ],
  })
