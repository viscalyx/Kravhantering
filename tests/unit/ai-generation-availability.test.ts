import { describe, expect, it } from 'vitest'
import {
  ADMIN_AI_SETTINGS_CONSTRAINTS,
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  addMcpMaxRequestBytesSteps,
  coerceMcpMaxRequestBytes,
  DEFAULT_ADMIN_AI_SETTINGS,
  DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
  formatMcpRequestPayloadKiB,
  isValidMcpMaxRequestBytes,
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
  MCP_REQUEST_PAYLOAD_MIN_BYTES,
} from '@/lib/ai/generation-availability'

describe('AI generation availability MCP payload grid', () => {
  it('uses one MiB steps while storing integer bytes', () => {
    const oneStepRaised = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_MIN_BYTES,
      1,
    )
    const clampedAtMax = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      1,
    )

    expect(oneStepRaised).toBe(2 * 1024 * 1024)
    expect(formatMcpRequestPayloadKiB(oneStepRaised)).toBe('2048')
    expect(clampedAtMax).toBe(MCP_REQUEST_PAYLOAD_DEFAULT_BYTES)
    expect(formatMcpRequestPayloadKiB(clampedAtMax)).toBe('10240')
    expect(isValidMcpMaxRequestBytes(oneStepRaised)).toBe(true)
  })

  it('coerces arbitrary bytes onto the one-MiB grid', () => {
    expect(coerceMcpMaxRequestBytes(1024 * 1024 + 100 * 1024)).toBe(
      MCP_REQUEST_PAYLOAD_MIN_BYTES,
    )
    expect(coerceMcpMaxRequestBytes(1024 * 1024 + 600 * 1024)).toBe(
      addMcpMaxRequestBytesSteps(MCP_REQUEST_PAYLOAD_MIN_BYTES, 1),
    )
  })

  it('keeps runtime availability narrow and Admin AI settings full', () => {
    expect(DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY).toEqual({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: true,
    })
    expect(DEFAULT_ADMIN_AI_SETTINGS).toEqual({
      aiSafetyForensicLoggingEnabled: true,
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: true,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })
  })
})
