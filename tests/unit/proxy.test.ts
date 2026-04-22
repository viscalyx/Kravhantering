import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const intlMiddlewareMock = vi.fn()
const getAuthConfigMock = vi.fn()
const getSessionFromRequestMock = vi.fn()
const isSignedInMock = vi.fn()

vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddlewareMock,
}))

vi.mock('@/i18n/routing', () => ({
  routing: {},
}))

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => getAuthConfigMock(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionFromRequest: (...args: unknown[]) =>
    getSessionFromRequestMock(...args),
  isSignedIn: (session: unknown) => isSignedInMock(session),
}))

describe('proxy', () => {
  beforeEach(() => {
    vi.resetModules()
    intlMiddlewareMock.mockReset()
    intlMiddlewareMock.mockImplementation(() => NextResponse.next())
    getAuthConfigMock.mockReset()
    getSessionFromRequestMock.mockReset()
    isSignedInMock.mockReset()
    getAuthConfigMock.mockReturnValue({ enabled: false })
    getSessionFromRequestMock.mockResolvedValue({})
    isSignedInMock.mockReturnValue(false)
  })

  it('propagates the nonce and CSP through request override headers', async () => {
    const { default: proxy } = await import('@/proxy')
    const request = new NextRequest('http://localhost:3000/sv/requirements')

    const response = await proxy(request)
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

  describe('with AUTH_ENABLED=true', () => {
    beforeEach(() => {
      getAuthConfigMock.mockReturnValue({ enabled: true })
    })

    it('redirects unauthenticated page requests to /api/auth/login with returnTo', async () => {
      isSignedInMock.mockReturnValue(false)
      const { default: proxy } = await import('@/proxy')
      const request = new NextRequest('http://localhost:3000/sv/requirements')

      const response = await proxy(request)

      expect([302, 307]).toContain(response.status)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/api/auth/login')
      expect(location).toContain('returnTo=%2Fsv%2Frequirements')
    })

    it('returns 401 JSON for unauthenticated API requests', async () => {
      isSignedInMock.mockReturnValue(false)
      const { default: proxy } = await import('@/proxy')
      const request = new NextRequest('http://localhost:3000/api/requirements')

      const response = await proxy(request)

      expect(response.status).toBe(401)
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('passes through requests for /api/auth/* without auth', async () => {
      const { default: proxy } = await import('@/proxy')
      const request = new NextRequest(
        'http://localhost:3000/api/auth/login?returnTo=/sv',
      )

      const response = await proxy(request)
      expect(response.status).toBe(200)
      expect(getSessionFromRequestMock).not.toHaveBeenCalled()
    })

    it('requires Bearer token on /api/mcp', async () => {
      const { default: proxy } = await import('@/proxy')
      const request = new NextRequest('http://localhost:3000/api/mcp')

      const response = await proxy(request)

      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
    })

    it('lets /api/mcp through when a Bearer token is present', async () => {
      const { default: proxy } = await import('@/proxy')
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: { authorization: 'Bearer abc.def.ghi' },
      })

      const response = await proxy(request)
      expect(response.status).toBe(200)
      expect(getSessionFromRequestMock).not.toHaveBeenCalled()
    })

    it('lets signed-in page requests render with CSP applied', async () => {
      isSignedInMock.mockReturnValue(true)
      const { default: proxy } = await import('@/proxy')
      const request = new NextRequest('http://localhost:3000/sv/requirements')

      const response = await proxy(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "script-src 'self' 'nonce-",
      )
    })
  })
})
