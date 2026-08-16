import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  createDeviation: vi.fn(),
  createDeviationForItemRef: vi.fn(),
  createDefaultAuthorizationService: vi.fn(),
  createRequestContext: vi.fn(),
  deleteDeviation: vi.fn(),
  deleteSpecificationLocalDeviation: vi.fn(),
  getDeviation: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSpecificationLocalDeviation: vi.fn(),
  listDeviationsForSpecificationItem: vi.fn(),
  listDeviationsForSpecificationLocalRequirement: vi.fn(),
  recordDecision: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  requestReview: vi.fn(),
  requireHumanActorSnapshot: vi.fn(),
  revertToDraft: vi.fn(),
  updateDeviation: vi.fn(),
  updateSpecificationLocalDeviation: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: routeState.recordDeniedActionAuditEvent,
}))

vi.mock('@/lib/dal/deviations', () => ({
  DEVIATION_APPROVED: 1,
  DEVIATION_REJECTED: 2,
  createDeviation: routeState.createDeviation,
  createDeviationForItemRef: routeState.createDeviationForItemRef,
  deleteDeviation: routeState.deleteDeviation,
  deleteSpecificationLocalDeviation:
    routeState.deleteSpecificationLocalDeviation,
  getDeviation: routeState.getDeviation,
  getSpecificationLocalDeviation: routeState.getSpecificationLocalDeviation,
  listDeviationsForSpecificationItem:
    routeState.listDeviationsForSpecificationItem,
  listDeviationsForSpecificationLocalRequirement:
    routeState.listDeviationsForSpecificationLocalRequirement,
  recordDecision: routeState.recordDecision,
  requestReview: routeState.requestReview,
  revertToDraft: routeState.revertToDraft,
  updateDeviation: routeState.updateDeviation,
  updateSpecificationLocalDeviation:
    routeState.updateSpecificationLocalDeviation,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService:
    routeState.createDefaultAuthorizationService,
  createRequestContext: routeState.createRequestContext,
  requireHumanActorSnapshot: routeState.requireHumanActorSnapshot,
}))

const mockDb = { db: true }

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  })
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) }
}

const deviationMutationFailureCases = [
  {
    expectedError: 'Failed to update deviation',
    failureMock: routeState.updateDeviation,
    invoke: async () => {
      const { PUT } = await import('@/app/api/deviations/[id]/route')
      return PUT(
        jsonRequest('https://example.test/api/deviations/7', {
          motivation: 'Updated motivation',
        }) as never,
        params({ id: '7' }),
      )
    },
    label: 'editing',
  },
  {
    expectedError: 'Failed to delete deviation',
    failureMock: routeState.deleteDeviation,
    invoke: async () => {
      const { DELETE } = await import('@/app/api/deviations/[id]/route')
      return DELETE(
        new Request('https://example.test/api/deviations/7', {
          method: 'DELETE',
        }) as never,
        params({ id: '7' }),
      )
    },
    label: 'deleting',
  },
  {
    expectedError: 'Failed to record decision',
    failureMock: routeState.recordDecision,
    invoke: async () => {
      const { POST } = await import('@/app/api/deviations/[id]/decision/route')
      return POST(
        new Request('https://example.test/api/deviations/7/decision', {
          body: JSON.stringify({
            decision: 2,
            decisionMotivation: 'Needs work',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }) as never,
        params({ id: '7' }),
      )
    },
    label: 'deciding',
  },
  {
    expectedError: 'Failed to request review',
    failureMock: routeState.requestReview,
    invoke: async () => {
      const { POST } = await import(
        '@/app/api/deviations/[id]/request-review/route'
      )
      return POST(
        new Request('https://example.test/api/deviations/7/request-review', {
          method: 'POST',
        }) as never,
        params({ id: '7' }),
      )
    },
    label: 'requesting review for',
  },
  {
    expectedError: 'Failed to revert to draft',
    failureMock: routeState.revertToDraft,
    invoke: async () => {
      const { POST } = await import(
        '@/app/api/deviations/[id]/revert-to-draft/route'
      )
      return POST(
        new Request('https://example.test/api/deviations/7/revert-to-draft', {
          method: 'POST',
        }) as never,
        params({ id: '7' }),
      )
    },
    label: 'returning to draft',
  },
]

describe('deviation mutation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.assertAuthorized.mockResolvedValue(undefined)
    routeState.createDefaultAuthorizationService.mockReturnValue({
      assertAuthorized: routeState.assertAuthorized,
    })
    routeState.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
    routeState.createRequestContext.mockResolvedValue({
      actor: {
        displayName: 'Reviewer',
        hsaId: 'SE5560000001-reviewer1',
        id: 'reviewer-sub',
        isAuthenticated: true,
        roles: ['Reviewer'],
        source: 'oidc',
      },
      correlationId: 'correlation-1',
      requestId: 'request-1',
      source: 'rest',
    })
    routeState.requireHumanActorSnapshot.mockReturnValue({
      displayName: 'Reviewer',
      hsaId: 'SE5560000001-reviewer1',
    })
  })

  it('gets a deviation and maps not-found while rethrowing infrastructure failures', async () => {
    const { GET } = await import('@/app/api/deviations/[id]/route')
    routeState.getDeviation.mockResolvedValueOnce({ id: 7, motivation: 'Why' })

    const foundResponse = await GET(
      new Request('https://example.test/api/deviations/7') as never,
      params({ id: '7' }),
    )

    expect(foundResponse.status).toBe(200)
    await expect(foundResponse.json()).resolves.toEqual({
      id: 7,
      motivation: 'Why',
    })
    expect(routeState.getDeviation).toHaveBeenCalledWith(mockDb, 7)
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        childId: 7,
        childKind: 'deviation',
        deviationKind: 'library',
        kind: 'get_specification_child',
      },
      expect.any(Object),
    )
    expect(foundResponse.headers.get('Cache-Control')).toBe('no-store')

    routeState.getDeviation.mockRejectedValueOnce(notFoundError('Not found'))
    const missingResponse = await GET(
      new Request('https://example.test/api/deviations/404') as never,
      params({ id: '404' }),
    )
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toEqual({
      code: 'not_found',
      error: 'Not found',
    })

    routeState.getDeviation.mockRejectedValueOnce(new Error('db offline'))
    await expect(
      GET(
        new Request('https://example.test/api/deviations/7') as never,
        params({ id: '7' }),
      ),
    ).rejects.toThrow('db offline')
  })

  it('denies direct deviation enumeration before reading its payload', async () => {
    routeState.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Specification read denied'),
    )
    const { GET } = await import('@/app/api/deviations/[id]/route')

    const response = await GET(
      new Request('https://example.test/api/deviations/7') as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(403)
    expect(routeState.getDeviation).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rejects invalid deviation identifiers before database work', async () => {
    const { GET } = await import('@/app/api/deviations/[id]/route')

    const response = await GET(
      new Request('https://example.test/api/deviations/nope') as never,
      params({ id: 'nope' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('rejects client-supplied creators for requirement application deviations', async () => {
    const { POST } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )
    const request = new Request(
      'https://example.test/api/specification-item-deviations/1',
      {
        body: JSON.stringify({
          createdBy: 'client',
          motivation: 'A valid deviation motivation',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await POST(request as never, params({ itemId: '1' }))

    expect(response.status).toBe(400)
    expect(routeState.createDeviation).not.toHaveBeenCalled()
    expect(routeState.createDeviationForItemRef).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('lists deviations for a numeric requirement application identifier', async () => {
    routeState.listDeviationsForSpecificationItem.mockResolvedValueOnce([
      { id: 4, motivation: 'Numeric item deviation' },
    ])
    const { GET } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-item-deviations/7',
      ) as never,
      params({ itemId: '7' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      deviations: [{ id: 4, motivation: 'Numeric item deviation' }],
    })
    expect(routeState.listDeviationsForSpecificationItem).toHaveBeenCalledWith(
      mockDb,
      7,
    )
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        childId: 7,
        childKind: 'requirement_application',
        kind: 'get_specification_child',
      },
      expect.any(Object),
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rejects an empty requirement application route segment before database work', async () => {
    const { GET } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-item-deviations/invalid',
      ) as never,
      params({ itemId: '' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('lists deviations for a stable specification-local requirement reference', async () => {
    routeState.listDeviationsForSpecificationLocalRequirement.mockResolvedValueOnce(
      [{ id: 5, motivation: 'Local item deviation' }],
    )
    const { GET } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-item-deviations/local%3A8',
      ) as never,
      params({ itemId: 'local%3A8' }),
    )

    expect(response.status).toBe(200)
    expect(
      routeState.listDeviationsForSpecificationLocalRequirement,
    ).toHaveBeenCalledWith(mockDb, 8)
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        childId: 8,
        childKind: 'specification_local_requirement',
        kind: 'get_specification_child',
      },
      expect.any(Object),
    )
  })

  it('lists deviations for a stable library requirement reference', async () => {
    routeState.listDeviationsForSpecificationItem.mockResolvedValueOnce([
      { id: 6, motivation: 'Library item deviation' },
    ])
    const { GET } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-item-deviations/lib%3A7',
      ) as never,
      params({ itemId: 'lib%3A7' }),
    )

    expect(response.status).toBe(200)
    expect(routeState.listDeviationsForSpecificationItem).toHaveBeenCalledWith(
      mockDb,
      7,
    )
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        childId: 7,
        childKind: 'requirement_application',
        kind: 'get_specification_child',
      },
      expect.any(Object),
    )
  })

  it.each(['%', '0', '999999999999999999999'])(
    'rejects invalid requirement application identifier %s before database work',
    async itemId => {
      const { GET } = await import(
        '@/app/api/specification-item-deviations/[itemId]/route'
      )

      const response = await GET(
        new Request(
          'https://example.test/api/specification-item-deviations/invalid',
        ) as never,
        params({ itemId }),
      )

      expect(response.status).toBe(400)
      expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    },
  )

  it('sanitizes failures while listing requirement application deviations', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.listDeviationsForSpecificationItem.mockRejectedValueOnce(
      new Error('database secret'),
    )
    const { GET } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-item-deviations/7',
      ) as never,
      params({ itemId: '7' }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
    })
    expect(consoleError).toHaveBeenCalled()
  })

  it('maps domain failures while listing requirement application deviations', async () => {
    routeState.listDeviationsForSpecificationItem.mockRejectedValueOnce(
      notFoundError('Specification item not found'),
    )
    const { GET } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-item-deviations/7',
      ) as never,
      params({ itemId: '7' }),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: 'not_found',
      error: 'Specification item not found',
    })
  })

  it('creates a deviation for a numeric requirement application', async () => {
    routeState.createDeviation.mockResolvedValueOnce({ id: 9 })
    const { POST } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await POST(
      new Request('https://example.test/api/specification-item-deviations/7', {
        body: JSON.stringify({ motivation: 'A valid deviation motivation' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      params({ itemId: '7' }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 9, ok: true })
    expect(routeState.createDeviation).toHaveBeenCalledWith(mockDb, {
      createdBy: 'Reviewer',
      createdByHsaId: 'SE5560000001-reviewer1',
      motivation: 'A valid deviation motivation',
      specificationItemId: 7,
    })
  })

  it.each(['0', '999999999999999999999'])(
    'rejects invalid item id %s in authorization before entering the mutation handler',
    async itemId => {
      const { POST } = await import(
        '@/app/api/specification-item-deviations/[itemId]/route'
      )

      const response = await POST(
        new Request(
          `https://example.test/api/specification-item-deviations/${itemId}`,
          {
            body: JSON.stringify({
              motivation: 'A valid deviation motivation',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        ) as never,
        params({ itemId }),
      )

      expect(response.status).toBe(400)
      expect(routeState.createDeviation).not.toHaveBeenCalled()
      expect(routeState.createDeviationForItemRef).not.toHaveBeenCalled()
      expect(routeState.requireHumanActorSnapshot).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['lib%3A7', 'lib:7'],
    ['local%3A8', 'local:8'],
  ])(
    'creates a deviation for stable item reference %s',
    async (itemId, itemRef) => {
      routeState.createDeviationForItemRef.mockResolvedValueOnce({ id: 10 })
      const { POST } = await import(
        '@/app/api/specification-item-deviations/[itemId]/route'
      )

      const response = await POST(
        new Request(
          `https://example.test/api/specification-item-deviations/${itemId}`,
          {
            body: JSON.stringify({
              motivation: 'A valid deviation motivation',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        ) as never,
        params({ itemId }),
      )

      expect(response.status).toBe(201)
      expect(routeState.createDeviationForItemRef).toHaveBeenCalledWith(
        mockDb,
        {
          createdBy: 'Reviewer',
          createdByHsaId: 'SE5560000001-reviewer1',
          itemRef,
          motivation: 'A valid deviation motivation',
        },
      )
    },
  )

  it('maps domain and unexpected errors while creating item deviations', async () => {
    const { POST } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )
    const invoke = () =>
      POST(
        new Request(
          'https://example.test/api/specification-item-deviations/7',
          {
            body: JSON.stringify({
              motivation: 'A valid deviation motivation',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        ) as never,
        params({ itemId: '7' }),
      )

    routeState.createDeviation.mockRejectedValueOnce(conflictError('Conflict'))
    const conflict = await invoke()
    expect(conflict.status).toBe(409)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.createDeviation.mockRejectedValueOnce(
      new Error('database secret'),
    )
    const unexpected = await invoke()
    expect(unexpected.status).toBe(500)
    expect(JSON.stringify(await unexpected.json())).not.toContain(
      'database secret',
    )
    expect(consoleError).toHaveBeenCalled()
  })

  it('rejects requirement application deviation creation before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { POST } = await import(
      '@/app/api/specification-item-deviations/[itemId]/route'
    )

    const response = await POST(
      new Request('https://example.test/api/specification-item-deviations/1', {
        body: JSON.stringify({
          motivation: 'A valid deviation motivation',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      params({ itemId: '1' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.createDeviation).not.toHaveBeenCalled()
    expect(routeState.createDeviationForItemRef).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('updates deviations without mutating original creator fields', async () => {
    routeState.updateDeviation.mockResolvedValue(undefined)
    const { PUT } = await import('@/app/api/deviations/[id]/route')

    const response = await PUT(
      jsonRequest('https://example.test/api/deviations/7', {
        motivation: 'Updated motivation',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    expect(routeState.updateDeviation).toHaveBeenCalledWith(mockDb, 7, {
      motivation: 'Updated motivation',
    })
    expect(
      routeState.createRequestContext.mock.invocationCallOrder[0],
    ).toBeLessThan(routeState.updateDeviation.mock.invocationCallOrder[0])
    expect(
      routeState.requireHumanActorSnapshot.mock.invocationCallOrder[0],
    ).toBeLessThan(routeState.updateDeviation.mock.invocationCallOrder[0])
  })

  it('rejects deviation updates before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { PUT } = await import('@/app/api/deviations/[id]/route')

    const response = await PUT(
      jsonRequest('https://example.test/api/deviations/7', {
        motivation: 'Updated motivation',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateDeviation).not.toHaveBeenCalled()
    expect(routeState.updateSpecificationLocalDeviation).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('rejects deviation decisions for non-reviewers before DAL writes', async () => {
    routeState.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Reviewer role is required for this decision', {
        reason: 'reviewer_required',
        requiredRoles: ['Reviewer'],
      }),
    )
    const { POST } = await import('@/app/api/deviations/[id]/decision/route')

    const response = await POST(
      new Request('https://example.test/api/deviations/7/decision', {
        body: JSON.stringify({
          decision: 1,
          decisionMotivation: 'Looks good',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'forbidden',
      error: 'Forbidden',
    })
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        deviationId: 7,
        deviationKind: 'library',
        kind: 'manage_deviation',
        operation: 'record_decision',
      },
      expect.any(Object),
    )
    expect(routeState.recordDecision).not.toHaveBeenCalled()
  })

  it('rejects deviation decisions before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { POST } = await import('@/app/api/deviations/[id]/decision/route')

    const response = await POST(
      new Request('https://example.test/api/deviations/7/decision', {
        body: JSON.stringify({
          decision: 1,
          decisionMotivation: 'Looks good',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.recordDecision).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('records an approved deviation decision with verified actor evidence', async () => {
    const { POST } = await import('@/app/api/deviations/[id]/decision/route')

    const response = await POST(
      new Request('https://example.test/api/deviations/7/decision', {
        body: JSON.stringify({
          decision: 1,
          decisionMotivation: 'Looks good',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.recordDecision).toHaveBeenCalledWith(mockDb, 7, {
      decidedBy: 'Reviewer',
      decidedByHsaId: 'SE5560000001-reviewer1',
      decision: 1,
      decisionMotivation: 'Looks good',
    })
  })

  it('returns the decision route error shape when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(
      new Error('db offline'),
    )
    const { POST } = await import('@/app/api/deviations/[id]/decision/route')

    try {
      const response = await POST(
        new Request('https://example.test/api/deviations/7/decision', {
          body: JSON.stringify({
            decision: 1,
            decisionMotivation: 'Looks good',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }) as never,
        params({ id: '7' }),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to record decision',
      })
      expect(routeState.recordDecision).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns the request-review route error shape when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(
      new Error('db offline'),
    )
    const { POST } = await import(
      '@/app/api/deviations/[id]/request-review/route'
    )

    try {
      const response = await POST(
        new Request('https://example.test/api/deviations/7/request-review', {
          method: 'POST',
        }) as never,
        params({ id: '7' }),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to request review',
      })
      expect(routeState.requestReview).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('rejects deviation request-review before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { POST } = await import(
      '@/app/api/deviations/[id]/request-review/route'
    )

    const response = await POST(
      new Request('https://example.test/api/deviations/7/request-review', {
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.requestReview).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('requests deviation review when a human actor is present', async () => {
    const { POST } = await import(
      '@/app/api/deviations/[id]/request-review/route'
    )

    const response = await POST(
      new Request('https://example.test/api/deviations/7/request-review', {
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.requestReview).toHaveBeenCalledWith(mockDb, 7)
  })

  it('rejects deviation revert-to-draft before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { POST } = await import(
      '@/app/api/deviations/[id]/revert-to-draft/route'
    )

    const response = await POST(
      new Request('https://example.test/api/deviations/7/revert-to-draft', {
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.revertToDraft).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('reverts deviations to draft when a human actor is present', async () => {
    const { POST } = await import(
      '@/app/api/deviations/[id]/revert-to-draft/route'
    )

    const response = await POST(
      new Request('https://example.test/api/deviations/7/revert-to-draft', {
        method: 'POST',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.revertToDraft).toHaveBeenCalledWith(mockDb, 7)
  })

  it('rejects deviation deletes before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { DELETE } = await import('@/app/api/deviations/[id]/route')

    const response = await DELETE(
      new Request('https://example.test/api/deviations/7', {
        method: 'DELETE',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.deleteDeviation).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('deletes deviations when a human actor is present', async () => {
    const { DELETE } = await import('@/app/api/deviations/[id]/route')

    const response = await DELETE(
      new Request('https://example.test/api/deviations/7', {
        method: 'DELETE',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.deleteDeviation).toHaveBeenCalledWith(mockDb, 7)
  })

  it('rejects client-supplied creators for specification-local deviation updates', async () => {
    const { PUT } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const response = await PUT(
      jsonRequest('https://example.test/api/specification-local-deviations/7', {
        createdBy: 'client',
        motivation: 'Updated motivation',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateSpecificationLocalDeviation).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('gets a specification-local deviation and maps read failures', async () => {
    routeState.getSpecificationLocalDeviation.mockResolvedValueOnce({
      id: 7,
      motivation: 'Local motivation',
    })
    const { GET } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const found = await GET(
      new Request(
        'https://example.test/api/specification-local-deviations/7',
      ) as never,
      params({ id: '7' }),
    )
    expect(found.status).toBe(200)
    await expect(found.json()).resolves.toMatchObject({ id: 7 })
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        childId: 7,
        childKind: 'deviation',
        deviationKind: 'specification-local',
        kind: 'get_specification_child',
      },
      expect.any(Object),
    )
    expect(found.headers.get('Cache-Control')).toBe('no-store')

    routeState.getSpecificationLocalDeviation.mockRejectedValueOnce(
      notFoundError('Not found'),
    )
    const missing = await GET(
      new Request(
        'https://example.test/api/specification-local-deviations/404',
      ) as never,
      params({ id: '404' }),
    )
    expect(missing.status).toBe(404)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.getSpecificationLocalDeviation.mockRejectedValueOnce(
      new Error('database secret'),
    )
    const failed = await GET(
      new Request(
        'https://example.test/api/specification-local-deviations/7',
      ) as never,
      params({ id: '7' }),
    )
    expect(failed.status).toBe(500)
    await expect(failed.json()).resolves.toEqual({
      error: 'Failed to get specification-local deviation',
    })
    expect(consoleError).toHaveBeenCalled()
  })

  it('rejects invalid specification-local deviation identifiers before database work', async () => {
    const { GET } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const response = await GET(
      new Request(
        'https://example.test/api/specification-local-deviations/invalid',
      ) as never,
      params({ id: 'invalid' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('updates specification-local deviations without mutating creator fields', async () => {
    routeState.updateSpecificationLocalDeviation.mockResolvedValue(undefined)
    const { PUT } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const response = await PUT(
      jsonRequest('https://example.test/api/specification-local-deviations/7', {
        motivation: 'Updated motivation',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    expect(routeState.updateSpecificationLocalDeviation).toHaveBeenCalledWith(
      mockDb,
      7,
      { motivation: 'Updated motivation' },
    )
    expect(
      routeState.createRequestContext.mock.invocationCallOrder[0],
    ).toBeLessThan(
      routeState.updateSpecificationLocalDeviation.mock.invocationCallOrder[0],
    )
    expect(
      routeState.requireHumanActorSnapshot.mock.invocationCallOrder[0],
    ).toBeLessThan(
      routeState.updateSpecificationLocalDeviation.mock.invocationCallOrder[0],
    )
  })

  it('rejects specification-local deviation updates before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { PUT } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const response = await PUT(
      jsonRequest('https://example.test/api/specification-local-deviations/7', {
        motivation: 'Updated motivation',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateDeviation).not.toHaveBeenCalled()
    expect(routeState.updateSpecificationLocalDeviation).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('rejects specification-local deviation deletes before DAL writes when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-id is required for this write',
        { reason: 'missing_actor_hsa_id' },
      )
    })
    const { DELETE } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const response = await DELETE(
      new Request('https://example.test/api/specification-local-deviations/7', {
        method: 'DELETE',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(400)
    expect(routeState.deleteSpecificationLocalDeviation).not.toHaveBeenCalled()
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('deletes specification-local deviations when a human actor is present', async () => {
    const { DELETE } = await import(
      '@/app/api/specification-local-deviations/[id]/route'
    )

    const response = await DELETE(
      new Request('https://example.test/api/specification-local-deviations/7', {
        method: 'DELETE',
      }) as never,
      params({ id: '7' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.deleteSpecificationLocalDeviation).toHaveBeenCalledWith(
      mockDb,
      7,
    )
  })

  it.each([
    {
      expectedError: 'Failed to update specification-local deviation',
      failureMock: routeState.updateSpecificationLocalDeviation,
      invoke: async () => {
        const { PUT } = await import(
          '@/app/api/specification-local-deviations/[id]/route'
        )
        return PUT(
          jsonRequest(
            'https://example.test/api/specification-local-deviations/7',
            { motivation: 'Updated motivation' },
          ) as never,
          params({ id: '7' }),
        )
      },
    },
    {
      expectedError: 'Failed to delete specification-local deviation',
      failureMock: routeState.deleteSpecificationLocalDeviation,
      invoke: async () => {
        const { DELETE } = await import(
          '@/app/api/specification-local-deviations/[id]/route'
        )
        return DELETE(
          new Request(
            'https://example.test/api/specification-local-deviations/7',
            { method: 'DELETE' },
          ) as never,
          params({ id: '7' }),
        )
      },
    },
  ])(
    'sanitizes unexpected specification-local mutation failures',
    async ({ expectedError, failureMock, invoke }) => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      failureMock.mockRejectedValueOnce(new Error('database secret'))

      const response = await invoke()

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({ error: expectedError })
      expect(consoleError).toHaveBeenCalled()
    },
  )

  it.each(deviationMutationFailureCases)(
    'maps domain conflicts while $label a deviation',
    async ({ failureMock, invoke }) => {
      failureMock.mockRejectedValueOnce(conflictError('Conflict'))

      const response = await invoke()

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        code: 'conflict',
        error: 'Conflict',
      })
    },
  )

  it.each(deviationMutationFailureCases)(
    'sanitizes unexpected errors while $label a deviation',
    async ({ expectedError, failureMock, invoke }) => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const unexpectedError = new Error('secret db details')
      failureMock.mockRejectedValueOnce(unexpectedError)

      try {
        const response = await invoke()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: expectedError })
        expect(consoleErrorSpy).toHaveBeenCalled()
      } finally {
        consoleErrorSpy.mockRestore()
      }
    },
  )
})
