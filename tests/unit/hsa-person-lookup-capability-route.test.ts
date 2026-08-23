import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
}))

vi.mock('@/lib/hsa/strict-person-lookup', () => ({
  getStrictHsaPersonLookupSnapshot: state.getSnapshot,
}))

import { GET } from '@/app/api/hsa-person-lookup-capability/route'

describe('GET /api/hsa-person-lookup-capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const request = () =>
    new Request('http://localhost/api/hsa-person-lookup-capability', {
      method: 'GET',
    })

  it('reports only that a validated startup snapshot is available', async () => {
    state.getSnapshot.mockResolvedValue({ endpointUrl: 'redacted' })

    const response = await GET(request() as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ available: true })
  })

  it.each([
    ['absent configuration', null],
    ['invalid local material', new Error('private TLS detail')],
  ])('reports unavailable for %s without leaking details', async (_, value) => {
    if (value instanceof Error) state.getSnapshot.mockRejectedValue(value)
    else state.getSnapshot.mockResolvedValue(value)

    const response = await GET(request() as never)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(JSON.parse(body)).toEqual({ available: false })
    expect(body).not.toContain('private TLS detail')
  })
})
