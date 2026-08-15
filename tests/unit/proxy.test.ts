import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from 'next/experimental/testing/server'
import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import {
  REVIEWED_PROXY_BYPASS_EXACT_PATHS,
  REVIEWED_PROXY_BYPASS_PREFIXES,
} from '@/lib/auth/proxy-public-paths'

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

const { config, default: proxy } = await import('@/proxy')
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

const REVIEWED_PROXY_BYPASS_PATHS = [
  ...REVIEWED_PROXY_BYPASS_EXACT_PATHS,
  ...REVIEWED_PROXY_BYPASS_PREFIXES.map(prefix => `${prefix}chunks/app.js`),
] as const

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

describe('proxy', () => {
  it('passes the API docs trailing-slash root through to its route handler', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/api-docs/hsa-person-lookup/'),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('location')).toBeNull()
    } finally {
      restore()
    }
  })

  it.each([
    {
      routeClass: 'localized page',
      source: '/sv/requirements/?view=active',
      target: '/sv/requirements?view=active',
    },
    {
      routeClass: 'auth endpoint',
      source: '/api/auth/me/?probe=anonymous',
      target: '/api/auth/me?probe=anonymous',
    },
    {
      routeClass: 'public static resource',
      source: '/logo-small.png/?variant=small',
      target: '/logo-small.png?variant=small',
    },
    {
      routeClass: 'Next.js framework resource',
      source: '/_next/static/chunks/app.js/?build=current',
      target: '/_next/static/chunks/app.js?build=current',
    },
  ])(
    'preserves canonical trailing-slash redirects for $routeClass routes',
    async ({ source, target }) => {
      const restore = withEnv(AUTH_ON_ENV)
      try {
        const response = await proxy(buildRequest(`http://localhost${source}`))

        expect(response.status).toBe(308)
        expect(response.headers.get('location')).toBe(
          `http://localhost${target}`,
        )
        expect(response.headers.get('refresh')).toBe(`0;url=${target}`)
      } finally {
        restore()
      }
    },
  )

  it('redirects unauthenticated browser GET to /api/auth/login', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/sv/requirements', {
          accept: 'text/html',
        }),
      )
      expect(response.status).toBe(302)
      expect(response.headers.get('Cache-Control')).toBeNull()
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

  it.each(['/sv/requirements/policy.v2', '/unknown/path/file.json'])(
    'keeps signed-out dotted page path %s behind login',
    async path => {
      const restore = withEnv(AUTH_ON_ENV)
      try {
        const response = await proxy(
          buildRequest(`http://localhost${path}`, {
            accept: 'text/html',
          }),
        )

        expect(response.status).toBe(302)
        expect(response.headers.get('location') ?? '').toContain(
          '/api/auth/login',
        )
      } finally {
        restore()
      }
    },
  )

  it('allows the auth error page without a signed-in session', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    intlMiddlewareMock.mockClear()
    try {
      const response = await proxy(
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
      const response = await proxy(
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
      const response = await proxy(
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
      const response = await proxy(
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
      const response = await proxy(
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

  it.each([
    ['/krav', '/requirements'],
    ['/krav/IDN0001', '/requirements/IDN0001'],
    ['/krav/IDN0001/10', '/requirements/IDN0001/10'],
    ['/sv/krav', '/sv/requirements'],
    ['/sv/krav/IDN0001', '/sv/requirements/IDN0001'],
    ['/en/krav', '/en/requirements'],
    ['/en/krav/IDN0001', '/en/requirements/IDN0001'],
    ['/sv/krav/IDN0001/10', '/sv/requirements/IDN0001/10'],
  ])(
    'redirects Swedish requirement route %s to the requirements page path',
    async (source, target) => {
      const restore = withEnv(AUTH_ON_ENV)
      try {
        const response = await proxy(
          buildRequest(`http://localhost${source}?from=swedish-route`, {
            accept: 'text/html',
          }),
        )

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe(
          `http://localhost${target}?from=swedish-route`,
        )
        expect(response.headers.get('content-type')).toBe(
          'text/plain; charset=utf-8',
        )
      } finally {
        restore()
      }
    },
  )

  it('returns 401 JSON for non-HTML unauthenticated requests', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
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

  it('returns 401 before normalizing unauthenticated trailing-slash REST mutations', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest('http://localhost/api/requirement-areas/', {
          method: 'POST',
        }),
      )

      expect(response.status).toBe(401)
      expect(response.headers.get('location')).toBeNull()
      await expect(response.json()).resolves.toMatchObject({
        error: 'Unauthorized',
        detail: 'Sign in required.',
      })
    } finally {
      restore()
    }
  })

  it('returns 401 JSON for expired API sessions', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie(1)
      const response = await proxy(
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

  it('returns 405 JSON for unsupported API methods that reach proxy', async () => {
    const response = await proxy(
      buildRequest('http://localhost/api/auth/me', { method: 'PROPFIND' }),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('GET')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      error: 'Method Not Allowed',
      detail: 'HTTP method PROPFIND is not allowed for API routes.',
    })
  })

  it('emits auth.session.rejected for invalid session cookies', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const response = await proxy(
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
      const response = await proxy(
        buildRequest('http://localhost/api/auth/login'),
      )
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })

  it.each(['/api/health', '/api/ready'])(
    'passes through exact public probe route %s',
    async path => {
      const restore = withEnv(AUTH_ON_ENV)
      try {
        const response = await proxy(buildRequest(`http://localhost${path}`))
        expect(response.status).toBe(200)
      } finally {
        restore()
      }
    },
  )

  it('derives public HEAD and session OPTIONS policies from registered paths', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const publicHead = await proxy(
        buildRequest('http://localhost/api/health', { method: 'HEAD' }),
      )
      expect(publicHead.status).toBe(200)
      expect(publicHead.headers.get('Cache-Control')).toBe('no-store')

      const cookie = await writeSignedInCookie()
      const sessionOptions = await proxy(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie,
          method: 'OPTIONS',
        }),
      )
      expect(sessionOptions.status).toBe(200)
      expect(sessionOptions.headers.get('x-middleware-next')).toBe('1')
    } finally {
      restore()
    }
  })

  it('keeps logout public while requiring same-origin CSRF for POST', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const rejected = await proxy(
        buildRequest('http://localhost/api/auth/logout', { method: 'POST' }),
      )
      expect(rejected.status).toBe(403)
      expect(rejected.headers.get('Cache-Control')).toBe('no-store')

      const accepted = await proxy(
        buildRequest('http://localhost/api/auth/logout', {
          method: 'POST',
          origin: 'http://localhost',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )
      expect(accepted.status).toBe(200)
      expect(accepted.headers.get('x-middleware-next')).toBe('1')
      expect(accepted.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      restore()
    }
  })

  it('applies the conservative policy to unknown REST operations', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const unknownAuthPath = await proxy(
        buildRequest('http://localhost/api/auth/does-not-exist'),
      )
      expect(unknownAuthPath.status).toBe(401)
      expect(unknownAuthPath.headers.get('Cache-Control')).toBe('no-store')

      const cookie = await writeSignedInCookie()
      const csrfRejected = await proxy(
        buildRequest('http://localhost/api/does-not-exist', {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
        }),
      )
      expect(csrfRejected.status).toBe(403)
      expect(csrfRejected.headers.get('Cache-Control')).toBe('no-store')

      const passThrough = await proxy(
        buildRequest('http://localhost/api/does-not-exist', { cookie }),
      )
      expect(passThrough.status).toBe(200)
      expect(passThrough.headers.get('x-middleware-next')).toBe('1')
      expect(passThrough.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      restore()
    }
  })

  it.each(REVIEWED_PROXY_BYPASS_PATHS)(
    'passes through reviewed public path %s without auth',
    async path => {
      const restore = withEnv(AUTH_ON_ENV)
      try {
        const response = await proxy(buildRequest(`http://localhost${path}`))
        expect(response.status).toBe(200)
        expect(response.headers.get('x-middleware-next')).toBe('1')
        expect(response.headers.get('location')).toBeNull()
      } finally {
        restore()
      }
    },
  )

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

  describe('matcher boundary', () => {
    it.each([
      '/api/files/report.json',
      '/api/health',
      '/sv/requirements/policy.v2',
      '/unknown/path/file.json',
      '/_next/data/build-id/page.json',
      '/_next/images',
      '/_next/static/chunks/app.js/',
      '/_next/static-files/chunks/app.js',
      '/api-docs/hsa-person-lookup/',
      '/api-docs/hsa-person-lookup/extra.js',
      '/api-docs/hsa-person-lookup/swagger-ui-standalone-preset.js',
      '/api-docs/hsa-person-lookup/swagger-ui.css.map',
      '/build.json/preview',
      '/favicon.ico/preview',
      '/logo-small.png.backup',
      '/robots.txt/preview',
      '/sitemap.xml.bak',
    ])('runs proxy for protected or near-miss path %s', path => {
      expect(
        unstable_doesProxyMatch({
          config,
          url: `http://localhost${path}`,
        }),
      ).toBe(true)
    })

    it.each(REVIEWED_PROXY_BYPASS_PATHS)(
      'skips proxy for reviewed public path %s',
      path => {
        expect(
          unstable_doesProxyMatch({
            config,
            url: `http://localhost${path}`,
          }),
        ).toBe(false)
      },
    )
  })

  it('leaves MCP enablement and bearer validation to the route boundary', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const without = await proxy(
        buildRequest('http://localhost/api/mcp', { method: 'POST' }),
      )
      expect(without.status).toBe(200)
      expect(without.headers.get('www-authenticate')).toBeNull()
      const overrides = (
        without.headers.get('x-middleware-override-headers') ?? ''
      ).split(',')
      expect(overrides).not.toContain('x-user-id')
      expect(overrides).not.toContain('x-user-roles')
      expect(without.headers.get('x-middleware-request-x-user-id')).toBeNull()
      expect(
        without.headers.get('x-middleware-request-x-user-roles'),
      ).toBeNull()

      const withBearer = await proxy(
        buildRequest('http://localhost/api/mcp', {
          method: 'POST',
          bearer: 'token-value',
        }),
      )
      expect(withBearer.status).toBe(200)
      expect(withBearer.headers.get('Cache-Control')).toBeNull()
    } finally {
      restore()
    }
  })

  it('rejects signed-in REST mutations without X-Requested-With', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
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

  it.each([
    '/api/privacy/data-subject-export',
    '/api/privacy/erasure-preview',
    '/api/privacy/erasure-requests',
  ])('prevents caching unauthenticated responses from %s', async path => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const response = await proxy(
        buildRequest(`http://localhost${path}`, { method: 'POST' }),
      )

      expect(response.status).toBe(401)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      restore()
    }
  })

  it.each([
    '/api/privacy/data-subject-export',
    '/api/privacy/erasure-preview',
    '/api/privacy/erasure-requests',
  ])('prevents caching CSRF rejections from %s', async path => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
        buildRequest(`http://localhost${path}`, {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
        }),
      )

      expect(response.status).toBe(403)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      restore()
    }
  })

  it('returns 403 before normalizing trailing-slash REST mutations that fail CSRF', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
        buildRequest('http://localhost/api/requirement-areas/', {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
        }),
      )

      expect(response.status).toBe(403)
      expect(response.headers.get('location')).toBeNull()
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
      const response = await proxy(
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
      const response = await proxy(
        buildRequest('http://localhost/api/requirement-areas', {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBeNull()
      const overrides = (
        response.headers.get('x-middleware-override-headers') ?? ''
      ).split(',')
      expect(overrides).not.toContain('x-user-id')
      expect(overrides).not.toContain('x-user-roles')
    } finally {
      restore()
    }
  })

  it.each([
    '/api/privacy/data-subject-export',
    '/api/privacy/erasure-preview',
    '/api/privacy/erasure-requests',
  ])('prevents caching privacy mutation pass-through from %s', async path => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
        buildRequest(`http://localhost${path}`, {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      restore()
    }
  })

  it('normalizes trailing-slash REST mutations after auth and CSRF succeed', async () => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
        buildRequest('http://localhost/api/requirement-areas/?view=active', {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )

      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe(
        'http://localhost/api/requirement-areas?view=active',
      )
      expect(response.headers.get('refresh')).toBe(
        '0;url=/api/requirement-areas?view=active',
      )
    } finally {
      restore()
    }
  })

  it.each([
    '/api/privacy/data-subject-export/',
    '/api/privacy/erasure-preview/',
    '/api/privacy/erasure-requests/',
  ])('prevents caching privacy mutation redirects from %s', async path => {
    const restore = withEnv(AUTH_ON_ENV)
    try {
      const cookie = await writeSignedInCookie()
      const response = await proxy(
        buildRequest(`http://localhost${path}`, {
          cookie,
          method: 'POST',
          origin: 'http://localhost',
          xRequestedWith: 'XMLHttpRequest',
        }),
      )

      expect(response.status).toBe(308)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      restore()
    }
  })

  it('strips inbound x-user-* headers', async () => {
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
