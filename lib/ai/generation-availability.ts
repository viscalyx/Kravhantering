export interface AiRequirementGenerationAvailability {
  aiSafetyForensicLoggingEnabled: boolean
  aiSafetyRuleCacheTtlSeconds: number
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  requirementGenerationEnabled: boolean
}

export const MCP_REQUEST_PAYLOAD_DEFAULT_BYTES = 10 * 1024 * 1024
export const MCP_REQUEST_PAYLOAD_STEP_BYTES = 1024 * 1024
export const MCP_REQUEST_PAYLOAD_MIN_BYTES = 1024 * 1024
export const MCP_REQUEST_PAYLOAD_MAX_BYTES = 10 * 1024 * 1024
export const AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS = 600
export const AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS = 30
export const AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS = 3600
export const MCP_IMPORT_MAX_ROWS_DEFAULT = 500
export const MCP_IMPORT_MAX_ROWS_MIN = 1
export const MCP_IMPORT_MAX_ROWS_MAX = 5000
export const MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES = 60
export const MCP_IMPORT_VALIDATION_TTL_MIN_MINUTES = 1
export const MCP_IMPORT_VALIDATION_TTL_MAX_MINUTES = 1440
export const MCP_REQUEST_PAYLOAD_STEP_KIB =
  MCP_REQUEST_PAYLOAD_STEP_BYTES / 1024

export interface NumericSettingConstraint {
  max: number
  min: number
  step: number
  unit: 'bytes' | 'minutes' | 'rows' | 'seconds'
}

export const ADMIN_AI_SETTINGS_CONSTRAINTS = Object.freeze({
  aiSafetyRuleCacheTtlSeconds: {
    max: AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS,
    min: AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS,
    step: 1,
    unit: 'seconds',
  },
  mcpImportMaxRows: {
    max: MCP_IMPORT_MAX_ROWS_MAX,
    min: MCP_IMPORT_MAX_ROWS_MIN,
    step: 1,
    unit: 'rows',
  },
  mcpImportValidationTtlMinutes: {
    max: MCP_IMPORT_VALIDATION_TTL_MAX_MINUTES,
    min: MCP_IMPORT_VALIDATION_TTL_MIN_MINUTES,
    step: 1,
    unit: 'minutes',
  },
  mcpMaxRequestBytes: {
    max: MCP_REQUEST_PAYLOAD_MAX_BYTES,
    min: MCP_REQUEST_PAYLOAD_MIN_BYTES,
    step: MCP_REQUEST_PAYLOAD_STEP_BYTES,
    unit: 'bytes',
  },
} satisfies Record<string, NumericSettingConstraint>)

export interface AdminAiSettings extends AiRequirementGenerationAvailability {
  constraints: typeof ADMIN_AI_SETTINGS_CONSTRAINTS
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
  mcpMaxRequestBytes: number
}

export const DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY: AiRequirementGenerationAvailability =
  Object.freeze({
    aiSafetyForensicLoggingEnabled: true,
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    disabledByEnvironment: false,
    effectiveRequirementGenerationEnabled: true,
    requirementGenerationEnabled: true,
  })

export const DEFAULT_ADMIN_AI_SETTINGS: AdminAiSettings = Object.freeze({
  ...DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
  constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
  mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
  mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
})

export function getMcpRequestPayloadBytesForStep(step: number): number {
  return step * MCP_REQUEST_PAYLOAD_STEP_BYTES
}

export function getMcpRequestPayloadKiBForBytes(bytes: number): number {
  return bytes / 1024
}

export function getMcpRequestPayloadStepForBytes(value: number): number {
  return Math.round(value / MCP_REQUEST_PAYLOAD_STEP_BYTES)
}

function clampMcpRequestPayloadStep(step: number): number {
  return Math.min(
    getMcpRequestPayloadStepForBytes(MCP_REQUEST_PAYLOAD_MAX_BYTES),
    Math.max(
      getMcpRequestPayloadStepForBytes(MCP_REQUEST_PAYLOAD_MIN_BYTES),
      step,
    ),
  )
}

export function isValidMcpMaxRequestBytes(value: number): boolean {
  const step = getMcpRequestPayloadStepForBytes(value)
  return (
    Number.isInteger(value) &&
    Number.isInteger(step) &&
    value >= MCP_REQUEST_PAYLOAD_MIN_BYTES &&
    value <= MCP_REQUEST_PAYLOAD_MAX_BYTES &&
    getMcpRequestPayloadBytesForStep(step) === value
  )
}

export function isValidMcpImportMaxRows(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MCP_IMPORT_MAX_ROWS_MIN &&
    value <= MCP_IMPORT_MAX_ROWS_MAX
  )
}

export function isValidMcpImportValidationTtlMinutes(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MCP_IMPORT_VALIDATION_TTL_MIN_MINUTES &&
    value <= MCP_IMPORT_VALIDATION_TTL_MAX_MINUTES
  )
}

export function isValidAiSafetyRuleCacheTtlSeconds(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS &&
    value <= AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS
  )
}

export function coerceAiSafetyRuleCacheTtlSeconds(value: number): number {
  const rounded = Math.round(value)
  return Math.min(
    AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS,
    Math.max(AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS, rounded),
  )
}

export function coerceMcpImportMaxRows(value: number): number {
  const rounded = Math.round(value)
  return Math.min(
    MCP_IMPORT_MAX_ROWS_MAX,
    Math.max(MCP_IMPORT_MAX_ROWS_MIN, rounded),
  )
}

export function coerceMcpImportValidationTtlMinutes(value: number): number {
  const rounded = Math.round(value)
  return Math.min(
    MCP_IMPORT_VALIDATION_TTL_MAX_MINUTES,
    Math.max(MCP_IMPORT_VALIDATION_TTL_MIN_MINUTES, rounded),
  )
}

export function coerceMcpMaxRequestBytes(value: number): number {
  const bounded = Math.min(
    MCP_REQUEST_PAYLOAD_MAX_BYTES,
    Math.max(MCP_REQUEST_PAYLOAD_MIN_BYTES, Math.round(value)),
  )
  return getMcpRequestPayloadBytesForStep(
    clampMcpRequestPayloadStep(getMcpRequestPayloadStepForBytes(bounded)),
  )
}

export function addMcpMaxRequestBytesSteps(
  value: number,
  stepDelta: number,
): number {
  return getMcpRequestPayloadBytesForStep(
    clampMcpRequestPayloadStep(
      getMcpRequestPayloadStepForBytes(value) + Math.trunc(stepDelta),
    ),
  )
}

export function formatMcpRequestPayloadKiB(bytes: number): string {
  const kib = bytes / 1024
  return Number.isInteger(kib) ? String(kib) : kib.toFixed(1)
}
