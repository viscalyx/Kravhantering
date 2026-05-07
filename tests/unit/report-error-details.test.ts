import { describe, expect, it } from 'vitest'
import { extractErrorDetails } from '@/lib/reports/extract-error-details'

describe('extractErrorDetails', () => {
  it('returns an empty string when no details are provided', () => {
    expect(extractErrorDetails('')).toBe('')
  })

  it('extracts an error field from JSON responses', () => {
    expect(extractErrorDetails('{"error":"Specification missing"}')).toBe(
      'Specification missing',
    )
  })

  it('extracts a message field from JSON responses', () => {
    expect(extractErrorDetails('{"message":"Specification missing"}')).toBe(
      'Specification missing',
    )
  })

  it('falls back to raw text when the response is not JSON', () => {
    expect(extractErrorDetails('plain text error')).toBe('plain text error')
  })
})
