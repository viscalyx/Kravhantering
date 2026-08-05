import { describe, expect, it } from 'vitest'
import {
  parseSpecificationCsvProfile,
  parseSpecificationReportProfile,
} from '@/lib/reports/specification-profiles'

describe('specification profiles', () => {
  it('parses only supported report and CSV profiles', () => {
    for (const profile of ['procurement', 'progress', 'management'] as const) {
      expect(parseSpecificationReportProfile(profile)).toBe(profile)
    }
    for (const profile of ['procurement', 'full'] as const) {
      expect(parseSpecificationCsvProfile(profile)).toBe(profile)
    }
    expect(parseSpecificationReportProfile(undefined)).toBeNull()
    expect(parseSpecificationReportProfile('full')).toBeNull()
    expect(parseSpecificationCsvProfile(null)).toBeNull()
    expect(parseSpecificationCsvProfile('progress')).toBeNull()
  })
})
