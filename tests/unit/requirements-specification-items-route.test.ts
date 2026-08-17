import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockContext, mockDb, mockTx, mocks } = vi.hoisted(() => ({
  mockContext: {
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
  },
  mockDb: { transaction: vi.fn() },
  mocks: {
    addToSpecification: vi.fn(),
    assertAuthorized: vi.fn(),
    createRequirementsRestRuntime: vi.fn(),
    getSpecificationItems: vi.fn(),
    getSpecificationById: vi.fn(),
    linkRequirementsToSpecificationAtomically: vi.fn(),
    mutateRequirementApplications: vi.fn(),
    recordDeniedActionAuditEvent: vi.fn(),
    removeFromSpecification: vi.fn(),
  },
  mockTx: {},
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/audit/action-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/audit/action-audit')>()
  return {
    ...actual,
    recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
  }
})

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  linkRequirementsToSpecificationAtomically: (...args: unknown[]) =>
    mocks.linkRequirementsToSpecificationAtomically(...args),
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
    createDefaultAuthorizationService: () => ({
      assertAuthorized: mocks.assertAuthorized,
    }),
    createRequestContext: vi.fn(async () => mockContext),
  }
})

import {
  DELETE,
  GET,
  PATCH,
  POST,
} from '@/app/api/requirements-specifications/[id]/items/route'
import {
  forbiddenError,
  invalidCursorError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT } from '@/lib/specifications/selection-action-limit'

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
          mutateRequirementApplications: mocks.mutateRequirementApplications,
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
    mocks.mutateRequirementApplications.mockImplementation(
      async (
        _context: unknown,
        input: { itemRefs?: string[]; operation: string },
      ) =>
        input.operation === 'update'
          ? { operation: 'update', updatedCount: input.itemRefs?.length ?? 0 }
          : {
              operation: 'remove',
              removedCount: input.itemRefs?.length ?? 2,
              removedLibraryCount:
                input.itemRefs?.filter(itemRef => itemRef.startsWith('lib:'))
                  .length ?? 2,
              removedSpecificationLocalCount:
                input.itemRefs?.filter(itemRef => itemRef.startsWith('local:'))
                  .length ?? 0,
            },
    )
    mocks.removeFromSpecification.mockResolvedValue({
      message: 'ok',
      removedCount: 2,
    })
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
        kind: 'specificationLocal',
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
      capacitySurface: 'rest',
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

  it('passes bounded requirement match probes to the shared item query', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items?limit=2&probeRequirementIds=31&probeRequirementIds=32',
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(200)
    expect(mocks.getSpecificationItems).toHaveBeenCalledWith(mockContext, {
      capacitySurface: 'rest',
      limit: 2,
      locale: 'en',
      probeRequirementIds: [31, 32],
      responseFormat: 'json',
      specificationId: 5,
    })
  })

  it('rejects more than 200 requirement match probes before database work', async () => {
    const params = new URLSearchParams({ limit: '100' })
    for (let id = 1; id <= 201; id += 1) {
      params.append('probeRequirementIds', String(id))
    }

    const response = await GET(
      new NextRequest(
        `http://localhost/api/requirements-specifications/5/items?${params}`,
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'probeRequirementIds')
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

  it('rejects direct selected-item mutations above the action limit', async () => {
    const itemRefs = Array.from(
      { length: SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT + 1 },
      (_, index) => `lib:${index + 1}`,
    )
    const patchRequest = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({ itemRefs, needsReferenceId: 7 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )
    const deleteRequest = new NextRequest(
      'http://localhost/api/requirements-specifications/5/items',
      {
        body: JSON.stringify({ itemRefs }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    )

    const [patchResponse, deleteResponse] = await Promise.all([
      PATCH(patchRequest, makeParams('5')),
      DELETE(deleteRequest, makeParams('5')),
    ])

    expect(patchResponse.status).toBe(400)
    expect(deleteResponse.status).toBe(400)
    expect(mocks.mutateRequirementApplications).not.toHaveBeenCalled()
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
    expect(mocks.mutateRequirementApplications).toHaveBeenCalledTimes(1)
    expect(mocks.mutateRequirementApplications).toHaveBeenCalledWith(
      mockContext,
      {
        operation: 'remove',
        requirementIds: [1, 2],
        specificationId: 5,
      },
    )
    expect(mocks.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_requirement_applications',
        operation: 'remove',
        requirementIds: [1, 2],
        specificationId: 5,
      },
      mockContext,
    )
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
    expect(mocks.mutateRequirementApplications).toHaveBeenCalledWith(
      mockContext,
      {
        fields: { needsReferenceId: 7 },
        itemRefs: ['lib:31', 'local:41'],
        operation: 'update',
        specificationId: 5,
      },
    )
  })

  it('returns an update-specific JSON 500 error for unexpected failures', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.mutateRequirementApplications.mockRejectedValueOnce(
      new Error('update failed'),
    )

    try {
      const response = await PATCH(
        new NextRequest(
          'http://localhost/api/requirements-specifications/5/items',
          {
            body: JSON.stringify({
              itemRefs: ['lib:31'],
              needsReferenceId: 7,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
          },
        ),
        makeParams('5'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to update requirement applications',
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('denies a bulk field update before the route workflow starts', async () => {
    mocks.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Specification author assignment is required', {
        reason: 'specification_author_required',
      }),
    )

    const response = await PATCH(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({
            itemRefs: ['lib:31', 'local:41'],
            needsReferenceId: 7,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(403)
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      mockDb,
      mockContext,
      expect.objectContaining({
        action: 'requirements.authorization.denied',
        denialReason: 'specification_author_required',
        targetKind: 'requirements',
      }),
    )
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.mutateRequirementApplications).not.toHaveBeenCalled()
  })

  it('denies mixed removal before route workflow or low-level mutation work', async () => {
    mocks.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Specification author assignment is required', {
        reason: 'specification_author_required',
      }),
    )

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({ itemRefs: ['lib:31', 'local:41'] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        },
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(403)
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      mockDb,
      mockContext,
      expect.objectContaining({
        action: 'requirements.authorization.denied',
        denialReason: 'specification_author_required',
        targetKind: 'requirements',
      }),
    )
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.mutateRequirementApplications).not.toHaveBeenCalled()
    expect(mocks.removeFromSpecification).not.toHaveBeenCalled()
  })

  it('denies requirement-id removal before the route workflow starts', async () => {
    mocks.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Specification author assignment is required', {
        reason: 'specification_author_required',
      }),
    )

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({ requirementIds: [1, 2] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        },
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(403)
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      mockDb,
      mockContext,
      expect.objectContaining({
        action: 'requirements.authorization.denied',
        denialReason: 'specification_author_required',
        targetKind: 'requirements',
      }),
    )
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.mutateRequirementApplications).not.toHaveBeenCalled()
  })

  it('returns a JSON 500 error when unlinking requirements fails unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.mutateRequirementApplications.mockRejectedValueOnce(
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
        error: 'Failed to remove requirement applications',
      })
      expect(mocks.mutateRequirementApplications).toHaveBeenCalled()
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
    expect(mocks.mutateRequirementApplications).toHaveBeenCalledWith(
      mockContext,
      {
        itemRefs: ['lib:31', 'local:2'],
        operation: 'remove',
        specificationId: 5,
      },
    )
    expect(mocks.removeFromSpecification).not.toHaveBeenCalled()
  })

  it('returns not found for missing specification item collection scopes', async () => {
    mocks.getSpecificationById.mockResolvedValue(null)

    const getResponse = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/items',
      ),
      makeParams('404'),
    )
    const postResponse = await POST(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/items',
        {
          body: JSON.stringify({ requirementIds: [1] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('404'),
    )
    mocks.assertAuthorized.mockRejectedValueOnce(
      notFoundError('Requirements specification not found'),
    )
    const patchResponse = await PATCH(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/items',
        {
          body: JSON.stringify({
            itemRefs: ['lib:1'],
            needsReferenceId: null,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      ),
      makeParams('404'),
    )
    mocks.assertAuthorized.mockRejectedValueOnce(
      notFoundError('Requirements specification not found'),
    )
    const deleteResponse = await DELETE(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/items',
        {
          body: JSON.stringify({ requirementIds: [1] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        },
      ),
      makeParams('404'),
    )

    expect(getResponse.status).toBe(404)
    expect(postResponse.status).toBe(404)
    expect(patchResponse.status).toBe(404)
    expect(deleteResponse.status).toBe(404)
  })

  it('maps item-ref deletion service and unexpected failures', async () => {
    mocks.mutateRequirementApplications.mockRejectedValueOnce(
      validationError('Referenced item does not belong to specification'),
    )
    const serviceFailure = await DELETE(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({ itemRefs: ['lib:999'] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        },
      ),
      makeParams('5'),
    )
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.mutateRequirementApplications.mockRejectedValueOnce(
      new Error('delete failed'),
    )
    try {
      const unexpectedFailure = await DELETE(
        new NextRequest(
          'http://localhost/api/requirements-specifications/5/items',
          {
            body: JSON.stringify({ itemRefs: ['local:999'] }),
            headers: { 'Content-Type': 'application/json' },
            method: 'DELETE',
          },
        ),
        makeParams('5'),
      )

      expect(serviceFailure.status).toBe(400)
      expect(unexpectedFailure.status).toBe(500)
      await expect(unexpectedFailure.json()).resolves.toEqual({
        error: 'Failed to remove requirement applications',
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('maps requirement-id unlink service errors', async () => {
    mocks.mutateRequirementApplications.mockRejectedValueOnce(
      validationError('Requirement is not linked'),
    )

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/items',
        {
          body: JSON.stringify({ requirementIds: [999] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        },
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Requirement is not linked',
    })
  })
})
