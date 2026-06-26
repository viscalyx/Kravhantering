import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

const mockGetRequirement = vi.fn()
const mockManageRequirement = vi.fn()
const mockCreateRequestContext = vi.hoisted(() =>
  vi.fn(() => ({
    actor: {
      displayName: 'Route Tester',
      hsaId: 'SE5560000001-route',
      id: 'route-test',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    },
    correlationId: 'corr-test',
    requestId: 'req-test',
    source: 'rest',
  })),
)
const mockAuthorization = vi.hoisted(() => ({ assertAuthorized: vi.fn() }))
const mockCreateDefaultAuthorizationService = vi.hoisted(() =>
  vi.fn(() => mockAuthorization),
)
const mockGetTransitionsFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => ({}),
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  getTransitionsFrom: mockGetTransitionsFrom,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: mockCreateDefaultAuthorizationService,
  createRequestContext: mockCreateRequestContext,
}))

vi.mock('@/lib/requirements/service', () => ({
  createRequirementsService: () => ({
    getRequirement: mockGetRequirement,
    manageRequirement: mockManageRequirement,
  }),
  toHttpErrorPayload: (
    err: Error & {
      code?: string
      details?: Record<string, unknown>
      status?: number
    },
  ) => ({
    body: {
      code: err.code ?? 'internal',
      details: err.details,
      error: err.message,
    },
    status: err.status ?? 500,
  }),
}))

import { DELETE, GET, PUT } from '@/app/api/requirements/[id]/route'

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

describe('requirements/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthorization.assertAuthorized.mockResolvedValue(undefined)
    mockGetTransitionsFrom.mockResolvedValue([{ id: 2 }])
  })

  describe('GET', () => {
    it('returns requirement with owner HSA-id as owner name', async () => {
      mockGetRequirement.mockResolvedValue({
        requirement: {
          id: 1,
          uniqueId: 'REQ-001',
          area: { id: 1, ownerHsaId: 'SE5560000001-annaj' },
          versions: [{ status: 3 }],
        },
      })

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))
      const json = (await res.json()) as {
        area: { ownerName: string }
        permissions: { allowedTransitionStatusIds: number[] }
      }
      expect(json.area.ownerName).toBe('SE5560000001-annaj')
      expect(json.permissions.allowedTransitionStatusIds).toEqual(
        expect.arrayContaining([2, 3, 4]),
      )
    })

    it('returns null area when no area is linked', async () => {
      mockGetRequirement.mockResolvedValue({
        requirement: {
          id: 1,
          uniqueId: 'REQ-001',
          area: null,
          versions: [{ status: 3 }],
        },
      })

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))
      const json = (await res.json()) as { area: null }
      expect(json.area).toBeNull()
    })

    it('uses published detail view when history permission is denied', async () => {
      mockAuthorization.assertAuthorized.mockImplementation(action => {
        if (action.kind === 'get_requirement' && action.view === 'history') {
          return Promise.reject(forbiddenError('history denied'))
        }
        return Promise.resolve()
      })
      mockGetRequirement.mockResolvedValue({
        requirement: {
          id: 1,
          uniqueId: 'REQ-001',
          area: { id: 1, ownerHsaId: 'SE5560000001-annaj' },
          versions: [{ status: 3 }],
        },
      })

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))
      const json = (await res.json()) as {
        permissions: { canViewHistory: boolean }
      }

      expect(res.status).toBe(200)
      expect(mockGetRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 1, view: 'detail' }),
      )
      expect(json.permissions.canViewHistory).toBe(false)
    })

    it('surfaces unexpected authorization failures instead of downgrading permissions', async () => {
      mockAuthorization.assertAuthorized.mockRejectedValueOnce(
        new Error('authorization datastore unavailable'),
      )

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))

      expect(res.status).toBe(500)
      expect(mockGetRequirement).not.toHaveBeenCalled()
    })

    it('returns error payload on failure', async () => {
      mockGetRequirement.mockRejectedValue(new Error('Not found'))

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))
      expect(res.status).toBe(500)
    })

    it('returns handled errors when request context creation fails', async () => {
      mockCreateRequestContext.mockRejectedValueOnce(new Error('auth failed'))

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))

      expect(res.status).toBe(500)
      expect(mockGetRequirement).not.toHaveBeenCalled()
    })
  })

  describe('PUT', () => {
    it('edits requirement and returns id', async () => {
      mockManageRequirement.mockResolvedValue({ result: 2 })

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'PUT',
        body: JSON.stringify({
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated',
          normReferenceIds: [5, 6],
          requirementPackageIds: [1, 2],
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await PUT(req, makeParams('1'))
      const json = (await res.json()) as { id: number; version: number }
      expect(json.id).toBe(1)
      expect(json.version).toBe(2)

      expect(mockManageRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 1,
          operation: 'edit',
          requirement: expect.objectContaining({
            baseRevisionToken: '11111111-1111-4111-8111-111111111111',
            baseVersionId: 10,
            normReferenceIds: [5, 6],
            requirementPackageIds: [1, 2],
          }),
        }),
      )
    })

    it('returns stale edit conflicts with details from the service', async () => {
      mockManageRequirement.mockRejectedValue(
        Object.assign(new Error('This requirement was updated'), {
          code: 'conflict',
          details: {
            baseVersionId: 10,
            latest: { uniqueId: 'REQ-001' },
            latestVersionId: 10,
            reason: 'stale_requirement_edit',
          },
          status: 409,
        }),
      )

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'PUT',
        body: JSON.stringify({
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await PUT(req, makeParams('1'))
      const json = (await res.json()) as {
        code: string
        details: { reason: string }
      }

      expect(res.status).toBe(409)
      expect(json.code).toBe('conflict')
      expect(json.details.reason).toBe('stale_requirement_edit')
    })

    it('returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('Validation'))

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'PUT',
        body: JSON.stringify({
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await PUT(req, makeParams('1'))
      expect(res.status).toBe(500)
    })

    it('returns 400 for invalid JSON bodies', async () => {
      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await PUT(req, makeParams('1'))

      expect(res.status).toBe(400)
      await expectInvalidRequest(res, '$')
      expect(mockManageRequirement).not.toHaveBeenCalled()
    })
  })

  describe('DELETE', () => {
    it('archives requirement', async () => {
      const detail = { id: 1, uniqueId: 'REQ-001' }
      mockManageRequirement.mockResolvedValue({ detail })

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'DELETE',
      })
      const res = await DELETE(req, makeParams('1'))
      const json = (await res.json()) as {
        detail: typeof detail
        id: number
        ok: boolean
        uniqueId: string
      }
      expect(json).toEqual({
        detail,
        id: 1,
        ok: true,
        uniqueId: 'REQ-001',
      })
      expect(mockManageRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ operation: 'archive' }),
      )
    })

    it.each([
      ['numeric id', '1', 1, null],
      ['unique id', 'REQ-001', null, 'REQ-001'],
    ])('archives requirement with fallback response when no detail is returned for %s', async (_label, ref, expectedId, expectedUniqueId) => {
      mockManageRequirement.mockResolvedValue({})

      const req = new NextRequest(`http://localhost/api/requirements/${ref}`, {
        method: 'DELETE',
      })
      const res = await DELETE(req, makeParams(ref))
      const json = (await res.json()) as {
        detail: null
        id: number | null
        ok: boolean
        uniqueId: string | null
      }
      expect(json).toEqual({
        detail: null,
        id: expectedId,
        ok: true,
        uniqueId: expectedUniqueId,
      })
      expect(mockManageRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ operation: 'archive' }),
      )
    })

    it('returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('Cannot archive'))

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'DELETE',
      })
      const res = await DELETE(req, makeParams('1'))
      expect(res.status).toBe(500)
    })
  })
})
