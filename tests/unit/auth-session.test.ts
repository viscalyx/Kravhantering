import { beforeEach, describe, expect, it } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

describe('session helpers', () => {
  beforeEach(() => {
    process.env.AUTH_ENABLED = 'true'
    process.env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
    process.env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
    process.env.AUTH_OIDC_CLIENT_SECRET = 'secret'
    process.env.AUTH_OIDC_REDIRECT_URI =
      'http://localhost:3000/api/auth/callback'
    process.env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/'
    process.env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
    resetAuthConfigForTests()
  })

  it('isSignedIn returns false for empty sessions and true when sub is set', async () => {
    const { isSignedIn } = await import('@/lib/auth/session')
    expect(isSignedIn({} as never)).toBe(false)
    expect(isSignedIn({ sub: 'alice' } as never)).toBe(true)
  })

  it('round-trips session data via iron-session', async () => {
    const { getSessionFromRequest } = await import('@/lib/auth/session')

    // First request: write a session.
    const writeReq = new Request('http://localhost/')
    const writeRes = new Response()
    const session = await getSessionFromRequest(writeReq, writeRes)
    session.sub = 'alice'
    session.givenName = 'Alice'
    session.familyName = 'Reviewer'
    session.name = 'Alice Reviewer'
    session.hsaId = 'SE2321000032-reviewer1'
    session.roles = ['Reviewer']
    session.idToken = 'jwt'
    session.accessTokenExpiresAt = 1
    await session.save()

    const setCookie = writeRes.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('kravhantering_session=')

    // Second request: round-trip it back via Cookie header.
    const cookieHeader = setCookie.split(';')[0]
    const readReq = new Request('http://localhost/', {
      headers: { cookie: cookieHeader },
    })
    const readRes = new Response()
    const restored = await getSessionFromRequest(readReq, readRes)
    expect(restored.sub).toBe('alice')
    expect(restored.hsaId).toBe('SE2321000032-reviewer1')
    expect(restored.roles).toEqual(['Reviewer'])
  })
})
