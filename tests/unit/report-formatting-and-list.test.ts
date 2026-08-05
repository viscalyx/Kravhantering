import { describe, expect, it } from 'vitest'
import { mapReportItemsWithConcurrency } from '@/lib/reports/data/concurrency'
import { requirementPackageName } from '@/lib/reports/package-name'
import {
  formatReportBoolean,
  formatReportTemplate,
  formatRequirementCount,
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'
import {
  formatArea,
  formatDeviationSignal,
  formatNormReferences,
  formatNormReferenceUris,
  formatQualityCharacteristic,
  isResidualFromImplementation,
} from '@/lib/reports/specification-output-format'
import {
  parseSpecificationCsvProfile,
  parseSpecificationReportProfile,
} from '@/lib/reports/specification-profiles'
import { buildListReport } from '@/lib/reports/templates/list-template'

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

function requirement(versionOverrides: Record<string, unknown> = {}) {
  return {
    area: { id: 1, name: 'Security' },
    createdAt: '2026-05-01T00:00:00.000Z',
    id: 1,
    isArchived: false,
    uniqueId: 'REQ-1',
    versions: [
      {
        description: 'Current requirement',
        statusColor: '#22c55e',
        statusIconName: 'CircleCheck',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        versionNumber: 1,
        ...versionOverrides,
      },
    ],
  }
}

describe('report formatting and list building', () => {
  it('formats every specification output fallback and signal', () => {
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

  it('formats shared labels, unknown locales, templates, and package names', () => {
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
    expect(requirementPackageName({ name: 'Package' })).toBe('Package')
    expect(requirementPackageName(null)).toBe('')
  })

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

  it('maps items in input order with bounded concurrency and handles empties', async () => {
    const active: number[] = []
    let maximumActive = 0
    const values = await mapReportItemsWithConcurrency(
      Array.from({ length: 12 }, (_, index) => index),
      async (item, index) => {
        active.push(index)
        maximumActive = Math.max(maximumActive, active.length)
        await Promise.resolve()
        active.splice(active.indexOf(index), 1)
        return `${index}:${item}`
      },
    )

    expect(values).toEqual(Array.from({ length: 12 }, (_, i) => `${i}:${i}`))
    expect(maximumActive).toBe(8)
    await expect(
      mapReportItemsWithConcurrency([], async item => item),
    ).resolves.toEqual([])
  })

  it('builds list rows, cover context, truncation, and missing-version fallbacks', () => {
    const longDescription = 'x'.repeat(121)
    const model = buildListReport(
      [
        requirement({ description: 'Old', versionNumber: 1 }),
        {
          ...requirement({ description: longDescription, versionNumber: 1 }),
          id: 2,
          uniqueId: 'REQ-2',
          versions: [
            {
              ...requirement({ description: 'Old' }).versions[0],
              versionNumber: 1,
            },
            {
              ...requirement({ description: longDescription }).versions[0],
              versionNumber: 2,
            },
          ],
        },
        {
          ...requirement(),
          area: null,
          id: 3,
          uniqueId: 'REQ-3',
          versions: [],
        },
      ] as never,
      'sv',
      {
        businessNeedsReference: 'Need-1',
        governanceObjectType: 'Program',
        implementationType: 'Development',
        lifecycleStatus: 'Implementation',
        name: 'Specification',
        specificationCode: 'SPEC-1',
      },
      [
        {
          answerText: 'Yes',
          areaName: 'Security',
          changedAt: '2026-05-01',
          isHistorical: true,
          questionCode: 'Q1',
          questionText: 'Use MFA?',
          selectedByDisplayName: 'Ada Admin',
        },
      ],
    )

    expect(model.sections.map(section => section.type)).toEqual([
      'specification-cover',
      'page-break',
      'header',
      'requirement-selection-context',
      'requirement-table',
    ])
    const table = model.sections.find(
      section => section.type === 'requirement-table',
    )
    if (table?.type !== 'requirement-table') {
      throw new Error('Expected requirement table')
    }
    expect(table.rows[1]?.cells.description).toBe(`${'x'.repeat(120)}…`)
    expect(table.rows[2]?.cells).toMatchObject({ area: '', status: '' })
    expect(table.rows[2]?.statusColor).toBeNull()
  })
})
