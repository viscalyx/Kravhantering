import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  transaction: vi.fn(),
}

const mockTx = {}

const mocks = {
  addToSpecification: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  deleteSpecificationItemsByRefs: vi.fn(),
  getSpecificationItems: vi.fn(),
  getSpecificationById: vi.fn(),
  linkRequirementsToSpecificationAtomically: vi.fn(),
  listSpecificationItems: vi.fn(),
  removeFromSpecification: vi.fn(),
  unlinkRequirementsFromSpecification: vi.fn(),
  updateSpecificationItemFieldsByItemRefs: vi.fn(),
}

const mockContext = {
  actor: {
    displayName: 'Route Tester',
    hsaId: 'SE5560000001-route',
    id: 'route-test',
    isAuthenticated: true,
    roles: ['RequirementsEditor'],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deleteSpecificationItemsByRefs: (...args: unknown[]) =>
    mocks.deleteSpecificationItemsByRefs(...args),
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  linkRequirementsToSpecificationAtomically: (...args: unknown[]) =>
    mocks.linkRequirementsToSpecificationAtomically(...args),
  listSpecificationItems: (...args: unknown[]) =>
    mocks.listSpecificationItems(...args),
  unlinkRequirementsFromSpecification: (...args: unknown[]) =>
    mocks.unlinkRequirementsFromSpecification(...args),
  updateSpecificationItemFieldsByItemRefs: (...args: unknown[]) =>
    mocks.updateSpecificationItemFieldsByItemRefs(...args),
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsPerItemRef: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: (...args: unknown[]) =>
    mocks.createRequirementsRestRuntime(...args),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({ assertAuthorized: vi.fn() }),
    createRequestContext: vi.fn(async () => mockContext),
  }
})

import {
  DELETE,
  GET,
  PATCH,
  POST,
} from '@/app/api/requirements-specifications/[id]/items/route'
import { invalidCursorError, validationError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function expectInvalidRequest(
  response: Response,
  path?: string,
): Promise<void> {
  const body = (await response.json()) as {
    error: string
    issues: Array<{ path: string }>
  }
  expect(body.error).toBe('Invalid request')
  expect(body.issues.length).toBeGreaterThan(0)
  if (path) {
    expect(body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path })]),
    )
  }
}

describe('requirements-specifications/[id]/items route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
    )
    mocks.deleteSpecificationItemsByRefs.mockResolvedValue({
      deletedLibraryCount: 1,
      deletedSpecificationLocalCount: 1,
    })
    mocks.addToSpecification.mockResolvedValue({
      addedCount: 1,
      message: 'ok',
      skippedCount: 0,
      skippedIds: [],
    })
    mocks.createRequirementsRestRuntime.mockImplementation(
      async (_request: Request, options?: { db?: unknown }) => ({
        authorization: { assertAuthorized: vi.fn() },
        context: mockContext,
        db: options?.db ?? mockDb,
        service: {
          addToSpecification: mocks.addToSpecification,
          getSpecificationItems: mocks.getSpecificationItems,
          removeFromSpecification: mocks.removeFromSpecification,
        },
      }),
    )
    mocks.getSpecificationById.mockResolvedValue({ id: 5 })
    mocks.getSpecificationItems.mockResolvedValue({
      items: [],
      message: 'ok',
      pagination: { count: 0, hasMore: false, limit: 50, nextCursor: null },
      specificationId: 5,
    })
    mocks.linkRequirementsToSpecificationAtomically.mockResolvedValue(1)
    mocks.removeFromSpecification.mockResolvedValue({
      message: 'ok',
      removedCount: 2,
    })
    mocks.unlinkRequirementsFromSpecification.mockResolvedValue(2)
    mocks.updateSpecificationItemFieldsByItemRefs.mockResolvedValue(2)
  })

  it('rejects needsReferenceId values that belong to another specification', async () => {
    mocks.addToSpecification.mockRejectedValue(
      validationError(
        'needsReferenceId does not belong to this requirements specification',
      ),
    )

    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          needsReferenceId: 99,
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'validation',
      error:
        'needsReferenceId does not belong to this requirements specification',
    })
    expect(mocks.addToSpecification).toHaveBeenCalledWith(mockContext, {
      specificationId: 5,
      requirementIds: [1],
      needsReferenceDescription: undefined,
      needsReferenceId: 99,
      needsReferenceText: undefined,
      responseFormat: 'json',
    })
  })

  it('returns the shared bounded requirement application page', async () => {
    mocks.getSpecificationById.mockResolvedValue({ id: 7 })
    const items = [
      {
        deviationCount: 3,
        hasApprovedDeviation: true,
        hasPendingDeviation: true,
        id: 31,
        itemRef: 'lib:31',
        kind: 'library',
        specificationItemId: 31,
      },
      {
        deviationCount: 1,
        hasApprovedDeviation: false,
        hasPendingDeviation: true,
        id: 41,
        itemRef: 'local:41',
        kind: 'local',
        specificationLocalRequirementId: 41,
      },
    ]
    mocks.getSpecificationItems.mockResolvedValueOnce({
      items,
      message: 'ok',
      pagination: {
        count: 2,
        hasMore: true,
        limit: 2,
        nextCursor: 'next-page',
      },
      specificationId: 7,
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items?limit=2&locale=sv&sortBy=description&sortDirection=desc',
      ),
      makeParams('5'),
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
      pagination: {
        count: 2,
        hasMore: true,
        limit: 2,
        nextCursor: 'next-page',
      },
    })
    expect(mocks.getSpecificationItems).toHaveBeenCalledWith(mockContext, {
      limit: 2,
      locale: 'sv',
      responseFormat: 'json',
      sortBy: 'description',
      sortDirection: 'desc',
      specificationId: 7,
    })
  })

  it('rejects page limits above 100 before database work', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items?limit=101',
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'limit')
    expect(mocks.getSpecificationById).not.toHaveBeenCalled()
    expect(mocks.getSpecificationItems).not.toHaveBeenCalled()
  })

  it('maps malformed continuation state to invalid_cursor', async () => {
    mocks.getSpecificationItems.mockRejectedValueOnce(invalidCursorError())

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items?cursor=stale',
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_cursor',
      error: 'Invalid requirement list cursor',
    })
  })

  it('delegates requirement linking to the requirements service', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          needsReferenceDescription: 'Shared description',
          needsReferenceText: 'Shared need',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(201)
    expect(mocks.createRequirementsRestRuntime).toHaveBeenCalledWith(request, {
      context: mockContext,
      db: mockDb,
    })
    expect(mocks.addToSpecification).toHaveBeenCalledWith(mockContext, {
      specificationId: 5,
      requirementIds: [1],
      needsReferenceDescription: 'Shared description',
      needsReferenceId: undefined,
      needsReferenceText: 'Shared need',
      responseFormat: 'json',
    })
  })

  it('returns 200 when linking is a no-op', async () => {
    mocks.addToSpecification.mockResolvedValueOnce({
      addedCount: 0,
      message: 'ok',
      skippedCount: 0,
      skippedIds: [],
    })

    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          needsReferenceText: 'Shared need',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ addedCount: 0, ok: true })
    expect(mocks.addToSpecification).toHaveBeenCalledWith(mockContext, {
      specificationId: 5,
      requirementIds: [1],
      needsReferenceDescription: undefined,
      needsReferenceId: undefined,
      needsReferenceText: 'Shared need',
      responseFormat: 'json',
    })
  })

  it('rejects malformed requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          requirementIds: [1, '2'],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'requirementIds.1')
    expect(mocks.addToSpecification).not.toHaveBeenCalled()
  })

  it('rejects duplicate requirementIds before any database work runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'requirementIds')
    expect(mocks.addToSpecification).not.toHaveBeenCalled()
  })

  it('rejects ambiguous needs-reference payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
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

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'needsReferenceText')
    expect(mocks.addToSpecification).not.toHaveBeenCalled()
  })

  it('rejects needs-reference descriptions without new needs-reference text', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          needsReferenceDescription: 'Context without a reference',
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'needsReferenceDescription')
    expect(mocks.addToSpecification).not.toHaveBeenCalled()
  })

  it('returns 422 when a requirement has no published version', async () => {
    mocks.addToSpecification.mockRejectedValueOnce(
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
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          requirementIds: [1],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request, makeParams('5'))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      code: 'validation',
      error:
        'Requirement 1 has no published version and cannot be added to a specification',
    })
  })

  it('rejects malformed delete payloads before unlinking items', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          requirementIds: [0],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('5'))

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'requirementIds.0')
    expect(mocks.removeFromSpecification).not.toHaveBeenCalled()
  })

  it('returns a JSON 500 error when linking requirements fails unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.addToSpecification.mockRejectedValue(
      new Error('SQL transaction failed'),
    )

    try {
      const request = new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({
            needsReferenceText: 'Shared need',
            requirementIds: [1],
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )

      const response = await POST(request, makeParams('5'))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to add requirements',
      })
      expect(mocks.addToSpecification).toHaveBeenCalledWith(mockContext, {
        specificationId: 5,
        requirementIds: [1],
        needsReferenceDescription: undefined,
        needsReferenceId: undefined,
        needsReferenceText: 'Shared need',
        responseFormat: 'json',
      })
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to add requirements to requirements specification',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'SQL transaction failed',
          }),
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('unlinks requirement items for valid delete payloads', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          requirementIds: [1, 2],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('5'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      removedCount: 2,
    })
    expect(mocks.removeFromSpecification).toHaveBeenCalledTimes(1)
    expect(mocks.removeFromSpecification).toHaveBeenCalledWith(mockContext, {
      specificationId: 5,
      requirementIds: [1, 2],
      responseFormat: 'json',
    })
  })

  it('bulk-updates needs references by item refs', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          itemRefs: ['lib:31', 'local:41'],
          needsReferenceId: 7,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(request, makeParams('5'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      updatedCount: 2,
    })
    expect(mocks.updateSpecificationItemFieldsByItemRefs).toHaveBeenCalledWith(
      mockDb,
      5,
      ['lib:31', 'local:41'],
      { needsReferenceId: 7 },
    )
  })

  it('returns a JSON 500 error when unlinking requirements fails unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.removeFromSpecification.mockRejectedValueOnce(
      new Error('SQL unlink failed'),
    )

    try {
      const request = new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({
            requirementIds: [1, 2],
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        },
      )

      const response = await DELETE(request, makeParams('5'))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to unlink requirements',
      })
      expect(mocks.removeFromSpecification).toHaveBeenCalledWith(mockContext, {
        specificationId: 5,
        requirementIds: [1, 2],
        responseFormat: 'json',
      })
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to unlink requirements from specification',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'SQL unlink failed',
          }),
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('deletes mixed requirement applications by itemRef when itemRefs are supplied', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({
          itemRefs: ['lib:31', 'local:2'],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const response = await DELETE(request, makeParams('5'))

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
    expect(mocks.removeFromSpecification).not.toHaveBeenCalled()
  })
})
