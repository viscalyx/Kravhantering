// @vitest-environment node

import { sealData } from 'iron-session'
import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cookieStore = vi.hoisted(() => ({ cookies: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: cookieStore.cookies }))

const build = vi.hoisted(() => ({ target: 'prod' }))
vi.mock('@/lib/runtime/build-target', () => ({
  get BUILD_TARGET() {
    return build.target
  },
  get USE_INSECURE_COOKIE() {
    return build.target === 'dev'
  },
}))

import { getAuthConfig, resetAuthConfigForTests } from '@/lib/auth/config'
import { getLoginState } from '@/lib/auth/login-state'
import {
  estimateSerializedSessionCookieLength,
  getSession,
  getSessionFromRequest,
  getSessionFromRequestWithDiagnostics,
  isSignedIn,
} from '@/lib/auth/session'

const PASSWORD = 'unique-cookie-password-at-least-32-characters'
const SESSION = {
  sub: 'alice',
  givenName: 'Alice',
  familyName: 'Reviewer',
  name: 'Alice Reviewer',
  hsaId: 'SE5560000001-reviewer1',
  roles: ['Reviewer'],
  accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
}
const LOGIN = {
  state: 'state',
  nonce: 'nonce',
  codeVerifier: 'verifier',
  issuedAt: 1,
  returnTo: '/sv/requirements',
}

function useCookieStore(header = ''): NextResponse {
  const request = new NextRequest('https://app.example.com/', {
    headers: { cookie: header },
  })
  const response = new NextResponse()
  cookieStore.cookies.mockResolvedValue({
    get: request.cookies.get.bind(request.cookies),
    set: response.cookies.set.bind(response.cookies),
  })
  return response
}

function expectCookie(
  header: string,
  name: string,
  secure: boolean,
  maxAge: number,
): void {
  expect(header).toMatch(new RegExp(`^${name}=`))
  expect(header).toMatch(/; Path=\/;/i)
  expect(header).toMatch(/; HttpOnly/i)
  expect(header).toMatch(/; SameSite=Lax/i)
  expect(/; Secure/i.test(header)).toBe(secure)
  expect(header).not.toMatch(/; Domain=/i)
  expect(header).toMatch(new RegExp(`; Max-Age=${maxAge}(?:;|$)`, 'i'))
}

describe.each(['prod', 'local-prod', 'dev'])('%s cookie names', target => {
  beforeEach(() => {
    vi.clearAllMocks()
    build.target = target
    vi.stubEnv('AUTH_OIDC_ISSUER_URL', 'https://issuer.example.com')
    vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'app')
    vi.stubEnv('AUTH_OIDC_CLIENT_SECRET', 'unique-secret')
    vi.stubEnv(
      'AUTH_OIDC_REDIRECT_URI',
      'https://app.example.com/api/auth/callback',
    )
    vi.stubEnv('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI', 'https://app.example.com/')
    vi.stubEnv('AUTH_SESSION_COOKIE_PASSWORD', PASSWORD)
    vi.stubEnv('AUTH_SESSION_COOKIE_NAME', undefined)
    vi.stubEnv('AUTH_SESSION_TTL_SECONDS', '7200')
    resetAuthConfigForTests()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })

  it.runIf(target !== 'dev').each([
    [undefined, '__Host-kravhantering_session'],
    ['', '__Host-kravhantering_session'],
    ['  ', '__Host-kravhantering_session'],
    ['kravhantering_session', '__Host-kravhantering_session'],
    ['custom_session', '__Host-custom_session'],
    [' __Host-custom_session ', '__Host-custom_session'],
    ['__host-custom_session', '__Host-__host-custom_session'],
  ])('resolves %s to %s', (configured, expected) => {
    vi.stubEnv('AUTH_SESSION_COOKIE_NAME', configured)
    expect(getAuthConfig().cookieName).toBe(expected)
  })
  it
    .runIf(target === 'dev')
    .each([undefined, '', ' ', 'kravhantering_session', ' custom_session '])(
    'preserves HTTP development name %s',
    configured => {
      vi.stubEnv('AUTH_SESSION_COOKIE_NAME', configured)
      expect(getAuthConfig().cookieName).toBe(
        configured?.trim() || 'kravhantering_session',
      )
    },
  )

  it
    .runIf(target === 'dev')
    .each([
      '__Host-session',
      '__Secure-session',
      '__Http-session',
      '__host-session',
      '__secure-session',
    ])('rejects a Secure-only development name %s', configured => {
    vi.stubEnv('AUTH_SESSION_COOKIE_NAME', configured)
    expect(() => getAuthConfig()).toThrow(/AUTH_SESSION_COOKIE_NAME.*Secure/)
  })

  it.each([
    'bad name',
    'name=value',
    'name;Path=/',
    'name\\suffix',
    'räksmörgås',
  ])('rejects invalid cookie name %s at configuration load', configured => {
    vi.stubEnv('AUTH_SESSION_COOKIE_NAME', configured)
    expect(() => getAuthConfig()).toThrow(
      /AUTH_SESSION_COOKIE_NAME.*valid cookie name/,
    )
  })
  it.each(
    target === 'dev'
      ? [
          [undefined, 'kravhantering_session'],
          ['custom_session', 'custom_session'],
        ]
      : [
          [undefined, '__Host-kravhantering_session'],
          ['', '__Host-kravhantering_session'],
          ['  ', '__Host-kravhantering_session'],
          ['kravhantering_session', '__Host-kravhantering_session'],
          ['custom_session', '__Host-custom_session'],
          ['__Host-custom_session', '__Host-custom_session'],
        ],
  )(
    'saves, reads and destroys both effective cookies for %s',
    async (configured, name) => {
      vi.stubEnv('AUTH_SESSION_COOKIE_NAME', configured)
      const effectiveName = name as string
      const response = new Response()
      const session = await getSessionFromRequest(
        new Request('https://app.example.com/'),
        response,
      )
      Object.assign(session, SESSION)
      await session.save()
      const header = response.headers.get('set-cookie') ?? ''
      expectCookie(header, effectiveName, target !== 'dev', 7140)
      expect(await estimateSerializedSessionCookieLength(SESSION)).toBe(
        header.length,
      )
      const pair = header.split(';')[0]
      const storeResponse = useCookieStore(pair)
      expect(isSignedIn(await getSession())).toBe(true)
      ;(await getSession()).destroy()
      expectCookie(
        storeResponse.headers.get('set-cookie') ?? '',
        effectiveName,
        target !== 'dev',
        0,
      )
      const rawResponse = new Response()
      const restored = await getSessionFromRequest(
        new Request('https://app.example.com/', {
          headers: { cookie: pair },
        }),
        rawResponse,
      )
      expect(restored.sub).toBe('alice')
      restored.destroy()
      expectCookie(
        rawResponse.headers.get('set-cookie') ?? '',
        effectiveName,
        target !== 'dev',
        0,
      )

      const loginResponse = useCookieStore()
      const login = await getLoginState()
      Object.assign(login, LOGIN)
      await login.save()
      const loginHeader = loginResponse.headers.get('set-cookie') ?? ''
      expectCookie(loginHeader, `${effectiveName}_login`, target !== 'dev', 240)
      const consumeResponse = useCookieStore(loginHeader.split(';')[0])
      const restoredLogin = await getLoginState()
      expect(restoredLogin.state).toBe('state')
      restoredLogin.destroy()
      expectCookie(
        consumeResponse.headers.get('set-cookie') ?? '',
        `${effectiveName}_login`,
        target !== 'dev',
        0,
      )
    },
  )

  it
    .runIf(target !== 'dev')
    .each(['legacy only', 'legacy first', 'effective first'])(
    'authenticates only the effective names and leaves legacy cookies to expire: %s',
    async order => {
      const oldSession = await sealData(
        { ...SESSION, sub: 'legacy-user' },
        { password: PASSWORD, ttl: 7200 },
      )
      const oldLogin = await sealData(
        { ...LOGIN, state: 'legacy-state' },
        { password: PASSWORD, ttl: 300 },
      )
      const newSession = await sealData(SESSION, {
        password: PASSWORD,
        ttl: 7200,
      })
      const newLogin = await sealData(LOGIN, { password: PASSWORD, ttl: 300 })
      const legacy = `kravhantering_session=${oldSession}; kravhantering_session_login=${oldLogin}`
      const effective = `__Host-kravhantering_session=${newSession}; __Host-kravhantering_session_login=${newLogin}`
      const header =
        order === 'legacy only'
          ? legacy
          : order === 'legacy first'
            ? `${legacy}; ${effective}`
            : `${effective}; ${legacy}`
      const response = new Response()
      const diagnostic = await getSessionFromRequestWithDiagnostics(
        new Request('https://app.example.com/', {
          headers: { cookie: header },
        }),
        response,
      )
      expect(diagnostic.rejected).toBe(false)
      expect(diagnostic.session.sub).toBe(
        order === 'legacy only' ? undefined : 'alice',
      )
      expect(response.headers.get('set-cookie')).toBeNull()
      const storeResponse = useCookieStore(header)
      expect((await getSession()).sub).toBe(
        order === 'legacy only' ? undefined : 'alice',
      )
      const login = await getLoginState()
      expect(login.state).toBe(order === 'legacy only' ? undefined : 'state')
      expect(storeResponse.headers.get('set-cookie')).toBeNull()
      login.destroy()
      expect(storeResponse.cookies.getAll().map(cookie => cookie.name)).toEqual(
        ['__Host-kravhantering_session_login'],
      )
      expect(getAuthConfig().sessionTtlSeconds).toBe(7200)
    },
  )
})
