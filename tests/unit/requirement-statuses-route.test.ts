import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListStatuses = vi.fn()
const mockListTransitions = vi.fn()
const mockCreateStatus = vi.fn()

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: {} } }),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => ({}),
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  listStatuses: (...args: unknown[]) => mockListStatuses(...args),
  listTransitions: (...args: unknown[]) => mockListTransitions(...args),
  createStatus: (...args: unknown[]) => mockCreateStatus(...args),
}))

import { GET, POST } from '@/app/api/requirement-statuses/route'

describe('requirement-statuses route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns statuses and transitions', async () => {
    mockListStatuses.mockResolvedValue([{ id: 1 }])
    mockListTransitions.mockResolvedValue([])
    const res = await GET()
    const json = (await res.json()) as {
      statuses: { id: number }[]
      transitions: unknown[]
    }
    expect(json.statuses).toHaveLength(1)
    expect(json.transitions).toEqual([])
  })

  it('POST creates status with 201', async () => {
    mockCreateStatus.mockResolvedValue({
      id: 2,
      nameSv: 'Ny',
      nameEn: 'New',
    })
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ nameSv: 'Ny', nameEn: 'New' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })
})
