import { describe, expect, it } from 'vitest'
import { getReportLabels } from '@/lib/reports/report-labels'
import {
  formatArea,
  formatDeviationSignal,
  formatNormReferences,
  formatNormReferenceUris,
  formatQualityCharacteristic,
  isResidualFromImplementation,
} from '@/lib/reports/specification-output-format'

function outputItem(overrides: Record<string, unknown> = {}) {
  return {
    areaName: 'Security',
    deviationCounts: { approved: 0, pending: 0, rejected: 0, total: 0 },
    kind: 'library',
    normReferences: [],
    qualityCharacteristicChapterId: null,
    qualityCharacteristicNameEn: null,
    qualityCharacteristicNameSv: null,
    specificationItemStatusId: null,
    ...overrides,
  } as never
}

describe('specification output formatting', () => {
  it('formats every fallback and deviation signal', () => {
    const labels = getReportLabels('en')
    expect(formatArea(outputItem(), labels)).toBe('Security')
    expect(formatArea(outputItem({ kind: 'specificationLocal' }), labels)).toBe(
      'Unique requirement',
    )
    expect(
      formatQualityCharacteristic(
        outputItem({
          qualityCharacteristicChapterId: '3.6',
          qualityCharacteristicNameEn: 'Security',
          qualityCharacteristicNameSv: 'Säkerhet',
        }),
        'en',
      ),
    ).toBe('Security (ISO/IEC 25010 3.6)')
    expect(
      formatQualityCharacteristic(
        outputItem({ qualityCharacteristicNameEn: 'Security' }),
        'en',
      ),
    ).toBe('Security')
    expect(formatQualityCharacteristic(outputItem(), 'en')).toBe('')

    const references = outputItem({
      normReferences: [
        { name: 'ISO 27001', normReferenceId: 'ISO', uri: 'https://iso.test' },
        { name: '', normReferenceId: 'NIST', uri: null },
      ],
    })
    expect(formatNormReferences(references)).toBe('ISO ISO 27001, NIST')
    expect(formatNormReferenceUris(references)).toBe('https://iso.test')

    expect(
      formatDeviationSignal(
        { approved: 1, pending: 1, rejected: 1, total: 3 },
        labels,
      ),
    ).toBe('Pending')
    expect(
      formatDeviationSignal(
        { approved: 1, pending: 0, rejected: 1, total: 2 },
        labels,
      ),
    ).toBe('Approved')
    expect(
      formatDeviationSignal(
        { approved: 0, pending: 0, rejected: 1, total: 1 },
        labels,
      ),
    ).toBe('Rejected')
    expect(
      formatDeviationSignal(
        { approved: 0, pending: 0, rejected: 0, total: 0 },
        labels,
      ),
    ).toBe('')

    expect(isResidualFromImplementation(outputItem())).toBe(true)
    expect(
      isResidualFromImplementation(
        outputItem({ specificationItemStatusId: 4 }),
      ),
    ).toBe(false)
  })
})
