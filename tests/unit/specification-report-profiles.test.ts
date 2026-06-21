import { describe, expect, it } from 'vitest'
import type { SpecificationOutputData } from '@/lib/reports/data/specification-output'
import { buildSpecificationCsv } from '@/lib/reports/specification-csv'
import {
  canExportProcurementCsvForLifecycleStatus,
  getSpecificationReportProfileForLifecycleStatus,
} from '@/lib/reports/specification-profiles'
import { buildSpecificationProfileReport } from '@/lib/reports/templates/specification-profile-template'

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
        requiresTesting: true,
        riskLevelNameEn: 'High',
        riskLevelNameSv: 'Hög',
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
      'Krav-ID;Kravtext;Kravområde;Kategori;Typ;Kvalitetsegenskap;Risknivå;Kravversionsstatus;Verifierbar;Version;Behovsreferens;Användningsstatus;Normreferenser;Kravpaket;Förbättringsförslag;ISO-kapitel;Norm-URI;Avstegssignal',
    )
    expect(fullCsv).toContain('2')
    expect(fullCsv).toContain('Väntande')
  })
})
