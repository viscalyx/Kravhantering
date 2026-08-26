import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}
const availableRequirementsSort = {
  by: 'uniqueId',
  direction: 'asc',
} as const
const mocks = vi.hoisted(() => ({
  createRequirementsRestRuntime: vi.fn(),
  createRequirementsRuntime: vi.fn(),
  getExistingSpecificationRequirementIds: vi.fn(),
  getRequirementSelectionFilterForSpecification: vi.fn(),
  listRequirements: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => mockDb),
}))

vi.mock('@/lib/dal/requirement-selection-questions', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/dal/requirement-selection-questions')
    >()
  return {
    ...actual,
    getExistingSpecificationRequirementIds:
      mocks.getExistingSpecificationRequirementIds,
    getRequirementSelectionFilterForSpecification:
      mocks.getRequirementSelectionFilterForSpecification,
  }
})

vi.mock('@/lib/dal/requirements', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/dal/requirements')>()
  return { ...actual, listRequirements: mocks.listRequirements }
})

vi.mock('@/lib/dal/requirements-specifications', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/dal/requirements-specifications')
    >()
  return {
    ...actual,
    getSpecificationByCode: vi.fn(async () => null),
    getSpecificationById: vi.fn(async (_db, id: number) => ({
      id,
      name: 'Parity specification',
      responsibleHsaId: 'SE5560000001-owner',
    })),
    getSpecificationForbiddenSummaryById: vi.fn(async () => null),
    listSpecificationCoAuthorHsaIds: vi.fn(async () => []),
    listSpecificationNeedsReferences: vi.fn(async () => []),
    listSpecificationsForActorCatalog: vi.fn(async () => ({
      coAuthorHsaIdsBySpecification: new Map(),
      specifications: [],
    })),
  }
})

vi.mock('@/lib/dal/ai-settings', () => ({
  getAiGenerationAvailability: vi.fn(async () => ({
    available: false,
    reason: null,
  })),
}))
vi.mock('@/lib/dal/norm-references', () => ({
  countLinkedRequirements: vi.fn(async () => ({})),
  listNormReferences: vi.fn(async () => []),
}))
vi.mock('@/lib/dal/requirement-areas', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/dal/requirement-areas')>()
  return {
    ...actual,
    listAreaIdsActorCanAuthor: vi.fn(async () => []),
    listAreas: vi.fn(async () => []),
  }
})
vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: vi.fn(async () => []),
}))
vi.mock('@/lib/dal/specification-governance-object-types', () => ({
  listSpecificationGovernanceObjectTypes: vi.fn(async () => []),
}))
vi.mock('@/lib/dal/specification-implementation-types', () => ({
  listSpecificationImplementationTypes: vi.fn(async () => []),
}))
vi.mock('@/lib/dal/specification-item-statuses', () => ({
  listSpecificationItemStatuses: vi.fn(async () => []),
}))
vi.mock('@/lib/dal/specification-lifecycle-statuses', () => ({
  listSpecificationLifecycleStatuses: vi.fn(async () => []),
}))
vi.mock('@/lib/requirements/specification-item-page', () => ({
  DEFAULT_SPECIFICATION_ITEM_PAGE_LIMIT: 50,
  querySpecificationItemPage: vi.fn(async () => ({
    items: [],
    pagination: { count: 0, hasMore: false, limit: 50, nextCursor: null },
  })),
}))
vi.mock('@/lib/requirements/specification-requirement-packages', () => ({
  DEFAULT_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT: 50,
  querySpecificationRequirementPackagePage: vi.fn(async () => ({
    packages: [],
    pagination: { count: 0, hasMore: false, limit: 50, nextCursor: null },
  })),
}))
vi.mock('@/lib/requirements/server-component-context', () => ({
  createServerComponentRequestContext: vi.fn(async () => ({
    actor: {
      hsaId: 'SE5560000001-owner',
      isAuthenticated: true,
      roles: [],
    },
    correlationId: 'parity-correlation',
    requestId: 'parity-request',
    source: 'rest',
  })),
}))
vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: mocks.createRequirementsRestRuntime,
  createRequirementsRuntime: mocks.createRequirementsRuntime,
}))

import { GET } from '@/app/api/requirements-specifications/[id]/available-requirements/route'
import { createRequirementsService } from '@/lib/requirements/service'
import { loadRequirementsSpecificationDetailInitialData } from '@/lib/specifications/preload'

describe('available requirement adapter parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getExistingSpecificationRequirementIds.mockResolvedValue([
      11, 12, 13, 14,
    ])
    mocks.getRequirementSelectionFilterForSpecification.mockResolvedValue({
      hasCurrentAnswers: true,
      hasNoRequirementSelection: false,
      hasRequirementSelection: true,
      requirementIds: [21],
    })
    const rows = [
      { id: 11, status: 3 },
      { id: 21, status: 3 },
      { id: 31, status: 3 },
      { id: 41, status: 1 },
    ]
    mocks.listRequirements.mockImplementation(async (_db, options) =>
      rows
        .filter(
          row =>
            options.statuses?.includes(row.status) &&
            !options.excludeRequirementIds?.includes(row.id),
        )
        .map(row => ({
          ...row,
          cursorBoundary: {
            nullRank: 0,
            requirementId: row.id,
            sortValue: `REQ-${row.id}`,
          },
          isArchived: false,
          maxVersion: 1,
          normReferenceIds: null,
          normReferenceUris: null,
          requirementPackages: [],
          suggestionCount: 0,
          uniqueId: `REQ-${row.id}`,
          versionNumber: 1,
        })),
    )
    const authorization = { assertAuthorized: vi.fn(async () => {}) }
    const service = createRequirementsService(mockDb as never, {
      authorization,
    })
    const context = {
      actor: {
        hsaId: 'SE5560000001-owner',
        isAuthenticated: true,
        roles: [],
      },
      correlationId: 'parity-correlation',
      requestId: 'parity-request',
      source: 'rest' as const,
    }
    mocks.createRequirementsRuntime.mockReturnValue({
      authorization,
      db: mockDb,
      logger: { error: vi.fn(), info: vi.fn() },
      service,
    })
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      authorization,
      context,
      db: mockDb,
      logger: { error: vi.fn(), info: vi.fn() },
      service,
    })
  })

  it('returns equivalent preload and refresh pages for identical domain input', async () => {
    const preload = await loadRequirementsSpecificationDetailInitialData({
      locale: 'en',
      specificationId: 42,
    })
    const response = await GET(
      new NextRequest(
        `http://localhost/api/requirements-specifications/42/available-requirements?limit=200&locale=en&sortBy=${availableRequirementsSort.by}&sortDirection=${availableRequirementsSort.direction}`,
      ),
      { params: Promise.resolve({ id: '42' }) },
    )
    const refresh = await response.json()

    expect(response.status).toBe(200)
    expect(preload.availableRequirements).toEqual({
      hasMore: refresh.pagination.hasMore,
      nextCursor: refresh.pagination.nextCursor,
      rows: refresh.requirements,
      selectionFilter: refresh.selectionFilter,
    })
    expect(refresh.requirements.map((row: { id: number }) => row.id)).toEqual([
      21, 31,
    ])
    expect(mocks.listRequirements).toHaveBeenNthCalledWith(
      1,
      mockDb,
      expect.objectContaining({
        sortBy: availableRequirementsSort.by,
        sortDirection: availableRequirementsSort.direction,
      }),
    )
    expect(mocks.listRequirements).toHaveBeenNthCalledWith(
      2,
      mockDb,
      expect.objectContaining({
        sortBy: availableRequirementsSort.by,
        sortDirection: availableRequirementsSort.direction,
      }),
    )
  })
})
