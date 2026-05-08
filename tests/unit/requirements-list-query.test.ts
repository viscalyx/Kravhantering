import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { queryRequirementList } from '@/lib/requirements/list-query'

const mocks = vi.hoisted(() => ({
  countRequirements: vi.fn(),
  formatRequirementListItem: vi.fn((row: unknown) => row),
  listRequirements: vi.fn(),
}))

vi.mock('@/lib/dal/requirements', () => ({
  STATUS_ARCHIVED: 4,
  countRequirements: mocks.countRequirements,
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
    requestId: 'request-1',
    source: 'rest',
  }
}

describe('queryRequirementList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countRequirements.mockResolvedValue(0)
    mocks.listRequirements.mockResolvedValue([])
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
    expect(mocks.countRequirements).not.toHaveBeenCalled()
  })

  it('clamps invalid, negative, and oversized pagination input', async () => {
    await queryRequirementList({} as never, {
      limit: Number.NaN,
      offset: Number.NaN,
    })

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 200, offset: 0 }),
    )

    await queryRequirementList({} as never, {
      limit: 9999,
      offset: -5,
    })

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 200, offset: 0 }),
    )

    await queryRequirementList({} as never, {
      limit: 0,
      offset: 3.7,
    })

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 1, offset: 3 }),
    )
  })

  it('uses the archived status constant when inferring archived inclusion', async () => {
    await queryRequirementList({} as never, {
      filters: { statuses: [4] },
    })

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ includeArchived: true, statuses: [4] }),
    )

    await queryRequirementList({} as never, {
      filters: { statuses: [3] },
    })

    expect(mocks.listRequirements).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ includeArchived: false, statuses: [3] }),
    )
  })
})
