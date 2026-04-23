import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(() => 'mock-db'),
  listOwners: vi.fn(),
  createOwner: vi.fn(),
  updateOwner: vi.fn(),
  deleteOwner: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/owners', () => ({
  listOwners: mocks.listOwners,
  createOwner: mocks.createOwner,
  updateOwner: mocks.updateOwner,
  deleteOwner: mocks.deleteOwner,
}))

import { DELETE, PUT } from '@/app/api/owners/[id]/route'
import { GET, POST } from '@/app/api/owners/route'

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id })
}

describe('owners routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/owners', () => {
    it('returns owners list mapped to id+name', async () => {
      mocks.listOwners.mockResolvedValue([
        { id: 1, firstName: 'Anna', lastName: 'Svensson', email: 'a@b.com' },
      ])
      const res = await GET()
      const json = await res.json()
      expect(json).toEqual({
        owners: [{ id: 1, name: 'Anna Svensson' }],
      })
    })
  })

  describe('POST /api/owners', () => {
    it('creates an owner and returns 201', async () => {
      const body = { firstName: 'Erik', lastName: 'L', email: 'e@t.com' }
      mocks.createOwner.mockResolvedValue({ id: 2, ...body })
      const req = new Request('http://localhost/api/owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const res = await POST(req)
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ id: 2 })
    })
  })

  describe('PUT /api/owners/[id]', () => {
    it('returns 400 for non-integer id', async () => {
      const req = new NextRequest('http://localhost/api/owners/abc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'X' }),
      })
      const res = await PUT(req, { params: makeParams('abc') })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 400 for float id', async () => {
      const req = new NextRequest('http://localhost/api/owners/1.5', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'X' }),
      })
      const res = await PUT(req, { params: makeParams('1.5') })
      expect(res.status).toBe(400)
    })

    it('returns 400 for non-object body', async () => {
      const req = new NextRequest('http://localhost/api/owners/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('not-object'),
      })
      const res = await PUT(req, { params: makeParams('1') })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid body' })
    })

    it('returns 400 for array body', async () => {
      const req = new NextRequest('http://localhost/api/owners/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([1, 2]),
      })
      const res = await PUT(req, { params: makeParams('1') })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid body' })
    })

    it('returns 400 for unknown fields', async () => {
      const req = new NextRequest('http://localhost/api/owners/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'X', hack: true }),
      })
      const res = await PUT(req, { params: makeParams('1') })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Unknown fields' })
    })

    it('returns 400 for non-string field types', async () => {
      const req = new NextRequest('http://localhost/api/owners/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 123 }),
      })
      const res = await PUT(req, { params: makeParams('1') })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid field types' })
    })

    it('returns 404 when owner not found', async () => {
      mocks.updateOwner.mockResolvedValue(null)
      const req = new NextRequest('http://localhost/api/owners/99', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'X' }),
      })
      const res = await PUT(req, { params: makeParams('99') })
      expect(res.status).toBe(404)
    })

    it('updates and returns owner on success', async () => {
      const updated = {
        id: 1,
        firstName: 'New',
        lastName: 'Name',
        email: 'n@t.com',
      }
      mocks.updateOwner.mockResolvedValue(updated)
      const req = new NextRequest('http://localhost/api/owners/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'New' }),
      })
      const res = await PUT(req, { params: makeParams('1') })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(updated)
      expect(mocks.updateOwner).toHaveBeenCalledWith('mock-db', 1, {
        firstName: 'New',
      })
    })
  })

  describe('DELETE /api/owners/[id]', () => {
    it('returns 400 for non-integer id', async () => {
      const req = new NextRequest('http://localhost/api/owners/abc', {
        method: 'DELETE',
      })
      const res = await DELETE(req, { params: makeParams('abc') })
      expect(res.status).toBe(400)
    })

    it('returns 404 when no row deleted', async () => {
      mocks.deleteOwner.mockResolvedValue(false)
      const req = new NextRequest('http://localhost/api/owners/99', {
        method: 'DELETE',
      })
      const res = await DELETE(req, { params: makeParams('99') })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Not found' })
    })

    it('returns ok on successful delete', async () => {
      mocks.deleteOwner.mockResolvedValue(true)
      const req = new NextRequest('http://localhost/api/owners/1', {
        method: 'DELETE',
      })
      const res = await DELETE(req, { params: makeParams('1') })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
  })
})
