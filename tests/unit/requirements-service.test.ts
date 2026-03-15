import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'
import { normalizeUiTerminology } from '@/lib/ui-terminology'

const mocks = vi.hoisted(() => ({
  archiveRequirement: vi.fn(),
  countRequirements: vi.fn(),
  createRequirement: vi.fn(),
  deleteDraftVersion: vi.fn(),
  editRequirement: vi.fn(),
  getAreaById: vi.fn(),
  getRequirementById: vi.fn(),
  getRequirementByUniqueId: vi.fn(),
  getVersionHistory: vi.fn(),
  listAreas: vi.fn(),
  listCategories: vi.fn(),
  listRequirements: vi.fn(),
  listScenarios: vi.fn(),
  listStatuses: vi.fn(),
  listTransitions: vi.fn(),
  listTypeCategories: vi.fn(),
  listTypes: vi.fn(),
  reactivateRequirement: vi.fn(),
  replaceReferencesForVersion: vi.fn(),
  restoreVersion: vi.fn(),
  transitionStatus: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  getAreaById: mocks.getAreaById,
  listAreas: mocks.listAreas,
}))

vi.mock('@/lib/dal/requirement-categories', () => ({
  listCategories: mocks.listCategories,
}))

vi.mock('@/lib/dal/requirement-references', () => ({
  replaceReferencesForVersion: mocks.replaceReferencesForVersion,
}))

vi.mock('@/lib/dal/requirement-scenarios', () => ({
  listScenarios: mocks.listScenarios,
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  listStatuses: mocks.listStatuses,
  listTransitions: mocks.listTransitions,
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  listTypeCategories: mocks.listTypeCategories,
  listTypes: mocks.listTypes,
}))

vi.mock('@/lib/dal/requirements', () => ({
  archiveRequirement: mocks.archiveRequirement,
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
        references: [
          {
            id: 100,
            name: 'ISO 27001',
            owner: 'Security',
            uri: 'https://example.com/iso-27001',
          },
        ],
        requiresTesting: true,
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        type: {
          id: 1,
          nameEn: 'Functional',
          nameSv: 'Funktionellt',
        },
        typeCategory: {
          id: 9,
          nameEn: 'Security',
          nameSv: 'Sakerhet',
        },
        versionNumber: 1,
        versionScenarios: [
          {
            scenario: {
              descriptionEn: 'A login flow',
              descriptionSv: 'Ett inloggningsflode',
              id: 7,
              nameEn: 'Login',
              nameSv: 'Inloggning',
              owner: 'Product',
            },
          },
        ],
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
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'headers' as const,
    },
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

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listRequirements.mockResolvedValue([])
    mocks.countRequirements.mockResolvedValue(0)
    mocks.getRequirementById.mockResolvedValue(makeRequirementRecord())
    mocks.getRequirementByUniqueId.mockResolvedValue(makeRequirementRecord())
    mocks.getVersionHistory.mockResolvedValue([])
    mocks.getAreaById.mockResolvedValue({
      id: 1,
      name: 'Integration',
      ownerId: 'alice',
      prefix: 'INT',
    })
    mocks.createRequirement.mockResolvedValue({
      requirement: { id: 1, uniqueId: 'INT0001' },
      version: { id: 10, versionNumber: 1 },
    })
    mocks.editRequirement.mockResolvedValue({ id: 10, versionNumber: 2 })
    mocks.restoreVersion.mockResolvedValue({ id: 22, versionNumber: 4 })
    mocks.transitionStatus.mockResolvedValue({ id: 10, versionNumber: 1 })
  })

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
        requirementTypeCategoryId: 9,
        requirementTypeId: 1,
        requiresTesting: true,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        typeCategoryNameEn: 'Security',
        typeCategoryNameSv: 'Sakerhet',
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
        requirementTypeCategoryId: null,
        requirementTypeId: null,
        requiresTesting: false,
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
        typeCategoryNameEn: null,
        typeCategoryNameSv: null,
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
        description: 'Support secure integration',
        references: [
          {
            name: 'ISO 27001',
            uri: 'https://example.com/iso-27001',
          },
        ],
        scenarioIds: [7],
      },
    })

    expect(mocks.createRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        description: 'Support secure integration',
        requirementAreaId: 1,
        scenarioIds: [7],
      }),
    )
    expect(mocks.replaceReferencesForVersion).toHaveBeenCalledWith(
      expect.anything(),
      10,
      [
        {
          name: 'ISO 27001',
          uri: 'https://example.com/iso-27001',
        },
      ],
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
      assertAuthorized: vi
        .fn()
        .mockRejectedValueOnce(forbiddenError('Blocked by policy')),
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

  it('queries type_categories catalog', async () => {
    mocks.listTypeCategories.mockResolvedValue([
      { id: 1, nameSv: 'TK', nameEn: 'TC' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'type_categories',
      typeId: 1,
    })
    expect(result.catalog).toBe('type_categories')
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

  it('queries scenarios catalog', async () => {
    mocks.listScenarios.mockResolvedValue([
      { id: 1, nameSv: 'Scen', nameEn: 'Scene' },
    ])
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.queryCatalog(makeContext(), {
      catalog: 'scenarios',
    })
    expect(result.catalog).toBe('scenarios')
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
    mocks.replaceReferencesForVersion.mockResolvedValue(undefined)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'edit',
      requirement: { description: 'Updated text' },
    })
    expect(result.operation).toBe('edit')
    expect(mocks.editRequirement).toHaveBeenCalled()
  })

  it('archives a requirement', async () => {
    mocks.archiveRequirement.mockResolvedValue(undefined)
    const service = createRequirementsService({} as never, {
      logger,
      uiSettings: makeUiSettings(),
    })
    const result = await service.manageRequirement(makeContext(), {
      id: 1,
      operation: 'archive',
    })
    expect(result.operation).toBe('archive')
    expect(mocks.archiveRequirement).toHaveBeenCalled()
  })

  it('deletes a draft', async () => {
    mocks.deleteDraftVersion.mockResolvedValue({ deleted: 'requirement' })
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
    ).rejects.toMatchObject({ code: 'internal' })
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
    ).rejects.toMatchObject({ code: 'internal' })
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
  })

  it('resolves requirement by id for transition', async () => {
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
  })
})
