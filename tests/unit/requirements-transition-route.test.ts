import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTransitionRequirement = vi.fn()

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
    transitionRequirement: mockTransitionRequirement,
  }),
  toHttpErrorPayload: (err: Error) => ({
    body: { error: err.message },
    status: 400,
  }),
}))

import { POST } from '@/app/api/requirements/[id]/transition/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirements/[id]/transition route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for missing statusId', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('1'))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toMatch(/statusId/)
  })

  it('transitions requirement successfully', async () => {
    mockTransitionRequirement.mockResolvedValue({ version: 3 })
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ statusId: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('1'))
    const json = (await res.json()) as { id: number; version: number }
    expect(json.id).toBe(1)
    expect(json.version).toBe(3)
  })

  it('returns error on service failure', async () => {
    mockTransitionRequirement.mockRejectedValue(new Error('Invalid transition'))
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ statusId: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('1'))
    expect(res.status).toBe(400)
  })
})
