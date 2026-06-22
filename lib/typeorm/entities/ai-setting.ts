import { EntitySchema } from 'typeorm'

export interface AiSettingEntity {
  createdAt: Date
  id: number
  requirementGenerationEnabled: boolean
  updatedAt: Date
}

export const aiSettingEntity = new EntitySchema<AiSettingEntity>({
  name: 'AiSetting',
  tableName: 'ai_settings',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'int',
    },
    requirementGenerationEnabled: {
      default: true,
      name: 'requirement_generation_enabled',
      type: 'bit',
    },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
})
