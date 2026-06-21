import { describe, expect, it } from 'vitest'
import {
  formatReportBoolean,
  formatReportTemplate,
  formatRequirementCount,
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'

describe('report labels', () => {
  it('returns localized report labels and falls back to English', () => {
    expect(getReportLabels('sv').columns.progressReportTitle).toBe(
      'Genomföranderapport',
    )
    expect(getReportLabels('en').columns.progressReportTitle).toBe(
      'Progress report',
    )
    expect(getReportLabels('fr').columns.progressReportTitle).toBe(
      'Progress report',
    )
  })

  it('formats shared localized values without local dictionaries', () => {
    const svLabels = getReportLabels('sv')
    const enLabels = getReportLabels('en')

    expect(formatReportBoolean(true, svLabels)).toBe('Ja')
    expect(formatReportBoolean(false, enLabels)).toBe('No')
    expect(formatRequirementCount(2, svLabels)).toBe('2 krav')
    expect(formatRequirementCount(1, enLabels)).toBe('1 requirement')
    expect(
      formatReportTemplate(svLabels.common.unpublishedVersion, { version: 4 }),
    ).toBe('Opublicerad version (v4)')
    expect(localizeReportValue('sv', 'Svenska', 'English')).toBe('Svenska')
    expect(localizeReportValue('en', 'Svenska', 'English')).toBe('English')
  })
})
