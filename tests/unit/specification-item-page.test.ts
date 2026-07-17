import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enrichSpecificationItemPage: vi.fn(),
  listSpecificationItemPageCandidates: vi.fn(),
}))

vi.mock('@/lib/dal/specification-item-page', () => mocks)

import {
  normalizeSpecificationItemFilters,
  querySpecificationItemPage,
} from '@/lib/requirements/specification-item-page'

const candidates = [
  {
    kindRank: 0 as const,
    nullRank: 0 as const,
    sortValue: 'REQ-001',
    sourceId: 31,
    uniqueId: 'REQ-001',
  },
  {
    kindRank: 1 as const,
    nullRank: 0 as const,
    sortValue: 'REQ-002',
    sourceId: 41,
    uniqueId: 'REQ-002',
  },
  {
    kindRank: 0 as const,
    nullRank: 0 as const,
    sortValue: 'REQ-003',
    sourceId: 32,
    uniqueId: 'REQ-003',
  },
]

describe('querySpecificationItemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listSpecificationItemPageCandidates.mockResolvedValue(candidates)
    mocks.enrichSpecificationItemPage.mockResolvedValue([
      { id: 11, itemRef: 'lib:31', uniqueId: 'REQ-001' },
    ])
  })

  it('normalizes equivalent filters deterministically', () => {
    expect(
      normalizeSpecificationItemFilters({
        areaIds: [3, 1, 3, -1],
        descriptionSearch: '  secure  ',
        uniqueIdSearch: '   ',
        verifiable: ['false', 'true', 'false', 'invalid'],
      }),
    ).toEqual(
      expect.objectContaining({
        areaIds: [1, 3],
        descriptionSearch: 'secure',
        uniqueIdSearch: undefined,
        verifiable: ['false', 'true'],
      }),
    )
  })

  it('selects only limit plus one candidates and enriches the page', async () => {
    const result = await querySpecificationItemPage({} as never, {
      limit: 1,
      specificationId: 7,
    })

    expect(mocks.listSpecificationItemPageCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 2, specificationId: 7 }),
    )
    expect(mocks.enrichSpecificationItemPage).toHaveBeenCalledWith(
      expect.anything(),
      7,
      [candidates[0]],
    )
    expect(result).toMatchObject({
      pagination: { count: 1, hasMore: true, limit: 1 },
    })
    expect(result.pagination.nextCursor).toEqual(expect.any(String))
  })

  it('allows a smaller continuation limit because page size is not fingerprinted', async () => {
    const first = await querySpecificationItemPage({} as never, {
      filters: { areaIds: [2, 1] },
      limit: 2,
      specificationId: 7,
    })
    mocks.listSpecificationItemPageCandidates.mockResolvedValueOnce([])
    mocks.enrichSpecificationItemPage.mockResolvedValueOnce([])

    await expect(
      querySpecificationItemPage({} as never, {
        cursor: first.pagination.nextCursor ?? undefined,
        filters: { areaIds: [1, 2] },
        limit: 1,
        specificationId: 7,
      }),
    ).resolves.toMatchObject({
      pagination: { count: 0, hasMore: false, limit: 1 },
    })
  })

  it('rejects continuation when normalized query identity changes', async () => {
    const first = await querySpecificationItemPage({} as never, {
      filters: { descriptionSearch: 'first query' },
      limit: 2,
      specificationId: 7,
    })

    await expect(
      querySpecificationItemPage({} as never, {
        cursor: first.pagination.nextCursor ?? undefined,
        filters: { descriptionSearch: 'different query' },
        limit: 1,
        specificationId: 7,
      }),
    ).rejects.toMatchObject({ code: 'invalid_cursor', status: 400 })
  })

  it.each([0, 101, 1.5])('rejects an out-of-contract limit', async limit => {
    await expect(
      querySpecificationItemPage({} as never, {
        limit,
        specificationId: 7,
      }),
    ).rejects.toMatchObject({ code: 'validation', status: 400 })
  })
})
