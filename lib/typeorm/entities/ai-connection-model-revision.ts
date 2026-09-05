import { EntitySchema } from 'typeorm'
import type { AiConnectionModelEntity } from './ai-connection-model'

export type AiConnectionModelRevisionStatus =
  | 'ended'
  | 'new_revision_required'
  | 'verified'

export interface AiConnectionModelRevisionEntity {
  agentRuntimeVersion: string | null
  connectionConfigurationVersion: number
  createdAt: Date
  declaredCapabilitiesJson: string
  discoveredCapabilitiesJson: string | null
  endedAt: Date | null
  externalModelId: string
  externalModelVersion: string | null
  id: string
  maximumConcurrency: number | null
  model: AiConnectionModelEntity
  reasoningJson: string | null
  revisionNumber: number
  revisionToken: string
  status: AiConnectionModelRevisionStatus
  updatedAt: Date
  verifiedAt: Date | null
  verifiedCapabilitiesJson: string | null
}

export const aiConnectionModelRevisionEntity =
  new EntitySchema<AiConnectionModelRevisionEntity>({
    name: 'AiConnectionModelRevision',
    tableName: 'ai_connection_model_revisions',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      revisionNumber: { name: 'revision_number', type: 'int' },
      connectionConfigurationVersion: {
        name: 'connection_configuration_version',
        type: 'int',
      },
      status: { length: 40, name: 'status', type: 'nvarchar' },
      externalModelId: {
        length: 450,
        name: 'external_model_id',
        type: 'nvarchar',
      },
      externalModelVersion: {
        length: 200,
        name: 'external_model_version',
        nullable: true,
        type: 'nvarchar',
      },
      maximumConcurrency: {
        name: 'maximum_concurrency',
        nullable: true,
        type: 'int',
      },
      agentRuntimeVersion: {
        length: 100,
        name: 'agent_runtime_version',
        nullable: true,
        type: 'nvarchar',
      },
      reasoningJson: {
        name: 'reasoning_json',
        type: 'nvarchar',
        length: 200,
        nullable: true,
      },
      declaredCapabilitiesJson: {
        length: 'MAX',
        name: 'declared_capabilities_json',
        type: 'nvarchar',
      },
      discoveredCapabilitiesJson: {
        length: 'MAX',
        name: 'discovered_capabilities_json',
        nullable: true,
        type: 'nvarchar',
      },
      verifiedCapabilitiesJson: {
        length: 'MAX',
        name: 'verified_capabilities_json',
        nullable: true,
        type: 'nvarchar',
      },
      verifiedAt: {
        name: 'verified_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      endedAt: {
        name: 'ended_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
      revisionToken: {
        default: () => 'NEWID()',
        name: 'revision_token',
        type: 'uniqueidentifier',
      },
    },
    relations: {
      model: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_connection_model_revisions_ai_connection_model_id',
          name: 'ai_connection_model_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnectionModel',
        type: 'many-to-one',
      },
    },
    uniques: [
      {
        columns: ['model', 'revisionNumber'],
        name: 'uq_ai_connection_model_revisions_model_revision',
      },
    ],
    indices: [
      {
        columns: ['status'],
        name: 'idx_ai_connection_model_revisions_status',
      },
    ],
    checks: [
      {
        name: 'chk_ai_connection_model_revisions_reasoning_json',
        expression: '[reasoning_json] IS NULL OR ISJSON([reasoning_json]) = 1',
      },
      {
        expression:
          '[maximum_concurrency] IS NULL OR [maximum_concurrency] BETWEEN 1 AND 100',
        name: 'chk_ai_connection_model_revisions_maximum_concurrency',
      },
      {
        expression: '[revision_number] >= 1',
        name: 'chk_ai_connection_model_revisions_revision_number',
      },
      {
        expression: '[connection_configuration_version] >= 1',
        name: 'chk_ai_connection_model_revisions_configuration_version',
      },
      {
        expression:
          "[status] IN (N'verified', N'new_revision_required', N'ended')",
        name: 'chk_ai_connection_model_revisions_status',
      },
      {
        expression: 'ISJSON([declared_capabilities_json]) = 1',
        name: 'chk_ai_connection_model_revisions_declared_capabilities_json',
      },
      {
        expression:
          '[discovered_capabilities_json] IS NULL OR ISJSON([discovered_capabilities_json]) = 1',
        name: 'chk_ai_connection_model_revisions_discovered_capabilities_json',
      },
      {
        expression:
          '[verified_capabilities_json] IS NULL OR ISJSON([verified_capabilities_json]) = 1',
        name: 'chk_ai_connection_model_revisions_verified_capabilities_json',
      },
      {
        expression:
          "[status] <> N'verified' OR ([verified_capabilities_json] IS NOT NULL AND [verified_at] IS NOT NULL)",
        name: 'chk_ai_connection_model_revisions_verified_fields',
      },
      {
        expression:
          "([status] = N'ended' AND [ended_at] IS NOT NULL) OR ([status] <> N'ended' AND [ended_at] IS NULL)",
        name: 'chk_ai_connection_model_revisions_ended_at',
      },
    ],
  })
