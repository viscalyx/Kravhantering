import { describe, expect, it } from 'vitest'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { buildHistoryReport } from '@/lib/reports/templates/history-template'
import { buildReviewReport } from '@/lib/reports/templates/review-template'
import { buildSuggestionHistoryReport } from '@/lib/reports/templates/suggestion-history-template'

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
    priorityLevel: null,
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
  it('skips blank requirement packages in history reports', () => {
    const model = buildHistoryReport(
      makeRequirement([
        makeVersion({
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 1,
                name: 'Mobile use',
              },
            },
            {
              requirementPackage: {
                id: 2,
                name: '',
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
    ).toEqual([{ name: 'Mobile use' }])
  })

  it('skips blank requirement packages in review reports', () => {
    const model = buildReviewReport(
      makeRequirement([
        makeVersion({
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 1,
                name: 'Mobile use',
              },
            },
            {
              requirementPackage: {
                id: 2,
                name: '',
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
    ).toEqual([{ name: 'Mobile use' }])
  })

  it('skips blank requirement packages in suggestion history reports', () => {
    const model = buildSuggestionHistoryReport(
      makeRequirement([
        makeVersion({
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 1,
                name: 'Mobile use',
              },
            },
            {
              requirementPackage: {
                id: 2,
                name: '  ',
              },
            },
          ],
        }),
      ]),
      [],
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
    ).toEqual([{ name: 'Mobile use' }])
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
                name: 'Old package',
              },
            },
          ],
        }),
        makeVersion({
          id: 2,
          requiresTesting: true,
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          versionNumber: 2,
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 7,
                name: 'New package name on same id',
              },
            },
          ],
        }),
      ]),
      'en',
    )

    const metadataChanges = model.sections.filter(
      section => section.type === 'metadata-changes',
    )
    expect(metadataChanges).toHaveLength(1)
    expect(
      metadataChanges.flatMap(section =>
        section.type === 'metadata-changes' ? section.changes : [],
      ),
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ field: 'Requirements packages' }),
        expect.objectContaining({ field: 'Kravpaket' }),
      ]),
    )
  })

  it('uses requirement package names in review metadata changes', () => {
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
                name: 'Old package',
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
                id: 8,
                name: 'New package',
              },
            },
          ],
        }),
      ]),
      'sv',
    )

    const metadataChanges = model.sections.find(
      section => section.type === 'metadata-changes',
    )
    expect(metadataChanges).toBeDefined()
    expect(
      metadataChanges?.type === 'metadata-changes'
        ? metadataChanges.changes
        : [],
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'Kravpaket',
          newValue: 'New package',
          oldValue: 'Old package',
        }),
      ]),
    )
  })
})
