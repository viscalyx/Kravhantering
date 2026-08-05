import { describe, expect, it } from 'vitest'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { buildCombinedReviewReport } from '@/lib/reports/templates/combined-review-template'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
import { buildHistoryReport } from '@/lib/reports/templates/history-template'
import { buildReviewReport } from '@/lib/reports/templates/review-template'
import { buildSuggestionHistoryReport } from '@/lib/reports/templates/suggestion-history-template'
import { createReportVersionSummary } from '@/lib/reports/version-summary'

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
  it('reports review availability and missing comparison bases', () => {
    const noReview = buildReviewReport(
      makeRequirement([makeVersion({ status: 3 })]),
      'en',
    )
    expect(noReview.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('review'),
          severity: 'warning',
          type: 'notice',
        }),
      ]),
    )

    const reviewWithoutBase = buildReviewReport(
      makeRequirement([
        makeVersion({
          status: 2,
          statusNameEn: '',
          statusNameSv: '',
          versionNumber: 2,
        }),
      ]),
      'en',
    )
    expect(reviewWithoutBase.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'info', type: 'notice' }),
        expect.objectContaining({ type: 'version-summary' }),
      ]),
    )

    const archivingWithoutBase = buildReviewReport(
      makeRequirement([
        makeVersion({
          archiveInitiatedAt: '2026-05-02T00:00:00.000Z',
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          versionNumber: 2,
        }),
      ]),
      'sv',
    )
    expect(archivingWithoutBase.sections[0]).toMatchObject({
      subtitle: expect.any(String),
      type: 'header',
    })
    expect(archivingWithoutBase.sections[1]).toMatchObject({
      severity: 'warning',
      type: 'notice',
    })
  })

  it('describes every changed review field against an archived base', () => {
    const named = (id: number, nameEn: string, nameSv: string) => ({
      id,
      nameEn,
      nameSv,
    })
    const model = buildReviewReport(
      makeRequirement([
        makeVersion({
          acceptanceCriteria: 'Old acceptance',
          archivedAt: '2026-05-02T00:00:00.000Z',
          category: named(1, 'Old category', 'Gammal kategori') as never,
          description: 'Old description',
          id: 1,
          priorityLevel: null,
          qualityCharacteristic: named(1, 'Old QC', 'Gammal KE') as never,
          status: 4,
          statusNameEn: 'Archived',
          statusNameSv: 'Arkiverad',
          type: named(1, 'Old type', 'Gammal typ') as never,
          verifiable: false,
          verificationMethod: null,
          versionNormReferences: [
            { normReference: { name: 'Old norm' } as never },
            { normReference: null } as never,
          ],
          versionNumber: 1,
          versionRequirementPackages: [
            { requirementPackage: null } as never,
            { requirementPackage: { id: 2, name: 'Old package' } },
            { requirementPackage: { id: 1, name: 'Earlier package' } },
          ],
        }),
        makeVersion({
          acceptanceCriteria: 'New acceptance',
          category: named(2, 'New category', 'Ny kategori') as never,
          description: 'New description',
          id: 2,
          priorityLevel: {
            code: 'P1',
            color: '#1e3a8a',
            iconName: null,
            id: 1,
            nameEn: 'Critical',
            nameSv: 'Kritisk',
          } as never,
          qualityCharacteristic: named(2, 'New QC', 'Ny KE') as never,
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          type: named(2, 'New type', 'Ny typ') as never,
          verifiable: true,
          verificationMethod: 'Inspection',
          versionNormReferences: [
            { normReference: { name: 'New norm' } as never },
          ],
          versionNumber: 2,
          versionRequirementPackages: [
            { requirementPackage: { id: 3, name: 'New package' } },
          ],
        }),
      ]),
      'en',
    )

    const changes = model.sections.flatMap(section =>
      section.type === 'metadata-changes' ? section.changes : [],
    )
    expect(changes.map(change => change.field)).toEqual(
      expect.arrayContaining([
        'Category',
        'Type',
        'Quality characteristic',
        'Priority',
        'Verifiable',
        'Verification Method',
        'Requirement package',
        'References',
      ]),
    )
    expect(
      model.sections.filter(section => section.type === 'diff'),
    ).toHaveLength(2)
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Archived'),
          severity: 'info',
          type: 'notice',
        }),
      ]),
    )
  })

  it('orders archive requests before ordinary reviews in a combined report', () => {
    const ordinary = makeRequirement([
      makeVersion({
        id: 1,
        status: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
    ])
    ordinary.uniqueId = 'REQ-REVIEW'
    const archiving = makeRequirement([
      makeVersion({
        archiveInitiatedAt: '2026-05-02T00:00:00.000Z',
        id: 2,
        status: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
    ])
    archiving.uniqueId = 'REQ-ARCHIVE'

    const model = buildCombinedReviewReport([ordinary, archiving], 'en')
    const toc = model.sections.find(section => section.type === 'toc')
    if (toc?.type !== 'toc') throw new Error('Expected contents')

    expect(toc.groups.map(group => group.items[0]?.id)).toEqual([
      'REQ-ARCHIVE',
      'REQ-REVIEW',
    ])
    expect(
      toc.groups.flatMap(group => group.items.map(item => item.page)),
    ).toEqual([2, 3])
  })

  it('uses the archiving comparison warning when a published base exists', () => {
    const model = buildReviewReport(
      makeRequirement([
        makeVersion({ id: 1, status: 3, versionNumber: 1 }),
        makeVersion({
          archiveInitiatedAt: '2026-05-02T00:00:00.000Z',
          id: 2,
          status: 2,
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          versionNumber: 2,
        }),
      ]),
      'en',
    )

    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', type: 'notice' }),
      ]),
    )
  })

  it('builds empty and archive-only combined report contents', () => {
    const empty = buildCombinedReviewReport([], 'en')
    const emptyToc = empty.sections.find(section => section.type === 'toc')
    expect(emptyToc).toMatchObject({ groups: [], type: 'toc' })

    const archiving = makeRequirement([
      makeVersion({
        archiveInitiatedAt: '2026-05-02T00:00:00.000Z',
        status: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
    ])
    const archiveOnly = buildCombinedReviewReport([archiving], 'en')
    const toc = archiveOnly.sections.find(section => section.type === 'toc')
    if (toc?.type !== 'toc') throw new Error('Expected contents')
    expect(toc.groups).toHaveLength(1)
  })

  it('maps linked and unlinked suggestions through every visible state', () => {
    const versions = [
      makeVersion({ id: 1, status: 3, versionNumber: 1 }),
      makeVersion({
        id: 2,
        status: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
        versionNumber: 2,
      }),
      makeVersion({
        id: 3,
        status: 1,
        statusNameEn: '',
        statusNameSv: '',
        versionNumber: 3,
      }),
    ]
    const suggestion = (
      id: number,
      overrides: Record<string, unknown> = {},
    ) => ({
      content: `Suggestion ${id}`,
      createdAt: '2026-05-01T00:00:00.000Z',
      createdBy: null,
      id,
      isReviewRequested: 0,
      requirementId: 1,
      requirementVersionId: 1,
      resolution: null,
      resolutionMotivation: null,
      resolvedAt: null,
      resolvedBy: null,
      ...overrides,
    })
    const model = buildSuggestionHistoryReport(
      makeRequirement(versions),
      [
        suggestion(1, { resolution: 1 }),
        suggestion(2, { resolution: 2 }),
        suggestion(3, { isReviewRequested: 1, requirementVersionId: 2 }),
        suggestion(4, { requirementVersionId: 3 }),
        suggestion(5, { requirementVersionId: null }),
        suggestion(6, { requirementVersionId: 1 }),
      ] as never,
      'en',
    )

    const suggestionItems = model.sections.flatMap(section =>
      section.type === 'suggestion-list' ? section.items : [],
    )
    expect(suggestionItems.map(item => item.status.label)).toEqual(
      expect.arrayContaining([
        'Resolved',
        'Dismissed',
        'Review Requested',
        'Draft',
      ]),
    )
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'notice' }),
        expect.objectContaining({
          borderColor: '#22c55e',
          type: 'version-summary',
        }),
        expect.objectContaining({
          borderColor: '#eab308',
          type: 'version-summary',
        }),
        expect.objectContaining({
          isUnpublished: true,
          type: 'version-summary',
        }),
      ]),
    )
  })

  it('builds a deviation review without optional specification or priority', () => {
    const model = buildDeviationReviewReport(
      {
        deviation: {
          createdAt: '2026-05-01T00:00:00.000Z',
          createdBy: null,
          motivation: 'A deviation is needed',
        },
        requirementUniqueId: 'REQ-1',
        specificationCode: null,
        specificationName: null,
        version: {
          acceptanceCriteria: null,
          category: null,
          createdBy: null,
          description: 'Description',
          normReferences: [],
          priorityLevel: null,
          qualityCharacteristic: null,
          requirementPackages: [{ name: 'Package' }],
          status: { color: null, iconName: null, label: 'Published' },
          type: null,
          verifiable: false,
          verificationMethod: null,
          versionNumber: 1,
        },
      },
      'en',
    )

    expect(model.sections.some(section => section.type === 'notice')).toBe(
      false,
    )
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priorityLevel: null,
          type: 'deviation-summary',
        }),
      ]),
    )
  })

  it('builds a deviation specification notice without a specification code', () => {
    const model = buildDeviationReviewReport(
      {
        deviation: {
          createdAt: '2026-05-01T00:00:00.000Z',
          createdBy: null,
          motivation: 'A deviation is needed',
        },
        requirementUniqueId: 'REQ-1',
        specificationCode: null,
        specificationName: 'Specification',
        version: {
          acceptanceCriteria: null,
          category: null,
          createdBy: null,
          description: 'Description',
          normReferences: [],
          priorityLevel: null,
          qualityCharacteristic: null,
          requirementPackages: [],
          status: { color: null, iconName: null, label: 'Published' },
          type: null,
          verifiable: false,
          verificationMethod: null,
          versionNumber: 1,
        },
      },
      'en',
    )
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Specification'),
          type: 'notice',
        }),
      ]),
    )
  })

  it('creates complete version summaries and filters missing relations', () => {
    const summary = createReportVersionSummary(
      makeVersion({
        category: { id: 1, nameEn: 'Category', nameSv: 'Kategori' } as never,
        priorityLevel: {
          code: 'P1',
          color: '#1e3a8a',
          iconName: null,
          id: 1,
          nameEn: 'Critical',
          nameSv: 'Kritisk',
        } as never,
        qualityCharacteristic: {
          id: 1,
          nameEn: 'Security',
          nameSv: 'Säkerhet',
        } as never,
        type: { id: 1, nameEn: 'Functional', nameSv: 'Funktionellt' } as never,
        versionNormReferences: [
          {
            normReference: {
              name: 'ISO 27001',
              reference: 'A.1',
              uri: 'https://iso.test',
            } as never,
          },
          { normReference: null } as never,
        ],
        versionRequirementPackages: [
          { requirementPackage: { id: 1, name: 'Package' } },
          { requirementPackage: { id: 2, name: '  ' } },
        ],
      }),
      'Published',
    )

    expect(summary).toMatchObject({
      category: { nameEn: 'Category', nameSv: 'Kategori' },
      priorityLevel: { code: 'P1' },
      qualityCharacteristic: { nameEn: 'Security', nameSv: 'Säkerhet' },
      requirementPackages: [{ name: 'Package' }],
      type: { nameEn: 'Functional', nameSv: 'Funktionellt' },
    })
    expect(summary.normReferences).toEqual([
      { name: 'ISO 27001', reference: 'A.1', uri: 'https://iso.test' },
    ])
  })

  it('truncates long history excerpts and uses unknown status labels', () => {
    const model = buildHistoryReport(
      makeRequirement([
        makeVersion({
          description: 'x'.repeat(201),
          status: 1,
          statusNameEn: '',
          statusNameSv: '',
        }),
      ]),
      'en',
    )
    const timeline = model.sections.find(
      section => section.type === 'timeline-entry',
    )
    expect(timeline).toMatchObject({
      entry: {
        descriptionExcerpt: `${'x'.repeat(200)}...`,
        status: { label: 'Unknown' },
      },
      type: 'timeline-entry',
    })
  })

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
