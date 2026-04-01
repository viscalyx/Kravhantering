import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  transaction: vi.fn(),
}

const mockTx = {}

const mocks = {
  getOrCreatePackageNeedsReference: vi.fn(),
  getPackageById: vi.fn(),
  getPackageNeedsReferenceById: vi.fn(),
  getPackageBySlug: vi.fn(),
  getPublishedVersionIdForRequirement: vi.fn(),
  linkRequirementsToPackage: vi.fn(),
  listPackageItems: vi.fn(),
  unlinkRequirementsFromPackage: vi.fn(),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: {} } }),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  getOrCreatePackageNeedsReference: (...args: unknown[]) =>
    mocks.getOrCreatePackageNeedsReference(...args),
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageNeedsReferenceById: (...args: unknown[]) =>
    mocks.getPackageNeedsReferenceById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
  getPublishedVersionIdForRequirement: (...args: unknown[]) =>
    mocks.getPublishedVersionIdForRequirement(...args),
  linkRequirementsToPackage: (...args: unknown[]) =>
    mocks.linkRequirementsToPackage(...args),
  listPackageItems: (...args: unknown[]) => mocks.listPackageItems(...args),
  unlinkRequirementsFromPackage: (...args: unknown[]) =>
    mocks.unlinkRequirementsFromPackage(...args),
}))

import { DELETE, POST } from '@/app/api/requirement-packages/[id]/items/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-packages/[id]/items route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
    )
    mocks.getPackageBySlug.mockResolvedValue({ id: 5 })
    mocks.getPublishedVersionIdForRequirement.mockResolvedValue(42)
    mocks.getOrCreatePackageNeedsReference.mockResolvedValue(7)
    mocks.getPackageNeedsReferenceById.mockResolvedValue({ id: 8 })
    mocks.linkRequirementsToPackage.mockResolvedValue(1)
  })

  it('rejects needsReferenceId values that belong to another package', async () => {
    mocks.getPackageNeedsReferenceById.mockResolvedValue(null)

    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          needsReferenceId: 99,
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('pkg'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'needsReferenceId does not belong to this requirement package',
    })
    expect(mocks.getPackageNeedsReferenceById).toHaveBeenCalledWith(
      mockTx,
      5,
      99,
    )
    expect(mocks.linkRequirementsToPackage).not.toHaveBeenCalled()
  })

  it('creates needs references and links items inside the same transaction', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          needsReferenceText: 'Shared need',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('pkg'))

    expect(response.status).toBe(201)
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.getOrCreatePackageNeedsReference).toHaveBeenCalledWith(
      mockTx,
      5,
      'Shared need',
    )
    expect(mocks.linkRequirementsToPackage).toHaveBeenCalledWith(mockTx, 5, [
      {
        needsReferenceId: 7,
        requirementId: 1,
        requirementVersionId: 42,
      },
    ])
  })

  it('rejects malformed requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          requirementIds: [1, '2'],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('pkg'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'requirementIds must be a non-empty array of positive integers',
    })
    expect(mocks.getPublishedVersionIdForRequirement).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('rejects duplicate requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('pkg'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        'requirementIds must be a non-empty array of unique positive integers',
    })
    expect(mocks.getPublishedVersionIdForRequirement).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('rejects ambiguous needs-reference payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          needsReferenceId: 7,
          needsReferenceText: 'Shared need',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('pkg'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provide either needsReferenceId or needsReferenceText, not both',
    })
    expect(mocks.getPublishedVersionIdForRequirement).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('rejects malformed delete payloads before unlinking items', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          requirementIds: [0],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('pkg'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'requirementIds must be a non-empty array of positive integers',
    })
    expect(mocks.unlinkRequirementsFromPackage).not.toHaveBeenCalled()
  })
})
