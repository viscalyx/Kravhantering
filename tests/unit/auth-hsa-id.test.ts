import { describe, expect, it } from 'vitest'
import {
  assertHsaId,
  HSA_ID_MAX_LENGTH,
  HsaIdFormatError,
  isHsaId,
} from '@/lib/auth/hsa-id'

describe('isHsaId / assertHsaId', () => {
  it('accepts a canonical HSA-id', () => {
    expect(isHsaId('SE5560000001-1003')).toBe(true)
    expect(assertHsaId('SE5560000001-1003')).toBe('SE5560000001-1003')
  })

  it('accepts country codes other than SE', () => {
    expect(isHsaId('NO5560000001-1003')).toBe(true)
    expect(assertHsaId('DK5560000001-1003')).toBe('DK5560000001-1003')
  })

  it('accepts the maximum-length HSA-id', () => {
    // Country code + 10 digits + '-' + suffix that brings the total to 31 chars.
    const value = `SE5560000001-${'a'.repeat(HSA_ID_MAX_LENGTH - 13)}`
    expect(value.length).toBe(HSA_ID_MAX_LENGTH)
    expect(isHsaId(value)).toBe(true)
  })

  it('rejects non-ASCII characters in the suffix', () => {
    expect(isHsaId('SE5560000001-å')).toBe(false)
  })

  it('rejects punctuation in the suffix', () => {
    expect(isHsaId('SE5560000001-foo@bar')).toBe(false)
  })

  it('rejects values that omit the country code prefix', () => {
    expect(isHsaId('5560000001-1003')).toBe(false)
  })

  it('rejects lowercase country codes', () => {
    expect(isHsaId('se5560000001-1003')).toBe(false)
  })

  it('rejects an organisation number with the wrong digit count', () => {
    expect(isHsaId('SE556000000-1003')).toBe(false) // 9 digits
    expect(isHsaId('SE55600000011-1003')).toBe(false) // 11 digits
  })

  it('rejects values that exceed the 31-char max length', () => {
    const tooLong = `SE5560000001-${'a'.repeat(HSA_ID_MAX_LENGTH - 12)}`
    expect(tooLong.length).toBe(HSA_ID_MAX_LENGTH + 1)
    expect(isHsaId(tooLong)).toBe(false)
  })

  it('rejects an empty suffix', () => {
    expect(isHsaId('SE5560000001-')).toBe(false)
  })

  it('throws HsaIdFormatError from assertHsaId on bad input', () => {
    expect(() => assertHsaId('not-an-hsa-id')).toThrow(HsaIdFormatError)
  })

  it('does not consider a service identifier to be an HSA-id', () => {
    expect(isHsaId('mcp-client:kravhantering-mcp')).toBe(false)
  })
})
