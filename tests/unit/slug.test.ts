import { describe, expect, it } from 'vitest'
import {
  generateSpecificationCode,
  normalizeSpecificationCodeInput,
} from '@/lib/slug'

describe('specification slug helpers', () => {
  it('generates uppercase nonnumeric specification codes from Swedish names', () => {
    expect(generateSpecificationCode('Säkerhetslyft Q2')).toBe(
      'SAKERHETSLYFT-Q2',
    )
  })

  it('rejects all-digit generated specification codes', () => {
    expect(generateSpecificationCode('2024')).toBe('')
  })

  it('rejects all-digit normalized specification code input after cleanup', () => {
    expect(normalizeSpecificationCodeInput(' 2024 ')).toBe('')
  })

  it('rejects all-digit normalized specification code input after truncation', () => {
    expect(normalizeSpecificationCodeInput('12345678901234567890ABC')).toBe('')
  })

  it('keeps mixed letter and digit specification codes valid', () => {
    expect(normalizeSpecificationCodeInput('spec 2024')).toBe('SPEC-2024')
  })
})
