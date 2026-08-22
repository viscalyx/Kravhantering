import { EntitySchema } from 'typeorm'
import type { AiConnectionModelRevisionEntity } from './ai-connection-model-revision'

export type AiRunProfileKey =
  | 'generation_with_images'
  | 'generation_without_images'
  | 'invalid_json_repair'

export type AiRunProfileOperationalStatus = 'enabled' | 'suspended'

export interface AiRunProfileEntity {
  configurationVersion: number
  createdAt: Date
  id: string
  inactivityTimeBudgetSeconds: number
  maximumBufferedEvents: number
  maximumOutputBytes: number
  maximumOutputTokens: number
  maximumRetainedMemoryBytes: number
  modelRevision: AiConnectionModelRevisionEntity | null
  operationalStatus: AiRunProfileOperationalStatus
  profileKey: AiRunProfileKey
  queueCapacity: number
  revisionToken: string
  totalTimeBudgetSeconds: number
  updatedAt: Date
}

export const aiRunProfileEntity = new EntitySchema<AiRunProfileEntity>({
  name: 'AiRunProfile',
  tableName: 'ai_run_profiles',
  columns: {
    id: {
      default: () => 'NEWID()',
      name: 'id',
      primary: true,
      type: 'uniqueidentifier',
    },
    profileKey: { length: 80, name: 'profile_key', type: 'nvarchar' },
    operationalStatus: {
      length: 24,
      name: 'operational_status',
      type: 'nvarchar',
    },
    configurationVersion: {
      default: 1,
      name: 'configuration_version',
      type: 'int',
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
    maximumOutputTokens: {
      default: 8192,
      name: 'maximum_output_tokens',
      type: 'int',
    },
    maximumOutputBytes: {
      default: 4194304,
      name: 'maximum_output_bytes',
      type: 'int',
    },
    maximumRetainedMemoryBytes: {
      default: 8388608,
      name: 'maximum_retained_memory_bytes',
      type: 'int',
    },
    maximumBufferedEvents: {
      default: 32,
      name: 'maximum_buffered_events',
      type: 'int',
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
    modelRevision: {
      joinColumn: {
        foreignKeyConstraintName:
          'fk_ai_run_profiles_ai_connection_model_revision_id',
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
  indices: [
    {
      columns: ['profileKey'],
      name: 'uq_ai_run_profiles_profile_key',
      unique: true,
    },
    {
      columns: ['modelRevision'],
      name: 'idx_ai_run_profiles_ai_connection_model_revision_id',
    },
  ],
  checks: [
    {
      expression:
        "[profile_key] IN (N'generation_without_images', N'generation_with_images', N'invalid_json_repair')",
      name: 'chk_ai_run_profiles_profile_key',
    },
    {
      expression: "[operational_status] IN (N'enabled', N'suspended')",
      name: 'chk_ai_run_profiles_operational_status',
    },
    {
      expression:
        "[ai_connection_model_revision_id] IS NOT NULL OR [operational_status] = N'enabled'",
      name: 'chk_ai_run_profiles_unconfigured_enabled',
    },
    {
      expression: '[configuration_version] >= 1',
      name: 'chk_ai_run_profiles_configuration_version',
    },
    {
      expression: '[total_time_budget_seconds] BETWEEN 300 AND 3600',
      name: 'chk_ai_run_profiles_total_time_budget_seconds',
    },
    {
      expression:
        '[inactivity_time_budget_seconds] BETWEEN 300 AND [total_time_budget_seconds]',
      name: 'chk_ai_run_profiles_inactivity_time_budget_seconds',
    },
    {
      expression: '[queue_capacity] BETWEEN 0 AND 100',
      name: 'chk_ai_run_profiles_queue_capacity',
    },
    {
      expression: '[maximum_output_tokens] BETWEEN 1 AND 1000000',
      name: 'chk_ai_run_profiles_maximum_output_tokens',
    },
    {
      expression: '[maximum_output_bytes] BETWEEN 1 AND 67108864',
      name: 'chk_ai_run_profiles_maximum_output_bytes',
    },
    {
      expression: '[maximum_retained_memory_bytes] BETWEEN 1 AND 134217728',
      name: 'chk_ai_run_profiles_maximum_retained_memory_bytes',
    },
    {
      expression: '[maximum_buffered_events] BETWEEN 1 AND 1024',
      name: 'chk_ai_run_profiles_maximum_buffered_events',
    },
  ],
})
