import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  collectDeviationForReport,
  collectPublishedRequirementForReport,
  collectSpecificationItemsForReport,
  type ReportDataError,
} from '@/lib/reports/data/server'
import {
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

const dalState = vi.hoisted(() => ({
  getRequirementById: vi.fn(),
  getRequirementByUniqueId: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  getSpecificationItemById: vi.fn(),
  getSpecificationLocalRequirementDetail: vi.fn(),
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
  getSpecificationById: dalState.getSpecificationById,
  getSpecificationBySlug: dalState.getSpecificationBySlug,
  getSpecificationItemById: dalState.getSpecificationItemById,
  getSpecificationLocalRequirementDetail:
    dalState.getSpecificationLocalRequirementDetail,
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
    requiresTesting: false,
    riskLevel: null,
    status,
    statusColor: null,
    statusIconName: null,
    statusNameEn: status === STATUS_PUBLISHED ? 'Published' : 'Draft',
    statusNameSv: status === STATUS_PUBLISHED ? 'Publicerad' : 'Utkast',
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

function localRequirement(id: number) {
  return {
    acceptanceCriteria: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    description: `Local ${id}`,
    id,
    normReferences: [],
    qualityCharacteristic: null,
    requirementCategory: null,
    requirementPackages: [],
    requirementType: null,
    requiresTesting: false,
    riskLevel: null,
    uniqueId: `LOCAL-${id}`,
    updatedAt: '2026-05-01T00:00:00.000Z',
    verificationMethod: null,
  }
}

function specification() {
  return {
    id: 5,
    name: 'Specification',
    slug: 'specification',
    uniqueId: 'SPEC-1',
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

  it('loads specification report items concurrently after validating refs', async () => {
    const spec = specification()
    let activeFetches = 0
    let maxActiveFetches = 0
    async function trackFetch<T>(value: T): Promise<T> {
      activeFetches += 1
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
      try {
        await new Promise(resolve => setTimeout(resolve, 0))
        return value
      } finally {
        activeFetches -= 1
      }
    }

    dalState.getSpecificationBySlug.mockResolvedValue(spec)
    dalState.parseSpecificationItemRef.mockImplementation((value: string) => {
      const match = /^(lib|local):(\d+)$/.exec(value)
      if (!match) {
        return null
      }

      return {
        id: Number(match[2]),
        kind: match[1] === 'lib' ? 'library' : 'specificationLocal',
      }
    })
    dalState.getSpecificationItemById.mockImplementation(
      async (_db: SqlServerDatabase, itemId: number) => ({
        id: itemId,
        requirementId: itemId + 100,
        specificationId: spec.id,
      }),
    )
    dalState.getRequirementById.mockImplementation(
      async (_db: SqlServerDatabase, requirementId: number) =>
        trackFetch(reportRequirement(requirementId)),
    )
    dalState.getSpecificationLocalRequirementDetail.mockImplementation(
      async (
        _db: SqlServerDatabase,
        _specificationId: number,
        localRequirementId: number,
      ) => trackFetch(localRequirement(localRequirementId)),
    )

    const result = await collectSpecificationItemsForReport(
      createReportDb(),
      'specification',
      ['lib:1', 'local:7', 'lib:2', 'local:8'],
    )

    expect(result.specification).toBe(spec)
    expect(result.requirements.map(requirement => requirement.id)).toEqual([
      101, 7, 102, 8,
    ])
    expect(maxActiveFetches).toBeGreaterThan(1)
  })

  it('shapes requirement list report data to the latest published version only', async () => {
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
      collectPublishedRequirementForReport(createReportDb(), 42),
    ).resolves.toMatchObject({
      id: 42,
      versions: [{ status: STATUS_PUBLISHED, versionNumber: 3 }],
    })
  })

  it('rejects requirement list report data when no published version exists', async () => {
    dalState.getRequirementById.mockResolvedValue({
      ...reportRequirement(42),
      versions: [
        reportVersion(2, STATUS_REVIEW),
        reportVersion(4, STATUS_DRAFT),
      ],
    })

    await expect(
      collectPublishedRequirementForReport(createReportDb(), 42),
    ).rejects.toMatchObject({
      message: 'Published requirement not found: 42',
      name: 'ReportDataError',
      status: 404,
    } satisfies Partial<ReportDataError>)
  })

  it('keeps specification report invalid item ref errors', async () => {
    dalState.getSpecificationBySlug.mockResolvedValue(specification())

    await expect(
      collectSpecificationItemsForReport(createReportDb(), 'specification', [
        'bad-ref',
      ]),
    ).rejects.toMatchObject({
      message: 'Invalid item ref: bad-ref',
      name: 'ReportDataError',
      status: 400,
    } satisfies Partial<ReportDataError>)
    expect(dalState.getSpecificationItemById).not.toHaveBeenCalled()
    expect(
      dalState.getSpecificationLocalRequirementDetail,
    ).not.toHaveBeenCalled()
  })

  it('keeps specification report missing local item errors', async () => {
    dalState.getSpecificationBySlug.mockResolvedValue(specification())
    dalState.parseSpecificationItemRef.mockReturnValue({
      id: 7,
      kind: 'specificationLocal',
    })
    dalState.getSpecificationLocalRequirementDetail.mockResolvedValue(null)

    await expect(
      collectSpecificationItemsForReport(createReportDb(), 'specification', [
        'local:7',
      ]),
    ).rejects.toMatchObject({
      message: 'Item not found in specification: local:7',
      name: 'ReportDataError',
      status: 404,
    } satisfies Partial<ReportDataError>)
  })
})
