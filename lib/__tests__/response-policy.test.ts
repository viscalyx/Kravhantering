import { describe, expect, it } from 'vitest'
import {
  applyRestResponsePolicy,
  getRouteHandlerBrand,
  withRestResponsePolicy,
} from '@/lib/http/response-policy'

// cSpell:ignore PROPFIND

describe('REST response policy', () => {
  it.each([
    ['GET', '/api/auth/me', 'no-store'],
    ['POST', '/api/ai/generate-requirement-import', 'no-cache'],
    ['GET', '/api/requirements', null],
    ['DELETE', '/api/requirements', null],
    ['POST', '/api/does-not-exist', 'no-store'],
    ['PROPFIND', '/api/auth/me', 'no-store'],
  ])('applies %s %s cache policy', (method, path, expected) => {
    const request = new Request(`http://localhost${path}`, { method })
    const response = new Response(null, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })

    const protectedResponse = applyRestResponsePolicy(request, response)

    expect(protectedResponse).toBe(response)
    expect(protectedResponse.headers.get('Cache-Control')).toBe(
      expected ?? 'private, max-age=60',
    )
  })

  it('brands restrictive response wrappers observably', async () => {
    const handler = withRestResponsePolicy((_request: Request) =>
      Response.json({ authenticated: false }),
    )

    expect(getRouteHandlerBrand(handler)).toBe('response-policy')
    const response = await handler(new Request('http://localhost/api/auth/me'))
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
