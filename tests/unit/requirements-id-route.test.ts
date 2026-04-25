import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRequirement = vi.fn()
const mockManageRequirement = vi.fn()
const mockGetOwnerById = vi.fn()
const mockCreateRequestContext = vi.hoisted(() =>
  vi.fn(() => ({ source: 'rest' })),
)

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => ({}),
}))

vi.mock('@/lib/requirements/auth', () => ({
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

vi.mock('@/lib/dal/owners', () => ({
  getOwnerById: (...args: unknown[]) => mockGetOwnerById(...args),
}))

import { DELETE, GET, PUT } from '@/app/api/requirements/[id]/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirements/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('returns requirement with owner name', async () => {
      mockGetRequirement.mockResolvedValue({
        requirement: {
          id: 1,
          area: { id: 1, ownerId: 10 },
        },
      })
      mockGetOwnerById.mockResolvedValue({
        firstName: 'Anna',
        lastName: 'Johansson',
      })

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))
      const json = (await res.json()) as { area: { ownerName: string } }
      expect(json.area.ownerName).toBe('Anna Johansson')
    })

    it('returns null ownerName when no owner', async () => {
      mockGetRequirement.mockResolvedValue({
        requirement: {
          id: 1,
          area: { id: 1, ownerId: null },
        },
      })

      const req = new NextRequest('http://localhost/api/requirements/1')
      const res = await GET(req, makeParams('1'))
      const json = (await res.json()) as { area: { ownerName: string | null } }
      expect(json.area.ownerName).toBeNull()
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
          references: [{ name: 'Ref1', uri: 'http://example.com' }],
          scenarioIds: [1, 2],
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
        body: JSON.stringify({ description: '' }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await PUT(req, makeParams('1'))
      expect(res.status).toBe(500)
    })
  })

  describe('DELETE', () => {
    it('archives requirement', async () => {
      mockManageRequirement.mockResolvedValue({})

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'DELETE',
      })
      const res = await DELETE(req, makeParams('1'))
      const json = (await res.json()) as { ok: boolean }
      expect(json.ok).toBe(true)
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
