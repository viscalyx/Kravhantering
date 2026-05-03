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
  linkRequirementsToPackageAtomically: vi.fn(),
  listPackageItems: vi.fn(),
  unlinkRequirementsFromPackage: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deletePackageItemsByRefs: (...args: unknown[]) =>
    mocks.deletePackageItemsByRefs(...args),
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
  linkRequirementsToPackageAtomically: (...args: unknown[]) =>
    mocks.linkRequirementsToPackageAtomically(...args),
  listPackageItems: (...args: unknown[]) => mocks.listPackageItems(...args),
  unlinkRequirementsFromPackage: (...args: unknown[]) =>
    mocks.unlinkRequirementsFromPackage(...args),
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsPerItemRef: vi.fn(async () => new Map()),
}))

import { DELETE, GET, POST } from '@/app/api/specifications/[id]/items/route'
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
      deletedSpecificationLocalCount: 1,
    })
    mocks.getPackageBySlug.mockResolvedValue({ id: 5 })
    mocks.linkRequirementsToPackageAtomically.mockResolvedValue(1)
    mocks.unlinkRequirementsFromPackage.mockResolvedValue(2)
  })

  it('rejects needsReferenceId values that belong to another package', async () => {
    mocks.linkRequirementsToPackageAtomically.mockRejectedValue(
      validationError(
        'needsReferenceId does not belong to this requirements specification',
      ),
    )

    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
      error:
        'needsReferenceId does not belong to this requirements specification',
    })
    expect(mocks.linkRequirementsToPackageAtomically).toHaveBeenCalledWith(
      mockDb,
      5,
      {
        requirementIds: [1],
        needsReferenceId: 99,
        needsReferenceText: undefined,
      },
    )
  })

  it('returns specification items with merged deviation counts', async () => {
    mocks.getPackageBySlug.mockResolvedValue({ id: 7 })
    mocks.listPackageItems.mockResolvedValue([
      {
        id: 31,
        itemRef: 'lib:31',
        kind: 'library',
        specificationItemId: 31,
      },
      {
        id: 41,
        itemRef: 'local:41',
        kind: 'local',
        specificationLocalRequirementId: 41,
      },
    ])
    const { countDeviationsPerItemRef } = await import('@/lib/dal/deviations')
    vi.mocked(countDeviationsPerItemRef).mockResolvedValueOnce(
      new Map([
        ['lib:31', { approved: 1, pending: 2, total: 3 }],
        ['local:41', { approved: 0, pending: 1, total: 1 }],
      ]),
    )

    const response = await GET(
      new NextRequest('http://localhost/api/specifications/pkg/items'),
      makeParams('pkg'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          deviationCount: 3,
          hasApprovedDeviation: true,
          hasPendingDeviation: true,
          specificationItemId: 31,
        }),
        expect.objectContaining({
          deviationCount: 1,
          hasApprovedDeviation: false,
          hasPendingDeviation: true,
          specificationLocalRequirementId: 41,
        }),
      ],
    })
    expect(mocks.listPackageItems).toHaveBeenCalledWith(mockDb, 7)
    expect(countDeviationsPerItemRef).toHaveBeenCalledWith(mockDb, 7)
  })

  it('delegates requirement linking to the transactional helper', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
        requirementIds: [1],
        needsReferenceId: undefined,
        needsReferenceText: 'Shared need',
      },
    )
  })

  it('returns 200 when linking is a no-op', async () => {
    mocks.linkRequirementsToPackageAtomically.mockResolvedValueOnce(0)

    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
        requirementIds: [1],
        needsReferenceId: undefined,
        needsReferenceText: 'Shared need',
      },
    )
  })

  it('rejects malformed requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
    expect(mocks.linkRequirementsToPackageAtomically).not.toHaveBeenCalled()
  })

  it('rejects duplicate requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
    expect(mocks.linkRequirementsToPackageAtomically).not.toHaveBeenCalled()
  })

  it('rejects ambiguous needs-reference payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
    expect(mocks.linkRequirementsToPackageAtomically).not.toHaveBeenCalled()
  })

  it('returns 422 when a requirement has no published version', async () => {
    mocks.linkRequirementsToPackageAtomically.mockRejectedValueOnce(
      validationError(
        'Requirement 1 has no published version and cannot be added to a package',
        {
          httpStatus: 422,
          reason: 'missing_published_version',
          requirementId: 1,
        },
      ),
    )

    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
      {
        body: JSON.stringify({
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('pkg'))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error:
        'Requirement 1 has no published version and cannot be added to a package',
    })
  })

  it('rejects malformed delete payloads before unlinking items', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
      new Error('SQL transaction failed'),
    )

    try {
      const request = new NextRequest(
        'http://localhost/api/specifications/pkg/items',
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
          requirementIds: [1],
          needsReferenceId: undefined,
          needsReferenceText: 'Shared need',
        },
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to add requirements to requirements specification',
        expect.any(Error),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('unlinks requirement items for valid delete payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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

  it('returns a JSON 500 error when unlinking requirements fails unexpectedly', async () => {
    mocks.unlinkRequirementsFromPackage.mockRejectedValueOnce(
      new Error('SQL unlink failed'),
    )

    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 2],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('pkg'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'SQL unlink failed',
    })
    expect(mocks.unlinkRequirementsFromPackage).toHaveBeenCalledWith(
      mockDb,
      5,
      [1, 2],
    )
  })

  it('deletes mixed package items by itemRef when itemRefs are supplied', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/pkg/items',
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
      deletedSpecificationLocalCount: 1,
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
