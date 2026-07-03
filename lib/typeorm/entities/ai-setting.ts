import { EntitySchema } from 'typeorm'

export interface AiSettingEntity {
  aiSafetyRuleCacheTtlSeconds: number
  createdAt: Date
  id: number
  mcpMaxRequestBytes: number
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
    mcpMaxRequestBytes: {
      default: 1048576,
      name: 'mcp_max_request_bytes',
      type: 'int',
    },
    aiSafetyRuleCacheTtlSeconds: {
      default: 600,
      name: 'ai_safety_rule_cache_ttl_seconds',
      type: 'int',
    },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  checks: [
    {
      expression:
        '[mcp_max_request_bytes] >= 104858 AND [mcp_max_request_bytes] <= 5242880 AND [mcp_max_request_bytes] = ((1048576 * ((([mcp_max_request_bytes] * 10) + 524288) / 1048576)) + 5) / 10',
      name: 'chk_ai_settings_mcp_max_request_bytes',
    },
    {
      expression:
        '[ai_safety_rule_cache_ttl_seconds] >= 30 AND [ai_safety_rule_cache_ttl_seconds] <= 3600',
      name: 'chk_ai_settings_ai_safety_rule_cache_ttl_seconds',
    },
  ],
})
