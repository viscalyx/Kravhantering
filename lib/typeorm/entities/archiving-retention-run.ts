import { EntitySchema } from 'typeorm'
import type { ArchivingRetentionPolicyEntity } from '@/lib/typeorm/entities/archiving-retention-policy'

export type ArchivingRetentionRunStatus = 'completed'

export interface ArchivingRetentionRunEntity {
  archivedCount: number
  candidateCount: number
  completedAt: Date
  deletedCount: number
  exceptionCount: number
  executedByDisplayName: string
  executedByHsaId: string | null
  id: number
  policy: ArchivingRetentionPolicyEntity
  previewToken: string
  skippedCount: number
  startedAt: Date
  status: ArchivingRetentionRunStatus
}

export const archivingRetentionRunEntity =
  new EntitySchema<ArchivingRetentionRunEntity>({
    name: 'ArchivingRetentionRun',
    tableName: 'archiving_retention_runs',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      status: {
        default: 'completed',
        length: 32,
        name: 'status',
        type: 'nvarchar',
      },
      startedAt: { name: 'started_at', precision: 3, type: 'datetime2' },
      completedAt: { name: 'completed_at', precision: 3, type: 'datetime2' },
      executedByHsaId: {
        length: 64,
        name: 'executed_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      executedByDisplayName: {
        length: 'MAX',
        name: 'executed_by_display_name',
        type: 'nvarchar',
      },
      previewToken: { length: 128, name: 'preview_token', type: 'nvarchar' },
      candidateCount: { default: 0, name: 'candidate_count', type: 'int' },
      archivedCount: { default: 0, name: 'archived_count', type: 'int' },
      deletedCount: { default: 0, name: 'deleted_count', type: 'int' },
      skippedCount: { default: 0, name: 'skipped_count', type: 'int' },
      exceptionCount: { default: 0, name: 'exception_count', type: 'int' },
    },
    indices: [
      { columns: ['policy'], name: 'idx_archiving_retention_runs_policy_id' },
      {
        columns: ['startedAt'],
        name: 'idx_archiving_retention_runs_started_at',
      },
    ],
    relations: {
      policy: {
        joinColumn: {
          foreignKeyConstraintName: 'fk_archiving_retention_runs_policy_id',
          name: 'policy_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
        target: 'ArchivingRetentionPolicy',
        type: 'many-to-one',
      },
    },
  })
