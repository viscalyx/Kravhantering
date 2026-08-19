import { EntitySchema } from 'typeorm'

export type AiRunProfileKey =
  | 'generation_with_images'
  | 'generation_without_images'
  | 'invalid_json_repair'

export type AiRunProfileOperationalStatus = 'enabled' | 'suspended'

export interface AiRunProfileEntity {
  createdAt: Date
  id: string
  operationalStatus: AiRunProfileOperationalStatus
  profileKey: AiRunProfileKey
  revisionToken: string
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
    createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
    updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
    revisionToken: {
      default: () => 'NEWID()',
      name: 'revision_token',
      type: 'uniqueidentifier',
    },
  },
  indices: [
    {
      columns: ['profileKey'],
      name: 'uq_ai_run_profiles_profile_key',
      unique: true,
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
  ],
})
