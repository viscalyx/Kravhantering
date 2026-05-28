import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { conflictError, forbiddenError } from '@/lib/requirements/errors'
import { normalizeUiTerminology } from '@/lib/ui-terminology'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

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
  getAreaById: vi.fn(),
  getRequirementById: vi.fn(),
  getRequirementByUniqueId: vi.fn(),
  getSpecificationLocalRequirementDetail: vi.fn(),
  getVersionHistory: vi.fn(),
  graduateSpecificationLocalRequirementToLibrary: vi.fn(),
  generateChat: vi.fn(),
  listAreas: vi.fn(),
  listAreasActorCanAuthor: vi.fn(),
  listCategories: vi.fn(),
  listRequirements: vi.fn(),
  listRequirementPackages: vi.fn(),
  listStatuses: vi.fn(),
  listTransitions: vi.fn(),
  listSpecifications: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  listSpecificationItems: vi.fn(),
  getPublishedVersionIdForRequirement: vi.fn(),
  getOrCreateSpecificationNeedsReference: vi.fn(),
  linkRequirementsToSpecificationAtomically: vi.fn(),
  linkRequirementsToSpecification: vi.fn(),
  listDeviationsForSpecification: vi.fn(),
  unlinkRequirementsFromSpecification: vi.fn(),
  listSuggestionsForRequirement: vi.fn(),
  listQualityCharacteristics: vi.fn(),
  listTypes: vi.fn(),
  loadTaxonomy: vi.fn(),
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

vi.mock('@/lib/ai/openrouter-client', () => ({
  generateChat: mocks.generateChat,
}))

vi.mock('@/lib/ai/requirement-prompt', () => ({
  REQUIREMENT_FORMAT_SCHEMA: { type: 'object' },
  buildSystemPrompt: () => 'system prompt',
  buildUserPrompt: () => 'user prompt',
  validateGeneratedRequirements: (requirements: unknown[]) => requirements,
}))

vi.mock('@/lib/ai/taxonomy', () => ({
  loadTaxonomy: mocks.loadTaxonomy,
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
  graduateSpecificationLocalRequirementToLibrary:
    mocks.graduateSpecificationLocalRequirementToLibrary,
  getOrCreateSpecificationNeedsReference:
    mocks.getOrCreateSpecificationNeedsReference,
  getSpecificationBySlug: mocks.getSpecificationBySlug,
  getSpecificationLocalRequirementDetail:
    mocks.getSpecificationLocalRequirementDetail,
  getPublishedVersionIdForRequirement:
    mocks.getPublishedVersionIdForRequirement,
  linkRequirementsToSpecificationAtomically:
    mocks.linkRequirementsToSpecificationAtomically,
  linkRequirementsToSpecification: mocks.linkRequirementsToSpecification,
  listSpecificationItems: mocks.listSpecificationItems,
  listSpecifications: mocks.listSpecifications,
  unlinkRequirementsFromSpecification:
    mocks.unlinkRequirementsFromSpecification,
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: mocks.listRequirementPackages,
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

function makeRequirementRecord() {
  return {
    area: {
      id: 1,
      name: 'Integration',
      ownerId: 'alice',
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
        editedAt: '2026-03-08T00:00:00.000Z',
        id: 10,
        publishedAt: null,
        requiresTesting: true,
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
              descriptionEn: 'A login flow',
              descriptionSv: 'Ett inloggningsflode',
              id: 7,
              nameEn: 'Login',
              nameSv: 'Inloggning',
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

function makeUiSettings() {
  return {
    getColumnDefaults: vi.fn(),
    getTerminology: vi.fn(async () => normalizeUiTerminology([])),
  }
}

describe('createRequirementsService', () => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  }
  let infoSpy: ReturnType<typeof vi.spyOn>

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
    mocks.canAuthorArea.mockResolvedValue(true)
    mocks.canAuthorSpecification.mockResolvedValue(true)
    mocks.listRequirements.mockResolvedValue([])
    mocks.countRequirements.mockResolvedValue(0)
    mocks.getRequirementById.mockResolvedValue(makeRequirementRecord())
    mocks.getRequirementByUniqueId.mockResolvedValue(makeRequirementRecord())
    mocks.getVersionHistory.mockResolvedValue([])
    mocks.loadTaxonomy.mockResolvedValue({})
    mocks.generateChat.mockResolvedValue({
      content: { requirements: [] },
      stats: {
        completionTokens: 7,
        cost: 0.02,
        promptTokens: 3,
        reasoningTokens: 0,
        totalTokens: 10,
      },
      thinking: '',
    })
    mocks.getAreaById.mockResolvedValue({
      id: 1,
      name: 'Integration',
      ownerId: 'alice',
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
    mocks.getSpecificationBySlug.mockResolvedValue({
      id: 7,
      uniqueId: 'IAM-SPECIFICATION',
    })
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
        ownerId: 'alice',
        prefix: 'INT',
      },
    ])
    mocks.listSpecificationItems.mockResolvedValue([])
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

  it('returns paginated requirement catalog results', async () => {
    mocks.listRequirements.mockResolvedValue([
      {
        acceptanceCriteria: 'Must respond in 2s',
        areaName: 'Integration',
        categoryNameEn: 'Business requirement',
        categoryNameSv: 'Verksamhetskrav',
        createdAt: '2026-03-08T00:00:00.000Z',
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
        requiresTesting: true,
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
    mocks.countRequirements.mockResolvedValue(3)

    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
      limit: 1,
      offset: 0,
    })

    expect(result.items).toHaveLength(1)
    expect(result.pagination).toEqual({
      count: 1,
      hasMore: true,
      limit: 1,
      nextOffset: 1,
      offset: 0,
      total: 3,
    })
    expect(result.items[0]).toMatchObject({
      hasPendingVersion: true,
      uniqueId: 'INT0001',
    })
  })

  it('preserves archived rows with pending replacement versions in queryCatalog results', async () => {
    mocks.listRequirements.mockResolvedValue([
      {
        acceptanceCriteria: 'Legacy acceptance criteria',
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
        requiresTesting: false,
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
    mocks.countRequirements.mockResolvedValue(1)

    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
    })

    expect(result.items[0]).toMatchObject({
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    await service.queryCatalog(makeContext(), {
      catalog: 'requirements',
      locale: 'sv',
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
    expect(mocks.countRequirements).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locale: 'sv',
        sortBy: 'status',
        sortDirection: 'desc',
      }),
    )
  })

  it('uses configurable terminology in catalog messages', async () => {
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

    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: {
        getColumnDefaults: vi.fn(),
        getTerminology: vi.fn(async () =>
          normalizeUiTerminology([
            {
              en: {
                definitePlural: 'Lifecycle states',
                plural: 'Lifecycle states',
                singular: 'Lifecycle state',
              },
              key: 'status',
              sv: {
                definitePlural: 'Livscykelstatusarna',
                plural: 'Livscykelstatusar',
                singular: 'Livscykelstatus',
              },
            },
          ]),
        ),
      },
    })

    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
      locale: 'en',
    })

    expect(result.message).toContain('Lifecycle states')
    expect(result.message).toContain('Published')
  })

  it('creates a requirement and syncs references', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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

    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Blocked by policy',
    })
    expect(authorization.assertAuthorized).toHaveBeenCalled()
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

  it('queries areas catalog', async () => {
    mocks.listAreas.mockResolvedValue([{ id: 1, prefix: 'A', name: 'Area A' }])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'areas',
    })
    expect(result.catalog).toBe('areas')
    expect(result.items).toHaveLength(1)
    expect(result.pagination).toBeNull()
  })

  it('queries categories catalog', async () => {
    mocks.listCategories.mockResolvedValue([
      { id: 1, nameSv: 'Kat', nameEn: 'Cat' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'categories',
    })
    expect(result.catalog).toBe('categories')
    expect(result.items).toHaveLength(1)
  })

  it('queries types catalog', async () => {
    mocks.listTypes.mockResolvedValue([
      { id: 1, nameSv: 'Typ', nameEn: 'Type' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'types',
    })
    expect(result.catalog).toBe('types')
    expect(result.items).toHaveLength(1)
  })

  it('queries quality_characteristics catalog', async () => {
    mocks.listQualityCharacteristics.mockResolvedValue([
      { id: 1, nameSv: 'TK', nameEn: 'TC' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'quality_characteristics',
      typeId: 1,
    })
    expect(result.catalog).toBe('quality_characteristics')
    expect(result.items).toHaveLength(1)
  })

  it('queries statuses catalog', async () => {
    mocks.listStatuses.mockResolvedValue([
      { id: 1, nameSv: 'Utkast', nameEn: 'Draft' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
    })
    expect(result.catalog).toBe('statuses')
    expect(result.items).toHaveLength(1)
  })

  it('queries requirementPackages catalog', async () => {
    mocks.listRequirementPackages.mockResolvedValue([
      { id: 1, nameSv: 'Mobil användning', nameEn: 'Mobile use' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'requirement_packages',
    })
    expect(result.catalog).toBe('requirement_packages')
    expect(result.items).toHaveLength(1)
  })

  it('queries transitions catalog', async () => {
    mocks.listTransitions.mockResolvedValue([
      {
        id: 1,
        fromStatus: { nameSv: 'Utkast', nameEn: 'Draft' },
        toStatus: { nameSv: 'Granskning', nameEn: 'Review' },
      },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'transitions',
    })
    expect(result.catalog).toBe('transitions')
    expect(result.items).toHaveLength(1)
  })

  it('edits a requirement', async () => {
    mocks.editRequirement.mockResolvedValue({ id: 11 })
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'archive',
    })
    expect(result.operation).toBe('archive')
    expect(mocks.initiateArchiving).toHaveBeenCalled()
  })

  it('approves archiving of a requirement', async () => {
    mocks.approveArchiving.mockResolvedValue(undefined)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'approve_archiving',
    })
    expect(result.operation).toBe('approve_archiving')
    expect(mocks.approveArchiving).toHaveBeenCalled()
  })

  it('cancels archiving of a requirement', async () => {
    mocks.cancelArchiving.mockResolvedValue(undefined)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'delete_draft',
    })
    expect(result.operation).toBe('delete_draft')
  })

  it('reactivates a requirement', async () => {
    mocks.reactivateRequirement.mockResolvedValue(undefined)
    mocks.getRequirementById.mockResolvedValue(makeRequirementRecord())
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.getRequirement(makeContext(), {
      uniqueId: 'INT0001',
      view: 'history',
    })
    expect(result.versions).toHaveLength(2)
    expect(result.message).toContain('History')
  })

  it('uses sv locale in catalog messages', async () => {
    mocks.listStatuses.mockResolvedValue([
      { id: 1, nameSv: 'Utkast', nameEn: 'Draft' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
      locale: 'sv',
    })
    expect(result.message).toContain('Utkast')
  })

  it('returns json format message', async () => {
    mocks.listStatuses.mockResolvedValue([
      { id: 1, nameSv: 'Utkast', nameEn: 'Draft' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'statuses',
      responseFormat: 'json',
    })
    const parsed = JSON.parse(result.message)
    expect(parsed).toHaveProperty('title')
    expect(parsed).toHaveProperty('lines')
  })

  it('rejects edit without description', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    await expect(
      service.manageRequirement(makeContext(), {
        id: 1,
        operation: 'edit',
        requirement: {},
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects edit with blank description', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    await expect(
      service.manageRequirement(makeContext(), {
        operation: 'create',
        requirement: { description: 'test' },
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects create with blank description', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    await expect(
      service.transitionRequirement(makeContext(), {
        id: 999,
        toStatusId: 2,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(mocks.transitionStatus).not.toHaveBeenCalled()
  })

  it('authorizes and logs specification listing operations', async () => {
    mocks.listSpecifications.mockResolvedValue([
      {
        businessNeedsReference: null,
        id: 7,
        implementationType: null,
        itemCount: 2,
        lifecycleStatus: null,
        name: 'IAM Specification',
        responsibilityArea: null,
        uniqueId: 'IAM-SPECIFICATION',
      },
    ])
    const authorization = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    }
    const service = createRequirementsService({} as never, {
      authorization,
      logger,
      uiSettings: makeUiSettings(),
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

  it('emits capacity metrics for MCP AI generation', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.generateRequirements(
      {
        ...makeContext(),
        correlationId: 'corr-mcp',
        requestId: 'req-mcp',
        source: 'mcp',
        toolName: 'requirements_generate_requirements',
      },
      {
        locale: 'sv',
        topic: 'kapacitetshantering',
      },
    )

    expect(result.stats.totalTokens).toBe(10)
    expect(parseCapacityEvents(infoSpy)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          correlation_id: 'corr-mcp',
          cost: 0.02,
          event: 'capacity.operation.completed',
          operation: 'requirements.generate_requirements',
          request_id: 'req-mcp',
          source: 'mcp',
          token_count: 10,
          tool_name: 'requirements_generate_requirements',
        }),
      ]),
    )
  })

  it('rejects specification workflows without a specification reference', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    await expect(
      service.getSpecificationItems(makeContext(), {}),
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
    expect(mocks.getSpecificationBySlug).not.toHaveBeenCalled()
    expect(mocks.listSpecificationItems).not.toHaveBeenCalled()
    expect(mocks.listDeviationsForSpecification).not.toHaveBeenCalled()
  })

  it('localizes specification item labels using the requested locale', async () => {
    mocks.listSpecificationItems.mockResolvedValue([
      {
        area: { name: 'Identitet' },
        id: 101,
        needsReference: 'IAM-42',
        uniqueId: 'INT0001',
        version: {
          categoryNameEn: 'Category',
          categoryNameSv: 'Kategori',
          description: 'Support secure integration',
          qualityCharacteristicNameEn: null,
          qualityCharacteristicNameSv: null,
          requiresTesting: true,
          status: 3,
          statusColor: '#22c55e',
          statusNameEn: 'Published',
          statusNameSv: 'Publicerad',
          typeNameEn: 'Functional',
          typeNameSv: 'Funktionellt',
          versionNumber: 1,
        },
      },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.getSpecificationItems(makeContext(), {
      locale: 'sv',
      specificationSlug: 'IAM-SPECIFICATION',
      responseFormat: 'json',
    })

    expect(result.specificationId).toBe(7)
    expect(result.items).toEqual([
      expect.objectContaining({
        area: 'Identitet',
        category: 'Kategori',
        needsReference: 'IAM-42',
        status: 'Publicerad',
        type: 'Funktionellt',
      }),
    ])
    expect(JSON.parse(result.message)).toMatchObject({
      title: 'Krav i kravunderlag',
    })
  })

  it('uses actual inserted specification link counts in addToSpecification', async () => {
    mocks.getPublishedVersionIdForRequirement
      .mockResolvedValueOnce(201)
      .mockResolvedValueOnce(202)
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(1)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.addToSpecification(makeContext(), {
      locale: 'en',
      specificationSlug: 'IAM-SPECIFICATION',
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
      lines: ['Added 1 requirement to specification IAM-SPECIFICATION.'],
      title: 'Requirements Added to Specification',
    })
  })

  it('uses actual deleted specification link counts in removeFromSpecification', async () => {
    mocks.unlinkRequirementsFromSpecification.mockResolvedValue(1)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.removeFromSpecification(makeContext(), {
      locale: 'en',
      specificationSlug: 'IAM-SPECIFICATION',
      requirementIds: [10, 11],
      responseFormat: 'json',
    })

    expect(result.removedCount).toBe(1)
    expect(JSON.parse(result.message)).toMatchObject({
      lines: ['Removed 1 requirement from specification IAM-SPECIFICATION.'],
      title: 'Requirements Removed from Specification',
    })
  })

  it('lists graduation target areas for actors who can author target areas without source specification access', async () => {
    mocks.canAuthorSpecification.mockResolvedValueOnce(false)
    mocks.listAreasActorCanAuthor.mockResolvedValue([
      {
        id: 2,
        name: 'Security',
        ownerId: 'alice',
        prefix: 'SEC',
      },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.listGraduationTargetAreas(makeContext(), {
      localRequirementId: 12,
      responseFormat: 'json',
      specificationSlug: 'IAM-SPECIFICATION',
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
      title: 'Requirements Library Target Areas',
    })
  })

  it('returns no graduation target areas when the actor cannot author any target area', async () => {
    mocks.canAuthorSpecification.mockResolvedValueOnce(false)
    mocks.listAreasActorCanAuthor.mockResolvedValueOnce([])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.listGraduationTargetAreas(makeContext(), {
      localRequirementId: 12,
      responseFormat: 'json',
      specificationSlug: 'IAM-SPECIFICATION',
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
      title: 'Requirements Library Target Areas',
    })
  })

  it('returns not found for graduation target areas when the local requirement does not exist', async () => {
    mocks.getSpecificationLocalRequirementDetail.mockResolvedValueOnce(null)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    await expect(
      service.listGraduationTargetAreas(makeContext(), {
        localRequirementId: 12,
        responseFormat: 'json',
        specificationSlug: 'IAM-SPECIFICATION',
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
      ownerId: 'alice',
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
        ownerId: 'alice',
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    const result = await service.graduateSpecificationLocalRequirement(
      makeContext(),
      {
        localRequirementId: 12,
        requirementAreaId: 2,
        responseFormat: 'json',
        specificationSlug: 'IAM-SPECIFICATION',
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
          specificationSlug: 'IAM-SPECIFICATION',
          targetRequirementAreaId: 2,
        }),
        event: 'requirements.high_risk_mutation.succeeded',
      }),
    ])
  })

  it('denies graduation when the actor cannot author the target area', async () => {
    mocks.canAuthorArea.mockResolvedValueOnce(false)
    mocks.getAreaById.mockResolvedValue({
      id: 2,
      name: 'Security',
      ownerId: 'alice',
      prefix: 'SEC',
    })
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
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
        specificationSlug: 'IAM-SPECIFICATION',
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(
      mocks.graduateSpecificationLocalRequirementToLibrary,
    ).not.toHaveBeenCalled()
  })

  it('does not emit specification addition audit events when no links are added', async () => {
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(0)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    await service.addToSpecification(makeContext(), {
      specificationSlug: 'IAM-SPECIFICATION',
      requirementIds: [10],
    })

    expect(emittedSecurityEvents()).toEqual([])
  })

  it('emits security audit events for high-risk requirement mutations', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
        event: 'requirements.high_risk_mutation.succeeded',
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
        event: 'requirements.high_risk_mutation.succeeded',
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
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    await service.removeFromSpecification(makeContext(), {
      specificationSlug: 'IAM-SPECIFICATION',
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
          specificationSlug: 'IAM-SPECIFICATION',
        }),
        event: 'requirements.high_risk_mutation.succeeded',
      }),
    ])
  })

  it('emits security audit events for specification additions', async () => {
    mocks.getPublishedVersionIdForRequirement
      .mockResolvedValueOnce(201)
      .mockResolvedValueOnce(202)
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(2)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

    await service.addToSpecification(makeContext(), {
      locale: 'sv',
      specificationSlug: 'IAM-SPECIFICATION',
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
          specificationSlug: 'IAM-SPECIFICATION',
        }),
        event: 'requirements.high_risk_mutation.succeeded',
      }),
    ])
  })

  it('emits security audit events for deviation decisions', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
        event: 'requirements.high_risk_mutation.succeeded',
      }),
    ])
  })

  it('emits security audit events for suggestion resolutions', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
        event: 'requirements.high_risk_mutation.succeeded',
      }),
    ])
  })

  it('rejects unsupported suggestion operations without deleting', async () => {
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })

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
})
