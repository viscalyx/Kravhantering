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

  it('drops Swedish stop words and returns empty when no code words remain', () => {
    expect(generateSpecificationCode('Det är en av de och ett')).toBe('AR')
    expect(generateSpecificationCode('det och en')).toBe('')
  })

  it('transliterates supported Swedish and European characters', () => {
    expect(generateSpecificationCode('ÅÄÖ é Ü')).toBe('AAO-E-U')
  })

  it('truncates long names at a word boundary when one is available', () => {
    expect(generateSpecificationCode('requirements governance workflow')).toBe(
      'REQUIREMENTS',
    )
  })

  it('uses the full limit when a long name has no word boundary', () => {
    expect(generateSpecificationCode('abcdefghijklmnopqrstuv')).toBe(
      'ABCDEFGHIJKLMNOPQRST',
    )
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

  it('normalizes accents, punctuation, repeated separators, and length', () => {
    expect(normalizeSpecificationCodeInput('  blå---équipe / 2026  ')).toBe(
      'BLA-EQUIPE-2026',
    )
    expect(normalizeSpecificationCodeInput('abcdefghijklmnopqrstuv')).toBe(
      'ABCDEFGHIJKLMNOPQRST',
    )
  })
})
