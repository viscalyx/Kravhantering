import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enrichSpecificationItemPage: vi.fn(),
  listSpecificationItemPageCandidates: vi.fn(),
}))

vi.mock('@/lib/dal/specification-item-page', () => mocks)

import {
  normalizeSpecificationItemFilters,
  querySpecificationItemPage,
  traverseCompleteSpecificationItemResult,
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

describe('traverseCompleteSpecificationItemResult', () => {
  const fullCandidatePage = Array.from({ length: 101 }, (_, index) => ({
    kindRank: 0 as const,
    nullRank: 0 as const,
    sortValue: `REQ-${index + 1}`,
    sourceId: index + 1,
    uniqueId: `REQ-${index + 1}`,
  }))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('visits bounded pages until the database result is complete', async () => {
    mocks.listSpecificationItemPageCandidates
      .mockResolvedValueOnce(fullCandidatePage)
      .mockResolvedValueOnce([fullCandidatePage[100]])
    mocks.enrichSpecificationItemPage
      .mockResolvedValueOnce([{ itemRef: 'lib:1', uniqueId: 'REQ-1' }])
      .mockResolvedValueOnce([{ itemRef: 'lib:101', uniqueId: 'REQ-101' }])
    const visited: string[][] = []

    const result = await traverseCompleteSpecificationItemResult(
      {} as never,
      { specificationId: 7 },
      items => {
        visited.push(items.map(item => item.itemRef ?? ''))
      },
    )

    expect(result).toEqual({ itemCount: 2, pageCount: 2 })
    expect(visited).toEqual([['lib:1'], ['lib:101']])
    expect(mocks.listSpecificationItemPageCandidates).toHaveBeenCalledTimes(2)
    expect(
      mocks.listSpecificationItemPageCandidates.mock.calls[0]?.[1],
    ).toMatchObject({ limit: 101 })
  })

  it('rejects duplicate stable references across pages', async () => {
    mocks.listSpecificationItemPageCandidates
      .mockResolvedValueOnce(fullCandidatePage)
      .mockResolvedValueOnce([fullCandidatePage[100]])
    mocks.enrichSpecificationItemPage.mockResolvedValue([
      { itemRef: 'lib:1', uniqueId: 'REQ-1' },
    ])

    await expect(
      traverseCompleteSpecificationItemResult(
        {} as never,
        { specificationId: 7 },
        () => undefined,
      ),
    ).rejects.toMatchObject({
      code: 'internal',
      details: { reason: 'complete_result_duplicate_reference' },
    })
  })

  it('rejects cyclic continuation cursors', async () => {
    mocks.listSpecificationItemPageCandidates.mockResolvedValue(
      fullCandidatePage,
    )
    mocks.enrichSpecificationItemPage
      .mockResolvedValueOnce([{ itemRef: 'lib:1', uniqueId: 'REQ-1' }])
      .mockResolvedValueOnce([{ itemRef: 'lib:2', uniqueId: 'REQ-2' }])

    await expect(
      traverseCompleteSpecificationItemResult(
        {} as never,
        { specificationId: 7 },
        () => undefined,
      ),
    ).rejects.toMatchObject({
      code: 'internal',
      details: { reason: 'complete_result_cursor_cycle' },
    })
  })
})
