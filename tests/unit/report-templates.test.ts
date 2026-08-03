import { describe, expect, it } from 'vitest'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
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
    verifiable: false,
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
  it('keeps structured previous and new priority identities in review reports', () => {
    const model = buildReviewReport(
      makeRequirement([
        makeVersion({
          id: 1,
          priorityLevel: {
            code: 'P2',
            color: '#FDE047',
            iconName: 'CircleAlert',
            id: 2,
            nameEn: 'High',
            nameSv: 'Hög',
          } as never,
          status: 3,
          versionNumber: 1,
        }),
        makeVersion({
          id: 2,
          priorityLevel: {
            code: 'P1',
            color: 'invalid',
            iconName: 'UnknownIcon',
            id: 1,
            nameEn: 'Critical',
            nameSv: 'Kritisk',
          } as never,
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          versionNumber: 2,
        }),
      ]),
      'sv',
    )

    const metadataChanges = model.sections.find(
      section => section.type === 'metadata-changes',
    )

    expect(
      metadataChanges?.type === 'metadata-changes'
        ? metadataChanges.changes
        : [],
    ).toContainEqual({
      field: 'Prioritet',
      newValue: {
        code: 'P1',
        color: null,
        iconName: null,
        nameEn: 'Critical',
        nameSv: 'Kritisk',
      },
      oldValue: {
        code: 'P2',
        color: '#fde047',
        iconName: 'CircleAlert',
        nameEn: 'High',
        nameSv: 'Hög',
      },
    })
  })

  it('keeps structured priority identities in history report summaries', () => {
    const version = makeVersion({
      priorityLevel: {
        code: 'P3',
        color: '#1E3A8A',
        iconName: null,
        id: 3,
        nameEn: 'Medium priority with a representative long name',
        nameSv: 'Medelprioritet med ett representativt långt namn',
      },
    })

    for (const model of [
      buildHistoryReport(makeRequirement([version]), 'sv'),
      buildSuggestionHistoryReport(makeRequirement([version]), [], 'en'),
    ]) {
      const summary = model.sections.find(
        section => section.type === 'version-summary',
      )
      expect(
        summary?.type === 'version-summary'
          ? summary.version.priorityLevel
          : null,
      ).toEqual({
        code: 'P3',
        color: '#1e3a8a',
        iconName: null,
        nameEn: 'Medium priority with a representative long name',
        nameSv: 'Medelprioritet med ett representativt långt namn',
      })
    }
  })

  it('keeps a structured priority identity in deviation review sections', () => {
    const model = buildDeviationReviewReport(
      {
        deviation: {
          createdAt: '2026-05-01T00:00:00.000Z',
          createdBy: 'Reviewer',
          motivation: 'A deviation is needed',
        },
        requirementUniqueId: 'REQ-1',
        specificationCode: 'SPEC-1',
        specificationName: 'Specification',
        version: {
          acceptanceCriteria: null,
          category: null,
          createdBy: null,
          description: 'Description',
          normReferences: [],
          priorityLevel: {
            code: 'P2',
            color: '#FDE047',
            iconName: 'UnknownIcon',
            nameEn: 'High',
            nameSv: 'Hög',
          } as never,
          qualityCharacteristic: null,
          requirementPackages: [],
          status: { color: null, iconName: null, label: 'Published' },
          type: null,
          verifiable: false,
          verificationMethod: null,
          versionNumber: 1,
        },
      },
      'sv',
    )
    const summary = model.sections.find(
      section => section.type === 'deviation-summary',
    )

    expect(
      summary?.type === 'deviation-summary' ? summary.priorityLevel : null,
    ).toEqual({
      code: 'P2',
      color: '#fde047',
      iconName: null,
      nameEn: 'High',
      nameSv: 'Hög',
    })
  })

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
          verifiable: true,
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
