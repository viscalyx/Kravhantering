import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTransitionRequirement = vi.fn()
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
    transitionRequirement: mockTransitionRequirement,
  }),
  toHttpErrorPayload: (err: Error) => ({
    body: { error: err.message },
    status: 400,
  }),
}))

import { POST } from '@/app/api/requirement-transitions/[id]/route'

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
    mockTransitionRequirement.mockResolvedValue({
      detail: { id: 1, uniqueId: 'TST0001' },
      version: 3,
    })
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

  it('returns handled errors when request context creation fails', async () => {
    mockCreateRequestContext.mockRejectedValueOnce(new Error('auth failed'))
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ statusId: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, makeParams('1'))
    expect(res.status).toBe(400)
    expect(mockTransitionRequirement).not.toHaveBeenCalled()
  })
})
