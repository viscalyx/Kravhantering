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

import { GET, PATCH } from '@/app/api/specifications/[id]/items/[itemId]/route'

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

  it('updates specification item status by item ref within the specification', async () => {
    mocks.getPackageBySlug.mockResolvedValue({ id: 7 })
    mocks.getPackageItemByRef.mockResolvedValue({
      itemRef: 'lib:31',
      specificationId: 7,
      specificationItemId: 31,
    })

    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/lib%3A31',
      {
        body: JSON.stringify({ specificationItemStatusId: 5 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(
      request,
      makeParams('ETJANST-UPP-2026', 'lib%3A31'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.getPackageItemByRef).toHaveBeenCalledWith(mockDb, 7, 'lib:31')
    expect(mocks.updatePackageItemFieldsByItemRef).toHaveBeenCalledWith(
      mockDb,
      7,
      'lib:31',
      { specificationItemStatusId: 5 },
    )
  })

  it.each([
    0, -1, 1.5,
  ])('rejects malformed specification item status id %s', async specificationItemStatusId => {
    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/lib%3A31',
      {
        body: JSON.stringify({ specificationItemStatusId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(
      request,
      makeParams('ETJANST-UPP-2026', 'lib%3A31'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Malformed payload',
    })
    expect(mocks.getPackageBySlug).not.toHaveBeenCalled()
    expect(mocks.updatePackageItemFieldsByItemRef).not.toHaveBeenCalled()
  })
})
