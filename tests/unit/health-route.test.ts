import { describe, expect, it } from 'vitest'
import * as route from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 with status ok and no-store cache header', async () => {
    const res = await route.GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('does not expose POST handler', () => {
    expect((route as { POST?: unknown }).POST).toBeUndefined()
  })
})
