import { EntitySchema } from 'typeorm'

export interface AiSafetyRuleTermEntity {
  createdAt: Date
  direction: string
  id: number
  isActive: boolean
  isStandard: boolean
  normalizedTerm: string
  rule?: unknown
  ruleId: number
  sortOrder: number
  standardDirection: string
  termText: string
  termType: string
  updatedAt: Date
}

export const aiSafetyRuleTermEntity = new EntitySchema<AiSafetyRuleTermEntity>({
  name: 'AiSafetyRuleTerm',
  tableName: 'ai_safety_rule_terms',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'int',
    },
    ruleId: { name: 'rule_id', type: 'int' },
    termType: { length: 64, name: 'term_type', type: 'nvarchar' },
    termText: { length: 255, name: 'term_text', type: 'nvarchar' },
    normalizedTerm: {
      length: 255,
      name: 'normalized_term',
      type: 'nvarchar',
    },
    direction: { length: 32, name: 'direction', type: 'nvarchar' },
    standardDirection: {
      length: 32,
      name: 'standard_direction',
      type: 'nvarchar',
    },
    isStandard: {
      default: false,
      name: 'is_standard',
      type: 'bit',
    },
    isActive: {
      default: true,
      name: 'is_active',
      type: 'bit',
    },
    sortOrder: {
      default: 0,
      name: 'sort_order',
      type: 'int',
    },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  checks: [
    {
      expression:
        "[term_type] IN (N'action', N'target', N'direct_marker', N'coding')",
      name: 'chk_ai_safety_rule_terms_term_type',
    },
    {
      expression: "[direction] IN (N'input', N'output', N'input_output')",
      name: 'chk_ai_safety_rule_terms_direction',
    },
    {
      expression:
        "[standard_direction] IN (N'input', N'output', N'input_output')",
      name: 'chk_ai_safety_rule_terms_standard_direction',
    },
    {
      expression: 'LEN([normalized_term]) > 0',
      name: 'chk_ai_safety_rule_terms_normalized_not_empty',
    },
  ],
  indices: [
    {
      columns: ['ruleId'],
      name: 'idx_ai_safety_rule_terms_rule_id',
    },
    {
      columns: ['ruleId', 'termType', 'normalizedTerm'],
      name: 'uq_ai_safety_rule_terms_rule_type_normalized',
      unique: true,
    },
  ],
  relations: {
    rule: {
      joinColumn: {
        foreignKeyConstraintName: 'fk_ai_safety_rule_terms_rule_id',
        name: 'rule_id',
        referencedColumnName: 'id',
      },
      onDelete: 'CASCADE',
      target: 'AiSafetyRule',
      type: 'many-to-one',
    },
  },
})
