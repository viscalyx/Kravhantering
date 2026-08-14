import { EntitySchema } from 'typeorm'
import { safeBigIntNumberTransformer } from '@/lib/typeorm/value-mappers'

export interface AiSettingEntity {
  aiSafetyForensicLoggingEnabled: boolean
  aiSafetyRuleCacheTtlSeconds: number
  createdAt: Date
  id: number
  mcpImportMaxActiveSessionsPerDestination: number
  mcpImportMaxActiveSessionsPerPrincipal: number
  mcpImportMaxCreationsPerWindow: number
  mcpImportMaxReservedBytes: number
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
      default: false,
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
    mcpImportMaxActiveSessionsPerPrincipal: {
      default: 10,
      name: 'mcp_import_max_active_sessions_per_principal',
      type: 'int',
    },
    mcpImportMaxActiveSessionsPerDestination: {
      default: 100,
      name: 'mcp_import_max_active_sessions_per_destination',
      type: 'int',
    },
    mcpImportMaxCreationsPerWindow: {
      default: 20,
      name: 'mcp_import_max_creations_per_window',
      type: 'int',
    },
    mcpImportMaxReservedBytes: {
      default: 536870912,
      name: 'mcp_import_max_reserved_bytes',
      transformer: safeBigIntNumberTransformer,
      type: 'bigint',
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
      expression: '[mcp_import_max_rows] >= 1 AND [mcp_import_max_rows] <= 500',
      name: 'chk_ai_settings_mcp_import_max_rows',
    },
    {
      expression:
        '[mcp_import_max_active_sessions_per_principal] >= 1 AND [mcp_import_max_active_sessions_per_principal] <= 100',
      name: 'chk_ai_settings_mcp_import_max_active_sessions_per_principal',
    },
    {
      expression:
        '[mcp_import_max_active_sessions_per_destination] >= 1 AND [mcp_import_max_active_sessions_per_destination] <= 1000',
      name: 'chk_ai_settings_mcp_import_max_active_sessions_per_destination',
    },
    {
      expression:
        '[mcp_import_max_creations_per_window] >= 1 AND [mcp_import_max_creations_per_window] <= 200',
      name: 'chk_ai_settings_mcp_import_max_creations_per_window',
    },
    {
      expression:
        '[mcp_import_max_reserved_bytes] >= 67108864 AND [mcp_import_max_reserved_bytes] <= 8589934592 AND [mcp_import_max_reserved_bytes] % 67108864 = 0',
      name: 'chk_ai_settings_mcp_import_max_reserved_bytes',
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
