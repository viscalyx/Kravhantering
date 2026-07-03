export interface AiRequirementGenerationAvailability {
  aiSafetyRuleCacheTtlSeconds: number
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  mcpMaxRequestBytes: number
  requirementGenerationEnabled: boolean
}

export const MCP_REQUEST_PAYLOAD_DEFAULT_BYTES = 1024 * 1024
export const MCP_REQUEST_PAYLOAD_STEPS_PER_MIB = 10
export const MCP_REQUEST_PAYLOAD_MIN_STEP = 1
export const MCP_REQUEST_PAYLOAD_DEFAULT_STEP = 10
export const MCP_REQUEST_PAYLOAD_MAX_STEP = 50
export const AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS = 600
export const AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS = 30
export const AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS = 3600
export const MCP_REQUEST_PAYLOAD_STEP_KIB =
  1024 / MCP_REQUEST_PAYLOAD_STEPS_PER_MIB
export const MCP_REQUEST_PAYLOAD_MIN_BYTES = getMcpRequestPayloadBytesForStep(
  MCP_REQUEST_PAYLOAD_MIN_STEP,
)
export const MCP_REQUEST_PAYLOAD_MAX_BYTES = 5 * 1024 * 1024

export const DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY: AiRequirementGenerationAvailability =
  Object.freeze({
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    disabledByEnvironment: false,
    effectiveRequirementGenerationEnabled: true,
    mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    requirementGenerationEnabled: true,
  })

export function getMcpRequestPayloadBytesForStep(step: number): number {
  return Math.round(
    (MCP_REQUEST_PAYLOAD_DEFAULT_BYTES * step) /
      MCP_REQUEST_PAYLOAD_STEPS_PER_MIB,
  )
}

export function getMcpRequestPayloadKiBForBytes(bytes: number): number {
  return getMcpRequestPayloadStepForBytes(bytes) * MCP_REQUEST_PAYLOAD_STEP_KIB
}

export function getMcpRequestPayloadStepForBytes(value: number): number {
  return Math.round(
    (value * MCP_REQUEST_PAYLOAD_STEPS_PER_MIB) /
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
  )
}

function clampMcpRequestPayloadStep(step: number): number {
  return Math.min(
    MCP_REQUEST_PAYLOAD_MAX_STEP,
    Math.max(MCP_REQUEST_PAYLOAD_MIN_STEP, step),
  )
}

export function isValidMcpMaxRequestBytes(value: number): boolean {
  const step = getMcpRequestPayloadStepForBytes(value)
  return (
    Number.isInteger(value) &&
    Number.isInteger(step) &&
    step >= MCP_REQUEST_PAYLOAD_MIN_STEP &&
    step <= MCP_REQUEST_PAYLOAD_MAX_STEP &&
    getMcpRequestPayloadBytesForStep(step) === value
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
