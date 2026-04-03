import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const intlMiddlewareMock = vi.fn()

vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddlewareMock,
}))

vi.mock('@/i18n/routing', () => ({
  routing: {},
}))

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules()
    intlMiddlewareMock.mockReset()
    intlMiddlewareMock.mockImplementation(() => NextResponse.next())
  })

  it('propagates the nonce and CSP through request override headers', async () => {
    const { default: middleware } = await import('@/middleware')
    const request = new NextRequest('http://localhost:3000/sv/requirements')

    const response = middleware(request)
    const csp = response.headers.get('Content-Security-Policy')
    const overrideHeaders = response.headers.get(
      'x-middleware-override-headers',
    )
    const nonce = response.headers.get('x-middleware-request-x-nonce')
    const requestCsp = response.headers.get(
      'x-middleware-request-content-security-policy',
    )

    expect(csp).toContain("script-src 'self' 'nonce-")
    expect(overrideHeaders).toContain('x-nonce')
    expect(overrideHeaders).toContain('content-security-policy')
    expect(nonce).toBeTruthy()
    expect(requestCsp).toBe(csp)
    expect(requestCsp).toContain("script-src 'self' 'nonce-")
  })
})
