import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  collectDeviationForReport,
  collectRequirementListItemForReport,
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
        specificationName: 'Spec',
        specificationUniqueId: 'SPEC',
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

  it('parses library and numeric item refs for deviation reports', () => {
    dalState.parseSpecificationItemRef.mockImplementation((value: string) =>
      value === 'lib:55' ? { id: 55, kind: 'library' } : null,
    )

    expect(parseLibrarySpecificationItemId('lib%3A55')).toBe(55)
    expect(parseLibrarySpecificationItemId('77')).toBe(77)
  })

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
})
