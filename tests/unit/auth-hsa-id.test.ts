import { describe, expect, it } from 'vitest'
import {
  assertHsaId,
  HSA_ID_MAX_LENGTH,
  HsaIdFormatError,
  isHsaId,
} from '@/lib/auth/hsa-id'

describe('isHsaId / assertHsaId', () => {
  it('accepts a canonical HSA-id', () => {
    expect(isHsaId('SE2321000032-1003')).toBe(true)
    expect(assertHsaId('SE2321000032-1003')).toBe('SE2321000032-1003')
  })

  it('accepts the maximum-length HSA-id', () => {
    // SE + 10 digits + '-' + suffix that brings the total to 31 chars.
    const value = `SE2321000032-${'a'.repeat(HSA_ID_MAX_LENGTH - 13)}`
    expect(value.length).toBe(HSA_ID_MAX_LENGTH)
    expect(isHsaId(value)).toBe(true)
  })

  it('rejects non-ASCII characters in the suffix', () => {
    expect(isHsaId('SE2321000032-å')).toBe(false)
  })

  it('rejects punctuation in the suffix', () => {
    expect(isHsaId('SE2321000032-foo@bar')).toBe(false)
  })

  it('rejects values that omit the SE prefix', () => {
    expect(isHsaId('2321000032-1003')).toBe(false)
  })

  it('rejects an organisation number with the wrong digit count', () => {
    expect(isHsaId('SE232100003-1003')).toBe(false) // 9 digits
    expect(isHsaId('SE23210000321-1003')).toBe(false) // 11 digits
  })

  it('rejects values that exceed the 31-char max length', () => {
    const tooLong = `SE2321000032-${'a'.repeat(HSA_ID_MAX_LENGTH - 12)}`
    expect(tooLong.length).toBe(HSA_ID_MAX_LENGTH + 1)
    expect(isHsaId(tooLong)).toBe(false)
  })

  it('rejects an empty suffix', () => {
    expect(isHsaId('SE2321000032-')).toBe(false)
  })

  it('throws HsaIdFormatError from assertHsaId on bad input', () => {
    expect(() => assertHsaId('not-an-hsa-id')).toThrow(HsaIdFormatError)
  })

  it('does not consider the synthetic MCP value to be an HSA-id', () => {
    expect(isHsaId('mcp-client:kravhantering-mcp')).toBe(false)
  })
})
