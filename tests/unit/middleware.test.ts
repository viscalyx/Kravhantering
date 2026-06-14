import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

// cSpell:ignore PROPFIND

// next-intl's middleware module imports `next/server` via a path that the
// Vitest ESM resolver cannot follow. Replace it with a pass-through that
// the individual tests can override per-call via `intlMiddlewareMock`.
// `@/i18n/routing` is also mocked because it pulls in next-intl's React
// navigation helpers that fail to resolve under Vitest.
const { intlMiddlewareMock } = vi.hoisted(() => ({
  intlMiddlewareMock: vi.fn(() => NextResponse.next()),
}))
vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddlewareMock,
}))
vi.mock('@/i18n/routing', () => ({ routing: {} }))

// Source file is `middleware.ts` (not `proxy.ts`) because Next.js 16.2.4
// emits a chunk for `proxy.ts` but never registers it in
// `middleware-manifest.json`, so the matcher never runs at runtime. The
// exported function is still semantically a Next 16 "proxy" — only the
// filename is the legacy name. See docs/security-ci.md.
const { config, default: middleware } = await import('@/middleware')
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

function buildRequest(
  url: string,
  init: {
    accept?: string
    bearer?: string
    cookie?: string
    method?: string
    origin?: string
    referer?: string
    xRequestedWith?: string
  } = {},
): NextRequest {
  const headers = new Headers()
  if (init.accept) headers.set('accept', init.accept)
  if (init.bearer) headers.set('authorization', `Bearer ${init.bearer}`)
  if (init.cookie) headers.set('cookie', init.cookie)
  if (init.origin) headers.set('origin', init.origin)
  if (init.referer) headers.set('referer', init.referer)
  if (init.xRequestedWith) {
    headers.set('x-requested-with', init.xRequestedWith)
  }
  // Headers an attacker could try to inject. Always present so the stripping
  // path is exercised on every request.
  headers.set('x-user-id', 'attacker')
  headers.set('x-user-roles', 'Admin')
  return new NextRequest(url, { method: init.method ?? 'GET', headers })
}

function futureEpochSeconds(): number {
  return Math.floor(Date.now() / 1000) + 60 * 60
}

async function writeSignedInCookie(
  accessTokenExpiresAt = futureEpochSeconds(),
): Promise<string> {
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
  session.accessTokenExpiresAt = accessTokenExpiresAt
  await session.save()
  return response.headers.get('set-cookie')?.split(';')[0] ?? ''
}

function parseSecurityEvents(
  infoSpy: ReturnType<typeof vi.spyOn>,
): Array<Record<string, unknown>> {
  return infoSpy.mock.calls
    .map((call: unknown[]) => {
      try {
        return JSON.parse(String(call[0])) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .filter(
      (
        event: Record<string, unknown> | null,
      ): event is Record<string, unknown> =>
        event !== null && event.channel === 'security-audit',
    )
}

describe('middleware', () => {
  it('redirects unauthenticated browser GET to /api/auth/login', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest('http://localhost/sv/requirements', {
          accept: 'text/html',
        }),
      )
      expect(response.status).toBe(302)
      expect(response.headers.get('X-Request-Id')).toBeTruthy()
      expect(response.headers.get('X-Correlation-Id')).toBeTruthy()
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/api/auth/login')
      expect(location).toContain(
        `returnTo=${encodeURIComponent('/sv/requirements')}`,
      )
      // ZAP rule 10019: 3xx responses must carry a Content-Type. Issue #111.
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8',
      )
    } finally {
      restore()
    }
  })

  it('allows the auth error page without a signed-in session', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    intlMiddlewareMock.mockClear()
    try {
      const response = await middleware(
        buildRequest(
          'http://localhost/auth/error?code=login_state_cookie_missing',
          {
            accept: 'text/html',
          },
        ),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('X-Request-Id')).toBeTruthy()
      expect(response.headers.get('X-Correlation-Id')).toBeTruthy()
      expect(intlMiddlewareMock).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('redirects expired browser sessions to /api/auth/login and audits expiry', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const cookie = await writeSignedInCookie(1)
      const response = await middleware(
        buildRequest('http://localhost/sv/requirements', {
          accept: 'text/html',
          cookie,
        }),
      )
      expect(response.status).toBe(302)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/api/auth/login')
      expect(location).toContain(
        `returnTo=${encodeURIComponent('/sv/requirements')}`,
      )
      const events = parseSecurityEvents(infoSpy)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        actor: {
          hsaId: 'SE5560000001-rev1',
          source: 'oidc',
          sub: 'user-1',
        },
        detail: { expiredAt: 1 },
        event: 'auth.session.expired',
        outcome: 'failure',
      })
    } finally {
      infoSpy.mockRestore()
      restore()
    }
  })

  it('strips body and sets Content-Type on next-intl 307 locale redirects', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    intlMiddlewareMock.mockImplementationOnce(
      () =>
        new NextResponse('<html><body>Redirecting to /sv…</body></html>', {
          status: 307,
          headers: {
            Location: 'http://localhost/sv/static/foo.js',
            'Set-Cookie': 'NEXT_LOCALE=sv; Path=/',
          },
        }) as unknown as ReturnType<typeof NextResponse.next>,
    )
    try {
      const response = await middleware(
        buildRequest('http://localhost/_next/static/foo.js'),
      )
      expect(response.status).toBe(307)
      expect(await response.text()).toBe('')
      expect(response.headers.get('location')).toBe(
        'http://localhost/sv/static/foo.js',
      )
      const setCookie = response.headers.get('set-cookie') ?? ''
      expect(setCookie).toContain('NEXT_LOCALE=sv')
      // Issue #113 / ZAP rule 10010: NEXT_LOCALE must carry HttpOnly so
      // client JS cannot read it. next-intl's default omits the flag.
      expect(setCookie).toMatch(/HttpOnly/i)
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8',
      )
    } finally {
      restore()
    }
  })

  it('preserves arbitrary next-intl response headers on locale redirect', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    intlMiddlewareMock.mockImplementationOnce(
      () =>
        new NextResponse('<html>stub</html>', {
          status: 307,
          headers: {
            Location: 'http://localhost/sv/page',
            Vary: 'Accept-Language',
            'X-Custom': 'preserved',
          },
        }) as unknown as ReturnType<typeof NextResponse.next>,
    )
    try {
      const response = await middleware(
        buildRequest('http://localhost/_next/static/page'),
      )
      expect(response.status).toBe(307)
      expect(await response.text()).toBe('')
      expect(response.headers.get('vary')).toBe('Accept-Language')
      expect(response.headers.get('x-custom')).toBe('preserved')
    } finally {
      restore()
    }
  })

  it('does not overwrite Content-Type on 200 page responses', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    intlMiddlewareMock.mockImplementationOnce(() => {
      const r = NextResponse.next()
      r.headers.set('content-type', 'text/html; charset=utf-8')
      return r
    })
    try {
      const response = await middleware(
        buildRequest('http://localhost/_next/static/foo.js'),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'text/html; charset=utf-8',
      )
    } finally {
      restore()
    }
  })

  it('prepends the default locale to returnTo for unprefixed paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
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

  it.each([
    ['/krav/IDN0001', '/requirements/IDN0001'],
    ['/krav/IDN0001/10', '/requirements/IDN0001/10'],
    ['/sv/krav/IDN0001', '/sv/requirements/IDN0001'],
    ['/en/krav/IDN0001', '/en/requirements/IDN0001'],
    ['/sv/krav/IDN0001/10', '/sv/requirements/IDN0001/10'],
  ])('redirects Swedish requirement alias %s to existing requirements path', async (source, target) => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest(`http://localhost${source}?from=alias`, {
          accept: 'text/html',
        }),
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        `http://localhost${target}?from=alias`,
      )
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8',
      )
    } finally {
      restore()
    }
  })

  it('returns 401 JSON for non-HTML unauthenticated requests', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest('http://localhost/api/requirement-areas', {
          method: 'POST',
        }),
      )
      expect(response.status).toBe(401)
      expect(response.headers.get('content-type') ?? '').toContain(
        'application/json',
      )
    } finally {
      restore()
    }
  })

  it('returns 401 JSON for expired API sessions', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie(1)
      const response = await middleware(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie,
          method: 'POST',
        }),
      )
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Unauthorized',
        detail: 'Sign in required.',
      })
    } finally {
      restore()
    }
  })

  it('returns 405 JSON for unsupported API methods that reach middleware', async () => {
    const response = await middleware(
      buildRequest('http://localhost/api/auth/me', { method: 'PROPFIND' }),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('GET')
    await expect(response.json()).resolves.toMatchObject({
      error: 'Method Not Allowed',
      detail: 'HTTP method PROPFIND is not allowed for API routes.',
    })
  })

  it('emits auth.session.rejected for invalid session cookies', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const response = await middleware(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie: 'kravhantering_session=this-is-not-a-real-session',
        }),
      )
      expect(response.status).toBe(401)
      const events = parseSecurityEvents(infoSpy)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        event: 'auth.session.rejected',
        outcome: 'failure',
        detail: { reason: 'invalid_session_cookie' },
      })
    } finally {
      infoSpy.mockRestore()
      restore()
    }
  })

  it('passes through public allow-list paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest('http://localhost/api/auth/login'),
      )
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it.each([
    '/api/health',
    '/api/ready',
  ])('passes through exact public probe route %s', async path => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(buildRequest(`http://localhost${path}`))
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('passes through /sitemap.xml without auth', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest('http://localhost/sitemap.xml'),
      )
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('passes through /robots.txt without auth', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest('http://localhost/robots.txt'),
      )
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it('requires auth for dotted api paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
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
      const without = await middleware(
        buildRequest('http://localhost/api/mcp', { method: 'POST' }),
      )
      expect(without.status).toBe(401)
      expect(without.headers.get('www-authenticate')).toBe('Bearer')
      await expect(without.json()).resolves.toEqual({
        error: { code: -32000, message: 'Missing Bearer token.' },
        id: null,
        jsonrpc: '2.0',
      })

      const withBearer = await middleware(
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

  it('rejects signed-in REST mutations without X-Requested-With', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await middleware(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
        }),
      )
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: 'Forbidden',
        detail: 'Missing X-Requested-With header.',
      })
    } finally {
      restore()
    }
  })

  it('rejects signed-in cross-origin REST mutations', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await middleware(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie,
          method: 'POST',
          origin: 'https://evil.example',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: 'Forbidden',
        detail: 'Cross-origin request rejected.',
      })
    } finally {
      restore()
    }
  })

  it('passes signed-in same-origin REST mutations through', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await middleware(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )
      expect(response.status).toBe(200)
      const overrides = (
        response.headers.get('x-middleware-override-headers') ?? ''
      ).split(',')
      expect(overrides).not.toContain('x-user-id')
      expect(overrides).not.toContain('x-user-roles')
    } finally {
      restore()
    }
  })

  it('strips inbound x-user-* headers', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await middleware(
        buildRequest('http://localhost/api/auth/me'),
      )
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
