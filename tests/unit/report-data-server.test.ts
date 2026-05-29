import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  collectDeviationForReport,
  type ReportDataError,
} from '@/lib/reports/data/server'

const dalState = vi.hoisted(() => ({
  getOwnerById: vi.fn(),
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

vi.mock('@/lib/dal/owners', () => ({
  getOwnerById: dalState.getOwnerById,
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

function reportVersion(id: number) {
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
    status: 3,
    statusColor: null,
    statusIconName: null,
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    type: null,
    verificationMethod: null,
    versionNormReferences: [],
    versionNumber: id,
    versionRequirementPackages: [],
  }
}

function createReportDb(): SqlServerDatabase {
  // This ReportDataError test only needs collectDeviationForReport to forward db into mocked DAL calls.
  return {} as Partial<SqlServerDatabase> as SqlServerDatabase
}

describe('report data server helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dalState.getOwnerById.mockResolvedValue(null)
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
})
