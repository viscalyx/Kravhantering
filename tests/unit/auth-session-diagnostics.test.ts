import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

describe('getSessionFromRequestWithDiagnostics', () => {
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function writeValidSessionCookie(): Promise<string> {
    const { getSessionFromRequest } = await import('@/lib/auth/session')
    const writeReq = new Request('http://localhost/')
    const writeRes = new Response()
    const session = await getSessionFromRequest(writeReq, writeRes)
    session.sub = 'user-1'
    session.givenName = 'Alice'
    session.familyName = 'Reviewer'
    session.name = 'Alice Reviewer'
    session.hsaId = 'SE2321000032-rev1'
    session.roles = ['Reviewer']
    session.idToken = 'jwt'
    session.accessTokenExpiresAt = 1
    await session.save()
    const setCookie = writeRes.headers.get('set-cookie') ?? ''
    return setCookie.split(';')[0] ?? ''
  }

  it('returns rejected=false when no cookie is present', async () => {
    const { getSessionFromRequestWithDiagnostics } = await import(
      '@/lib/auth/session'
    )
    const result = await getSessionFromRequestWithDiagnostics(
      new Request('http://localhost/'),
      new Response(),
    )
    expect(result.rejected).toBe(false)
    expect(result.reason).toBeUndefined()
  })

  it('returns rejected=false when a valid signed-in cookie is present', async () => {
    const cookieHeader = await writeValidSessionCookie()
    const { getSessionFromRequestWithDiagnostics } = await import(
      '@/lib/auth/session'
    )
    const result = await getSessionFromRequestWithDiagnostics(
      new Request('http://localhost/', { headers: { cookie: cookieHeader } }),
      new Response(),
    )
    expect(result.rejected).toBe(false)
    expect(result.session.sub).toBe('user-1')
  })

  it('returns rejected=true with reason when the cookie is garbage', async () => {
    const { getSessionFromRequestWithDiagnostics } = await import(
      '@/lib/auth/session'
    )
    const result = await getSessionFromRequestWithDiagnostics(
      new Request('http://localhost/', {
        headers: { cookie: 'kravhantering_session=this-is-not-a-real-session' },
      }),
      new Response(),
    )
    expect(result.rejected).toBe(true)
    expect(result.reason).toBe('invalid_session_cookie')
  })

  it('returns rejected=true when the cookie was sealed with a different password', async () => {
    // Write a cookie under one password, then read it under a different one.
    const cookieHeader = await writeValidSessionCookie()
    process.env.AUTH_SESSION_COOKIE_PASSWORD =
      'different-cookie-password-must-be-at-least-32-chars'
    resetAuthConfigForTests()
    const { getSessionFromRequestWithDiagnostics } = await import(
      '@/lib/auth/session'
    )
    const result = await getSessionFromRequestWithDiagnostics(
      new Request('http://localhost/', { headers: { cookie: cookieHeader } }),
      new Response(),
    )
    expect(result.rejected).toBe(true)
    expect(result.reason).toBe('invalid_session_cookie')
  })
})
