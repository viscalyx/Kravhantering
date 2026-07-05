import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}
const mocks = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  getSpecificationByCode: vi.fn(),
  getSpecificationById: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/requirements-specifications', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/dal/requirements-specifications')
    >()
  return {
    ...actual,
    getSpecificationByCode: mocks.getSpecificationByCode,
    getSpecificationById: mocks.getSpecificationById,
  }
})

import { resolveRequirementsSpecificationRouteParam } from '@/lib/specifications/preload'

describe('specifications preload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
    mocks.getSpecificationByCode.mockResolvedValue(null)
    mocks.getSpecificationById.mockResolvedValue({ id: 42 })
  })

  it('resolves canonical numeric specification route params by id', async () => {
    await expect(
      resolveRequirementsSpecificationRouteParam('42'),
    ).resolves.toEqual({
      fromCode: false,
      id: 42,
    })
    expect(mocks.getSpecificationById).toHaveBeenCalledWith(mockDb, 42)
    expect(mocks.getSpecificationByCode).not.toHaveBeenCalled()
  })

  it('rejects oversized numeric route params before converting to Number', async () => {
    await expect(
      resolveRequirementsSpecificationRouteParam('2147483648'),
    ).resolves.toBeNull()
    expect(mocks.getSpecificationById).not.toHaveBeenCalled()
    expect(mocks.getSpecificationByCode).not.toHaveBeenCalled()
  })

  it('resolves nonnumeric route params by specification code', async () => {
    mocks.getSpecificationByCode.mockResolvedValueOnce({ id: 9 })

    await expect(
      resolveRequirementsSpecificationRouteParam('ETJANST-UPP-2026'),
    ).resolves.toEqual({
      fromCode: true,
      id: 9,
    })
    expect(mocks.getSpecificationByCode).toHaveBeenCalledWith(
      mockDb,
      'ETJANST-UPP-2026',
    )
    expect(mocks.getSpecificationById).not.toHaveBeenCalled()
  })
})
