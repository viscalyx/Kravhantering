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

  beforeEach(() => {
    mockAuthEnv()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
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

  async function importGet() {
    const mod = await import('@/app/api/auth/logout/route')
    return mod.GET
  }

  it('emits auth.logout with the signed-in actor', async () => {
    getSessionMock.mockResolvedValue({
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
      idToken: 'idt',
      destroy: vi.fn(),
    })
    const GET = await importGet()
    await GET(new NextRequest('http://localhost/api/auth/logout'))
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.logout')
    expect(events[0].outcome).toBe('success')
    expect(events[0].actor).toEqual({
      source: 'oidc',
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
    })
  })

  it('emits auth.logout with anonymous source when no session is present', async () => {
    getSessionMock.mockResolvedValue({ destroy: vi.fn() })
    const GET = await importGet()
    await GET(new NextRequest('http://localhost/api/auth/logout'))
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.logout')
    expect(events[0].actor).toEqual({ source: 'anonymous' })
  })
})
