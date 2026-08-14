import { describe, expect, it } from 'vitest'
import { safeBigIntNumberTransformer } from '@/lib/typeorm/value-mappers'

describe('TypeORM value mappers', () => {
  it('maps safe SQL Server bigint values to numbers in both directions', () => {
    expect(safeBigIntNumberTransformer.from('8589934592')).toBe(8589934592)
    expect(safeBigIntNumberTransformer.to(536870912)).toBe(536870912)
  })

  it.each([
    Number.MAX_SAFE_INTEGER + 1,
    String(Number.MAX_SAFE_INTEGER + 1),
    1.5,
  ])('rejects unsafe bigint value %s', value => {
    expect(() => safeBigIntNumberTransformer.from(value)).toThrow(
      'SQL Server bigint is not a safe integer',
    )
    expect(() => safeBigIntNumberTransformer.to(value)).toThrow(
      'SQL Server bigint is not a safe integer',
    )
  })
})
