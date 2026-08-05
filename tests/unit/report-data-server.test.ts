import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  collectDeviationForReport,
  collectMultipleRequirementListItemsForReport,
  collectMultipleRequirementsForReport,
  collectRequirementForReport,
  collectRequirementListItemForReport,
  collectSuggestionsForReport,
  parseLibrarySpecificationItemId,
  type ReportDataError,
} from '@/lib/reports/data/server'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

const dalState = vi.hoisted(() => ({
  getRequirementById: vi.fn(),
  getRequirementByUniqueId: vi.fn(),
  listDeviationsForSpecificationItem: vi.fn(),
  listSuggestionsForRequirement: vi.fn(),
  parseSpecificationItemRef: vi.fn(),
}))

vi.mock('@/lib/dal/deviations', () => ({
  listDeviationsForSpecificationItem:
    dalState.listDeviationsForSpecificationItem,
}))

vi.mock('@/lib/dal/improvement-suggestions', () => ({
  listSuggestionsForRequirement: dalState.listSuggestionsForRequirement,
}))

vi.mock('@/lib/dal/requirements', () => ({
  getRequirementById: dalState.getRequirementById,
  getRequirementByUniqueId: dalState.getRequirementByUniqueId,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  parseSpecificationItemRef: dalState.parseSpecificationItemRef,
}))

function reportVersion(id: number, status = STATUS_PUBLISHED) {
  return {
    acceptanceCriteria: null,
    archivedAt: null,
    archiveInitiatedAt: null,
    category: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: null,
    description: `Version ${id}`,
    editedAt: null,
    id,
    publishedAt: null,
    qualityCharacteristic: null,
    verifiable: false,
    priorityLevel: null,
    status,
    statusColor: null,
    statusIconName: null,
    statusNameEn:
      status === STATUS_PUBLISHED
        ? 'Published'
        : status === STATUS_REVIEW
          ? 'Review'
          : status === STATUS_ARCHIVED
            ? 'Archived'
            : 'Draft',
    statusNameSv:
      status === STATUS_PUBLISHED
        ? 'Publicerad'
        : status === STATUS_REVIEW
          ? 'Granskning'
          : status === STATUS_ARCHIVED
            ? 'Arkiverad'
            : 'Utkast',
    type: null,
    verificationMethod: null,
    versionNormReferences: [],
    versionNumber: id,
    versionRequirementPackages: [],
  }
}

function reportRequirement(id: number) {
  return {
    area: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    id,
    isArchived: false,
    uniqueId: `KRAV-${id}`,
    versions: [reportVersion(id)],
  }
}

function createReportDb(): SqlServerDatabase {
  // This ReportDataError test only needs collectDeviationForReport to forward db into mocked DAL calls.
  return {} as Partial<SqlServerDatabase> as SqlServerDatabase
}

describe('report data server helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dalState.parseSpecificationItemRef.mockReturnValue(null)
  })

  it('fails fast when a deviation review points to a missing requirement version', async () => {
    dalState.getRequirementById.mockResolvedValue({
      area: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      id: 42,
      isArchived: false,
      uniqueId: 'KRAV-42',
      versions: [reportVersion(10), reportVersion(11)],
    })
    dalState.listDeviationsForSpecificationItem.mockResolvedValue([
      {
        createdAt: '2026-05-02T00:00:00.000Z',
        createdBy: 'reviewer',
        decision: null,
        id: 7,
        isReviewRequested: 1,
        motivation: 'Needs review',
        requirementVersionId: 999,
        specificationCode: 'SPEC',
        specificationName: 'Spec',
      },
    ])

    await expect(
      collectDeviationForReport(createReportDb(), 42, '55', 'sv'),
    ).rejects.toMatchObject({
      message: 'Requirement version 999 not found for requirement 42',
      name: 'ReportDataError',
      status: 500,
    } satisfies Partial<ReportDataError>)
  })

  it('keeps the complete priority identity in deviation report data', async () => {
    dalState.getRequirementById.mockResolvedValue({
      area: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      id: 42,
      isArchived: false,
      uniqueId: 'KRAV-42',
      versions: [
        {
          ...reportVersion(10),
          priorityLevel: {
            code: 'P2',
            color: '#fde047',
            iconName: 'CircleAlert',
            id: 2,
            nameEn: 'High',
            nameSv: 'Hög',
          },
        },
      ],
    })
    dalState.listDeviationsForSpecificationItem.mockResolvedValue([
      {
        createdAt: '2026-05-02T00:00:00.000Z',
        createdBy: 'reviewer',
        decision: null,
        id: 7,
        isReviewRequested: 1,
        motivation: 'Needs review',
        requirementVersionId: 10,
        specificationCode: 'SPEC',
        specificationName: 'Spec',
      },
    ])

    await expect(
      collectDeviationForReport(createReportDb(), 42, '55', 'sv'),
    ).resolves.toMatchObject({
      version: {
        priorityLevel: {
          code: 'P2',
          color: '#fde047',
          iconName: 'CircleAlert',
          nameEn: 'High',
          nameSv: 'Hög',
        },
      },
    })
  })

  it('parses library and numeric item refs for deviation reports', () => {
    dalState.parseSpecificationItemRef.mockImplementation((value: string) =>
      value === 'lib:55' ? { id: 55, kind: 'library' } : null,
    )

    expect(parseLibrarySpecificationItemId('lib%3A55')).toBe(55)
    expect(parseLibrarySpecificationItemId('77')).toBe(77)
  })

  it.each(['unknown', '0', '1.5'])(
    'rejects invalid deviation application ID %s',
    value => {
      expect(() => parseLibrarySpecificationItemId(value)).toThrow(
        'Invalid requirement application ID',
      )
    },
  )

  it('rejects specification-local item refs for deviation reports', () => {
    dalState.parseSpecificationItemRef.mockReturnValue({
      id: 7,
      kind: 'specificationLocal',
    })

    expect(() => parseLibrarySpecificationItemId('local%3A7')).toThrow(
      'Deviation review PDF is only available for library requirement applications',
    )
  })

  it('shapes requirement list report data to the list-view published display version', async () => {
    dalState.getRequirementById.mockResolvedValue({
      ...reportRequirement(42),
      versions: [
        reportVersion(1, STATUS_PUBLISHED),
        reportVersion(2, STATUS_REVIEW),
        reportVersion(3, STATUS_PUBLISHED),
        reportVersion(4, STATUS_DRAFT),
      ],
    })

    await expect(
      collectRequirementListItemForReport(createReportDb(), 42),
    ).resolves.toMatchObject({
      id: 42,
      versions: [{ status: STATUS_PUBLISHED, versionNumber: 3 }],
    })
  })

  it('includes review requirements in list report data when no published version exists', async () => {
    dalState.getRequirementById.mockResolvedValue({
      ...reportRequirement(42),
      versions: [reportVersion(2, STATUS_REVIEW)],
    })

    await expect(
      collectRequirementListItemForReport(createReportDb(), 42),
    ).resolves.toMatchObject({
      id: 42,
      versions: [{ status: STATUS_REVIEW, versionNumber: 2 }],
    })
  })

  it('prefers the archived version over later non-archived fallbacks for archived requirements', async () => {
    dalState.getRequirementById.mockResolvedValue({
      ...reportRequirement(42),
      isArchived: true,
      versions: [
        reportVersion(2, STATUS_REVIEW),
        reportVersion(3, STATUS_ARCHIVED),
        reportVersion(4, STATUS_DRAFT),
      ],
    })

    await expect(
      collectRequirementListItemForReport(createReportDb(), 42),
    ).resolves.toMatchObject({
      id: 42,
      versions: [{ status: STATUS_ARCHIVED, versionNumber: 3 }],
    })
  })

  it('rejects requirement list report data when no requirement version exists', async () => {
    dalState.getRequirementById.mockResolvedValue({
      ...reportRequirement(42),
      versions: [],
    })

    await expect(
      collectRequirementListItemForReport(createReportDb(), 42),
    ).rejects.toMatchObject({
      message: 'Requirement version not found: 42',
      name: 'ReportDataError',
      status: 404,
    } satisfies Partial<ReportDataError>)
  })

  it('resolves encoded requirement identities and retains their area identity', async () => {
    dalState.getRequirementByUniqueId.mockResolvedValue({
      ...reportRequirement(42),
      area: {
        id: 3,
        name: 'Security',
        ownerHsaId: 'SE-OWNER',
      },
    })

    await expect(
      collectRequirementForReport(createReportDb(), 'KRAV%2D42'),
    ).resolves.toMatchObject({
      area: {
        id: 3,
        name: 'Security',
        ownerHsaId: 'SE-OWNER',
        ownerName: null,
      },
      uniqueId: 'KRAV-42',
    })
    expect(dalState.getRequirementByUniqueId).toHaveBeenCalledWith(
      expect.anything(),
      'KRAV-42',
    )
  })

  it('returns a 404 for a missing requirement even when decoding fails', async () => {
    dalState.getRequirementByUniqueId.mockResolvedValue(null)

    await expect(
      collectRequirementForReport(createReportDb(), '%E0%A4%A'),
    ).rejects.toMatchObject({
      message: 'Requirement not found: %E0%A4%A',
      status: 404,
    })
    expect(dalState.getRequirementByUniqueId).toHaveBeenCalledWith(
      expect.anything(),
      '%E0%A4%A',
    )
  })

  it('maps suggestions and rejects them when their requirement disappears', async () => {
    dalState.getRequirementById.mockResolvedValue(reportRequirement(42))
    dalState.listSuggestionsForRequirement.mockResolvedValue([
      {
        content: 'Tighten wording',
        createdAt: '2026-05-02T00:00:00.000Z',
        createdBy: 'reviewer',
        id: 8,
        isReviewRequested: 1,
        requirementVersionId: 42,
        resolution: null,
        resolutionMotivation: null,
        resolvedAt: null,
        resolvedBy: null,
      },
    ])

    await expect(
      collectSuggestionsForReport(createReportDb(), 42),
    ).resolves.toEqual([
      expect.objectContaining({ content: 'Tighten wording', id: 8 }),
    ])

    dalState.getRequirementById.mockResolvedValueOnce(null)
    await expect(
      collectSuggestionsForReport(createReportDb(), 99),
    ).rejects.toMatchObject({
      message: 'Requirement not found: 99',
      status: 404,
    })
  })

  it('loads report batches concurrently while preserving input order', async () => {
    dalState.getRequirementById.mockImplementation(async (_db, id: number) => ({
      ...reportRequirement(id),
      versions: [reportVersion(id, STATUS_PUBLISHED)],
    }))
    const ids = Array.from({ length: 10 }, (_, index) => index + 1)

    const [requirements, listItems] = await Promise.all([
      collectMultipleRequirementsForReport(createReportDb(), ids),
      collectMultipleRequirementListItemsForReport(createReportDb(), ids),
    ])

    expect(requirements.map(item => item.id)).toEqual(ids)
    expect(listItems.map(item => item.id)).toEqual(ids)
  })

  it('maps complete deviation metadata and rejects when no review is active', async () => {
    dalState.getRequirementById.mockResolvedValue({
      ...reportRequirement(42),
      versions: [
        {
          ...reportVersion(10),
          category: { nameEn: 'Business', nameSv: 'Verksamhet' },
          qualityCharacteristic: { nameEn: 'Security', nameSv: 'Säkerhet' },
          statusColor: '#123456',
          statusIconName: 'CircleAlert',
          statusNameEn: '',
          statusNameSv: '',
          type: { nameEn: 'Functional', nameSv: 'Funktionellt' },
          versionNormReferences: [
            { normReference: null },
            {
              normReference: {
                name: 'ISO 27001',
                reference: 'A.1',
                uri: null,
              },
            },
          ],
          versionRequirementPackages: [
            { requirementPackage: null },
            { requirementPackage: { name: 'Base package' } },
          ],
        },
      ],
    })
    dalState.listDeviationsForSpecificationItem.mockResolvedValue([
      {
        createdAt: '2026-05-02T00:00:00.000Z',
        createdBy: 'reviewer',
        decision: null,
        id: 7,
        isReviewRequested: 1,
        motivation: 'Needs review',
        requirementVersionId: 10,
        specificationCode: 'SPEC',
        specificationName: 'Spec',
      },
    ])

    await expect(
      collectDeviationForReport(createReportDb(), 42, '55', 'en'),
    ).resolves.toMatchObject({
      version: {
        category: { nameEn: 'Business' },
        normReferences: [{ name: 'ISO 27001' }],
        qualityCharacteristic: { nameEn: 'Security' },
        requirementPackages: [{ name: 'Base package' }],
        status: { color: '#123456', iconName: 'CircleAlert', label: 'Unknown' },
        type: { nameEn: 'Functional' },
      },
    })

    dalState.listDeviationsForSpecificationItem.mockResolvedValueOnce([
      { decision: 'approved', isReviewRequested: 1 },
    ])
    await expect(
      collectDeviationForReport(createReportDb(), 42, '55', 'en'),
    ).rejects.toMatchObject({
      message: 'No deviation in review found',
      status: 404,
    })
  })
})
