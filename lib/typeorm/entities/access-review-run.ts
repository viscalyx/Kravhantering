import { EntitySchema } from 'typeorm'

export type AccessReviewRunStatus =
  | 'cancelled'
  | 'completed'
  | 'draft'
  | 'in_review'

export interface AccessReviewRunEntity {
  completedAt: Date | null
  completedByDisplayName: string | null
  completedByHsaId: string | null
  createdAt: Date
  createdByDisplayName: string
  createdByHsaId: string | null
  dueAt: Date
  externalEvidenceReference: string | null
  id: number
  periodEnd: Date
  periodStart: Date
  reviewerDisplayName: string
  reviewerHsaId: string | null
  status: AccessReviewRunStatus
  updatedAt: Date
}

export const accessReviewRunEntity = new EntitySchema<AccessReviewRunEntity>({
  name: 'AccessReviewRun',
  tableName: 'access_review_runs',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'int',
    },
    status: {
      default: 'in_review',
      length: 32,
      name: 'status',
      type: 'nvarchar',
    },
    periodStart: { name: 'period_start', precision: 3, type: 'datetime2' },
    periodEnd: { name: 'period_end', precision: 3, type: 'datetime2' },
    dueAt: { name: 'due_at', precision: 3, type: 'datetime2' },
    createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
    updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
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
    reviewerHsaId: {
      length: 64,
      name: 'reviewer_hsa_id',
      nullable: true,
      type: 'nvarchar',
    },
    reviewerDisplayName: {
      length: 'MAX',
      name: 'reviewer_display_name',
      type: 'nvarchar',
    },
    externalEvidenceReference: {
      length: 450,
      name: 'external_evidence_reference',
      nullable: true,
      type: 'nvarchar',
    },
    completedAt: {
      name: 'completed_at',
      nullable: true,
      precision: 3,
      type: 'datetime2',
    },
    completedByHsaId: {
      length: 64,
      name: 'completed_by_hsa_id',
      nullable: true,
      type: 'nvarchar',
    },
    completedByDisplayName: {
      length: 'MAX',
      name: 'completed_by_display_name',
      nullable: true,
      type: 'nvarchar',
    },
  },
  indices: [
    {
      columns: ['status'],
      name: 'idx_access_review_runs_status',
    },
    {
      columns: ['dueAt'],
      name: 'idx_access_review_runs_due_at',
    },
    {
      columns: ['reviewerHsaId'],
      name: 'idx_access_review_runs_reviewer_hsa_id',
    },
  ],
  checks: [
    {
      expression: '[period_start] <= [period_end]',
      name: 'chk_access_review_runs_period_order',
    },
  ],
})
