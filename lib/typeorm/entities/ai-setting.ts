import { EntitySchema } from 'typeorm'

export interface AiSettingEntity {
  aiSafetyForensicLoggingEnabled: boolean
  aiSafetyRuleCacheTtlSeconds: number
  createdAt: Date
  id: number
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
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
    aiSafetyForensicLoggingEnabled: {
      default: true,
      name: 'ai_safety_forensic_logging_enabled',
      type: 'bit',
    },
    mcpMaxRequestBytes: {
      default: 10485760,
      name: 'mcp_max_request_bytes',
      type: 'int',
    },
    mcpImportMaxRows: {
      default: 500,
      name: 'mcp_import_max_rows',
      type: 'int',
    },
    mcpImportValidationTtlMinutes: {
      default: 60,
      name: 'mcp_import_validation_ttl_minutes',
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
        '[mcp_max_request_bytes] >= 1048576 AND [mcp_max_request_bytes] <= 10485760 AND [mcp_max_request_bytes] % 1048576 = 0',
      name: 'chk_ai_settings_mcp_max_request_bytes',
    },
    {
      expression:
        '[mcp_import_max_rows] >= 1 AND [mcp_import_max_rows] <= 5000',
      name: 'chk_ai_settings_mcp_import_max_rows',
    },
    {
      expression:
        '[mcp_import_validation_ttl_minutes] >= 1 AND [mcp_import_validation_ttl_minutes] <= 1440',
      name: 'chk_ai_settings_mcp_import_validation_ttl_minutes',
    },
    {
      expression:
        '[ai_safety_rule_cache_ttl_seconds] >= 30 AND [ai_safety_rule_cache_ttl_seconds] <= 3600',
      name: 'chk_ai_settings_ai_safety_rule_cache_ttl_seconds',
    },
  ],
})
