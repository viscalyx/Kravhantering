import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError, validationError } from '@/lib/requirements/errors'

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
})
