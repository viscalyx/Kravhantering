import { EntitySchema } from 'typeorm'
import type { AccessReviewRunEntity } from '@/lib/typeorm/entities/access-review-run'

export type AccessReviewDecision =
  | 'approved'
  | 'changed'
  | 'not_applicable'
  | 'pending'
  | 'revoke_required'

export interface AccessReviewItemEntity {
  canGenerateAi: boolean
  comment: string | null
  createdAt: Date
  decidedAt: Date | null
  decidedByDisplayName: string | null
  decidedByHsaId: string | null
  decision: AccessReviewDecision
  id: number
  permissionType: string
  principalDisplayName: string
  principalHsaId: string | null
  run: AccessReviewRunEntity
  runId: number
  scopeKey: string
  scopeLabel: string
  scopeType: string
  sourceKey: string
  sourceTable: string
}

export const accessReviewItemEntity = new EntitySchema<AccessReviewItemEntity>({
  name: 'AccessReviewItem',
  tableName: 'access_review_items',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'int',
    },
    runId: {
      name: 'run_id',
      type: 'int',
    },
    sourceKey: {
      length: 120,
      name: 'source_key',
      type: 'nvarchar',
    },
    sourceTable: {
      length: 120,
      name: 'source_table',
      type: 'nvarchar',
    },
    principalHsaId: {
      length: 64,
      name: 'principal_hsa_id',
      nullable: true,
      type: 'nvarchar',
    },
    principalDisplayName: {
      length: 'MAX',
      name: 'principal_display_name',
      type: 'nvarchar',
    },
    scopeType: {
      length: 64,
      name: 'scope_type',
      type: 'nvarchar',
    },
    scopeKey: {
      length: 120,
      name: 'scope_key',
      type: 'nvarchar',
    },
    scopeLabel: {
      length: 'MAX',
      name: 'scope_label',
      type: 'nvarchar',
    },
    permissionType: {
      length: 64,
      name: 'permission_type',
      type: 'nvarchar',
    },
    canGenerateAi: {
      default: false,
      name: 'can_generate_ai',
      type: 'bit',
    },
    decision: {
      default: 'pending',
      length: 32,
      name: 'decision',
      type: 'nvarchar',
    },
    decidedAt: {
      name: 'decided_at',
      nullable: true,
      type: 'datetime2',
    },
    decidedByHsaId: {
      length: 64,
      name: 'decided_by_hsa_id',
      nullable: true,
      type: 'nvarchar',
    },
    decidedByDisplayName: {
      length: 'MAX',
      name: 'decided_by_display_name',
      nullable: true,
      type: 'nvarchar',
    },
    comment: {
      length: 'MAX',
      name: 'comment',
      nullable: true,
      type: 'nvarchar',
    },
    createdAt: { name: 'created_at', type: 'datetime2' },
  },
  indices: [
    {
      columns: ['runId', 'decision'],
      name: 'idx_access_review_items_run_id_decision',
    },
    {
      columns: ['principalHsaId'],
      name: 'idx_access_review_items_principal_hsa_id',
    },
    {
      columns: ['sourceKey'],
      name: 'idx_access_review_items_source_key',
    },
    {
      columns: ['decidedByHsaId'],
      name: 'idx_access_review_items_decided_by_hsa_id',
    },
  ],
  relations: {
    run: {
      joinColumn: {
        foreignKeyConstraintName: 'fk_access_review_items_run_id',
        name: 'run_id',
        referencedColumnName: 'id',
      },
      nullable: false,
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      target: 'AccessReviewRun',
      type: 'many-to-one',
    },
  },
})
