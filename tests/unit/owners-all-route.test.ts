import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: {} } })),
  getDb: vi.fn(() => 'mock-db'),
  listOwners: vi.fn(),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}))
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/dal/owners', () => ({
  listOwners: mocks.listOwners,
}))

import { GET } from '@/app/api/owners/all/route'

describe('GET /api/owners/all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns full owner objects', async () => {
    mocks.listOwners.mockResolvedValue([
      { id: 1, firstName: 'Anna', lastName: 'S', email: 'a@b.com' },
    ])
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual({
      owners: [{ id: 1, firstName: 'Anna', lastName: 'S', email: 'a@b.com' }],
    })
  })

  it('returns empty array when no owners', async () => {
    mocks.listOwners.mockResolvedValue([])
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual({ owners: [] })
  })
})
