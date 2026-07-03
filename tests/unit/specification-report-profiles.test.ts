import { describe, expect, it } from 'vitest'
import type { SpecificationOutputData } from '@/lib/reports/data/specification-output'
import type { SpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'
import { buildSpecificationCsv } from '@/lib/reports/specification-csv'
import {
  canExportProcurementCsvForLifecycleStatus,
  getSpecificationReportProfileForLifecycleStatus,
} from '@/lib/reports/specification-profiles'
import { buildSpecificationProfileReport } from '@/lib/reports/templates/specification-profile-template'
import { buildSpecificationTraceabilityReport } from '@/lib/reports/templates/specification-traceability-template'

function outputData(): SpecificationOutputData {
  return {
    specification: {
      businessNeedsReference: 'IAM initiative',
      createdAt: '2026-06-01T00:00:00.000Z',
      governanceObjectType: { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
      id: 10,
      implementationType: { id: 2, nameEn: 'Program', nameSv: 'Program' },
      lifecycleStatus: { id: 1, nameEn: 'Procurement', nameSv: 'Upphandling' },
      name: 'IAM procurement',
      responsibleDisplayName: 'Ada Admin',
      responsibleHsaId: 'SE5560000001-ada1',
      specificationGovernanceObjectTypeId: 1,
      specificationImplementationTypeId: 2,
      specificationLifecycleStatusId: 1,
      uniqueId: 'SPEC-1',
      updatedAt: '2026-06-02T00:00:00.000Z',
    },
    items: [
      {
        areaName: 'Security',
        categoryNameEn: 'Business requirement',
        categoryNameSv: 'Verksamhetskrav',
        description: 'Authentication must use MFA.',
        deviationCounts: { approved: 0, pending: 1, rejected: 0, total: 1 },
        itemRef: 'lib:31',
        kind: 'library',
        needsReference: 'IAM-need',
        normReferences: [
          {
            id: 7,
            name: 'ISO 27001',
            normReferenceId: 'ISO27001',
            uri: 'https://example.test/iso',
          },
        ],
        qualityCharacteristicChapterId: '3.6',
        qualityCharacteristicNameEn: 'Security',
        qualityCharacteristicNameSv: 'Informationssäkerhet',
        requirementPackageNames: ['Base package'],
        verifiable: true,
        priorityLevelNameEn: 'High',
        priorityLevelNameSv: 'Hög',
        specificationItemStatusId: 2,
        specificationItemStatusNameEn: 'In progress',
        specificationItemStatusNameSv: 'Pågår',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        suggestionCount: 2,
        typeNameEn: 'Non-functional',
        typeNameSv: 'Icke-funktionellt',
        uniqueId: 'BEH0001',
        versionNumber: 4,
      },
    ],
  }
}

function requirementTable(
  model: ReturnType<typeof buildSpecificationProfileReport>,
) {
  const table = model.sections.find(
    section => section.type === 'requirement-table',
  )
  expect(table?.type).toBe('requirement-table')
  return table?.type === 'requirement-table' ? table : null
}

function traceabilityData(): SpecificationTraceabilityData {
  return {
    specification: outputData().specification,
    items: [
      {
        areaName: 'Security',
        deviationCounts: { approved: 0, pending: 1, rejected: 0, total: 1 },
        itemRef: 'lib:31',
        kind: 'library',
        needsReference: 'IAM-need',
        note: 'Follow up at gate 2',
        verifiable: true,
        priorityLevelNameEn: 'High',
        priorityLevelNameSv: 'Hög',
        specificationItemStatusId: 2,
        specificationItemStatusNameEn: 'In progress',
        specificationItemStatusNameSv: 'Pågår',
        statusUpdatedAt: '2026-06-03T00:00:00.000Z',
        uniqueId: 'BEH0001',
        verificationMethod: 'Review test evidence',
        versionNumber: 4,
      },
      {
        areaName: null,
        deviationCounts: { approved: 1, pending: 0, rejected: 0, total: 1 },
        itemRef: 'local:41',
        kind: 'specificationLocal',
        needsReference: null,
        note: null,
        verifiable: false,
        priorityLevelNameEn: null,
        priorityLevelNameSv: null,
        specificationItemStatusId: 1,
        specificationItemStatusNameEn: 'Not started',
        specificationItemStatusNameSv: 'Ej startad',
        statusUpdatedAt: null,
        uniqueId: 'KRAV0001',
        verificationMethod: null,
        versionNumber: null,
      },
    ],
  }
}

describe('specification report profiles', () => {
  it('maps lifecycle statuses to the available report and export profiles', () => {
    expect(getSpecificationReportProfileForLifecycleStatus(1)).toBe(
      'procurement',
    )
    expect(getSpecificationReportProfileForLifecycleStatus(2)).toBe('progress')
    expect(getSpecificationReportProfileForLifecycleStatus(3)).toBe('progress')
    expect(getSpecificationReportProfileForLifecycleStatus(4)).toBe(
      'management',
    )
    expect(getSpecificationReportProfileForLifecycleStatus(null)).toBeNull()
    expect(canExportProcurementCsvForLifecycleStatus(1)).toBe(true)
    expect(canExportProcurementCsvForLifecycleStatus(3)).toBe(false)
  })

  it('keeps procurement reports external-safe and omits internal fields', () => {
    const model = buildSpecificationProfileReport(
      outputData(),
      'procurement',
      'sv',
    )
    const cover = model.sections.find(
      section => section.type === 'specification-cover',
    )
    const table = requirementTable(model)

    expect(model.orientation).toBe('portrait')
    expect(cover).toMatchObject({
      type: 'specification-cover',
      variant: 'minimal',
    })
    expect(table?.columns.map(column => column.key)).toEqual([
      'uniqueId',
      'description',
      'qualityCharacteristic',
      'normReferences',
    ])
    expect(table?.rows[0]?.cells).toMatchObject({
      qualityCharacteristic: 'Informationssäkerhet (ISO/IEC 25010 3.6)',
      normReferences: 'ISO27001 ISO 27001',
    })
    expect(JSON.stringify(table)).not.toContain('https://example.test/iso')
    expect(JSON.stringify(table)).not.toContain('needsReference')
  })

  it('uses the canonical Swedish Genomföranderapport title', () => {
    const model = buildSpecificationProfileReport(
      outputData(),
      'progress',
      'sv',
    )
    const header = model.sections.find(section => section.type === 'header')

    expect(header).toMatchObject({
      title: 'Genomföranderapport',
    })
  })

  it('adds management residual and deviation signals without free-text details', () => {
    const model = buildSpecificationProfileReport(
      outputData(),
      'management',
      'sv',
    )
    const table = requirementTable(model)

    expect(model.orientation).toBe('landscape')
    expect(table?.columns.map(column => column.key)).toContain(
      'deviationSignal',
    )
    expect(table?.columns.map(column => column.key)).toContain(
      'residualFromImplementation',
    )
    expect(table?.rows[0]?.cells.deviationSignal).toBe('Väntande')
    expect(table?.rows[0]?.cells.residualFromImplementation).toBe('Ja')
  })

  it('builds row-based CSV exports with the right profile columns', () => {
    const procurementCsv = buildSpecificationCsv(
      outputData(),
      'procurement',
      'sv',
    )
    expect(procurementCsv.split('\r\n')[0]).toBe(
      'Krav-ID;Kravtext;Kvalitetsegenskap;Normreferenser;Norm-URI',
    )
    expect(procurementCsv).toContain('https://example.test/iso')
    expect(procurementCsv).not.toContain('Underlagssyfte')

    const fullCsv = buildSpecificationCsv(outputData(), 'full', 'sv')
    expect(fullCsv.split('\r\n')[0]).toBe(
      'Krav-ID;Kravtext;Kravområde;Kategori;Typ;Kvalitetsegenskap;Prioritet;Kravversionsstatus;Verifierbar;Version;Behovsreferens;Användningsstatus;Normreferenser;Kravpaket;Förbättringsförslag;ISO-kapitel;Norm-URI;Avstegssignal',
    )
    expect(fullCsv).toContain('2')
    expect(fullCsv).toContain('Väntande')
  })

  it('builds a traceability report from selected requirement applications', () => {
    const model = buildSpecificationTraceabilityReport(traceabilityData(), 'sv')
    const header = model.sections.find(section => section.type === 'header')
    const summary = model.sections.find(
      section => section.type === 'traceability-summary',
    )
    const table = model.sections.find(
      section => section.type === 'traceability-table',
    )

    expect(model.orientation).toBe('portrait')
    expect(header).toMatchObject({
      subtitle: '2 kravtillämpningar',
      title: 'Tillämpningsspårbarhet',
    })
    expect(summary?.type).toBe('traceability-summary')
    if (summary?.type !== 'traceability-summary') {
      throw new Error('Expected traceability summary section')
    }
    expect(summary.metrics).toEqual([
      { label: 'Kravtillämpningar', value: '2' },
      { label: 'Bibliotekskrav', value: '1' },
      { label: 'Lokala krav', value: '1' },
      { label: 'Saknade behovsreferenser', value: '1' },
    ])
    expect(summary.groups[0]?.items).toEqual([
      { label: 'Ej startad', value: '1' },
      { label: 'Pågår', value: '1' },
    ])
    expect(summary.groups[1]?.items).toEqual([
      { label: 'Väntande', value: '1' },
      { label: 'Godkänd', value: '1' },
      { label: 'Avslagen', value: '0' },
    ])

    expect(table?.type).toBe('traceability-table')
    if (table?.type !== 'traceability-table') {
      throw new Error('Expected traceability table section')
    }
    expect(table.rows).toEqual([
      expect.objectContaining({
        area: 'Security',
        deviation: 'Väntande: 1',
        needsReference: 'IAM-need',
        note: 'Follow up at gate 2',
        origin: 'Bibliotekskrav',
        requirementId: 'BEH0001',
        priorityLevel: 'Hög',
        usageStatus: 'Pågår',
        verification: 'Ja: Review test evidence',
        version: '4',
      }),
      expect.objectContaining({
        area: 'Unikt krav',
        deviation: 'Godkänd: 1',
        needsReference: '',
        origin: 'Kravunderlagslokalt krav',
        requirementId: 'KRAV0001',
        verification: 'Nej',
        version: '',
      }),
    ])
  })

  it('sorts traceability summary labels with the report locale', () => {
    const data = traceabilityData()
    const [firstItem, secondItem] = data.items
    if (!firstItem || !secondItem) {
      throw new Error('Expected two traceability items')
    }

    data.items = [
      {
        ...firstItem,
        specificationItemStatusNameEn: 'Ä active',
        specificationItemStatusNameSv: 'Ä aktiv',
      },
      {
        ...secondItem,
        specificationItemStatusNameEn: 'Zulu',
        specificationItemStatusNameSv: 'Zulu',
      },
    ]

    const englishSummary = buildSpecificationTraceabilityReport(
      data,
      'en',
    ).sections.find(section => section.type === 'traceability-summary')
    const swedishSummary = buildSpecificationTraceabilityReport(
      data,
      'sv',
    ).sections.find(section => section.type === 'traceability-summary')

    if (englishSummary?.type !== 'traceability-summary') {
      throw new Error('Expected English traceability summary section')
    }
    if (swedishSummary?.type !== 'traceability-summary') {
      throw new Error('Expected Swedish traceability summary section')
    }

    expect(englishSummary.groups[0]?.items.map(item => item.label)).toEqual([
      'Ä active',
      'Zulu',
    ])
    expect(swedishSummary.groups[0]?.items.map(item => item.label)).toEqual([
      'Zulu',
      'Ä aktiv',
    ])
  })
})
