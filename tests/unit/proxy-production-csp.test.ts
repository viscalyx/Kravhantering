import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

// next-intl's middleware module imports `next/server` via a path that the
// Vitest ESM resolver cannot follow. Match the main proxy test's
// pass-through mock so this file only varies the build target.
const { intlMiddlewareMock } = vi.hoisted(() => ({
  intlMiddlewareMock: vi.fn(() => NextResponse.next()),
}))

vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddlewareMock,
}))
vi.mock('@/i18n/routing', () => ({ routing: {} }))
vi.mock('@/lib/runtime/build-target', () => ({
  ALLOW_INSECURE_OIDC_ISSUER: false,
  BUILD_TARGET: 'prod',
  USE_DEV_CSP: false,
  USE_INSECURE_COOKIE: false,
}))

const { default: proxy } = await import('@/proxy')
const { resetAuthConfigForTests } = await import('@/lib/auth/config')
const { getSessionFromRequest } = await import('@/lib/auth/session')

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const AUTH_ON_ENV: Record<string, string> = {
  AUTH_OIDC_ISSUER_URL: 'https://idp.example.test/oidc',
  AUTH_OIDC_CLIENT_ID: 'kravhantering-app',
  AUTH_OIDC_CLIENT_SECRET: 'test-secret',
  AUTH_OIDC_REDIRECT_URI: 'http://localhost/api/auth/callback',
  AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost/',
  AUTH_SESSION_COOKIE_PASSWORD: COOKIE_PASSWORD,
}

function withEnv(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetAuthConfigForTests()
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetAuthConfigForTests()
  }
}

function buildRequest(url: string, cookie?: string): NextRequest {
  const headers = new Headers({
    accept: 'text/html',
    'x-user-id': 'attacker',
    'x-user-roles': 'Admin',
  })
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(url, { headers })
}

function futureEpochSeconds(): number {
  return Math.floor(Date.now() / 1000) + 60 * 60
}

async function writeSignedInCookie(): Promise<string> {
  const response = new Response()
  const session = await getSessionFromRequest(
    new Request('http://localhost/'),
    response,
  )
  session.sub = 'user-1'
  session.givenName = 'Alice'
  session.familyName = 'Reviewer'
  session.name = 'Alice Reviewer'
  session.hsaId = 'SE5560000001-rev1'
  session.roles = ['Reviewer']
  session.accessTokenExpiresAt = futureEpochSeconds()
  await session.save()
  return response.headers.get('set-cookie')?.split(';')[0] ?? ''
}

describe('proxy production CSP', () => {
  it('emits the strict production policy and request nonce override', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
        buildRequest('http://localhost/sv/requirements', cookie),
      )

      const csp = response.headers.get('content-security-policy') ?? ''
      const nonceMatch = csp.match(/script-src 'self' 'nonce-([^']+)'/)
      const requestNonce = response.headers.get('x-middleware-request-x-nonce')

      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).not.toContain("'unsafe-eval'")
      expect(csp).not.toContain('ws://localhost:*')
      expect(nonceMatch?.[1]).toBeTruthy()
      expect(requestNonce).toBe(nonceMatch?.[1])
      expect(response.headers.get('x-user-id')).toBeNull()
      expect(response.headers.get('x-user-roles')).toBeNull()
      expect(response.headers.get('x-middleware-request-x-user-id')).toBeNull()
      expect(
        response.headers.get('x-middleware-request-x-user-roles'),
      ).toBeNull()
    } finally {
      restore()
    }
  })

  it('redirects missing sessions without emitting a production nonce', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/sv/requirements'),
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('location') ?? '').toContain(
        '/api/auth/login',
      )
      expect(response.headers.get('content-security-policy')).toBeNull()
      expect(response.headers.get('x-middleware-request-x-nonce')).toBeNull()
    } finally {
      restore()
    }
  })

  it('redirects invalid sessions without reusing a spoofed nonce', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const response = await proxy(
        buildRequest(
          'http://localhost/sv/requirements',
          'kravhantering_session=this-is-not-a-real-session',
        ),
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('content-security-policy')).toBeNull()
      expect(response.headers.get('x-middleware-request-x-nonce')).toBeNull()
      expect(response.headers.get('x-user-id')).toBeNull()
      expect(response.headers.get('x-user-roles')).toBeNull()
    } finally {
      infoSpy.mockRestore()
      restore()
    }
  })

  it.each(['/api/health', '/api/ready'])(
    'passes public API route %s without page CSP headers',
    async path => {
      const restore = withEnv(AUTH_ON_ENV)
      try {
        const response = await proxy(buildRequest(`http://localhost${path}`))

        expect(response.status).toBe(200)
        expect(response.headers.get('content-security-policy')).toBeNull()
        expect(response.headers.get('x-middleware-request-x-nonce')).toBeNull()
        expect(response.headers.get('x-user-id')).toBeNull()
        expect(response.headers.get('x-user-roles')).toBeNull()
      } finally {
        restore()
      }
    },
  )
})
