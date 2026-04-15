import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  transaction: vi.fn(),
}

const mockTx = {}

const mocks = {
  deletePackageItemsByRefs: vi.fn(),
  getPackageById: vi.fn(),
  getPackageBySlug: vi.fn(),
  getPublishedVersionIdForRequirement: vi.fn(),
  linkRequirementsToPackageAtomically: vi.fn(),
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
  deletePackageItemsByRefs: (...args: unknown[]) =>
    mocks.deletePackageItemsByRefs(...args),
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
  getPublishedVersionIdForRequirement: (...args: unknown[]) =>
    mocks.getPublishedVersionIdForRequirement(...args),
  linkRequirementsToPackageAtomically: (...args: unknown[]) =>
    mocks.linkRequirementsToPackageAtomically(...args),
  listPackageItems: (...args: unknown[]) => mocks.listPackageItems(...args),
  unlinkRequirementsFromPackage: (...args: unknown[]) =>
    mocks.unlinkRequirementsFromPackage(...args),
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsPerItemRef: vi.fn(async () => new Map()),
}))

import { DELETE, POST } from '@/app/api/requirement-packages/[id]/items/route'
import { validationError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-packages/[id]/items route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
    )
    mocks.deletePackageItemsByRefs.mockResolvedValue({
      deletedLibraryCount: 1,
      deletedPackageLocalCount: 1,
    })
    mocks.getPackageBySlug.mockResolvedValue({ id: 5 })
    mocks.getPublishedVersionIdForRequirement.mockResolvedValue(42)
    mocks.linkRequirementsToPackageAtomically.mockResolvedValue(1)
    mocks.unlinkRequirementsFromPackage.mockResolvedValue(2)
  })

  it('rejects needsReferenceId values that belong to another package', async () => {
    mocks.linkRequirementsToPackageAtomically.mockRejectedValue(
      validationError(
        'needsReferenceId does not belong to this requirement package',
      ),
    )

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
    expect(mocks.linkRequirementsToPackageAtomically).toHaveBeenCalledWith(
      mockDb,
      5,
      {
        items: [
          {
            requirementId: 1,
            requirementVersionId: 42,
          },
        ],
        needsReferenceId: 99,
        needsReferenceText: undefined,
      },
    )
  })

  it('delegates requirement linking to the transactional helper', async () => {
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
    expect(mocks.linkRequirementsToPackageAtomically).toHaveBeenCalledWith(
      mockDb,
      5,
      {
        items: [
          {
            requirementId: 1,
            requirementVersionId: 42,
          },
        ],
        needsReferenceId: undefined,
        needsReferenceText: 'Shared need',
      },
    )
  })

  it('returns 200 when linking is a no-op', async () => {
    mocks.linkRequirementsToPackageAtomically.mockResolvedValueOnce(0)

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

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ addedCount: 0, ok: true })
    expect(mocks.linkRequirementsToPackageAtomically).toHaveBeenCalledWith(
      mockDb,
      5,
      {
        items: [
          {
            requirementId: 1,
            requirementVersionId: 42,
          },
        ],
        needsReferenceId: undefined,
        needsReferenceText: 'Shared need',
      },
    )
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
    expect(mocks.linkRequirementsToPackageAtomically).not.toHaveBeenCalled()
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

  it('returns a JSON 500 error when linking requirements fails unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.linkRequirementsToPackageAtomically.mockRejectedValue(
      new Error('D1 transaction failed'),
    )

    try {
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

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to add requirements',
      })
      expect(mocks.linkRequirementsToPackageAtomically).toHaveBeenCalledWith(
        mockDb,
        5,
        {
          items: [
            {
              requirementId: 1,
              requirementVersionId: 42,
            },
          ],
          needsReferenceId: undefined,
          needsReferenceText: 'Shared need',
        },
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to add requirements to requirement package',
        expect.any(Error),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('unlinks requirement items for valid delete payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 2],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('pkg'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      removedCount: 2,
    })
    expect(mocks.unlinkRequirementsFromPackage).toHaveBeenCalledTimes(1)
    expect(mocks.unlinkRequirementsFromPackage).toHaveBeenCalledWith(
      mockDb,
      5,
      [1, 2],
    )
  })

  it('deletes mixed package items by itemRef when itemRefs are supplied', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-packages/pkg/items',
      {
        body: JSON.stringify({
          itemRefs: ['lib:31', 'local:2'],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('pkg'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      deletedLibraryCount: 1,
      deletedPackageLocalCount: 1,
      ok: true,
      removedCount: 2,
    })
    expect(mocks.deletePackageItemsByRefs).toHaveBeenCalledWith(mockDb, 5, [
      'lib:31',
      'local:2',
    ])
    expect(mocks.unlinkRequirementsFromPackage).not.toHaveBeenCalled()
  })
})
