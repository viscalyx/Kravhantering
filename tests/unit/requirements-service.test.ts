import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import {
  conflictError,
  forbiddenError,
  invalidCursorError,
} from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => ({
  approveArchiving: vi.fn(),
  cancelArchiving: vi.fn(),
  canAuthorArea: vi.fn(),
  canAuthorSpecification: vi.fn(),
  countDeviationsBySpecification: vi.fn(),
  countSuggestionsByRequirement: vi.fn(),
  createDeviation: vi.fn(),
  initiateArchiving: vi.fn(),
  countRequirements: vi.fn(),
  createRequirement: vi.fn(),
  createSuggestion: vi.fn(),
  deleteDeviation: vi.fn(),
  deleteDraftVersion: vi.fn(),
  deleteSuggestion: vi.fn(),
  editRequirement: vi.fn(),
  findSpecificationIdentity: vi.fn(),
  getAreaById: vi.fn(),
  getRequirementById: vi.fn(),
  getRequirementByUniqueId: vi.fn(),
  getSpecificationLocalRequirementDetail: vi.fn(),
  getVersionHistory: vi.fn(),
  graduateSpecificationLocalRequirementToLibrary: vi.fn(),
  listAreas: vi.fn(),
  listAreasActorCanAuthor: vi.fn(),
  listCategories: vi.fn(),
  listRequirements: vi.fn(),
  listRequirementPackages: vi.fn(),
  listPriorityLevels: vi.fn(),
  listSpecificationItemStatuses: vi.fn(),
  listStatuses: vi.fn(),
  listTransitions: vi.fn(),
  listSpecifications: vi.fn(),
  listSpecificationsForActorCatalog: vi.fn(),
  querySpecificationItemPage: vi.fn(),
  getPublishedVersionIdForRequirement: vi.fn(),
  getOrCreateSpecificationNeedsReference: vi.fn(),
  linkRequirementsToSpecificationAtomically: vi.fn(),
  linkRequirementsToSpecification: vi.fn(),
  listDeviationsForSpecification: vi.fn(),
  unlinkRequirementsFromSpecification: vi.fn(),
  listSuggestionsForRequirement: vi.fn(),
  listQualityCharacteristics: vi.fn(),
  listTypes: vi.fn(),
  reactivateRequirement: vi.fn(),
  recordDecision: vi.fn(),
  recordResolution: vi.fn(),
  requestReview: vi.fn(),
  revertToDraft: vi.fn(),
  restoreVersion: vi.fn(),
  transitionStatus: vi.fn(),
  updateDeviation: vi.fn(),
  updateSuggestion: vi.fn(),
  auditQuery: vi.fn(),
  auditTransaction: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  canAuthorArea: mocks.canAuthorArea,
  getAreaById: mocks.getAreaById,
  listAreasActorCanAuthor: mocks.listAreasActorCanAuthor,
  listAreas: mocks.listAreas,
}))

vi.mock('@/lib/dal/requirement-categories', () => ({
  listCategories: mocks.listCategories,
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsBySpecification: mocks.countDeviationsBySpecification,
  createDeviation: mocks.createDeviation,
  deleteDeviation: mocks.deleteDeviation,
  DEVIATION_APPROVED: 1,
  DEVIATION_REJECTED: 2,
  listDeviationsForSpecification: mocks.listDeviationsForSpecification,
  recordDecision: mocks.recordDecision,
  updateDeviation: mocks.updateDeviation,
}))

vi.mock('@/lib/dal/improvement-suggestions', () => ({
  countSuggestionsByRequirement: mocks.countSuggestionsByRequirement,
  createSuggestion: mocks.createSuggestion,
  deleteSuggestion: mocks.deleteSuggestion,
  listSuggestionsForRequirement: mocks.listSuggestionsForRequirement,
  recordResolution: mocks.recordResolution,
  requestReview: mocks.requestReview,
  revertToDraft: mocks.revertToDraft,
  SUGGESTION_DISMISSED: 2,
  SUGGESTION_RESOLVED: 1,
  updateSuggestion: mocks.updateSuggestion,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  canAuthorSpecification: mocks.canAuthorSpecification,
  findSpecificationIdentity: mocks.findSpecificationIdentity,
  graduateSpecificationLocalRequirementToLibrary:
    mocks.graduateSpecificationLocalRequirementToLibrary,
  getOrCreateSpecificationNeedsReference:
    mocks.getOrCreateSpecificationNeedsReference,
  getSpecificationLocalRequirementDetail:
    mocks.getSpecificationLocalRequirementDetail,
  getPublishedVersionIdForRequirement:
    mocks.getPublishedVersionIdForRequirement,
  linkRequirementsToSpecificationAtomically:
    mocks.linkRequirementsToSpecificationAtomically,
  linkRequirementsToSpecification: mocks.linkRequirementsToSpecification,
  listSpecifications: mocks.listSpecifications,
  listSpecificationsForActorCatalog: mocks.listSpecificationsForActorCatalog,
  unlinkRequirementsFromSpecification:
    mocks.unlinkRequirementsFromSpecification,
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: mocks.listRequirementPackages,
}))

vi.mock('@/lib/dal/priority-levels', () => ({
  listPriorityLevels: mocks.listPriorityLevels,
}))

vi.mock('@/lib/dal/specification-item-statuses', () => ({
  listSpecificationItemStatuses: mocks.listSpecificationItemStatuses,
}))

vi.mock('@/lib/requirements/specification-item-page', () => ({
  querySpecificationItemPage: mocks.querySpecificationItemPage,
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  listStatuses: mocks.listStatuses,
  listTransitions: mocks.listTransitions,
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  listQualityCharacteristics: mocks.listQualityCharacteristics,
  listTypes: mocks.listTypes,
}))

vi.mock('@/lib/dal/requirements', () => ({
  approveArchiving: mocks.approveArchiving,
  cancelArchiving: mocks.cancelArchiving,
  initiateArchiving: mocks.initiateArchiving,
  countRequirements: mocks.countRequirements,
  createRequirement: mocks.createRequirement,
  deleteDraftVersion: mocks.deleteDraftVersion,
  editRequirement: mocks.editRequirement,
  getRequirementById: mocks.getRequirementById,
  getRequirementByUniqueId: mocks.getRequirementByUniqueId,
  getVersionHistory: mocks.getVersionHistory,
  listRequirements: mocks.listRequirements,
  reactivateRequirement: mocks.reactivateRequirement,
  restoreVersion: mocks.restoreVersion,
  transitionStatus: mocks.transitionStatus,
}))

import { createRequirementsService } from '@/lib/requirements/service'
import {
  buildRequirementViewUri,
  formatRequirementDetail,
  formatRequirementListItem,
} from '@/lib/requirements/service-requirements'

function makeRequirementRecord() {
  return {
    area: {
      id: 1,
      name: 'Integration',
      ownerHsaId: 'SE5560000001-alice1',
      prefix: 'INT',
    },
    createdAt: '2026-03-08T00:00:00.000Z',
    id: 1,
    isArchived: false,
    specificationCount: 0,
    uniqueId: 'INT0001',
    versions: [
      {
        acceptanceCriteria: 'Must respond in 2s',
        archivedAt: null,
        category: {
          id: 1,
          nameEn: 'Business requirement',
          nameSv: 'Verksamhetskrav',
        },
        createdAt: '2026-03-08T00:00:00.000Z',
        createdBy: 'alice',
        description: 'Support secure integration',
        cursorBoundary: {
          nullRank: 0,
          requirementId: 1,
          sortValue: 'INT0001',
        },
        editedAt: '2026-03-08T00:00:00.000Z',
        id: 10,
        publishedAt: null,
        verifiable: true,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        type: {
          id: 1,
          nameEn: 'Functional',
          nameSv: 'Funktionellt',
        },
        qualityCharacteristic: {
          id: 9,
          nameEn: 'Security',
          nameSv: 'Sakerhet',
        },
        versionNumber: 1,
        versionRequirementPackages: [
          {
            requirementPackage: {
              description: 'A login flow',
              id: 7,
              name: 'Login',
              ownerId: 1,
            },
          },
        ],
        versionNormReferences: [],
      },
    ],
  }
}

function makeRequirementRecordWithPublishedVersion() {
  return {
    ...makeRequirementRecord(),
    versions: [
      {
        ...makeRequirementRecord().versions[0],
        description: 'Draft update pending review',
        id: 11,
        publishedAt: null,
        status: 1,
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        versionNumber: 2,
      },
      {
        ...makeRequirementRecord().versions[0],
        description: 'Published integration baseline',
        id: 10,
        publishedAt: '2026-03-07T00:00:00.000Z',
        status: 3,
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        versionNumber: 1,
      },
    ],
  }
}

function makeContext() {
  return {
    actor: {
      id: 'alice',
      displayName: 'alice',
      hsaId: 'SE5560000001-alice1',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc' as const,
    },
    correlationId: 'corr-1',
    requestId: 'req-1',
    source: 'rest' as const,
  }
}

describe('createRequirementsService', () => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  }
  let infoSpy: ReturnType<typeof vi.spyOn>

  function createTestRequirementsService() {
    return createRequirementsService(
      {
        query: mocks.auditQuery,
        transaction: mocks.auditTransaction,
      } as never,
      {
        authorization: { assertAuthorized: vi.fn(async () => {}) },
        logger,
      },
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.countDeviationsBySpecification.mockResolvedValue({
      approved: 0,
      pending: 0,
      rejected: 0,
      total: 0,
    })
    mocks.countSuggestionsByRequirement.mockResolvedValue({
      dismissed: 0,
      pending: 0,
      resolved: 0,
      total: 0,
    })
    mocks.createDeviation.mockResolvedValue({ id: 5 })
    mocks.createSuggestion.mockResolvedValue({ id: 6 })
    mocks.deleteDeviation.mockResolvedValue(undefined)
    mocks.deleteSuggestion.mockResolvedValue(undefined)
    mocks.findSpecificationIdentity.mockImplementation(async (_db, id) => ({
      id,
    }))
    mocks.canAuthorArea.mockResolvedValue(true)
    mocks.canAuthorSpecification.mockResolvedValue(true)
    mocks.listRequirements.mockResolvedValue([])
    mocks.listPriorityLevels.mockResolvedValue([])
    mocks.listSpecificationItemStatuses.mockResolvedValue([])
    mocks.countRequirements.mockResolvedValue(0)
    mocks.getRequirementById.mockResolvedValue(makeRequirementRecord())
    mocks.getRequirementByUniqueId.mockResolvedValue(makeRequirementRecord())
    mocks.getVersionHistory.mockResolvedValue([])
    mocks.getAreaById.mockResolvedValue({
      id: 1,
      name: 'Integration',
      ownerHsaId: 'SE5560000001-alice1',
      prefix: 'INT',
    })
    const createRequirementResult = {
      requirement: { id: 1, uniqueId: 'INT0001' },
      version: { id: 10, versionNumber: 1 },
    }
    mocks.createRequirement.mockImplementation(async (_db, _data, options) => {
      await options?.audit?.(
        { query: mocks.auditQuery },
        createRequirementResult,
      )
      return createRequirementResult
    })
    mocks.editRequirement.mockImplementation(
      async (_db, _id, _data, options) => {
        const result = { id: 10, versionNumber: 2 }
        await options?.audit?.({ query: mocks.auditQuery }, result)
        return result
      },
    )
    mocks.getOrCreateSpecificationNeedsReference.mockResolvedValue(44)
    mocks.getSpecificationLocalRequirementDetail.mockResolvedValue({
      id: 12,
      itemRef: 'local:12',
      specificationItemStatusId: 1,
      uniqueId: 'KRAV0001',
    })
    mocks.graduateSpecificationLocalRequirementToLibrary.mockResolvedValue({
      requirement: {
        id: 2,
        requirementAreaId: 1,
        sequenceNumber: 1,
        uniqueId: 'INT0001',
      },
      sourceLocalRequirement: {
        id: 12,
        specificationId: 7,
        uniqueId: 'KRAV0001',
      },
      version: {
        id: 20,
        requirementId: 2,
        statusId: 1,
        versionNumber: 1,
      },
    })
    mocks.getPublishedVersionIdForRequirement.mockResolvedValue(101)
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(0)
    mocks.linkRequirementsToSpecification.mockResolvedValue(0)
    mocks.listDeviationsForSpecification.mockResolvedValue([])
    mocks.listAreasActorCanAuthor.mockResolvedValue([
      {
        id: 1,
        name: 'Integration',
        ownerHsaId: 'SE5560000001-alice1',
        prefix: 'INT',
      },
    ])
    mocks.querySpecificationItemPage.mockResolvedValue({
      items: [],
      pagination: { count: 0, hasMore: false, limit: 50, nextCursor: null },
    })
    mocks.listSpecifications.mockResolvedValue([])
    mocks.listSuggestionsForRequirement.mockResolvedValue([])
    mocks.recordDecision.mockResolvedValue(undefined)
    mocks.recordResolution.mockResolvedValue(undefined)
    mocks.requestReview.mockResolvedValue(undefined)
    mocks.revertToDraft.mockResolvedValue(undefined)
    mocks.initiateArchiving.mockImplementation(async (_db, _id, options) => {
      await options?.audit?.({ query: mocks.auditQuery }, undefined)
    })
    mocks.approveArchiving.mockImplementation(async (_db, _id, options) => {
      await options?.audit?.({ query: mocks.auditQuery }, undefined)
    })
    mocks.cancelArchiving.mockImplementation(async (_db, _id, options) => {
      await options?.audit?.({ query: mocks.auditQuery }, undefined)
    })
    mocks.deleteDraftVersion.mockImplementation(async (_db, _id, options) => {
      const result = {
        deleted: [
          {
            requirementUniqueId: 'INT0001',
            type: 'draftRequirementVersion' as const,
            versionNumber: 2,
          },
        ],
      }
      await options?.audit?.({ query: mocks.auditQuery }, result)
      return result
    })
    mocks.restoreVersion.mockImplementation(
      async (_db, _requirementId, _versionId, _createdBy, _hsaId, options) => {
        const result = { id: 22, versionNumber: 4 }
        await options?.audit?.({ query: mocks.auditQuery }, result)
        return result
      },
    )
    mocks.reactivateRequirement.mockImplementation(
      async (_db, _requirementId, _createdBy, _hsaId, options) => {
        const result = { id: 23, versionNumber: 5 }
        await options?.audit?.({ query: mocks.auditQuery }, result)
        return result
      },
    )
    mocks.transitionStatus.mockImplementation(
      async (_db, _requirementId, _toStatusId, options) => {
        const result = { id: 10, versionNumber: 1 }
        await options?.audit?.({ query: mocks.auditQuery }, result)
        return result
      },
    )
    mocks.unlinkRequirementsFromSpecification.mockResolvedValue(0)
    mocks.updateDeviation.mockResolvedValue(undefined)
    mocks.updateSuggestion.mockResolvedValue(undefined)
    mocks.auditQuery.mockImplementation(async (sql: string) =>
      sql.includes('SELECT TOP (1) unique_id') ? [{ uniqueId: 'INT0001' }] : [],
    )
    mocks.auditTransaction.mockImplementation(async (...args: unknown[]) => {
      const callback = typeof args[0] === 'function' ? args[0] : args[1]
      if (typeof callback !== 'function') {
        throw new Error('Expected transaction callback')
      }
      return callback({ query: mocks.auditQuery })
    })
    mocks.getRequestSqlServerDataSource.mockResolvedValue({
      query: mocks.auditQuery,
      transaction: mocks.auditTransaction,
    })
  })

  afterEach(() => {
    infoSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  function emittedSecurityEvents(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls
      .map(
        (call: unknown[]) =>
          JSON.parse(String(call[0])) as Record<string, unknown>,
      )
      .filter(
        (event: Record<string, unknown>) => event.channel === 'security-audit',
      )
  }

  function emittedCapacityEvents(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(String(call[0])) as Record<string, unknown>
        } catch {
          return {}
        }
      })
      .filter(
        (event: Record<string, unknown>) =>
          event.channel === 'capacity-observability',
      )
  }

  it('returns structured requirements library list results', async () => {
    mocks.listRequirements.mockResolvedValue([
      {
        acceptanceCriteria: 'Must respond in 2s',
        areaName: 'Integration',
        categoryNameEn: 'Business requirement',
        categoryNameSv: 'Verksamhetskrav',
        createdAt: '2026-03-08T00:00:00.000Z',
        cursorBoundary: {
          nullRank: 0,
          requirementId: 1,
          sortValue: 'INT0001',
        },
        description: 'Support secure integration',
        id: 1,
        isArchived: false,
        maxVersion: 2,
        pendingVersionStatusColor: '#eab308',
        pendingVersionStatusId: 2,
        requirementAreaId: 1,
        requirementCategoryId: 1,
        qualityCharacteristicId: 9,
        requirementTypeId: 1,
        verifiable: true,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        qualityCharacteristicNameEn: 'Security',
        qualityCharacteristicNameSv: 'Sakerhet',
        typeNameEn: 'Functional',
        typeNameSv: 'Funktionellt',
        uniqueId: 'INT0001',
        versionCreatedAt: '2026-03-08T00:00:00.000Z',
        versionId: 10,
        versionNumber: 1,
      },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
      operation: 'list',
    })

    expect(result.result).toHaveLength(1)
    expect(result.result[0]).toMatchObject({
      hasPendingVersion: true,
      uniqueId: 'INT0001',
    })
  })

  it('preserves archived rows with pending replacement versions in queryCatalog results', async () => {
    mocks.listRequirements.mockResolvedValue([
      {
        acceptanceCriteria: 'Archived acceptance criteria',
        areaName: 'Integration',
        categoryNameEn: null,
        categoryNameSv: null,
        createdAt: '2026-03-08T00:00:00.000Z',
        description: 'Archived baseline',
        id: 2,
        isArchived: true,
        maxVersion: 2,
        pendingVersionStatusColor: '#3b82f6',
        pendingVersionStatusId: 1,
        requirementAreaId: 1,
        requirementCategoryId: null,
        qualityCharacteristicId: null,
        requirementTypeId: null,
        verifiable: false,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
        qualityCharacteristicNameEn: null,
        qualityCharacteristicNameSv: null,
        typeNameEn: null,
        typeNameSv: null,
        uniqueId: 'INT0002',
        versionCreatedAt: '2026-03-01T00:00:00.000Z',
        versionId: 20,
        versionNumber: 1,
      },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
      operation: 'list',
    })

    expect(result.result[0]).toMatchObject({
      hasPendingVersion: true,
      isArchived: true,
      pendingVersionStatusId: 1,
      uniqueId: 'INT0002',
      version: {
        description: 'Archived baseline',
        status: 4,
        statusNameEn: 'Archived',
        versionNumber: 1,
      },
    })
  })

  it('passes locale-aware sorting options to the DAL query', async () => {
    const service = createTestRequirementsService()

    await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
      locale: 'sv',
      operation: 'list',
      sortBy: 'status',
      sortDirection: 'desc',
    })

    expect(mocks.listRequirements).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locale: 'sv',
        sortBy: 'status',
        sortDirection: 'desc',
      }),
    )
  })

  it('searches requirements across id, uniqueId, description, and acceptance criteria', async () => {
    mocks.listRequirements.mockResolvedValue([
      {
        acceptanceCriteria: 'Must respond in 2s',
        areaName: 'Integration',
        categoryNameEn: 'Business requirement',
        categoryNameSv: 'Verksamhetskrav',
        createdAt: '2026-03-08T00:00:00.000Z',
        description: 'Support secure integration',
        id: 10,
        isArchived: false,
        maxVersion: 1,
        matchedFields: ['version.acceptanceCriteria'],
        pendingVersionStatusColor: null,
        pendingVersionStatusId: null,
        requirementAreaId: 1,
        requirementCategoryId: 1,
        qualityCharacteristicId: 9,
        requirementTypeId: 1,
        verifiable: true,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        qualityCharacteristicNameEn: 'Security',
        qualityCharacteristicNameSv: 'Sakerhet',
        typeNameEn: 'Functional',
        typeNameSv: 'Funktionellt',
        uniqueId: 'INT0001',
        versionCreatedAt: '2026-03-08T00:00:00.000Z',
        versionId: 10,
        versionNumber: 1,
      },
    ])

    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
      operation: 'search',
      search: '2s',
    })

    expect(result.result).toEqual([
      expect.objectContaining({
        match: {
          matchedFields: ['version.acceptanceCriteria'],
        },
        uniqueId: 'INT0001',
      }),
    ])
    expect(mocks.listRequirements).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 51, search: '2s' }),
    )
  })

  it('lists status catalog rows as structured results', async () => {
    mocks.listStatuses.mockResolvedValue([
      {
        color: '#22c55e',
        id: 3,
        isSystem: true,
        nameEn: 'Published',
        nameSv: 'Publicerad',
        sortOrder: 3,
      },
    ])

    const service = createTestRequirementsService()

    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
      locale: 'en',
      operation: 'list',
    })

    expect(result.result).toEqual([
      expect.objectContaining({
        id: 3,
        nameEn: 'Published',
      }),
    ])
  })

  it('creates a requirement and syncs references', async () => {
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      operation: 'create',
      requirement: {
        areaId: 1,
        description: '  Support secure integration  ',
        requirementPackageIds: [7],
      },
    })

    expect(mocks.createRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        description: 'Support secure integration',
        requirementAreaId: 1,
        requirementPackageIds: [7],
      }),
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(result.detail?.uniqueId).toBe('INT0001')
  })

  it('restores by version number using the underlying version id', async () => {
    mocks.getVersionHistory.mockResolvedValue([
      {
        id: 44,
        versionNumber: 3,
      },
    ])

    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'restore_version',
      versionNumber: 3,
    })

    expect(mocks.restoreVersion).toHaveBeenCalledWith(
      expect.anything(),
      1,
      44,
      'alice',
      'SE5560000001-alice1',
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(result.result).toMatchObject({ id: 22, versionNumber: 4 })
  })

  it('returns only the latest published version for the default detail view', async () => {
    mocks.getRequirementById.mockResolvedValueOnce(
      makeRequirementRecordWithPublishedVersion(),
    )
    const service = createTestRequirementsService()

    const result = await service.getRequirement(makeContext(), {
      id: 1,
      view: 'detail',
    })

    expect(result.requirement.versions).toHaveLength(1)
    expect(result.requirement.specificationCount).toBe(0)
    expect(result.requirement.versions[0]).toMatchObject({
      statusNameEn: 'Published',
      versionNumber: 1,
    })
    expect(result.requirementResourceUri).toBe(
      'requirements://requirement/INT0001?version=1',
    )
  })

  it('returns an explicit non-published version only when requested', async () => {
    mocks.getRequirementById.mockResolvedValueOnce(
      makeRequirementRecordWithPublishedVersion(),
    )
    const service = createTestRequirementsService()

    const result = await service.getRequirement(makeContext(), {
      id: 1,
      versionNumber: 2,
      view: 'version',
    })

    expect(result.requirement.versions).toHaveLength(1)
    expect(result.requirement.versions[0]).toMatchObject({
      statusNameEn: 'Draft',
      versionNumber: 2,
    })
    expect(result.version).toMatchObject({
      statusNameEn: 'Draft',
      versionNumber: 2,
    })
  })

  it('returns not_found when no published version exists for the default detail view', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.getRequirement(makeContext(), {
        id: 1,
        view: 'detail',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'No published version exists for this requirement',
      status: 404,
    })
  })

  it('returns not_found when a requested version is missing', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.getRequirement(makeContext(), {
        id: 1,
        versionNumber: 99,
        view: 'version',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    })
  })

  it('applies authorization hooks before executing operations', async () => {
    const authorization = {
      assertAuthorized: vi.fn().mockRejectedValueOnce(
        forbiddenError('Blocked by policy', {
          reason: 'policy_missing',
          requiredRoles: ['Admin'],
        }),
      ),
    }
    const service = createRequirementsService({} as never, {
      authorization,
      logger,
    })

    await expect(
      service.queryCatalog(makeContext(), {
        catalog: 'requirements',
        operation: 'list',
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Blocked by policy',
    })
    expect(authorization.assertAuthorized).toHaveBeenCalled()
    expect(mocks.auditQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO action_audit_events'),
      expect.arrayContaining([
        'query_catalog.denied',
        'query_catalog',
        'denied',
        'policy_missing',
      ]),
    )
    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        actor: expect.objectContaining({ source: 'oidc', sub: 'alice' }),
        detail: expect.objectContaining({
          actionKind: 'query_catalog',
          catalog: 'requirements',
          errorCode: 'forbidden',
          reason: 'policy_missing',
          requiredRoles: ['Admin'],
          requestSource: 'rest',
        }),
        event: 'auth.authorization.denied',
        outcome: 'failure',
        request: expect.objectContaining({ requestId: 'req-1' }),
      }),
    ])
  })

  it('fails closed for MCP when required denial evidence cannot persist', async () => {
    const authorization = {
      assertAuthorized: vi.fn().mockRejectedValueOnce(
        forbiddenError('Blocked by policy', {
          reason: 'policy_missing',
          requiredRoles: ['Admin'],
        }),
      ),
    }
    mocks.auditQuery.mockRejectedValueOnce(
      new Error('DATABASE_URL password=supersecret rejected the audit insert'),
    )
    const service = createRequirementsService({} as never, {
      authorization,
      logger,
    })
    const mcpContext = {
      ...makeContext(),
      actor: {
        ...makeContext().actor,
        source: 'mcp' as const,
      },
      source: 'mcp' as const,
      toolName: 'requirements_query_catalog',
    }

    await expect(
      service.queryCatalog(mcpContext, {
        catalog: 'requirements',
        operation: 'list',
      }),
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'An internal error occurred',
      status: 500,
    })

    expect(mocks.listRequirements).not.toHaveBeenCalled()
    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        event: 'auth.authorization.denied',
      }),
      expect.objectContaining({
        detail: expect.objectContaining({
          auditFailure: 'denied_action_audit_write_failed',
          requestSource: 'mcp',
          toolName: 'requirements_query_catalog',
        }),
        event: 'auth.authorization.denied.audit_failed',
      }),
    ])
    expect(JSON.stringify(emittedSecurityEvents())).not.toContain('supersecret')
  })

  it('queries areas catalog', async () => {
    mocks.listAreas.mockResolvedValue([{ id: 1, prefix: 'A', name: 'Area A' }])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'areas',
      operation: 'list',
    })
    expect(result.result).toHaveLength(1)
  })

  it('queries categories catalog', async () => {
    mocks.listCategories.mockResolvedValue([
      { id: 1, nameSv: 'Kat', nameEn: 'Cat' },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'categories',
      operation: 'list',
    })
    expect(result.result).toHaveLength(1)
  })

  it('queries types catalog', async () => {
    mocks.listTypes.mockResolvedValue([
      { id: 1, nameSv: 'Typ', nameEn: 'Type' },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'types',
      operation: 'list',
    })
    expect(result.result).toHaveLength(1)
  })

  it('queries quality_characteristics catalog', async () => {
    mocks.listQualityCharacteristics.mockResolvedValue([
      { id: 1, nameSv: 'TK', nameEn: 'TC' },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'quality_characteristics',
      operation: 'list',
      typeId: 1,
    })
    expect(result.result).toHaveLength(1)
  })

  it('returns the lookup result shape for MCP lookup list operations', async () => {
    const category = { id: 1, nameSv: 'Kat', nameEn: 'Cat' }
    mocks.listCategories.mockResolvedValue([category])
    const service = createTestRequirementsService()

    const result = await service.queryCatalog(makeContext(), {
      catalog: 'categories',
      operation: 'list',
    })

    expect(result).toEqual({ result: [category] })
  })

  it('uses catalog-specific lookup fields for categories and quality characteristics', async () => {
    mocks.listCategories.mockResolvedValue([
      {
        chapterId: '3.1',
        id: 1,
        nameEn: 'Supplier requirement',
        nameSv: 'Leverantörskrav',
      } as never,
    ])
    mocks.listQualityCharacteristics.mockResolvedValue([
      {
        chapterId: '3.1.1',
        id: 11,
        nameEn: 'Functional completeness',
        nameSv: 'Funktionell fullständighet',
        parentId: 10,
        requirementTypeId: 1,
      },
    ])
    const service = createTestRequirementsService()

    await expect(
      service.queryCatalog(makeContext(), {
        catalog: 'categories',
        operation: 'search',
        search: '3.1',
      }),
    ).resolves.toEqual({ result: [] })
    await expect(
      service.queryCatalog(makeContext(), {
        catalog: 'quality_characteristics',
        operation: 'search',
        search: '3.1.1',
      }),
    ).resolves.toMatchObject({
      result: [
        expect.objectContaining({
          chapterId: '3.1.1',
          match: expect.objectContaining({
            matchedFields: ['chapterId'],
          }),
        }),
      ],
    })
  })

  it('queries statuses catalog', async () => {
    mocks.listStatuses.mockResolvedValue([
      { id: 1, nameSv: 'Utkast', nameEn: 'Draft' },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
      operation: 'list',
    })
    expect(result.result).toHaveLength(1)
  })

  it('queries requirementPackages catalog', async () => {
    mocks.listRequirementPackages.mockResolvedValue([
      {
        createdAt: '2026-04-20T20:07:00.000Z',
        description: null,
        id: 1,
        isArchived: false,
        leadDisplayName: 'Anna Owner',
        leadHsaId: 'SE5560000001-anna1',
        name: 'Mobil användning',
        updatedAt: '2026-04-20T20:07:00.000Z',
      },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirement_packages',
      operation: 'list',
    })
    expect(result.result).toHaveLength(1)
    expect(result.result[0]).toMatchObject({
      description: null,
      name: 'Mobil användning',
    })
  })

  it('queries transitions catalog', async () => {
    mocks.listTransitions.mockResolvedValue([
      {
        id: 1,
        fromStatus: { nameSv: 'Utkast', nameEn: 'Draft' },
        toStatus: { nameSv: 'Granskning', nameEn: 'Review' },
      },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'transitions',
      operation: 'list',
    })
    expect(result.result).toHaveLength(1)
  })

  it('edits a requirement', async () => {
    mocks.editRequirement.mockResolvedValue({ id: 11 })
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'edit',
      requirement: {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 10,
        description: '  Updated text  ',
      },
    })
    expect(result.operation).toBe('edit')
    expect(mocks.editRequirement).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 10,
        description: 'Updated text',
      }),
      expect.objectContaining({ audit: expect.any(Function) }),
    )
  })

  it('rejects edits without an optimistic concurrency token', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'edit',
        requirement: { description: 'Updated text' },
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'missing_edit_precondition' },
    })
    expect(mocks.editRequirement).not.toHaveBeenCalled()
  })

  it('adds the latest requirement snapshot to stale edit conflicts', async () => {
    mocks.editRequirement.mockRejectedValue(
      conflictError('This requirement was updated after you started editing.', {
        baseVersionId: 10,
        latestVersionId: 10,
        reason: 'stale_requirement_edit',
      }),
    )
    const service = createTestRequirementsService()

    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'edit',
        requirement: {
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated text',
        },
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        baseVersionId: 10,
        latest: expect.objectContaining({ uniqueId: 'INT0001' }),
        latestVersionId: 10,
        reason: 'stale_requirement_edit',
      },
    })
  })

  it('initiates archiving review for a requirement', async () => {
    mocks.initiateArchiving.mockResolvedValue(undefined)
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'archive',
    })
    expect(result.operation).toBe('archive')
    expect(mocks.initiateArchiving).toHaveBeenCalled()
  })

  it('approves archiving of a requirement', async () => {
    mocks.approveArchiving.mockResolvedValue(undefined)
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'approve_archiving',
    })
    expect(result.operation).toBe('approve_archiving')
    expect(mocks.approveArchiving).toHaveBeenCalled()
  })

  it('cancels archiving of a requirement', async () => {
    mocks.cancelArchiving.mockResolvedValue(undefined)
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'cancel_archiving',
    })
    expect(result.operation).toBe('cancel_archiving')
    expect(mocks.cancelArchiving).toHaveBeenCalled()
  })

  it('deletes a draft', async () => {
    mocks.deleteDraftVersion.mockResolvedValue({
      deleted: [
        {
          requirementUniqueId: 'INT0001',
          type: 'draftRequirementVersion',
          versionNumber: 2,
        },
        { requirementUniqueId: 'INT0001', type: 'requirement' },
      ],
    })
    mocks.getRequirementById
      .mockResolvedValueOnce(makeRequirementRecord())
      .mockResolvedValueOnce(null)
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'delete_draft',
    })
    expect(result.operation).toBe('delete_draft')
  })

  it('reactivates a requirement', async () => {
    mocks.reactivateRequirement.mockResolvedValue(undefined)
    mocks.getRequirementById.mockResolvedValue(makeRequirementRecord())
    const service = createTestRequirementsService()
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'reactivate',
    })
    expect(result.operation).toBe('reactivate')
  })

  it('transitions a requirement', async () => {
    mocks.transitionStatus.mockResolvedValue(undefined)
    mocks.getRequirementById.mockResolvedValue(
      makeRequirementRecordWithPublishedVersion(),
    )
    const service = createTestRequirementsService()
    const result = await service.transitionRequirement(makeContext(), {
      id: 1,
      toStatusId: 2,
    })
    expect(result.detail.uniqueId).toBe('INT0001')
    expect(result.version).toBeDefined()
  })

  it('returns history view with all versions', async () => {
    mocks.getRequirementByUniqueId.mockResolvedValue(
      makeRequirementRecordWithPublishedVersion(),
    )
    const service = createTestRequirementsService()
    const result = await service.getRequirement(makeContext(), {
      uniqueId: 'INT0001',
      view: 'history',
    })
    expect(result.versions).toHaveLength(2)
    expect(result.message).toContain('History')
  })

  it('searches lookup catalogs by localized names', async () => {
    mocks.listStatuses.mockResolvedValue([
      { id: 1, nameSv: 'Utkast', nameEn: 'Draft' },
    ])
    const service = createTestRequirementsService()
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
      locale: 'sv',
      operation: 'search',
      search: 'Utkast',
    })
    expect(result.result).toEqual([
      expect.objectContaining({
        match: {
          matchedFields: ['nameSv'],
          quality: 'exact',
        },
      }),
    ])
  })

  it('requires search text for search operations', async () => {
    const service = createTestRequirementsService()
    await expect(
      service.queryCatalog(makeContext(), {
        catalog: 'statuses',
        operation: 'search',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Search text is required',
    })
  })

  it('rejects edit without description', async () => {
    const service = createTestRequirementsService()
    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'edit',
        requirement: {},
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects edit with blank description', async () => {
    const service = createTestRequirementsService()
    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'edit',
        requirement: {
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: '   ',
        },
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(mocks.editRequirement).not.toHaveBeenCalled()
  })

  it('rejects missing requirement references as validation errors', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.getRequirement(makeContext(), { view: 'detail' }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Requirement reference is missing',
      status: 400,
    })
    await expect(
      service.manageRequirement(makeContext(), {
        operation: 'edit',
        requirement: { description: 'Updated text' },
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Requirement reference is missing',
      status: 400,
    })
    await expect(
      service.transitionRequirement(makeContext(), { toStatusId: 2 }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Requirement reference is missing',
      status: 400,
    })
    expect(mocks.getRequirementById).not.toHaveBeenCalled()
    expect(mocks.getRequirementByUniqueId).not.toHaveBeenCalled()
  })

  it('rejects create without areaId', async () => {
    const service = createTestRequirementsService()
    await expect(
      service.manageRequirement(makeContext(), {
        operation: 'create',
        requirement: { description: 'test' },
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects create with blank description', async () => {
    const service = createTestRequirementsService()
    await expect(
      service.manageRequirement(makeContext(), {
        operation: 'create',
        requirement: { areaId: 1, description: '   ' },
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(mocks.createRequirement).not.toHaveBeenCalled()
  })

  it('rejects restore_version when version not found', async () => {
    mocks.getVersionHistory.mockResolvedValue([{ id: 10, versionNumber: 1 }])
    const service = createTestRequirementsService()
    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'restore_version',
        versionNumber: 99,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(mocks.restoreVersion).not.toHaveBeenCalled()
  })

  it('rejects restore_version without a valid versionNumber before reading history', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'restore_version',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Missing or invalid versionNumber',
      status: 400,
    })
    expect(mocks.getVersionHistory).not.toHaveBeenCalled()
    expect(mocks.restoreVersion).not.toHaveBeenCalled()
  })

  it('rejects transition when requirement not found', async () => {
    mocks.getRequirementById.mockResolvedValue(null)
    const service = createTestRequirementsService()
    await expect(
      service.transitionRequirement(makeContext(), {
        id: 999,
        toStatusId: 2,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(mocks.transitionStatus).not.toHaveBeenCalled()
  })

  it('authorizes and logs specification listing operations', async () => {
    mocks.listSpecificationsForActorCatalog.mockResolvedValue({
      coAuthorHsaIdsBySpecification: new Map([[7, []]]),
      specifications: [
        {
          businessNeedsReference: null,
          id: 7,
          implementationType: null,
          itemCount: 2,
          lifecycleStatus: null,
          name: 'IAM Specification',
          governanceObjectType: null,
          responsibleHsaId: 'SE5560000001-alice1',
          specificationCode: 'IAM-SPECIFICATION',
        },
      ],
    })
    const authorization = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    }
    const service = createRequirementsService({} as never, {
      authorization,
      logger,
    })

    const result = await service.listSpecifications(makeContext(), {
      locale: 'sv',
      responseFormat: 'json',
    })

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'list_specifications', nameSearch: undefined },
      expect.anything(),
    )
    expect(JSON.parse(result.message)).toMatchObject({
      lines: ['Hittade 1 kravunderlag.'],
      title: 'Kravunderlag',
    })
    expect(logger.info).toHaveBeenCalledWith(
      'requirements.list_specifications',
      expect.objectContaining({
        actor_id: 'alice',
        correlation_id: 'corr-1',
        source: 'rest',
      }),
    )
  })

  it('filters specification catalogs and shapes REST-only fields on demand', async () => {
    const specification = {
      businessNeedsReference: 'Business need',
      createdAt: '2026-01-01T00:00:00.000Z',
      governanceObjectType: { id: 3, nameEn: 'Service', nameSv: 'Tjänst' },
      id: 7,
      implementationType: { id: 4, nameEn: 'Contract', nameSv: 'Avtal' },
      itemCount: 2,
      lifecycleStatus: { id: 1, nameEn: 'Draft', nameSv: 'Utkast' },
      name: 'IAM Specification',
      requirementAreas: [{ id: 2, name: 'Security' }],
      responsibleDisplayName: 'Alice Owner',
      responsibleHsaId: 'SE5560000001-alice1',
      specificationCode: 'IAM-SPECIFICATION',
      specificationGovernanceObjectTypeId: 3,
      specificationImplementationTypeId: 4,
      specificationLifecycleStatusId: 1,
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    mocks.listSpecificationsForActorCatalog.mockResolvedValue({
      coAuthorHsaIdsBySpecification: new Map(),
      specifications: [specification],
    })
    const service = createTestRequirementsService()

    const filtered = await service.listSpecifications(makeContext(), {
      nameSearch: 'iam',
    })
    const rest = await service.listSpecifications(makeContext(), {
      includeRestFields: true,
      nameSearch: 'IAM',
      responseFormat: 'json',
    })
    const empty = await service.listSpecifications(makeContext(), {
      nameSearch: 'missing',
    })

    expect(filtered.specifications).toEqual([
      expect.objectContaining({
        governanceObjectType: { nameEn: 'Service', nameSv: 'Tjänst' },
        implementationType: { nameEn: 'Contract', nameSv: 'Avtal' },
      }),
    ])
    expect(rest.specifications).toEqual([
      expect.objectContaining({
        governanceObjectType: expect.objectContaining({ id: 3 }),
        implementationType: expect.objectContaining({ id: 4 }),
        lifecycleStatus: expect.objectContaining({ id: 1 }),
        permissions: expect.objectContaining({ canEditContent: true }),
      }),
    ])
    expect(empty.specifications).toEqual([])
    expect(empty.message).toContain('No specifications found.')
  })

  it('rejects specification workflows without a specification reference', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.getSpecificationItems(makeContext(), {} as never),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Missing specification reference',
      status: 400,
    })
    await expect(
      service.listDeviations(makeContext(), {}),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Missing specification reference',
      status: 400,
    })
    expect(mocks.querySpecificationItemPage).not.toHaveBeenCalled()
    expect(mocks.listDeviationsForSpecification).not.toHaveBeenCalled()
  })

  it('returns a bounded requirement application page from the shared query', async () => {
    const item = {
      area: { name: 'Identitet' },
      id: 101,
      isArchived: false,
      itemRef: 'lib:31',
      kind: 'library',
      needsReference: 'IAM-42',
      uniqueId: 'INT0001',
      version: {
        categoryNameEn: 'Category',
        categoryNameSv: 'Kategori',
        description: 'Support secure integration',
        qualityCharacteristicNameEn: null,
        qualityCharacteristicNameSv: null,
        verifiable: true,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        typeNameEn: 'Functional',
        typeNameSv: 'Funktionellt',
        versionNumber: 1,
      },
    }
    mocks.querySpecificationItemPage.mockResolvedValue({
      items: [item],
      pagination: {
        count: 1,
        hasMore: true,
        limit: 25,
        nextCursor: 'next-page',
      },
    })
    const service = createTestRequirementsService()

    const result = await service.getSpecificationItems(makeContext(), {
      categoryIds: [4],
      cursor: 'current-page',
      limit: 25,
      locale: 'sv',
      probeRequirementIds: [31, 32],
      sortBy: 'category',
      sortDirection: 'desc',
      specificationId: 7,
      responseFormat: 'json',
    })

    expect(result.specificationId).toBe(7)
    expect(result.items).toEqual([item])
    expect(result.pagination).toEqual({
      count: 1,
      hasMore: true,
      limit: 25,
      nextCursor: 'next-page',
    })
    expect(mocks.querySpecificationItemPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cursor: 'current-page',
        filters: expect.objectContaining({
          categoryIds: [4],
          requirementIds: [31, 32],
        }),
        limit: 25,
        locale: 'sv',
        sort: { by: 'category', direction: 'desc' },
        specificationId: 7,
      }),
    )
    expect(JSON.parse(result.message)).toMatchObject({
      title: 'Kravtillämpningar',
    })
  })

  it('emits privacy-safe page capacity evidence for preload, REST, and MCP surfaces', async () => {
    mocks.querySpecificationItemPage.mockResolvedValue({
      items: [{ itemRef: 'lib:31', uniqueId: 'SECRET-REQ-31' }],
      pagination: {
        count: 1,
        hasMore: true,
        limit: 25,
        nextCursor: 'opaque-secret-cursor',
      },
    })
    const service = createTestRequirementsService()

    for (const capacitySurface of ['editor-preload', 'rest', 'mcp'] as const) {
      await service.getSpecificationItems(makeContext(), {
        capacitySurface,
        cursor: 'incoming-secret-cursor',
        descriptionSearch: 'private requirement text',
        limit: 25,
        specificationId: 593,
      })
    }

    const events = emittedCapacityEvents().filter(
      entry => entry.operation === 'requirements.get_specification_items',
    )
    expect(events.map(event => event.surface)).toEqual([
      'editor-preload',
      'rest',
      'mcp',
    ])
    for (const [index, event] of events.entries()) {
      expect(event).toMatchObject({
        continuation_available: true,
        outcome: 'success',
        page_limit: 25,
        returned_count: 1,
        surface: ['editor-preload', 'rest', 'mcp'][index],
      })
      const serialized = JSON.stringify(event)
      expect(serialized).not.toMatch(
        /incoming-secret-cursor|opaque-secret-cursor|private requirement text|SECRET-REQ-31/,
      )
      expect(event).not.toHaveProperty('specification_id')
    }
    const specificationPageLogs = logger.info.mock.calls.filter(
      ([operation]) => operation === 'requirements.get_specification_items',
    )
    expect(specificationPageLogs).toHaveLength(3)
    for (const [, metadata] of specificationPageLogs) {
      expect(metadata).toMatchObject({ description_search_supplied: true })
      expect(JSON.stringify(metadata)).not.toContain('private requirement text')
    }
  })

  it('emits only the bounded cursor failure category', async () => {
    mocks.querySpecificationItemPage.mockRejectedValueOnce(invalidCursorError())
    const service = createTestRequirementsService()

    await expect(
      service.getSpecificationItems(makeContext(), {
        capacitySurface: 'rest',
        cursor: 'private-cursor-value',
        specificationId: 593,
      }),
    ).rejects.toMatchObject({ code: 'invalid_cursor' })

    const [event] = emittedCapacityEvents().filter(
      entry => entry.event === 'capacity.operation.failed',
    )
    expect(event).toMatchObject({
      cursor_failure_category: 'invalid_cursor',
      outcome: 'failure',
      surface: 'rest',
    })
    expect(JSON.stringify(event)).not.toMatch(/private-cursor-value/)
    expect(event).not.toHaveProperty('specification_id')
  })

  it('does not fail a page request when capacity telemetry fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    infoSpy.mockImplementationOnce(() => {
      throw new Error('telemetry sink unavailable')
    })
    const service = createTestRequirementsService()

    await expect(
      service.getSpecificationItems(makeContext(), {
        capacitySurface: 'mcp',
        specificationId: 7,
      }),
    ).resolves.toMatchObject({
      pagination: { count: 0, hasMore: false, limit: 50 },
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('uses actual inserted specification link counts in addToSpecification', async () => {
    mocks.getPublishedVersionIdForRequirement
      .mockResolvedValueOnce(201)
      .mockResolvedValueOnce(202)
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(1)
    const service = createTestRequirementsService()

    const result = await service.addToSpecification(makeContext(), {
      locale: 'en',
      specificationId: 7,
      requirementIds: [10, 11],
      responseFormat: 'json',
    })

    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).toHaveBeenCalledWith(expect.anything(), 7, {
      requirementIds: [10, 11],
      needsReferenceDescription: undefined,
      needsReferenceId: undefined,
      needsReferenceText: undefined,
    })
    expect(result.addedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(JSON.parse(result.message)).toMatchObject({
      lines: ['Added 1 requirement to specification 7.'],
      title: 'Requirements Added to Specification',
    })
  })

  it('uses actual deleted specification link counts in removeFromSpecification', async () => {
    mocks.unlinkRequirementsFromSpecification.mockResolvedValue(1)
    const service = createTestRequirementsService()

    const result = await service.removeFromSpecification(makeContext(), {
      locale: 'en',
      specificationId: 7,
      requirementIds: [10, 11],
      responseFormat: 'json',
    })

    expect(result.removedCount).toBe(1)
    expect(JSON.parse(result.message)).toMatchObject({
      lines: ['Removed 1 requirement from specification 7.'],
      title: 'Requirements Removed from Specification',
    })
  })

  it('lists graduation target requirement areas for actors who can author target requirement areas without source specification access', async () => {
    mocks.canAuthorSpecification.mockResolvedValueOnce(false)
    mocks.listAreasActorCanAuthor.mockResolvedValue([
      {
        id: 2,
        name: 'Security',
        ownerHsaId: 'SE5560000001-alice1',
        prefix: 'SEC',
      },
    ])
    const service = createTestRequirementsService()

    const result = await service.listGraduationTargetAreas(makeContext(), {
      localRequirementId: 12,
      responseFormat: 'json',
      specificationId: 7,
    })

    expect(mocks.canAuthorSpecification).not.toHaveBeenCalled()
    expect(mocks.getSpecificationLocalRequirementDetail).toHaveBeenCalledWith(
      expect.anything(),
      7,
      12,
    )
    expect(result.areas).toEqual([{ id: 2, name: 'Security', prefix: 'SEC' }])
    expect(JSON.parse(result.message)).toEqual({
      lines: ['1 requirement area(s) can receive the copy.'],
      title: 'Requirements Library target requirement areas',
    })
  })

  it('returns no graduation target requirement areas when the actor cannot author any target requirement area', async () => {
    mocks.canAuthorSpecification.mockResolvedValueOnce(false)
    mocks.listAreasActorCanAuthor.mockResolvedValueOnce([])
    const service = createTestRequirementsService()

    const result = await service.listGraduationTargetAreas(makeContext(), {
      localRequirementId: 12,
      responseFormat: 'json',
      specificationId: 7,
    })

    expect(mocks.canAuthorSpecification).not.toHaveBeenCalled()
    expect(mocks.getSpecificationLocalRequirementDetail).toHaveBeenCalledWith(
      expect.anything(),
      7,
      12,
    )
    expect(result.areas).toEqual([])
    expect(JSON.parse(result.message)).toEqual({
      lines: ['0 requirement area(s) can receive the copy.'],
      title: 'Requirements Library target requirement areas',
    })
  })

  it('returns not found for graduation target requirement areas when the local requirement does not exist', async () => {
    mocks.getSpecificationLocalRequirementDetail.mockResolvedValueOnce(null)
    const service = createTestRequirementsService()

    await expect(
      service.listGraduationTargetAreas(makeContext(), {
        localRequirementId: 12,
        responseFormat: 'json',
        specificationId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: {
        localRequirementId: 12,
        specificationId: 7,
      },
    })
    expect(mocks.canAuthorSpecification).not.toHaveBeenCalled()
    expect(mocks.listAreasActorCanAuthor).not.toHaveBeenCalled()
  })

  it('graduates a specification-local requirement through the shared service workflow using target-area access only', async () => {
    mocks.canAuthorSpecification.mockResolvedValueOnce(false)
    mocks.getAreaById.mockResolvedValue({
      id: 2,
      name: 'Security',
      ownerHsaId: 'SE5560000001-alice1',
      prefix: 'SEC',
    })
    mocks.graduateSpecificationLocalRequirementToLibrary.mockResolvedValue({
      requirement: {
        id: 2,
        requirementAreaId: 2,
        sequenceNumber: 1,
        uniqueId: 'SEC0001',
      },
      sourceLocalRequirement: {
        id: 12,
        specificationId: 7,
        uniqueId: 'KRAV0001',
      },
      version: {
        id: 20,
        requirementId: 2,
        statusId: 1,
        versionNumber: 1,
      },
    })
    mocks.getRequirementById.mockResolvedValue({
      ...makeRequirementRecord(),
      area: {
        id: 2,
        name: 'Security',
        ownerHsaId: 'SE5560000001-alice1',
        prefix: 'SEC',
      },
      id: 2,
      uniqueId: 'SEC0001',
      versions: [
        {
          ...makeRequirementRecord().versions[0],
          id: 20,
          status: 1,
          statusNameEn: 'Draft',
          statusNameSv: 'Utkast',
          versionNumber: 1,
        },
      ],
    })
    const service = createTestRequirementsService()

    const result = await service.graduateSpecificationLocalRequirement(
      makeContext(),
      {
        localRequirementId: 12,
        requirementAreaId: 2,
        responseFormat: 'json',
        specificationId: 7,
      },
    )

    expect(mocks.canAuthorSpecification).not.toHaveBeenCalled()
    expect(
      mocks.graduateSpecificationLocalRequirementToLibrary,
    ).toHaveBeenCalledWith(expect.anything(), {
      actorDisplayName: 'alice',
      actorHsaId: 'SE5560000001-alice1',
      specificationId: 7,
      specificationLocalRequirementId: 12,
      targetRequirementAreaId: 2,
    })
    expect(result.detail.uniqueId).toBe('SEC0001')
    expect(result.requirementResourceUri).toBe(
      'requirements://requirement/SEC0001?version=1',
    )
    expect(result.requirementViewUri).toBe(
      'ui://requirements/requirement-detail/SEC0001?version=1',
    )
    expect(JSON.parse(result.message)).toEqual({
      lines: [
        'Unique requirement KRAV0001 was copied to SEC0001 as a draft in Security.',
      ],
      title: 'Unique Requirement Graduated to Requirements Library',
    })
    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'specification_local_requirement.graduated',
          localRequirementId: 12,
          newRequirementId: 2,
          newRequirementUniqueId: 'SEC0001',
          operation: 'graduate_specification_local_requirement',
          specificationId: 7,
          targetRequirementAreaId: 2,
        }),
        event: 'requirements.sensitive_mutation.succeeded',
      }),
    ])
  })

  it('denies graduation when the actor cannot author the target requirement area', async () => {
    mocks.canAuthorArea.mockResolvedValueOnce(false)
    mocks.getAreaById.mockResolvedValue({
      id: 2,
      name: 'Security',
      ownerHsaId: 'SE5560000001-alice1',
      prefix: 'SEC',
    })
    const service = createTestRequirementsService()
    const context = {
      ...makeContext(),
      actor: {
        ...makeContext().actor,
        roles: [],
      },
    }

    await expect(
      service.graduateSpecificationLocalRequirement(context, {
        localRequirementId: 12,
        requirementAreaId: 2,
        specificationId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(
      mocks.graduateSpecificationLocalRequirementToLibrary,
    ).not.toHaveBeenCalled()
  })

  it('reports missing graduation target areas and missing graduated records', async () => {
    const service = createTestRequirementsService()
    mocks.getAreaById.mockResolvedValueOnce(null)

    await expect(
      service.graduateSpecificationLocalRequirement(makeContext(), {
        localRequirementId: 12,
        requirementAreaId: 404,
        specificationId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { requirementAreaId: 404 },
    })

    mocks.getAreaById.mockResolvedValueOnce({
      id: 2,
      name: 'Security',
      ownerHsaId: 'SE5560000001-alice1',
      prefix: 'SEC',
    })
    mocks.getRequirementById.mockResolvedValueOnce(null)
    await expect(
      service.graduateSpecificationLocalRequirement(makeContext(), {
        localRequirementId: 12,
        requirementAreaId: 2,
        specificationId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { requirementId: 2 },
    })
  })

  it('does not emit specification addition audit events when no links are added', async () => {
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(0)
    const service = createTestRequirementsService()

    await service.addToSpecification(makeContext(), {
      specificationId: 7,
      requirementIds: [10],
    })

    expect(emittedSecurityEvents()).toEqual([])
  })

  it('reports unpublished requirements as skipped without attempting links', async () => {
    mocks.getPublishedVersionIdForRequirement
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(202)
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValueOnce(1)
    const service = createTestRequirementsService()

    const result = await service.addToSpecification(makeContext(), {
      locale: 'en',
      requirementIds: [10, 11],
      specificationId: 7,
    })

    expect(result).toMatchObject({
      addedCount: 1,
      skippedCount: 1,
      skippedIds: [10],
    })
    expect(result.message).toContain(
      'Skipped 1 requirement with no published version: 10.',
    )
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).toHaveBeenCalledWith(
      expect.anything(),
      7,
      expect.objectContaining({ requirementIds: [11] }),
    )
  })

  it('emits security audit events for sensitive requirement mutations', async () => {
    const service = createTestRequirementsService()

    await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'approve_archiving',
    })

    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        actor: expect.objectContaining({ source: 'oidc', sub: 'alice' }),
        detail: expect.objectContaining({
          action: 'requirement.archiving.approved',
          operation: 'approve_archiving',
          requestSource: 'rest',
          requirementId: 1,
          requirementUniqueId: 'INT0001',
        }),
        event: 'requirements.sensitive_mutation.succeeded',
        outcome: 'success',
        request: expect.objectContaining({ requestId: 'req-1' }),
      }),
    ])
  })

  it('uses the delete-draft result unique ID for final-requirement audit events', async () => {
    mocks.deleteDraftVersion.mockImplementation(async (_db, _id, options) => {
      const result = {
        deleted: [
          {
            requirementUniqueId: 'SEC-0001',
            type: 'draftRequirementVersion' as const,
            versionNumber: 10,
          },
          { requirementUniqueId: 'SEC-0001', type: 'requirement' as const },
        ],
      }
      await options?.audit?.({ query: mocks.auditQuery }, result)
      return result
    })
    mocks.getRequirementById
      .mockResolvedValueOnce(makeRequirementRecord())
      .mockResolvedValueOnce(null)
    mocks.auditQuery.mockImplementation(async () => [])
    const service = createTestRequirementsService()

    await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'delete_draft',
    })

    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'requirement.draft.deleted',
          deletedTypes: ['draftRequirementVersion', 'requirement'],
          deletedVersionNumber: 10,
          operation: 'delete_draft',
          requirementId: 1,
          requirementUniqueId: 'SEC-0001',
        }),
        event: 'requirements.sensitive_mutation.succeeded',
        outcome: 'success',
      }),
    ])
    const auditSqlCalls = mocks.auditQuery.mock.calls.map(([sql]) =>
      typeof sql === 'string' ? sql : '',
    )
    expect(
      auditSqlCalls.some(sql => sql.includes('SELECT TOP (1) unique_id')),
    ).toBe(false)
  })

  it('emits security audit events for specification removals', async () => {
    mocks.unlinkRequirementsFromSpecification.mockResolvedValue(2)
    const service = createTestRequirementsService()

    await service.removeFromSpecification(makeContext(), {
      specificationId: 7,
      requirementIds: [10, 11, 12],
    })

    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'specification.requirements.removed',
          operation: 'remove_from_specification',
          removedCount: 2,
          requirementCount: 3,
          specificationId: 7,
        }),
        event: 'requirements.sensitive_mutation.succeeded',
      }),
    ])
  })

  it('emits security audit events for specification additions', async () => {
    mocks.getPublishedVersionIdForRequirement
      .mockResolvedValueOnce(201)
      .mockResolvedValueOnce(202)
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(2)
    const service = createTestRequirementsService()

    await service.addToSpecification(makeContext(), {
      locale: 'sv',
      specificationId: 7,
      requirementIds: [10, 11],
    })

    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'specification.requirements.added',
          addedCount: 2,
          locale: 'sv',
          operation: 'add_to_specification',
          requirementCount: 2,
          requirementIds: [10, 11],
          requestSource: 'rest',
          specificationId: 7,
        }),
        event: 'requirements.sensitive_mutation.succeeded',
      }),
    ])
  })

  it('lists localized deviations and preserves library and local item references', async () => {
    mocks.countDeviationsBySpecification.mockResolvedValue({
      approved: 1,
      pending: 1,
      rejected: 1,
      total: 3,
    })
    mocks.listDeviationsForSpecification.mockResolvedValue([
      {
        createdAt: '2026-08-01T10:00:00.000Z',
        createdBy: 'Alice',
        decidedAt: null,
        decidedBy: null,
        decision: null,
        decisionMotivation: null,
        id: 7,
        motivation: 'Library deviation',
        requirementDescription: 'Library requirement',
        requirementUniqueId: 'INT0001',
        specificationItemId: 41,
        specificationLocalRequirementId: null,
      },
      {
        createdAt: '2026-08-02T10:00:00.000Z',
        createdBy: null,
        decidedAt: null,
        decidedBy: null,
        decision: null,
        decisionMotivation: null,
        id: 8,
        motivation: 'Local deviation',
        requirementDescription: 'Local requirement',
        requirementUniqueId: 'LOCAL001',
        specificationItemId: null,
        specificationLocalRequirementId: 12,
      },
      {
        createdAt: '2026-08-03T10:00:00.000Z',
        createdBy: null,
        decidedAt: null,
        decidedBy: null,
        decision: null,
        decisionMotivation: null,
        id: 9,
        motivation: 'Legacy reference fallback',
        requirementDescription: null,
        requirementUniqueId: null,
        specificationItemId: null,
        specificationLocalRequirementId: null,
      },
    ])
    const service = createTestRequirementsService()

    const result = await service.listDeviations(makeContext(), {
      locale: 'sv',
      responseFormat: 'json',
      specificationId: 7,
    })

    expect(result.deviations.map(row => row.specificationItemId)).toEqual([
      41, -12, -9,
    ])
    expect(JSON.parse(result.message)).toEqual({
      lines: ['3 avvikelse(r): 1 väntande, 1 godkända, 1 avvisade.'],
      title: 'Avvikelser',
    })
  })

  it('validates deviation creation before writing', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), {
        motivation: 'Needed',
        operation: 'create',
      }),
    ).rejects.toThrow('Requirement application ID is required')
    await expect(
      service.manageDeviation(makeContext(), {
        motivation: '   ',
        operation: 'create',
        specificationItemId: 41,
      }),
    ).rejects.toThrow('Motivation is required')
    expect(mocks.createDeviation).not.toHaveBeenCalled()
  })

  it('creates a localized deviation from trimmed input and verified identity', async () => {
    const service = createTestRequirementsService()

    const result = await service.manageDeviation(makeContext(), {
      locale: 'sv',
      motivation: '  Saknar beslutad kontroll  ',
      operation: 'create',
      responseFormat: 'json',
      specificationItemId: 41,
    })

    expect(mocks.createDeviation).toHaveBeenCalledWith(expect.anything(), {
      createdBy: 'alice',
      createdByHsaId: 'SE5560000001-alice1',
      motivation: 'Saknar beslutad kontroll',
      specificationItemId: 41,
    })
    expect(JSON.parse(result.message)).toEqual({
      lines: ['Avvikelse registrerad (ID 5).'],
      title: 'Avvikelse',
    })
  })

  it('validates deviation IDs and edit motivation before writing', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), { operation: 'delete' }),
    ).rejects.toThrow('Deviation ID is required')
    await expect(
      service.manageDeviation(makeContext(), {
        deviationId: 9,
        motivation: '   ',
        operation: 'edit',
      }),
    ).rejects.toThrow('Motivation is required for editing')
    expect(mocks.deleteDeviation).not.toHaveBeenCalled()
    expect(mocks.updateDeviation).not.toHaveBeenCalled()
  })

  it('edits deviations with trimmed motivation and a localized response', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), {
        deviationId: 9,
        locale: 'sv',
        motivation: '  Reviderad motivering  ',
        operation: 'edit',
      }),
    ).resolves.toEqual({
      message: '## Avvikelse\nAvvikelse 9 uppdaterad.',
      result: { id: 9 },
    })
    expect(mocks.updateDeviation).toHaveBeenCalledWith(expect.anything(), 9, {
      motivation: 'Reviderad motivering',
    })
  })

  it('validates complete and supported deviation decisions', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), {
        decisionMotivation: 'Reviewed',
        deviationId: 9,
        operation: 'record_decision',
      }),
    ).rejects.toThrow('Decision and decision motivation are required')
    await expect(
      service.manageDeviation(makeContext(), {
        decision: 1,
        decisionMotivation: '   ',
        deviationId: 9,
        operation: 'record_decision',
      }),
    ).rejects.toThrow('Decision and decision motivation are required')
    await expect(
      service.manageDeviation(makeContext(), {
        decision: 3,
        decisionMotivation: 'Reviewed',
        deviationId: 9,
        operation: 'record_decision',
      }),
    ).rejects.toThrow('Invalid decision value')
    expect(mocks.recordDecision).not.toHaveBeenCalled()
  })

  it('records a rejected deviation decision with Swedish output', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), {
        decision: 2,
        decisionMotivation: '  Uppfyller inte policyn  ',
        deviationId: 9,
        locale: 'sv',
        operation: 'record_decision',
      }),
    ).resolves.toEqual({
      message:
        '## Avvikelsebeslut\nBeslut registrerat för avvikelse 9: avvisad.',
      result: { decision: 2, id: 9 },
    })
    expect(mocks.recordDecision).toHaveBeenCalledWith(expect.anything(), 9, {
      decidedBy: 'alice',
      decidedByHsaId: 'SE5560000001-alice1',
      decision: 2,
      decisionMotivation: 'Uppfyller inte policyn',
    })
  })

  it('deletes deviations and returns the deleted identity', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), {
        deviationId: 9,
        operation: 'delete',
      }),
    ).resolves.toEqual({
      message: '## Deviation\nDeviation 9 deleted.',
      result: { id: 9 },
    })
    expect(mocks.deleteDeviation).toHaveBeenCalledWith(expect.anything(), 9)
  })

  it('returns English deviation list and mutation messages for default locale branches', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.listDeviations(makeContext(), { specificationId: 7 }),
    ).resolves.toMatchObject({
      message:
        '## Deviations\n0 deviation(s): 0 pending, 0 approved, 0 rejected.',
    })
    await expect(
      service.manageDeviation(makeContext(), {
        motivation: '  Required exception  ',
        operation: 'create',
        specificationItemId: 41,
      }),
    ).resolves.toMatchObject({
      message: '## Deviation\nDeviation registered (ID 5).',
    })
    await expect(
      service.manageDeviation(makeContext(), {
        deviationId: 9,
        motivation: '  Updated exception  ',
        operation: 'edit',
      }),
    ).resolves.toMatchObject({
      message: '## Deviation\nDeviation 9 updated.',
    })
  })

  it('returns every localized deviation decision and deletion label', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageDeviation(makeContext(), {
        decision: 1,
        decisionMotivation: 'Godkänd av granskare',
        deviationId: 9,
        locale: 'sv',
        operation: 'record_decision',
      }),
    ).resolves.toMatchObject({
      message:
        '## Avvikelsebeslut\nBeslut registrerat för avvikelse 9: godkänd.',
    })
    await expect(
      service.manageDeviation(makeContext(), {
        decision: 2,
        decisionMotivation: 'Rejected by reviewer',
        deviationId: 9,
        operation: 'record_decision',
      }),
    ).resolves.toMatchObject({
      message:
        '## Deviation Decision\nDecision recorded for deviation 9: rejected.',
    })
    await expect(
      service.manageDeviation(makeContext(), {
        deviationId: 9,
        locale: 'sv',
        operation: 'delete',
      }),
    ).resolves.toMatchObject({
      message: '## Avvikelse\nAvvikelse 9 borttagen.',
    })
  })

  it('emits security audit events for deviation decisions', async () => {
    const service = createTestRequirementsService()

    await service.manageDeviation(makeContext(), {
      decision: 1,
      decisionMotivation: 'Approved by security reviewer',
      deviationId: 9,
      operation: 'record_decision',
    })

    expect(mocks.recordDecision).toHaveBeenCalledWith(expect.anything(), 9, {
      decision: 1,
      decisionMotivation: 'Approved by security reviewer',
      decidedBy: 'alice',
      decidedByHsaId: 'SE5560000001-alice1',
    })
    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'deviation.decision.recorded',
          decision: 1,
          deviationId: 9,
          operation: 'record_decision',
        }),
        event: 'requirements.sensitive_mutation.succeeded',
      }),
    ])
  })

  it('lists suggestions by unique ID with localized counts and complete rows', async () => {
    mocks.getRequirementByUniqueId.mockResolvedValue({
      ...makeRequirementRecord(),
      id: 23,
    })
    mocks.countSuggestionsByRequirement.mockResolvedValue({
      dismissed: 1,
      pending: 2,
      resolved: 3,
      total: 6,
    })
    mocks.listSuggestionsForRequirement.mockResolvedValue([
      {
        content: 'Clarify encryption requirements',
        createdAt: '2026-08-01T10:00:00.000Z',
        createdBy: 'Alice',
        id: 12,
        isReviewRequested: 1,
        requirementId: 23,
        requirementVersionId: 45,
        resolution: null,
        resolutionMotivation: null,
        resolvedAt: null,
        resolvedBy: null,
        updatedAt: '2026-08-02T10:00:00.000Z',
      },
    ])
    const service = createTestRequirementsService()

    const result = await service.listSuggestions(makeContext(), {
      locale: 'sv',
      responseFormat: 'json',
      uniqueId: 'INT0023',
    })

    expect(mocks.listSuggestionsForRequirement).toHaveBeenCalledWith(
      expect.anything(),
      23,
    )
    expect(result.suggestions).toEqual([
      {
        content: 'Clarify encryption requirements',
        createdAt: '2026-08-01T10:00:00.000Z',
        createdBy: 'Alice',
        id: 12,
        isReviewRequested: 1,
        requirementId: 23,
        requirementVersionId: 45,
        resolution: null,
        resolutionMotivation: null,
        resolvedAt: null,
        resolvedBy: null,
        updatedAt: '2026-08-02T10:00:00.000Z',
      },
    ])
    expect(JSON.parse(result.message)).toEqual({
      lines: ['6 förbättringsförslag: 2 väntande, 3 åtgärdade, 1 avvisade.'],
      title: 'Förbättringsförslag',
    })
  })

  it('reports missing suggestion requirement references and unknown unique IDs', async () => {
    const service = createTestRequirementsService()

    await expect(service.listSuggestions(makeContext(), {})).rejects.toThrow(
      'Either requirementId or uniqueId is required',
    )
    mocks.getRequirementByUniqueId.mockResolvedValueOnce(null)
    await expect(
      service.listSuggestions(makeContext(), { uniqueId: 'MISSING' }),
    ).rejects.toThrow('Requirement not found: MISSING')
    expect(mocks.listSuggestionsForRequirement).not.toHaveBeenCalled()
  })

  it('lists suggestions directly by requirement ID with default output options', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.listSuggestions(makeContext(), { requirementId: 23 }),
    ).resolves.toEqual({
      counts: { dismissed: 0, pending: 0, resolved: 0, total: 0 },
      message:
        '## Improvement suggestions\n0 improvement suggestion(s): 0 pending, 0 resolved, 0 dismissed.',
      suggestions: [],
    })
  })

  it('validates suggestion creation before writing', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        content: 'Clarify this requirement',
        operation: 'create',
      }),
    ).rejects.toThrow('Requirement ID is required')
    await expect(
      service.manageSuggestion(makeContext(), {
        content: '   ',
        operation: 'create',
        requirementId: 23,
      }),
    ).rejects.toThrow('Content is required')
    expect(mocks.createSuggestion).not.toHaveBeenCalled()
  })

  it('creates suggestions from trimmed content and verified identity', async () => {
    const service = createTestRequirementsService()

    const result = await service.manageSuggestion(makeContext(), {
      content: '  Clarify this requirement  ',
      locale: 'sv',
      operation: 'create',
      requirementId: 23,
      requirementVersionId: 45,
      responseFormat: 'json',
    })

    expect(mocks.createSuggestion).toHaveBeenCalledWith(expect.anything(), {
      content: 'Clarify this requirement',
      createdBy: 'alice',
      createdByHsaId: 'SE5560000001-alice1',
      requirementId: 23,
      requirementVersionId: 45,
    })
    expect(JSON.parse(result.message)).toEqual({
      lines: ['Förbättringsförslag registrerat (ID 6).'],
      title: 'Förbättringsförslag',
    })
  })

  it('defaults a created suggestion to no requirement version', async () => {
    const service = createTestRequirementsService()

    await service.manageSuggestion(makeContext(), {
      content: 'Clarify this requirement',
      operation: 'create',
      requirementId: 23,
    })

    expect(mocks.createSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requirementVersionId: null }),
    )
  })

  it('validates suggestion IDs and edit content before writing', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), { operation: 'edit' }),
    ).rejects.toThrow('Suggestion ID is required')
    await expect(
      service.manageSuggestion(makeContext(), {
        content: '   ',
        operation: 'edit',
        suggestionId: 12,
      }),
    ).rejects.toThrow('Content is required for editing')
    expect(mocks.updateSuggestion).not.toHaveBeenCalled()
  })

  it('edits and reverts suggestions with localized success messages', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        content: '  Updated suggestion  ',
        locale: 'sv',
        operation: 'edit',
        suggestionId: 12,
      }),
    ).resolves.toEqual({
      message: '## Förbättringsförslag\nFörbättringsförslag 12 uppdaterat.',
      result: { id: 12 },
    })
    await expect(
      service.manageSuggestion(makeContext(), {
        locale: 'sv',
        operation: 'revert_to_draft',
        suggestionId: 12,
      }),
    ).resolves.toEqual({
      message:
        '## Förbättringsförslag\nFörbättringsförslag 12 återställt till utkast.',
      result: { id: 12 },
    })
    expect(mocks.updateSuggestion).toHaveBeenCalledWith(expect.anything(), 12, {
      content: 'Updated suggestion',
    })
    expect(mocks.revertToDraft).toHaveBeenCalledWith(expect.anything(), 12)
  })

  it('validates resolution motivation before resolving or dismissing', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'dismiss',
        resolutionMotivation: '   ',
        suggestionId: 12,
      }),
    ).rejects.toThrow('Resolution motivation is required')
    expect(mocks.recordResolution).not.toHaveBeenCalled()
  })

  it('dismisses suggestions with Swedish output and verified identity', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        locale: 'sv',
        operation: 'dismiss',
        resolutionMotivation: '  Inte relevant  ',
        suggestionId: 12,
      }),
    ).resolves.toEqual({
      message: '## Förbättringsförslag\nFörbättringsförslag 12 avvisat.',
      result: { id: 12, resolution: 2 },
    })
    expect(mocks.recordResolution).toHaveBeenCalledWith(expect.anything(), 12, {
      resolution: 2,
      resolutionMotivation: 'Inte relevant',
      resolvedBy: 'alice',
      resolvedByHsaId: 'SE5560000001-alice1',
    })
  })

  it('deletes suggestions and returns the deleted identity', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'delete',
        suggestionId: 12,
      }),
    ).resolves.toEqual({
      message: '## Improvement suggestion\nImprovement suggestion 12 deleted.',
      result: { id: 12 },
    })
    expect(mocks.deleteSuggestion).toHaveBeenCalledWith(expect.anything(), 12)
  })

  it('returns English suggestion edit and revert messages', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        content: 'Updated suggestion',
        operation: 'edit',
        suggestionId: 12,
      }),
    ).resolves.toMatchObject({
      message: '## Improvement suggestion\nImprovement suggestion 12 updated.',
    })
    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'revert_to_draft',
        suggestionId: 12,
      }),
    ).resolves.toMatchObject({
      message:
        '## Improvement suggestion\nImprovement suggestion 12 reverted to draft.',
    })
  })

  it('returns every localized suggestion review, resolution, and deletion label', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        locale: 'sv',
        operation: 'request_review',
        suggestionId: 12,
      }),
    ).resolves.toMatchObject({
      message:
        '## Förbättringsförslag\nFörbättringsförslag 12 skickat för granskning.',
    })
    await expect(
      service.manageSuggestion(makeContext(), {
        locale: 'sv',
        operation: 'resolve',
        resolutionMotivation: 'Åtgärdat',
        suggestionId: 12,
      }),
    ).resolves.toMatchObject({
      message: '## Förbättringsförslag\nFörbättringsförslag 12 åtgärdat.',
    })
    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'dismiss',
        resolutionMotivation: 'Not applicable',
        suggestionId: 12,
      }),
    ).resolves.toMatchObject({
      message:
        '## Improvement suggestion\nImprovement suggestion 12 dismissed.',
    })
    await expect(
      service.manageSuggestion(makeContext(), {
        locale: 'sv',
        operation: 'delete',
        suggestionId: 12,
      }),
    ).resolves.toMatchObject({
      message: '## Förbättringsförslag\nFörbättringsförslag 12 borttaget.',
    })
  })

  it('preserves suggestion review success messages and reason-coded conflicts', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'request_review',
        responseFormat: 'markdown',
        suggestionId: 12,
      }),
    ).resolves.toEqual({
      message:
        '## Improvement suggestion\nImprovement suggestion 12 sent for review.',
      result: { id: 12 },
    })

    mocks.requestReview.mockRejectedValueOnce(
      conflictError('Review has already been requested', {
        reason: 'improvement_suggestion_review_already_requested',
        suggestionId: 12,
      }),
    )
    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'request_review',
        suggestionId: 12,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        reason: 'improvement_suggestion_review_already_requested',
      },
      status: 409,
    })
  })

  it('emits security audit events for suggestion resolutions', async () => {
    const service = createTestRequirementsService()

    await service.manageSuggestion(makeContext(), {
      operation: 'resolve',
      resolutionMotivation: 'Implemented in the current draft',
      suggestionId: 12,
    })

    expect(mocks.recordResolution).toHaveBeenCalledWith(expect.anything(), 12, {
      resolution: 1,
      resolutionMotivation: 'Implemented in the current draft',
      resolvedBy: 'alice',
      resolvedByHsaId: 'SE5560000001-alice1',
    })
    expect(emittedSecurityEvents()).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'suggestion.resolution.recorded',
          operation: 'resolve',
          resolution: 1,
          suggestionId: 12,
        }),
        event: 'requirements.sensitive_mutation.succeeded',
      }),
    ])
  })

  it('rejects unsupported suggestion operations without deleting', async () => {
    const service = createTestRequirementsService()

    await expect(
      service.manageSuggestion(makeContext(), {
        operation: 'unsupported' as never,
        suggestionId: 12,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Unsupported suggestion operation',
      status: 400,
    })
    expect(mocks.deleteSuggestion).not.toHaveBeenCalled()
  })

  it('formats sparse and pending requirement list records without inventing lookup values', () => {
    const base = {
      acceptanceCriteria: null,
      archiveInitiatedAt: null,
      areaName: null,
      categoryNameEn: null,
      categoryNameSv: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Sparse requirement',
      id: 1,
      isArchived: false,
      maxVersion: 1,
      normReferenceIds: null,
      normReferenceUris: null,
      pendingVersionStatusColor: '#fff',
      pendingVersionStatusIconName: 'clock',
      pendingVersionStatusId: 2,
      priorityLevelCode: null,
      priorityLevelColor: null,
      priorityLevelIconName: null,
      priorityLevelId: null,
      priorityLevelNameEn: null,
      priorityLevelNameSv: null,
      priorityLevelSortOrder: undefined,
      qualityCharacteristicId: null,
      qualityCharacteristicNameEn: null,
      qualityCharacteristicNameSv: null,
      requirementAreaId: 1,
      requirementCategoryId: null,
      requirementPackages: [],
      requirementTypeId: null,
      revisionToken: 'token',
      status: 1,
      statusColor: null,
      statusIconName: null,
      statusNameEn: null,
      statusNameSv: null,
      suggestionCount: 0,
      typeNameEn: null,
      typeNameSv: null,
      uniqueId: 'INT0001',
      verifiable: false,
      versionCreatedAt: '2026-01-01T00:00:00.000Z',
      versionId: 10,
      versionNumber: 1,
    }

    expect(formatRequirementListItem(base as never)).toMatchObject({
      area: null,
      hasPendingVersion: false,
      normReferenceIds: [],
      normReferenceUris: [],
      pendingVersionStatusColor: null,
      pendingVersionStatusId: null,
      version: { priorityLevelSortOrder: null },
    })
    expect(
      formatRequirementListItem({
        ...base,
        areaName: 'Integration',
        maxVersion: 2,
        normReferenceIds: '10,,20',
        normReferenceUris: 'https://one,https://two',
      } as never),
    ).toMatchObject({
      area: { id: 1, name: 'Integration' },
      hasPendingVersion: true,
      normReferenceIds: ['10', '20'],
      normReferenceUris: ['https://one', 'https://two'],
      pendingVersionStatusColor: '#fff',
      pendingVersionStatusIconName: 'clock',
      pendingVersionStatusId: 2,
    })
  })

  it('executes mutation audit callbacks for archive, cancellation, reactivation, and transition', async () => {
    const service = createTestRequirementsService()

    await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'archive',
    })
    await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'cancel_archiving',
    })
    await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'reactivate',
    })
    await service.transitionRequirement(makeContext(), {
      id: 1,
      toStatusId: 2,
    })

    expect(mocks.auditQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT TOP (1) unique_id'),
      [1],
    )
  })

  it('reports a missing post-mutation reload for create, edit, and transition', async () => {
    const service = createTestRequirementsService()
    mocks.getRequirementById.mockResolvedValueOnce(null)
    await expect(
      service.manageRequirement(makeContext(), {
        operation: 'create',
        requirement: { areaId: 1, description: 'Created' },
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Created requirement could not be reloaded',
    })

    mocks.getRequirementById
      .mockResolvedValueOnce(makeRequirementRecord())
      .mockResolvedValueOnce(null)
    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'edit',
        requirement: {
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Edited',
        },
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Edited requirement could not be reloaded',
    })

    mocks.getRequirementById
      .mockResolvedValueOnce(makeRequirementRecord())
      .mockResolvedValueOnce(null)
    await expect(
      service.transitionRequirement(makeContext(), {
        id: 1,
        toStatusId: 2,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Transitioned requirement could not be reloaded',
    })
  })

  it('formats sparse detail joins with stable identifiers and null catalog records', () => {
    const record = makeRequirementRecord()
    const sparse = {
      ...record,
      area: null,
      versions: [
        {
          ...record.versions[0],
          category: null,
          createdBy: null,
          priorityLevel: null,
          qualityCharacteristic: null,
          type: null,
          verificationMethod: null,
          versionNormReferences: [{ normReference: null, normReferenceId: 45 }],
          versionRequirementPackages: [
            { requirementPackage: null, requirementPackageId: 67 },
          ],
        },
      ],
    }

    expect(formatRequirementDetail(sparse as never)).toMatchObject({
      area: null,
      versions: [
        {
          category: null,
          ownerName: null,
          priorityLevel: null,
          qualityCharacteristic: null,
          type: null,
          versionNormReferences: [
            {
              normReference: {
                id: 45,
                issuer: '',
                name: '',
                normReferenceId: '',
                reference: '',
                type: '',
                uri: null,
                version: null,
              },
            },
          ],
          versionRequirementPackages: [
            {
              requirementPackage: {
                id: 67,
                name: null,
                ownerId: null,
                purposeAndScope: null,
              },
            },
          ],
        },
      ],
    })
    expect(buildRequirementViewUri({ id: 7 })).toBe(
      'ui://requirements/requirement-detail/7',
    )
    expect(buildRequirementViewUri({ uniqueId: 'SEC / 7' }, 3)).toBe(
      'ui://requirements/requirement-detail/SEC%20%2F%207?version=3',
    )
  })

  it('searches every lookup catalog through its catalog-specific fields', async () => {
    mocks.listAreas.mockResolvedValue([
      {
        description: 'Coordinates integrations',
        id: 1,
        name: 'Integration',
        ownerHsaId: 'SE5560000001-owner1',
        prefix: 'INT',
      },
    ])
    mocks.listPriorityLevels.mockResolvedValue([
      {
        assessmentCriteriaEn: 'Immediate action',
        assessmentCriteriaSv: 'Omedelbar åtgärd',
        code: 'P1',
        descriptionEn: 'Critical',
        descriptionSv: 'Kritisk',
        id: 1,
        nameEn: 'Highest',
        nameSv: 'Högst',
      },
    ])
    mocks.listRequirementPackages.mockResolvedValue([
      {
        id: 2,
        leadDisplayName: 'Package Lead',
        name: 'Citizen portal',
        purposeAndScope: 'Self service',
      },
    ])
    mocks.listTypes.mockResolvedValue([
      {
        id: 3,
        nameEn: 'Quality',
        nameSv: 'Kvalitet',
        qualityCharacteristics: [
          { nameEn: 'Reliability', nameSv: 'Tillförlitlighet' },
        ],
      },
    ])
    mocks.listSpecificationItemStatuses.mockResolvedValue([
      {
        descriptionEn: 'Included in baseline',
        descriptionSv: 'Ingår i baslinje',
        id: 4,
        nameEn: 'Included',
        nameSv: 'Ingår',
      },
    ])
    mocks.listStatuses.mockResolvedValue([
      { id: 5, nameEn: 'Published', nameSv: 'Publicerad' },
    ])
    mocks.listTransitions.mockResolvedValue([
      {
        fromStatus: { nameEn: 'Draft', nameSv: 'Utkast' },
        fromStatusId: 1,
        id: 6,
        toStatus: { nameEn: 'Review', nameSv: 'Granskning' },
        toStatusId: 2,
      },
    ])
    const service = createTestRequirementsService()
    const cases = [
      ['areas', 'owner1', 'ownerHsaId'],
      ['priority_levels', 'Immediate', 'assessmentCriteriaEn'],
      ['requirement_packages', 'Package Lead', 'leadDisplayName'],
      ['types', 'Reliability', 'qualityCharacteristicNamesEn'],
      ['specification_item_statuses', 'baseline', 'descriptionEn'],
      ['statuses', 'Published', 'nameEn'],
      ['transitions', 'Review', 'toStatusNameEn'],
    ] as const

    for (const [catalog, search, matchedField] of cases) {
      const result = await service.queryCatalog(makeContext(), {
        catalog,
        operation: 'search',
        search,
      })
      expect(result.result).toEqual([
        expect.objectContaining({
          match: expect.objectContaining({ matchedFields: [matchedField] }),
        }),
      ])
    }
  })

  it('sorts lookup rows by localized fallback fields and stable ids', async () => {
    mocks.listPriorityLevels.mockResolvedValue([
      { id: 6 },
      { code: 'C', id: 5 },
      { id: 4, nameEn: 'B' },
      { id: 3, nameSv: 'A' },
      { id: 2, name: 'Same' },
      { id: 1, name: 'Same' },
    ])
    const service = createTestRequirementsService()

    const result = await service.queryCatalog(makeContext(), {
      catalog: 'priority_levels',
      operation: 'list',
    })

    expect((result.result as Array<{ id: number }>).map(row => row.id)).toEqual(
      [6, 3, 4, 5, 1, 2],
    )
  })
})
