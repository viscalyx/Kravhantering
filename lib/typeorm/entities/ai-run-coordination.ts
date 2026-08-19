import { EntitySchema } from 'typeorm'
import type { AiConnectionEntity } from './ai-connection'
import type { AiConnectionModelRevisionEntity } from './ai-connection-model-revision'
import type { AiRunProfileRevisionEntity } from './ai-run-profile-revision'

export type AiRunCoordinationStatus = 'queued' | 'retry_wait' | 'running'

export interface AiRunCoordinationEntity {
  applicationRunId: string
  attemptCount: number
  connection: AiConnectionEntity
  createdAt: Date
  id: string
  leaseExpiresAt: Date | null
  leaseOwnerId: string | null
  modelRevision: AiConnectionModelRevisionEntity
  notBefore: Date
  profileRevision: AiRunProfileRevisionEntity
  queueSequence: string
  status: AiRunCoordinationStatus
  totalDeadlineAt: Date
  updatedAt: Date
}

export const aiRunCoordinationEntity =
  new EntitySchema<AiRunCoordinationEntity>({
    name: 'AiRunCoordination',
    tableName: 'ai_run_coordination_entries',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      applicationRunId: {
        length: 100,
        name: 'application_run_id',
        type: 'nvarchar',
      },
      queueSequence: {
        generated: 'increment',
        name: 'queue_sequence',
        type: 'bigint',
      },
      status: { length: 24, name: 'status', type: 'nvarchar' },
      attemptCount: { default: 0, name: 'attempt_count', type: 'tinyint' },
      notBefore: { name: 'not_before', precision: 3, type: 'datetime2' },
      totalDeadlineAt: {
        name: 'total_deadline_at',
        precision: 3,
        type: 'datetime2',
      },
      leaseOwnerId: {
        name: 'lease_owner_id',
        nullable: true,
        type: 'uniqueidentifier',
      },
      leaseExpiresAt: {
        name: 'lease_expires_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
    },
    relations: {
      connection: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_run_coordination_entries_ai_connection_id',
          name: 'ai_connection_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnection',
        type: 'many-to-one',
      },
      modelRevision: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_run_coordination_entries_ai_connection_model_revision_id',
          name: 'ai_connection_model_revision_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnectionModelRevision',
        type: 'many-to-one',
      },
      profileRevision: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_run_coordination_entries_ai_run_profile_revision_id',
          name: 'ai_run_profile_revision_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiRunProfileRevision',
        type: 'many-to-one',
      },
    },
    uniques: [
      {
        columns: ['applicationRunId'],
        name: 'uq_ai_run_coordination_entries_application_run_id',
      },
    ],
    indices: [
      {
        columns: ['queueSequence'],
        name: 'uq_ai_run_coordination_entries_queue_sequence',
        unique: true,
      },
      {
        columns: ['connection', 'status', 'notBefore', 'queueSequence'],
        name: 'idx_ai_run_coordination_entries_fifo',
      },
      {
        columns: ['leaseExpiresAt'],
        name: 'idx_ai_run_coordination_entries_lease_expires_at',
        where: '[lease_expires_at] IS NOT NULL',
      },
    ],
    checks: [
      {
        expression: "[status] IN (N'queued', N'running', N'retry_wait')",
        name: 'chk_ai_run_coordination_entries_status',
      },
      {
        expression: '[attempt_count] BETWEEN 0 AND 2',
        name: 'chk_ai_run_coordination_entries_attempt_count',
      },
      {
        expression:
          "([status] = N'running' AND [lease_owner_id] IS NOT NULL AND [lease_expires_at] IS NOT NULL) OR ([status] <> N'running' AND [lease_owner_id] IS NULL AND [lease_expires_at] IS NULL)",
        name: 'chk_ai_run_coordination_entries_lease',
      },
      {
        expression: '[total_deadline_at] > [created_at]',
        name: 'chk_ai_run_coordination_entries_deadline',
      },
    ],
  })
