import { describe, expect, it } from 'vitest'
import {
  addMcpMaxRequestBytesSteps,
  coerceMcpMaxRequestBytes,
  formatMcpRequestPayloadKiB,
  isValidMcpMaxRequestBytes,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'

describe('AI generation availability MCP payload grid', () => {
  it('uses ten 102.4 KiB steps per MiB while storing integer bytes', () => {
    const oneStepRaised = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      1,
    )
    const tenStepsRaised = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      10,
    )

    expect(formatMcpRequestPayloadKiB(oneStepRaised)).toBe('1126.4')
    expect(tenStepsRaised).toBe(2 * 1024 * 1024)
    expect(formatMcpRequestPayloadKiB(tenStepsRaised)).toBe('2048')
    expect(isValidMcpMaxRequestBytes(tenStepsRaised)).toBe(true)
  })

  it('coerces arbitrary bytes onto the ten-steps-per-MiB grid', () => {
    expect(coerceMcpMaxRequestBytes(1024 * 1024 + 100 * 1024)).toBe(
      addMcpMaxRequestBytesSteps(MCP_REQUEST_PAYLOAD_DEFAULT_BYTES, 1),
    )
  })
})
