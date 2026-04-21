import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(() => 'mock-db'),
  listAreas: vi.fn(),
  createArea: vi.fn(),
  listOwners: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreas: mocks.listAreas,
  createArea: mocks.createArea,
}))
vi.mock('@/lib/dal/owners', () => ({
  listOwners: mocks.listOwners,
}))

import { GET, POST } from '@/app/api/requirement-areas/route'

describe('requirement-areas route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('returns areas enriched with ownerName', async () => {
      mocks.listAreas.mockResolvedValue([
        { id: 1, prefix: 'INT', name: 'Integration', ownerId: 1 },
        { id: 2, prefix: 'SÄK', name: 'Säkerhet', ownerId: null },
      ])
      mocks.listOwners.mockResolvedValue([
        { id: 1, firstName: 'Anna', lastName: 'S', email: 'a@b.com' },
      ])

      const res = await GET()
      const json = (await res.json()) as {
        areas: { ownerName: string | null }[]
      }

      expect(json.areas).toHaveLength(2)
      expect(json.areas[0].ownerName).toBe('Anna S')
      expect(json.areas[1].ownerName).toBeNull()
    })

    it('returns null ownerName when owner not found', async () => {
      mocks.listAreas.mockResolvedValue([
        { id: 1, prefix: 'INT', name: 'Integration', ownerId: 999 },
      ])
      mocks.listOwners.mockResolvedValue([])

      const res = await GET()
      const json = (await res.json()) as {
        areas: { ownerName: string | null }[]
      }
      expect(json.areas[0].ownerName).toBeNull()
    })
  })

  describe('POST', () => {
    it('creates an area and returns 201', async () => {
      const body = { prefix: 'NEW', name: 'New Area' }
      mocks.createArea.mockResolvedValue({ id: 3, ...body })

      const req = new Request('http://localhost/api/requirement-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const res = await POST(req)
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ id: 3 })
    })
  })
})
