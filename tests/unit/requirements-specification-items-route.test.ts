import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  transaction: vi.fn(),
}

const mockTx = {}

const mocks = {
  deleteSpecificationItemsByRefs: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  linkRequirementsToSpecificationAtomically: vi.fn(),
  listSpecificationItems: vi.fn(),
  unlinkRequirementsFromSpecification: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deleteSpecificationItemsByRefs: (...args: unknown[]) =>
    mocks.deleteSpecificationItemsByRefs(...args),
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  getSpecificationBySlug: (...args: unknown[]) =>
    mocks.getSpecificationBySlug(...args),
  linkRequirementsToSpecificationAtomically: (...args: unknown[]) =>
    mocks.linkRequirementsToSpecificationAtomically(...args),
  listSpecificationItems: (...args: unknown[]) =>
    mocks.listSpecificationItems(...args),
  unlinkRequirementsFromSpecification: (...args: unknown[]) =>
    mocks.unlinkRequirementsFromSpecification(...args),
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsPerItemRef: vi.fn(async () => new Map()),
}))

import { DELETE, GET, POST } from '@/app/api/specifications/[id]/items/route'
import { validationError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('specifications/[id]/items route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
    )
    mocks.deleteSpecificationItemsByRefs.mockResolvedValue({
      deletedLibraryCount: 1,
      deletedSpecificationLocalCount: 1,
    })
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 5 })
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(1)
    mocks.unlinkRequirementsFromSpecification.mockResolvedValue(2)
  })

  it('rejects needsReferenceId values that belong to another specification', async () => {
    mocks.linkRequirementsToSpecificationAtomically.mockRejectedValue(
      validationError(
        'needsReferenceId does not belong to this requirements specification',
      ),
    )

    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          needsReferenceId: 99,
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        'needsReferenceId does not belong to this requirements specification',
    })
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).toHaveBeenCalledWith(mockDb, 5, {
      requirementIds: [1],
      needsReferenceId: 99,
      needsReferenceText: undefined,
    })
  })

  it('returns specification items with merged deviation counts', async () => {
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 7 })
    mocks.listSpecificationItems.mockResolvedValue([
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
      new NextRequest('http://localhost/api/specifications/spec/items'),
      makeParams('spec'),
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
    expect(mocks.listSpecificationItems).toHaveBeenCalledWith(mockDb, 7)
    expect(countDeviationsPerItemRef).toHaveBeenCalledWith(mockDb, 7)
  })

  it('delegates requirement linking to the transactional helper', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          needsReferenceText: 'Shared need',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(201)
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).toHaveBeenCalledWith(mockDb, 5, {
      requirementIds: [1],
      needsReferenceId: undefined,
      needsReferenceText: 'Shared need',
    })
  })

  it('returns 200 when linking is a no-op', async () => {
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValueOnce(0)

    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          needsReferenceText: 'Shared need',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ addedCount: 0, ok: true })
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).toHaveBeenCalledWith(mockDb, 5, {
      requirementIds: [1],
      needsReferenceId: undefined,
      needsReferenceText: 'Shared need',
    })
  })

  it('rejects malformed requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          requirementIds: [1, '2'],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'requirementIds must be a non-empty array of positive integers',
    })
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).not.toHaveBeenCalled()
  })

  it('rejects duplicate requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        'requirementIds must be a non-empty array of unique positive integers',
    })
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).not.toHaveBeenCalled()
  })

  it('rejects ambiguous needs-reference payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
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

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provide either needsReferenceId or needsReferenceText, not both',
    })
    expect(
      mocks.linkRequirementsToSpecificationAtomically,
    ).not.toHaveBeenCalled()
  })

  it('returns 422 when a requirement has no published version', async () => {
    mocks.linkRequirementsToSpecificationAtomically.mockRejectedValueOnce(
      validationError(
        'Requirement 1 has no published version and cannot be added to a specification',
        {
          httpStatus: 422,
          reason: 'missing_published_version',
          requirementId: 1,
        },
      ),
    )

    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('spec'))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error:
        'Requirement 1 has no published version and cannot be added to a specification',
    })
  })

  it('rejects malformed delete payloads before unlinking items', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          requirementIds: [0],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('spec'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'requirementIds must be a non-empty array of positive integers',
    })
    expect(mocks.unlinkRequirementsFromSpecification).not.toHaveBeenCalled()
  })

  it('returns a JSON 500 error when linking requirements fails unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.linkRequirementsToSpecificationAtomically.mockRejectedValue(
      new Error('SQL transaction failed'),
    )

    try {
      const request = new NextRequest(
        'http://localhost/api/specifications/spec/items',
        {
          body: JSON.stringify({
            needsReferenceText: 'Shared need',
            requirementIds: [1],
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )

      const response = await POST(request, makeParams('spec'))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to add requirements',
      })
      expect(
        mocks.linkRequirementsToSpecificationAtomically,
      ).toHaveBeenCalledWith(mockDb, 5, {
        requirementIds: [1],
        needsReferenceId: undefined,
        needsReferenceText: 'Shared need',
      })
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
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 2],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('spec'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      removedCount: 2,
    })
    expect(mocks.unlinkRequirementsFromSpecification).toHaveBeenCalledTimes(1)
    expect(mocks.unlinkRequirementsFromSpecification).toHaveBeenCalledWith(
      mockDb,
      5,
      [1, 2],
    )
  })

  it('returns a JSON 500 error when unlinking requirements fails unexpectedly', async () => {
    mocks.unlinkRequirementsFromSpecification.mockRejectedValueOnce(
      new Error('SQL unlink failed'),
    )

    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 2],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('spec'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to unlink requirements',
    })
    expect(mocks.unlinkRequirementsFromSpecification).toHaveBeenCalledWith(
      mockDb,
      5,
      [1, 2],
    )
  })

  it('deletes mixed specification items by itemRef when itemRefs are supplied', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/spec/items',
      {
        body: JSON.stringify({
          itemRefs: ['lib:31', 'local:2'],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('spec'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      deletedLibraryCount: 1,
      deletedSpecificationLocalCount: 1,
      ok: true,
      removedCount: 2,
    })
    expect(mocks.deleteSpecificationItemsByRefs).toHaveBeenCalledWith(
      mockDb,
      5,
      ['lib:31', 'local:2'],
    )
    expect(mocks.unlinkRequirementsFromSpecification).not.toHaveBeenCalled()
  })
})
