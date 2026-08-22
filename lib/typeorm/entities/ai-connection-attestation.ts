import { EntitySchema } from 'typeorm'
import type { AiConnectionEntity } from './ai-connection'

export type AiConnectionAttestationStatus =
  | 'draft'
  | 'expired'
  | 'revoked'
  | 'superseded'
  | 'valid'

export interface AiConnectionAttestationEntity {
  connection: AiConnectionEntity
  createdAt: Date
  decisionReference: string | null
  id: string
  incidentResponseReference: string | null
  isPersonalDataProcessed: boolean | null
  isTrainingAllowed: boolean | null
  maximumInformationClass: string | null
  maximumRetentionDays: number | null
  processingRegionsJson: string | null
  providerName: string | null
  purpose: string | null
  responsibleOrganizationUnitReference: string | null
  reviewDueAt: Date | null
  reviewedAt: Date | null
  revisionNumber: number
  revisionToken: string
  status: AiConnectionAttestationStatus
  subprocessorsJson: string | null
}

export const aiConnectionAttestationEntity =
  new EntitySchema<AiConnectionAttestationEntity>({
    name: 'AiConnectionAttestation',
    tableName: 'ai_connection_attestations',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      revisionNumber: { name: 'revision_number', type: 'int' },
      status: { length: 32, name: 'status', type: 'nvarchar' },
      responsibleOrganizationUnitReference: {
        name: 'responsible_organization_unit_reference',
        nullable: true,
        type: 'uniqueidentifier',
      },
      purpose: {
        length: 'MAX',
        name: 'purpose',
        nullable: true,
        type: 'nvarchar',
      },
      maximumInformationClass: {
        length: 100,
        name: 'maximum_information_class',
        nullable: true,
        type: 'nvarchar',
      },
      isPersonalDataProcessed: {
        name: 'is_personal_data_processed',
        nullable: true,
        type: 'bit',
      },
      providerName: {
        length: 300,
        name: 'provider_name',
        nullable: true,
        type: 'nvarchar',
      },
      subprocessorsJson: {
        length: 'MAX',
        name: 'subprocessors_json',
        nullable: true,
        type: 'nvarchar',
      },
      processingRegionsJson: {
        length: 'MAX',
        name: 'processing_regions_json',
        nullable: true,
        type: 'nvarchar',
      },
      isTrainingAllowed: {
        name: 'is_training_allowed',
        nullable: true,
        type: 'bit',
      },
      maximumRetentionDays: {
        name: 'maximum_retention_days',
        nullable: true,
        type: 'int',
      },
      incidentResponseReference: {
        name: 'incident_response_reference',
        nullable: true,
        type: 'uniqueidentifier',
      },
      decisionReference: {
        length: 1000,
        name: 'decision_reference',
        nullable: true,
        type: 'nvarchar',
      },
      reviewedAt: {
        name: 'reviewed_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      reviewDueAt: {
        name: 'review_due_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      revisionToken: {
        default: () => 'NEWID()',
        name: 'revision_token',
        type: 'uniqueidentifier',
      },
    },
    relations: {
      connection: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_connection_attestations_ai_connection_id',
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
    uniques: [
      {
        columns: ['connection', 'revisionNumber'],
        name: 'uq_ai_connection_attestations_connection_revision',
      },
    ],
    indices: [
      {
        columns: ['connection'],
        name: 'uq_ai_connection_attestations_valid_connection',
        unique: true,
        where: "[status] = N'valid'",
      },
      {
        columns: ['reviewDueAt'],
        name: 'idx_ai_connection_attestations_review_due_at',
      },
    ],
    checks: [
      {
        expression: '[revision_number] >= 1',
        name: 'chk_ai_connection_attestations_revision_number',
      },
      {
        expression:
          "[status] IN (N'draft', N'valid', N'superseded', N'expired', N'revoked')",
        name: 'chk_ai_connection_attestations_status',
      },
      {
        expression:
          '[subprocessors_json] IS NULL OR ISJSON([subprocessors_json]) = 1',
        name: 'chk_ai_connection_attestations_subprocessors_json',
      },
      {
        expression:
          '[processing_regions_json] IS NULL OR ISJSON([processing_regions_json]) = 1',
        name: 'chk_ai_connection_attestations_processing_regions_json',
      },
      {
        expression:
          '[maximum_retention_days] IS NULL OR [maximum_retention_days] >= 0',
        name: 'chk_ai_connection_attestations_retention',
      },
      {
        expression:
          "[status] <> N'valid' OR ([responsible_organization_unit_reference] IS NOT NULL AND [purpose] IS NOT NULL AND [maximum_information_class] IS NOT NULL AND [is_personal_data_processed] IS NOT NULL AND [provider_name] IS NOT NULL AND [subprocessors_json] IS NOT NULL AND [processing_regions_json] IS NOT NULL AND [is_training_allowed] IS NOT NULL AND [maximum_retention_days] IS NOT NULL AND [incident_response_reference] IS NOT NULL AND [decision_reference] IS NOT NULL AND [reviewed_at] IS NOT NULL)",
        name: 'chk_ai_connection_attestations_valid_fields',
      },
    ],
  })
