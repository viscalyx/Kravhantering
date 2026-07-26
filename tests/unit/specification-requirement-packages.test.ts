import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPage: vi.fn(),
  resolveSelected: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  listSpecificationRequirementPackagePage: (...args: unknown[]) =>
    mocks.listPage(...args),
  resolveSpecificationRequirementPackages: (...args: unknown[]) =>
    mocks.resolveSelected(...args),
}))

import { querySpecificationRequirementPackagePage } from '@/lib/requirements/specification-requirement-packages'

const db = { query: vi.fn() } as never

describe('specification requirement package pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveSelected.mockResolvedValue([])
  })

  it('uses limit plus one and continues with a name-and-id keyset cursor', async () => {
    const firstRows = Array.from({ length: 51 }, (_, index) => ({
      id: index + 1,
      name: `Package ${String(index + 1).padStart(2, '0')}`,
      purposeAndScope: null,
    }))
    mocks.listPage.mockResolvedValueOnce(firstRows)

    const first = await querySpecificationRequirementPackagePage(db, {
      search: ' package ',
      specificationId: 7,
    })

    expect(first.requirementPackages).toHaveLength(50)
    expect(first.pagination).toEqual({
      count: 50,
      hasMore: true,
      limit: 50,
      nextCursor: expect.any(String),
    })
    expect(mocks.listPage).toHaveBeenCalledWith(db, 7, {
      after: undefined,
      limit: 51,
      search: 'package',
    })

    mocks.listPage.mockResolvedValueOnce([
      { id: 51, name: 'Package 51', purposeAndScope: null },
    ])
    const second = await querySpecificationRequirementPackagePage(db, {
      cursor: first.pagination.nextCursor ?? undefined,
      search: 'package',
      specificationId: 7,
    })

    expect(mocks.listPage).toHaveBeenLastCalledWith(db, 7, {
      after: { id: 50, name: 'Package 50' },
      limit: 51,
      search: 'package',
    })
    expect(second.pagination).toEqual({
      count: 1,
      hasMore: false,
      limit: 50,
      nextCursor: null,
    })
  })

  it('rejects a cursor when the normalized search changes', async () => {
    mocks.listPage.mockResolvedValueOnce(
      Array.from({ length: 51 }, (_, index) => ({
        id: index + 1,
        name: `Package ${index + 1}`,
        purposeAndScope: null,
      })),
    )
    const first = await querySpecificationRequirementPackagePage(db, {
      search: 'alpha',
      specificationId: 7,
    })

    await expect(
      querySpecificationRequirementPackagePage(db, {
        cursor: first.pagination.nextCursor ?? undefined,
        search: 'beta',
        specificationId: 7,
      }),
    ).rejects.toMatchObject({ code: 'invalid_cursor', status: 400 })
  })

  it('resolves normalized selected IDs separately from the visible page', async () => {
    mocks.listPage.mockResolvedValue([])
    mocks.resolveSelected.mockResolvedValue([
      { id: 7, name: 'Selected', purposeAndScope: 'Scope' },
    ])

    const result = await querySpecificationRequirementPackagePage(db, {
      includeIds: [7, 3],
      limit: 100,
      specificationId: 9,
    })

    expect(mocks.resolveSelected).toHaveBeenCalledWith(db, 9, [3, 7])
    expect(result.selectedRequirementPackages).toEqual([
      { id: 7, name: 'Selected', purposeAndScope: 'Scope' },
    ])
    expect(result.pagination.limit).toBe(100)
  })

  it('rejects duplicate selected IDs and out-of-range page limits', async () => {
    await expect(
      querySpecificationRequirementPackagePage(db, {
        includeIds: [7, 7],
        specificationId: 9,
      }),
    ).rejects.toMatchObject({ code: 'validation', status: 400 })
    await expect(
      querySpecificationRequirementPackagePage(db, {
        limit: 101,
        specificationId: 9,
      }),
    ).rejects.toMatchObject({ code: 'validation', status: 400 })
    expect(mocks.listPage).not.toHaveBeenCalled()
  })
})
