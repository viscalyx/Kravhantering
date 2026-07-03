import { EntitySchema } from 'typeorm'

export interface AiSafetyRuleEntity {
  category: string
  createdAt: Date
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  patternKind: string
  ruleId: string
  sortOrder: number
  updatedAt: Date
  windowChars: number | null
}

export const aiSafetyRuleEntity = new EntitySchema<AiSafetyRuleEntity>({
  name: 'AiSafetyRule',
  tableName: 'ai_safety_rules',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'int',
    },
    ruleId: {
      length: 64,
      name: 'rule_id',
      type: 'nvarchar',
      unique: true,
    },
    category: { length: 64, name: 'category', type: 'nvarchar' },
    nameSv: { length: 255, name: 'name_sv', type: 'nvarchar' },
    nameEn: { length: 255, name: 'name_en', type: 'nvarchar' },
    descriptionSv: {
      length: 'MAX',
      name: 'description_sv',
      nullable: true,
      type: 'nvarchar',
    },
    descriptionEn: {
      length: 'MAX',
      name: 'description_en',
      nullable: true,
      type: 'nvarchar',
    },
    patternKind: { length: 64, name: 'pattern_kind', type: 'nvarchar' },
    windowChars: { name: 'window_chars', nullable: true, type: 'int' },
    sortOrder: { name: 'sort_order', type: 'int' },
    createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
    updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
  },
  checks: [
    {
      expression:
        "[pattern_kind] IN (N'paired_terms', N'bidirectional_pair', N'direct_markers')",
      name: 'chk_ai_safety_rules_pattern_kind',
    },
  ],
})
