import { describe, expect, it } from 'vitest'
import {
  formatReportBoolean,
  formatReportTemplate,
  formatRequirementCount,
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'

describe('report labels', () => {
  it('formats booleans, counts, templates, and localized values', () => {
    const labels = getReportLabels('en')
    expect(formatReportBoolean(true, labels)).toBe('Yes')
    expect(formatReportBoolean(false, labels)).toBe('No')
    expect(formatRequirementCount(1, labels)).toBe('1 requirement')
    expect(formatRequirementCount(2, labels)).toBe('2 requirements')
    expect(
      formatReportTemplate('{count} {known} {missing}', {
        count: 2,
        known: 'rows',
      }),
    ).toBe('2 rows {missing}')
    expect(localizeReportValue('sv', 'Svenska', 'English')).toBe('Svenska')
    expect(localizeReportValue('de', 'Svenska', 'English')).toBe('English')
    expect(localizeReportValue('sv', null, 'English')).toBe('')
  })
})
