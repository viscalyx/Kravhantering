import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { queryRequirementList } from '@/lib/requirements/list-query'

const mocks = vi.hoisted(() => ({
  formatRequirementListItem: vi.fn((row: unknown) => row),
  getRequirementListSeekAnchor: vi.fn(),
  listRequirements: vi.fn(),
}))

vi.mock('@/lib/dal/requirements', () => ({
  STATUS_ARCHIVED: 4,
  getRequirementListSeekAnchor: mocks.getRequirementListSeekAnchor,
  listRequirements: mocks.listRequirements,
}))

vi.mock('@/lib/requirements/service', () => ({
  formatRequirementListItem: mocks.formatRequirementListItem,
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
    mocks.getRequirementListSeekAnchor.mockResolvedValue({
      nullRank: 0,
      sortValue: 'REQ-200',
      uniqueId: 'REQ-200',
    })
    mocks.listRequirements.mockResolvedValue([])
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

    expect(mocks.getRequirementListSeekAnchor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: undefined }),
      2,
    )
    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        after: expect.objectContaining({ uniqueId: 'REQ-200' }),
        limit: 3,
      }),
    )
  })

  it('rejects a cursor when its query state changes', async () => {
    mocks.listRequirements.mockResolvedValueOnce([
      { id: 1, uniqueId: 'REQ-1' },
      { id: 2, uniqueId: 'REQ-2' },
    ])
    const firstPage = await queryRequirementList(
      {} as never,
      { limit: 1 },
      { allowUnauthenticated: true },
    )

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
})
