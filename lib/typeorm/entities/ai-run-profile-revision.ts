import { EntitySchema } from 'typeorm'
import type { AiConnectionModelRevisionEntity } from './ai-connection-model-revision'
import type { AiRunProfileEntity } from './ai-run-profile'

export type AiRunProfileRevisionStatus = 'active' | 'draft' | 'superseded'

export interface AiRunProfileRevisionEntity {
  activatedAt: Date | null
  capabilityPolicyJson: string
  createdAt: Date
  id: string
  inactivityTimeBudgetSeconds: number
  modelRevision: AiConnectionModelRevisionEntity | null
  profile: AiRunProfileEntity
  queueCapacity: number
  revisionNumber: number
  revisionToken: string
  status: AiRunProfileRevisionStatus
  supersededAt: Date | null
  totalTimeBudgetSeconds: number
}

export const aiRunProfileRevisionEntity =
  new EntitySchema<AiRunProfileRevisionEntity>({
    name: 'AiRunProfileRevision',
    tableName: 'ai_run_profile_revisions',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      revisionNumber: { name: 'revision_number', type: 'int' },
      status: { length: 24, name: 'status', type: 'nvarchar' },
      capabilityPolicyJson: {
        length: 'MAX',
        name: 'capability_policy_json',
        type: 'nvarchar',
      },
      totalTimeBudgetSeconds: {
        default: 1200,
        name: 'total_time_budget_seconds',
        type: 'int',
      },
      inactivityTimeBudgetSeconds: {
        default: 300,
        name: 'inactivity_time_budget_seconds',
        type: 'int',
      },
      queueCapacity: { default: 10, name: 'queue_capacity', type: 'int' },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      activatedAt: {
        name: 'activated_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      supersededAt: {
        name: 'superseded_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      revisionToken: {
        default: () => 'NEWID()',
        name: 'revision_token',
        type: 'uniqueidentifier',
      },
    },
    relations: {
      profile: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_run_profile_revisions_ai_run_profile_id',
          name: 'ai_run_profile_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiRunProfile',
        type: 'many-to-one',
      },
      modelRevision: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_run_profile_revisions_ai_connection_model_revision_id',
          name: 'ai_connection_model_revision_id',
          referencedColumnName: 'id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnectionModelRevision',
        type: 'many-to-one',
      },
    },
    uniques: [
      {
        columns: ['profile', 'revisionNumber'],
        name: 'uq_ai_run_profile_revisions_profile_revision',
      },
    ],
    indices: [
      {
        columns: ['profile'],
        name: 'uq_ai_run_profile_revisions_active_profile',
        unique: true,
        where: "[status] = N'active'",
      },
      {
        columns: ['profile'],
        name: 'uq_ai_run_profile_revisions_draft_profile',
        unique: true,
        where: "[status] = N'draft'",
      },
      {
        columns: ['modelRevision'],
        name: 'idx_ai_run_profile_revisions_model_revision',
      },
    ],
    checks: [
      {
        expression: '[revision_number] >= 1',
        name: 'chk_ai_run_profile_revisions_revision_number',
      },
      {
        expression: "[status] IN (N'draft', N'active', N'superseded')",
        name: 'chk_ai_run_profile_revisions_status',
      },
      {
        expression: 'ISJSON([capability_policy_json]) = 1',
        name: 'chk_ai_run_profile_revisions_capability_policy_json',
      },
      {
        expression: '[total_time_budget_seconds] BETWEEN 300 AND 3600',
        name: 'chk_ai_run_profile_revisions_total_time_budget',
      },
      {
        expression:
          '[inactivity_time_budget_seconds] BETWEEN 300 AND [total_time_budget_seconds]',
        name: 'chk_ai_run_profile_revisions_inactivity_time_budget',
      },
      {
        expression: '[queue_capacity] BETWEEN 0 AND 100',
        name: 'chk_ai_run_profile_revisions_queue_capacity',
      },
      {
        expression:
          "[status] = N'draft' OR [ai_connection_model_revision_id] IS NOT NULL",
        name: 'chk_ai_run_profile_revisions_model_required',
      },
      {
        expression:
          "([status] = N'draft' AND [activated_at] IS NULL AND [superseded_at] IS NULL) OR ([status] = N'active' AND [activated_at] IS NOT NULL AND [superseded_at] IS NULL) OR ([status] = N'superseded' AND [activated_at] IS NOT NULL AND [superseded_at] IS NOT NULL)",
        name: 'chk_ai_run_profile_revisions_lifecycle_dates',
      },
    ],
  })
