import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}

const mocks = {
  getPackageById: vi.fn(),
  getPackageByRef: vi.fn(),
  getPackageBySlug: vi.fn(),
  getPackageItemByRef: vi.fn(),
  listPackageItems: vi.fn(),
  updatePackageItemFieldsByItemRef: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
  getPackageItemByRef: (...args: unknown[]) =>
    mocks.getPackageItemByRef(...args),
  listPackageItems: (...args: unknown[]) => mocks.listPackageItems(...args),
  updatePackageItemFieldsByItemRef: (...args: unknown[]) =>
    mocks.updatePackageItemFieldsByItemRef(...args),
}))

import { GET } from '@/app/api/requirement-packages/[id]/items/[itemId]/route'

function makeParams(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

describe('requirement-packages/[id]/items/[itemId] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPackageBySlug.mockResolvedValue({ id: 5 })
  })

  it('returns package-specific metadata for a library requirement item', async () => {
    mocks.listPackageItems.mockResolvedValue([
      {
        kind: 'library',
        needsReference: 'Shared package need',
        needsReferenceId: 81,
        packageItemId: 31,
        packageItemStatusColor: '#f59e0b',
        packageItemStatusId: 2,
        packageItemStatusNameEn: 'Ongoing',
        packageItemStatusNameSv: 'Pågående',
      },
    ])

    const request = new NextRequest(
      'http://localhost/api/requirement-packages/ETJANSTPLATT/items/31',
    )

    const response = await GET(request, makeParams('ETJANSTPLATT', '31'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      needsReference: 'Shared package need',
      needsReferenceId: 81,
      packageItemId: 31,
      packageItemStatusColor: '#f59e0b',
      packageItemStatusId: 2,
      packageItemStatusNameEn: 'Ongoing',
      packageItemStatusNameSv: 'Pågående',
    })
    expect(mocks.listPackageItems).toHaveBeenCalledWith(mockDb, 5)
  })
})
