import { sealData } from 'iron-session'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const TRACKED_ENV_KEYS = [
  'AUTH_ENABLED',
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_ISSUER_URL',
  'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
  'AUTH_OIDC_REDIRECT_URI',
  'AUTH_SESSION_COOKIE_PASSWORD',
  'AUTH_SESSION_TTL_SECONDS',
] as const

const env = process.env as Record<string, string | undefined>
const originalEnv = Object.fromEntries(
  TRACKED_ENV_KEYS.map(key => [key, env[key]]),
) as Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>

function restoreTrackedEnv() {
  for (const key of TRACKED_ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
}

describe('session helpers', () => {
  beforeEach(() => {
    env.AUTH_ENABLED = 'true'
    env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
    env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
    env.AUTH_OIDC_CLIENT_SECRET = 'secret'
    env.AUTH_OIDC_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
    env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/'
    env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
    delete env.AUTH_SESSION_TTL_SECONDS
    resetAuthConfigForTests()
  })

  afterEach(() => {
    restoreTrackedEnv()
    resetAuthConfigForTests()
  })

  it('isSignedIn returns false for empty and partial sessions, and true for complete sessions', async () => {
    const { isSignedIn } = await import('@/lib/auth/session')
    expect(isSignedIn({} as never)).toBe(false)
    expect(isSignedIn({ sub: 'alice' } as never)).toBe(false)
    expect(
      isSignedIn({
        sub: 'alice',
        givenName: 'Alice',
        familyName: 'Reviewer',
        name: 'Alice Reviewer',
        hsaId: 'SE2321000032-reviewer1',
        roles: ['Reviewer'],
        accessTokenExpiresAt: 1,
      } as never),
    ).toBe(true)
  })

  it('round-trips session data via iron-session', async () => {
    const { getSessionFromRequest } = await import('@/lib/auth/session')

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

  it('clamps negative cookie max-age to zero when estimating cookie length', async () => {
    env.AUTH_SESSION_TTL_SECONDS = '30'
    resetAuthConfigForTests()

    const sessionData = { sub: 'alice' }
    const { estimateSerializedSessionCookieLength } = await import(
      '@/lib/auth/session'
    )
    const length = await estimateSerializedSessionCookieLength(sessionData)
    const seal = await sealData(sessionData, {
      password: COOKIE_PASSWORD,
      ttl: 30,
    })
    const expected = [
      `kravhantering_session=${seal}`,
      'Max-Age=0',
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ].join('; ').length

    expect(length).toBe(expected)
  })
})
