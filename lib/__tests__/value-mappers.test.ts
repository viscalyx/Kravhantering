import { describe, expect, it } from 'vitest'
import {
  toBoolean,
  toIsoString,
  toNullableIsoString,
} from '@/lib/typeorm/value-mappers'

describe('SQL Server value mapping', () => {
  it('serializes dates while preserving database strings and nullability', () => {
    const date = new Date('2026-08-05T12:34:56.000Z')

    expect(toIsoString(date)).toBe('2026-08-05T12:34:56.000Z')
    expect(toIsoString('2026-08-05')).toBe('2026-08-05')
    expect(toNullableIsoString(date)).toBe('2026-08-05T12:34:56.000Z')
    expect(toNullableIsoString(null)).toBeNull()
    expect(toNullableIsoString(undefined)).toBeNull()
  })

  it('maps only SQL Server truth values to true', () => {
    expect([true, 1, '1'].map(toBoolean)).toEqual([true, true, true])
    expect([false, 0, '0', 'true'].map(toBoolean)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })
})
