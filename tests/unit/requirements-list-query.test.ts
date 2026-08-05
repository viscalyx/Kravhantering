import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  normalizeRequirementListFilters,
  queryRequirementList,
  traverseCompleteRequirementList,
} from '@/lib/requirements/list-query'

const mocks = vi.hoisted(() => ({
  formatRequirementListItem: vi.fn((row: unknown) => row),
  listRequirements: vi.fn(),
  recordCapacityEvent: vi.fn(),
  resolveRequirementListVisibility: vi.fn(),
  throwIfGenerationAborted: vi.fn(),
}))

vi.mock('@/lib/dal/requirements', () => ({
  STATUS_ARCHIVED: 4,
  listRequirements: mocks.listRequirements,
}))

vi.mock('@/lib/requirements/service', () => ({
  formatRequirementListItem: mocks.formatRequirementListItem,
}))

vi.mock('@/lib/observability/capacity', () => ({
  recordCapacityEvent: mocks.recordCapacityEvent,
}))

vi.mock('@/lib/requirements/visibility', () => ({
  resolveRequirementListVisibility: mocks.resolveRequirementListVisibility,
}))

vi.mock('@/lib/generated-output/operation', () => ({
  throwIfGenerationAborted: mocks.throwIfGenerationAborted,
}))

function makeContext(): RequestContext {
  return {
    actor: {
      displayName: 'Test User',
      hsaId: null,
      id: 'user-1',
      isAuthenticated: true,
      roles: ['admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    requestId: 'request-1',
    source: 'rest',
  }
}

describe('queryRequirementList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listRequirements.mockResolvedValue([])
    mocks.resolveRequirementListVisibility.mockResolvedValue({
      publishedOnly: false,
    })
  })

  it('normalizes all filter types and discards invalid values', () => {
    expect(
      normalizeRequirementListFilters({
        areaIds: [3, -1, 3, 2.5, 1],
        categoryIds: [2],
        descriptionSearch: '  spaced   words ',
        needsReferenceIds: [0, 8],
        normReferenceIds: [7],
        priorityLevelIds: [6],
        qualityCharacteristicIds: [5],
        requirementPackageIds: [4],
        specificationItemStatusIds: [3],
        statuses: [2],
        typeIds: [1],
        uniqueIdSearch: '  REQ  42 ',
        verifiable: ['false', 'invalid', 'true', 'true'],
      }),
    ).toEqual({
      areaIds: [1, 3],
      categoryIds: [2],
      descriptionSearch: 'spaced words',
      needsReferenceIds: [8],
      normReferenceIds: [7],
      priorityLevelIds: [6],
      qualityCharacteristicIds: [5],
      requirementPackageIds: [4],
      specificationItemStatusIds: [3],
      statuses: [2],
      typeIds: [1],
      uniqueIdSearch: 'REQ 42',
      verifiable: ['false', 'true'],
    })
    expect(
      normalizeRequirementListFilters({
        areaIds: [],
        descriptionSearch: ' ',
        verifiable: [],
      }),
    ).toEqual(
      expect.objectContaining({
        areaIds: undefined,
        descriptionSearch: undefined,
        verifiable: undefined,
      }),
    )
  })

  it('fails closed when authorization options are missing', async () => {
    await expect(queryRequirementList({} as never, {})).rejects.toMatchObject({
      code: 'unauthorized',
    })

    expect(mocks.listRequirements).not.toHaveBeenCalled()
  })

  it('requires an explicit authorization service when a context is provided', async () => {
    await expect(
      queryRequirementList({} as never, {}, { context: makeContext() }),
    ).rejects.toMatchObject({
      code: 'unauthorized',
    })

    expect(mocks.listRequirements).not.toHaveBeenCalled()
  })

  it('authorizes requirements list queries before reading rows', async () => {
    const context = makeContext()
    const authorization = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    }

    await queryRequirementList(
      {} as never,
      {},
      {
        authorization,
        context,
      },
    )

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'query_catalog', catalog: 'requirements' },
      context,
    )
    expect(mocks.listRequirements).toHaveBeenCalled()
    expect(
      authorization.assertAuthorized.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.listRequirements.mock.invocationCallOrder[0])
    expect(mocks.resolveRequirementListVisibility).toHaveBeenCalledWith(
      expect.anything(),
      context,
    )
  })

  it('allows callers to opt out of authorization explicitly', async () => {
    await queryRequirementList({} as never, {}, { allowUnauthenticated: true })

    expect(mocks.listRequirements).toHaveBeenCalled()
  })

  it('does not query rows when authorization rejects the request', async () => {
    const authorization = {
      assertAuthorized: vi.fn().mockRejectedValue(new Error('denied')),
    }

    await expect(
      queryRequirementList(
        {} as never,
        {},
        {
          authorization,
          context: makeContext(),
        },
      ),
    ).rejects.toThrow('denied')

    expect(mocks.listRequirements).not.toHaveBeenCalled()
  })

  it('clamps invalid and oversized page sizes and requests one lookahead row', async () => {
    await queryRequirementList(
      {} as never,
      {
        limit: Number.NaN,
      },
      { allowUnauthenticated: true },
    )

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 201 }),
    )

    await queryRequirementList(
      {} as never,
      {
        limit: 9999,
      },
      { allowUnauthenticated: true },
    )

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 201 }),
    )

    await queryRequirementList(
      {} as never,
      {
        limit: 0,
      },
      { allowUnauthenticated: true },
    )

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 2 }),
    )
  })

  it('returns a forward cursor without running a count query', async () => {
    mocks.listRequirements.mockResolvedValueOnce(
      Array.from({ length: 3 }, (_, index) => ({
        cursorBoundary: {
          nullRank: 0,
          requirementId: index + 1,
          sortValue: `REQ-${index + 1}`,
        },
        id: index + 1,
        uniqueId: `REQ-${index + 1}`,
      })),
    )

    const firstPage = await queryRequirementList(
      {} as never,
      { limit: 2 },
      { allowUnauthenticated: true },
    )

    expect(firstPage.requirements).toHaveLength(2)
    expect(firstPage.pagination).toMatchObject({
      count: 2,
      hasMore: true,
      limit: 2,
    })
    expect(firstPage.pagination.nextCursor).toEqual(expect.any(String))

    mocks.listRequirements.mockResolvedValueOnce([])
    await queryRequirementList(
      {} as never,
      { cursor: firstPage.pagination.nextCursor ?? undefined, limit: 2 },
      { allowUnauthenticated: true },
    )

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        after: expect.objectContaining({ requirementId: 2 }),
        limit: 3,
      }),
    )
  })

  it('allows a reduced page size while rejecting changed query state', async () => {
    mocks.listRequirements.mockResolvedValueOnce([
      {
        cursorBoundary: {
          nullRank: 0,
          requirementId: 1,
          sortValue: 'REQ-1',
        },
        id: 1,
        uniqueId: 'REQ-1',
      },
      {
        cursorBoundary: {
          nullRank: 0,
          requirementId: 2,
          sortValue: 'REQ-2',
        },
        id: 2,
        uniqueId: 'REQ-2',
      },
    ])
    const firstPage = await queryRequirementList(
      {} as never,
      { limit: 1 },
      { allowUnauthenticated: true },
    )

    mocks.listRequirements.mockResolvedValueOnce([])
    await expect(
      queryRequirementList(
        {} as never,
        {
          cursor: firstPage.pagination.nextCursor ?? undefined,
          limit: 2,
        },
        { allowUnauthenticated: true },
      ),
    ).resolves.toMatchObject({ pagination: { limit: 2 } })

    await expect(
      queryRequirementList(
        {} as never,
        {
          cursor: firstPage.pagination.nextCursor ?? undefined,
          limit: 1,
          locale: 'sv',
        },
        { allowUnauthenticated: true },
      ),
    ).rejects.toMatchObject({ code: 'invalid_cursor', status: 400 })
  })

  it('uses the archived status constant when inferring archived inclusion', async () => {
    await queryRequirementList(
      {} as never,
      {
        filters: { statuses: [4] },
      },
      { allowUnauthenticated: true },
    )

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ includeArchived: true, statuses: [4] }),
    )

    await queryRequirementList(
      {} as never,
      {
        filters: { statuses: [3] },
      },
      { allowUnauthenticated: true },
    )

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ includeArchived: false, statuses: [3] }),
    )
  })

  it('normalizes query fields, formats search matches, and records capacity', async () => {
    const context = {
      ...makeContext(),
      source: 'mcp' as const,
      toolName: 'requirements_query',
    }
    const authorization = { assertAuthorized: vi.fn() }
    mocks.listRequirements.mockResolvedValueOnce([
      {
        cursorBoundary: { nullRank: 0, requirementId: 2, sortValue: 'REQ-2' },
        id: 2,
        matchedFields: ['description'],
        uniqueId: 'REQ-2',
      },
    ])

    const result = await queryRequirementList(
      {} as never,
      {
        capacityOperation: 'search',
        capacitySurface: 'mcp',
        excludeRequirementIds: [9, 9, -1],
        filters: {
          areaIds: [2],
          categoryIds: [3],
          descriptionSearch: '  text  value ',
          normReferenceIds: [4],
          priorityLevelIds: [5],
          qualityCharacteristicIds: [6],
          requirementPackageIds: [7],
          statuses: [3],
          typeIds: [8],
          uniqueIdSearch: ' REQ ',
          verifiable: ['true'],
        },
        includeArchived: true,
        locale: 'sv',
        requirementIds: [2],
        search: '  needle  text ',
        sort: { by: 'description', direction: 'desc' },
      },
      { authorization, context },
    )

    expect(result.requirements[0]).toEqual(
      expect.objectContaining({
        id: 2,
        match: { matchedFields: ['description'] },
      }),
    )
    expect(mocks.listRequirements).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        areaIds: [2],
        categoryIds: [3],
        descriptionSearch: 'text value',
        excludeRequirementIds: [9],
        includeArchived: true,
        locale: 'sv',
        normReferenceIds: [4],
        priorityLevelIds: [5],
        publishedOnly: false,
        qualityCharacteristicIds: [6],
        requirementIds: [2],
        requirementPackageIds: [7],
        search: 'needle text',
        sortBy: 'description',
        sortDirection: 'desc',
        statuses: [3],
        typeIds: [8],
        uniqueIdSearch: 'REQ',
        verifiable: [true],
      }),
    )
    expect(mocks.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'requirements.library_page.search',
        outcome: 'success',
        source: 'mcp',
        statusCode: 200,
        surface: 'mcp',
        toolName: 'requirements_query',
      }),
    )
  })

  it('records typed and unexpected capacity failures before rethrowing', async () => {
    mocks.listRequirements.mockRejectedValueOnce(new Error('database down'))

    await expect(
      queryRequirementList(
        {} as never,
        { capacitySurface: 'rest' },
        { allowUnauthenticated: true },
      ),
    ).rejects.toThrow('database down')
    expect(mocks.recordCapacityEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'error',
        outcome: 'failure',
        source: 'server',
        statusCode: 500,
      }),
    )

    await expect(
      queryRequirementList(
        {} as never,
        { capacitySurface: 'rest', cursor: 'not-a-cursor' },
        { allowUnauthenticated: true },
      ),
    ).rejects.toMatchObject({ code: 'invalid_cursor' })
    expect(mocks.recordCapacityEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursorFailureCategory: 'invalid_cursor',
        level: 'warn',
        statusCode: 400,
      }),
    )
  })

  it('traverses every page, checks abort signals, and visits in order', async () => {
    const firstPage = Array.from({ length: 201 }, (_, index) => ({
      cursorBoundary: {
        nullRank: 0,
        requirementId: index + 1,
        sortValue: `REQ-${index + 1}`,
      },
      id: index + 1,
      uniqueId: `REQ-${index + 1}`,
    }))
    mocks.listRequirements
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        {
          cursorBoundary: {
            nullRank: 0,
            requirementId: 201,
            sortValue: 'REQ-201',
          },
          id: 201,
          uniqueId: 'REQ-201',
        },
      ])
    const visitPage = vi.fn()

    await expect(
      traverseCompleteRequirementList(
        {} as never,
        {},
        { allowUnauthenticated: true },
        visitPage,
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ itemCount: 201, pageCount: 2 })
    expect(visitPage).toHaveBeenNthCalledWith(1, firstPage.slice(0, 200), 1)
    expect(visitPage).toHaveBeenNthCalledWith(2, [firstPage[200]], 2)
    expect(mocks.throwIfGenerationAborted).toHaveBeenCalledTimes(4)
  })

  it('enforces traversal item bounds with custom and default errors', async () => {
    mocks.listRequirements.mockResolvedValue([
      { id: 1, uniqueId: 'REQ-1' },
      { id: 2, uniqueId: 'REQ-2' },
    ])
    const customError = new Error('custom item limit')

    await expect(
      traverseCompleteRequirementList(
        {} as never,
        {},
        { allowUnauthenticated: true },
        vi.fn(),
        { createItemLimitError: () => customError, maxItems: 1 },
      ),
    ).rejects.toBe(customError)

    await expect(
      traverseCompleteRequirementList(
        {} as never,
        {},
        { allowUnauthenticated: true },
        vi.fn(),
        { maxItems: 1 },
      ),
    ).rejects.toMatchObject({
      code: 'internal',
      details: { reason: 'complete_result_item_bound' },
    })
  })

  it('rejects duplicate requirements and cyclic continuations', async () => {
    const page = Array.from({ length: 201 }, (_, index) => ({
      cursorBoundary: {
        nullRank: 0,
        requirementId: index + 1,
        sortValue: `REQ-${index + 1}`,
      },
      id: index + 1,
      uniqueId: `REQ-${index + 1}`,
    }))
    mocks.listRequirements
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([{ ...page[0], cursorBoundary: undefined }])

    await expect(
      traverseCompleteRequirementList(
        {} as never,
        {},
        { allowUnauthenticated: true },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'complete_result_duplicate_requirement' },
    })

    const cyclicPage = Array.from({ length: 201 }, (_, index) => ({
      cursorBoundary:
        index === 199
          ? page[199].cursorBoundary
          : {
              nullRank: 0,
              requirementId: index + 201,
              sortValue: `REQ-${index + 201}`,
            },
      id: index + 201,
      uniqueId: `REQ-${index + 201}`,
    }))
    mocks.listRequirements.mockReset()
    mocks.listRequirements
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(cyclicPage)
    await expect(
      traverseCompleteRequirementList(
        {} as never,
        {},
        { allowUnauthenticated: true },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'complete_result_cursor_cycle' },
    })
  })
})
