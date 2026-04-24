import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

// next-intl's middleware module imports `next/server` via a path that the
// Vitest ESM resolver cannot follow. Replace it with a no-op pass-through —
// this test exercises proxy.ts's auth gating and header stripping, not
// locale rewriting. `@/i18n/routing` is also mocked because it pulls in
// next-intl's React navigation helpers that fail to resolve under Vitest.
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}))
vi.mock('@/i18n/routing', () => ({ routing: {} }))

const { config, default: proxy } = await import('@/proxy')
const { resetAuthConfigForTests } = await import('@/lib/auth/config')

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const AUTH_ON_ENV: Record<string, string> = {
  AUTH_ENABLED: 'true',
  AUTH_OIDC_ISSUER_URL: 'https://idp.example.test/oidc',
  AUTH_OIDC_CLIENT_ID: 'kravhantering-app',
  AUTH_OIDC_CLIENT_SECRET: 'test-secret',
  AUTH_OIDC_REDIRECT_URI: 'http://localhost/api/auth/callback',
  AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost/',
  AUTH_SESSION_COOKIE_PASSWORD: COOKIE_PASSWORD,
}

const AUTH_OFF_ENV: Record<string, string> = {
  AUTH_ENABLED: 'false',
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

function buildRequest(
  url: string,
  init: { method?: string; accept?: string; bearer?: string } = {},
): NextRequest {
  const headers = new Headers()
  if (init.accept) headers.set('accept', init.accept)
  if (init.bearer) headers.set('authorization', `Bearer ${init.bearer}`)
  // Headers that the legacy `lib/requirements/auth.ts` header-trust path would
  // honor when AUTH_ENABLED=false. Always inject so the stripping path is
  // exercised.
  headers.set('x-user-id', 'attacker')
  headers.set('x-user-roles', 'Admin')
  return new NextRequest(url, { method: init.method ?? 'GET', headers })
}

describe('proxy', () => {
  it('passes through when AUTH_ENABLED=false', async () => {
    const restore = withEnv(AUTH_OFF_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/sv/requirements'),
      )
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('redirects unauthenticated browser GET to /api/auth/login', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/sv/requirements', {
          accept: 'text/html',
        }),
      )
      expect(response.status).toBe(302)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/api/auth/login')
      expect(location).toContain(
        `returnTo=${encodeURIComponent('/sv/requirements')}`,
      )
    } finally {
      restore()
    }
  })

  it('prepends the default locale to returnTo for unprefixed paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/requirements', {
          accept: 'text/html',
        }),
      )
      expect(response.status).toBe(302)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain(
        `returnTo=${encodeURIComponent('/sv/requirements')}`,
      )
    } finally {
      restore()
    }
  })

  it('returns 401 JSON for non-HTML unauthenticated requests', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/api/owners', { method: 'POST' }),
      )
      expect(response.status).toBe(401)
      expect(response.headers.get('content-type') ?? '').toContain(
        'application/json',
      )
    } finally {
      restore()
    }
  })

  it('passes through public allow-list paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/api/auth/login'),
      )
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('passes through exact public health routes', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(buildRequest('http://localhost/api/health'))
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('requires auth for dotted api paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/api/files/report.json', {
          method: 'POST',
        }),
      )
      expect(response.status).toBe(401)
    } finally {
      restore()
    }
  })

  it('matches api paths explicitly so dotted routes stay behind auth', () => {
    expect(config.matcher).toContain('/api/:path*')
  })

  it('requires Authorization: Bearer for /api/mcp', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const without = await proxy(
        buildRequest('http://localhost/api/mcp', { method: 'POST' }),
      )
      expect(without.status).toBe(401)
      expect(without.headers.get('www-authenticate')).toBe('Bearer')

      const withBearer = await proxy(
        buildRequest('http://localhost/api/mcp', {
          method: 'POST',
          bearer: 'token-value',
        }),
      )
      expect(withBearer.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('strips inbound x-user-* headers when AUTH_ENABLED=true', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(buildRequest('http://localhost/api/auth/me'))
      const overrides = (
        response.headers.get('x-middleware-override-headers') ?? ''
      ).split(',')
      expect(overrides).not.toContain('x-user-id')
      expect(overrides).not.toContain('x-user-roles')
      expect(response.headers.get('x-middleware-request-x-user-id')).toBeNull()
      expect(
        response.headers.get('x-middleware-request-x-user-roles'),
      ).toBeNull()
    } finally {
      restore()
    }
  })
})
