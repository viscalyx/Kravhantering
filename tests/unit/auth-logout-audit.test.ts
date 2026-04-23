import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const getSessionMock = vi.fn()
const getOidcConfigurationMock = vi.fn()
const buildEndSessionUrlMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getSession: () => getSessionMock(),
}))
vi.mock('@/lib/auth/oidc', () => ({
  getOidcConfiguration: () => getOidcConfigurationMock(),
  oidcClient: {
    buildEndSessionUrl: (...args: unknown[]) => buildEndSessionUrlMock(...args),
  },
}))

function mockAuthEnv() {
  process.env.AUTH_ENABLED = 'true'
  process.env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  process.env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
  process.env.AUTH_OIDC_CLIENT_SECRET = 'secret'
  process.env.AUTH_OIDC_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
  process.env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/'
  process.env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
  resetAuthConfigForTests()
}

describe('auth logout security audit events', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockAuthEnv()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getSessionMock.mockReset()
    getOidcConfigurationMock.mockReset()
    buildEndSessionUrlMock.mockReset()
    getOidcConfigurationMock.mockResolvedValue({})
    buildEndSessionUrlMock.mockReturnValue(
      new URL('https://idp.example.test/end'),
    )
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warnSpy.mockRestore()
  })

  function emittedSecurityEvents(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(String(call[0])) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter(
        (ev: Record<string, unknown> | null): ev is Record<string, unknown> =>
          ev !== null && ev.channel === 'security-audit',
      )
  }

  async function importRoute() {
    return import('@/app/api/auth/logout/route')
  }

  it('emits auth.logout with the signed-in actor on POST', async () => {
    const destroy = vi.fn()
    getSessionMock.mockResolvedValue({
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
      idToken: 'idt',
      destroy,
    })
    const { POST } = await importRoute()
    await POST(
      new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }),
    )
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.logout')
    expect(events[0].outcome).toBe('success')
    expect(events[0].actor).toEqual({
      source: 'oidc',
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
    })
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('emits auth.logout with anonymous source on POST when no session is present', async () => {
    const destroy = vi.fn()
    getSessionMock.mockResolvedValue({ destroy })
    const { POST } = await importRoute()
    await POST(
      new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }),
    )
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.logout')
    expect(events[0].actor).toEqual({ source: 'anonymous' })
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('keeps GET non-destructive and redirects locally', async () => {
    const destroy = vi.fn()
    getSessionMock.mockResolvedValue({ destroy, sub: 'user-1' })
    const { GET } = await importRoute()
    const response = await GET(
      new NextRequest('http://localhost/api/auth/logout'),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(destroy).not.toHaveBeenCalled()
    expect(emittedSecurityEvents()).toHaveLength(0)
  })

  it('logs a warning and falls back to the local redirect when discovery fails', async () => {
    const destroy = vi.fn()
    getSessionMock.mockResolvedValue({ destroy })
    getOidcConfigurationMock.mockRejectedValue(new Error('discovery failed'))

    const { POST } = await importRoute()
    const response = await POST(
      new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }),
    )

    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(destroy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(
      'OIDC end_session_endpoint discovery/build failed',
      expect.objectContaining({
        error: 'discovery failed',
        hasIdTokenHint: false,
        postLogoutRedirectUri: 'http://localhost:3000/',
      }),
    )
  })
})
