import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

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

    const service = createRequirementsService({} as never, { logger })
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

    const service = createRequirementsService({} as never, { logger })
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

  it('creates a requirement and syncs references', async () => {
    const service = createRequirementsService({} as never, { logger })
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

    const service = createRequirementsService({} as never, { logger })
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
    const service = createRequirementsService({} as never, { logger })

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
    const service = createRequirementsService({} as never, { logger })

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
    const service = createRequirementsService({} as never, { logger })

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
    const service = createRequirementsService({} as never, { logger })

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
})
