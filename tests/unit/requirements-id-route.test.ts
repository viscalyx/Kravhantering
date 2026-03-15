import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const mockGetRequirement = vi.fn()
const mockManageRequirement = vi.fn()
const mockGetOwnerById = vi.fn()

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: {} } }),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => ({}),
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: () => ({ source: 'rest' }),
}))

vi.mock('@/lib/requirements/service', () => ({
  createRequirementsService: () => ({
    getRequirement: mockGetRequirement,
    manageRequirement: mockManageRequirement,
  }),
  toHttpErrorPayload: (err: Error) => ({
    body: { error: err.message },
    status: 400,
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
      expect(res.status).toBe(400)
    })
  })

  describe('PUT', () => {
    it('edits requirement and returns id', async () => {
      mockManageRequirement.mockResolvedValue({ result: 2 })

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'PUT',
        body: JSON.stringify({
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
        }),
      )
    })

    it('returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('Validation'))

      const req = new NextRequest('http://localhost/api/requirements/1', {
        method: 'PUT',
        body: JSON.stringify({ description: '' }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await PUT(req, makeParams('1'))
      expect(res.status).toBe(400)
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
      expect(res.status).toBe(400)
    })
  })
})
