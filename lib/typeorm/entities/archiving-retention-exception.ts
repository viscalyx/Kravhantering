import { EntitySchema } from 'typeorm'
import type { ArchivingRetentionPolicyEntity } from '@/lib/typeorm/entities/archiving-retention-policy'

export interface ArchivingRetentionExceptionEntity {
  createdAt: Date
  createdByDisplayName: string
  createdByHsaId: string | null
  expiresAt: Date | null
  id: number
  policy: ArchivingRetentionPolicyEntity
  reason: string
  sourceKey: string
  subjectId: string
  subjectTable: string
}

export const archivingRetentionExceptionEntity =
  new EntitySchema<ArchivingRetentionExceptionEntity>({
    name: 'ArchivingRetentionException',
    tableName: 'archiving_retention_exceptions',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      sourceKey: { length: 120, name: 'source_key', type: 'nvarchar' },
      subjectTable: { length: 120, name: 'subject_table', type: 'nvarchar' },
      subjectId: { length: 120, name: 'subject_id', type: 'nvarchar' },
      reason: { length: 'MAX', name: 'reason', type: 'nvarchar' },
      createdByHsaId: {
        length: 64,
        name: 'created_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      createdByDisplayName: {
        length: 'MAX',
        name: 'created_by_display_name',
        type: 'nvarchar',
      },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      expiresAt: {
        name: 'expires_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
    },
    indices: [
      {
        columns: ['policy', 'sourceKey'],
        name: 'idx_archiving_retention_exceptions_policy_source',
      },
    ],
    relations: {
      policy: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_archiving_retention_exceptions_policy_id',
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
    uniques: [
      {
        columns: ['policy', 'sourceKey', 'subjectTable', 'subjectId'],
        name: 'uq_archiving_retention_exceptions_subject',
      },
    ],
  })
