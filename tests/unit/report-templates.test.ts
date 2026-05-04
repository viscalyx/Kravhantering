import { describe, expect, it } from 'vitest'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { buildHistoryReport } from '@/lib/reports/templates/history-template'
import { buildReviewReport } from '@/lib/reports/templates/review-template'

function makeVersion(
  overrides: Partial<RequirementReportData['versions'][number]> = {},
): RequirementReportData['versions'][number] {
  return {
    acceptanceCriteria: 'AC',
    archiveInitiatedAt: null,
    archivedAt: null,
    category: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: null,
    description: 'Description',
    editedAt: null,
    id: 1,
    publishedAt: null,
    qualityCharacteristic: null,
    requiresTesting: false,
    riskLevel: null,
    status: 3,
    statusColor: '#22c55e',
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    type: null,
    verificationMethod: null,
    versionNormReferences: [],
    versionNumber: 1,
    versionRequirementPackages: [],
    ...overrides,
  }
}

function makeRequirement(
  versions: RequirementReportData['versions'],
): RequirementReportData {
  return {
    area: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    id: 1,
    isArchived: false,
    uniqueId: 'REQ-001',
    versions,
  }
}

describe('report templates', () => {
  it('skips blank requirement packages and falls back to the available locale', () => {
    const model = buildHistoryReport(
      makeRequirement([
        makeVersion({
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 1,
                nameEn: 'Mobile use',
                nameSv: null,
              },
            },
            {
              requirementPackage: {
                id: 2,
                nameEn: '',
                nameSv: '',
              },
            },
          ],
        }),
      ]),
      'sv',
    )

    const versionSummary = model.sections.find(
      section => section.type === 'version-summary',
    )
    expect(versionSummary).toBeDefined()
    expect(
      versionSummary?.type === 'version-summary'
        ? versionSummary.version.requirementPackages
        : [],
    ).toEqual([{ nameEn: 'Mobile use', nameSv: 'Mobile use' }])
  })

  it('compares requirement packages by stable IDs in review metadata', () => {
    const model = buildReviewReport(
      makeRequirement([
        makeVersion({
          id: 1,
          status: 3,
          versionNumber: 1,
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 7,
                nameEn: 'Old translation',
                nameSv: null,
              },
            },
          ],
        }),
        makeVersion({
          id: 2,
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          versionNumber: 2,
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 7,
                nameEn: 'New translation',
                nameSv: null,
              },
            },
          ],
        }),
      ]),
      'en',
    )

    expect(
      model.sections.some(section => section.type === 'metadata-changes'),
    ).toBe(false)
  })
})
