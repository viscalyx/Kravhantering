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

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
  getPackageItemByRef: (...args: unknown[]) =>
    mocks.getPackageItemByRef(...args),
  listPackageItems: (...args: unknown[]) => mocks.listPackageItems(...args),
  updatePackageItemFieldsByItemRef: (...args: unknown[]) =>
    mocks.updatePackageItemFieldsByItemRef(...args),
}))

import { GET } from '@/app/api/specifications/[id]/items/[itemId]/route'

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
        specificationItemId: 31,
        specificationItemStatusColor: '#f59e0b',
        specificationItemStatusId: 2,
        specificationItemStatusNameEn: 'Ongoing',
        specificationItemStatusNameSv: 'Pågående',
      },
    ])

    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/31',
    )

    const response = await GET(request, makeParams('ETJANST-UPP-2026', '31'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      needsReference: 'Shared package need',
      needsReferenceId: 81,
      specificationItemId: 31,
      specificationItemStatusColor: '#f59e0b',
      specificationItemStatusId: 2,
      specificationItemStatusNameEn: 'Ongoing',
      specificationItemStatusNameSv: 'Pågående',
    })
    expect(mocks.listPackageItems).toHaveBeenCalledWith(mockDb, 5)
  })
})
