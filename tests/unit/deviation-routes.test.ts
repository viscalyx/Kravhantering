import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validationError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  createDeviation: vi.fn(),
  createDeviationForItemRef: vi.fn(),
  createRequestContext: vi.fn(),
  deleteDeviation: vi.fn(),
  deleteSpecificationLocalDeviation: vi.fn(),
  getDeviation: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSpecificationLocalDeviation: vi.fn(),
  listDeviationsForSpecificationItem: vi.fn(),
  listDeviationsForSpecificationLocalRequirement: vi.fn(),
  requireHumanActorSnapshot: vi.fn(),
  updateDeviation: vi.fn(),
  updateSpecificationLocalDeviation: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/deviations', () => ({
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
  updateDeviation: routeState.updateDeviation,
  updateSpecificationLocalDeviation:
    routeState.updateSpecificationLocalDeviation,
}))

vi.mock('@/lib/requirements/auth', () => ({
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
    routeState.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
    routeState.createRequestContext.mockResolvedValue({
      actor: {
        displayName: 'Reviewer',
        hsaId: 'SE2321000032-reviewer1',
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
      hsaId: 'SE2321000032-reviewer1',
    })
  })

  it('rejects client-supplied creators for specification item deviations', async () => {
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

  it('rejects deviation updates before loading the database when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-ID is required for this write',
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
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
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

  it('rejects specification-local deviation updates before loading the database when no human actor is present', async () => {
    routeState.requireHumanActorSnapshot.mockImplementationOnce(() => {
      throw validationError(
        'Authenticated actor with a verified HSA-ID is required for this write',
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
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })
})
