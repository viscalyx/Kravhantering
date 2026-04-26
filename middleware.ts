import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import { recordSecurityEvent } from '@/lib/auth/audit'
import {
  getSessionFromRequestWithDiagnostics,
  isSignedIn,
} from '@/lib/auth/session'
import { USE_DEV_CSP, USE_INSECURE_COOKIE } from '@/lib/runtime/build-target'

const intlMiddleware = createMiddleware(routing)

// Locales are duplicated from `@/i18n/routing` so the locale-aware redirect
// below can run in the Edge runtime without pulling next-intl's React-flavoured
// navigation helpers (which fail to resolve under the Vitest Node runtime).
// Keep the two lists in sync.
const LOCALES = ['sv', 'en'] as const
const DEFAULT_LOCALE: (typeof LOCALES)[number] = 'sv'

// Inbound headers that an attacker could try to use to impersonate a user.
// Always stripped before requests reach app handlers.
const STRIPPED_REQUEST_HEADERS = ['x-user-id', 'x-user-roles']

function stripUserHeaders(headers: Headers): Headers {
  for (const name of STRIPPED_REQUEST_HEADERS) {
    headers.delete(name)
  }
  return headers
}

// ZAP rule 10044 (Big Redirect Detected) flags 3xx responses with bodies
// larger than 1024 bytes. next-intl's middleware injects an HTML
// "redirecting…" stub for legacy clients that ignore the Location header.
// This app targets modern browsers, which always honor 3xx Location, so
// the body is unnecessary. Strip it while preserving every original
// header (Set-Cookie, Vary, x-middleware-*, etc.). Issue #110.
function stripRedirectBody(response: NextResponse): NextResponse {
  if (response.status < 300 || response.status >= 400) return response
  if (response.headers.get('location') === null) return response
  const stripped = new NextResponse(null, { status: response.status })
  // Copy every header from the original next-intl response so Set-Cookie,
  // Vary, x-middleware-* etc. survive the body strip. Skip Content-Type
  // (and Content-Length) because they describe the discarded body;
  // ensureRedirectContentType will set the canonical Content-Type.
  stripped.headers.delete('content-type')
  stripped.headers.delete('content-length')
  for (const [key, value] of response.headers) {
    const lower = key.toLowerCase()
    if (lower === 'content-type' || lower === 'content-length') continue
    // Set-Cookie may legitimately appear multiple times. The Headers
    // iterator yields each Set-Cookie value as a separate entry, so use
    // append to preserve every cookie instead of overwriting.
    if (lower === 'set-cookie') {
      stripped.headers.append(key, value)
      continue
    }
    stripped.headers.set(key, value)
  }
  return stripped
}

// ZAP rule 10019 (Content-Type Header Missing) flags 3xx responses that
// omit Content-Type. RFC 7231 allows empty redirect bodies, but strict
// scanners do not differentiate. Set a benign Content-Type on 3xx
// responses unless something else has already set one. Issue #111.
function ensureRedirectContentType(response: NextResponse): NextResponse {
  if (response.status < 300 || response.status >= 400) return response
  if (response.headers.get('content-type') !== null) return response
  response.headers.set('content-type', 'text/plain; charset=utf-8')
  return response
}

// ZAP rule 10010 (Cookie No HttpOnly Flag) flags the NEXT_LOCALE cookie
// emitted by next-intl, which omits HttpOnly by default and exposes no
// option to add it (`localeCookie` accepts only a Pick<> that excludes
// httpOnly). Re-set the cookie with HttpOnly so client JS cannot read it.
// The cookie is only consumed by next-intl's server-side locale detection.
// Issue #113.
function hardenLocaleCookie(response: NextResponse): NextResponse {
  const existing = response.cookies.get('NEXT_LOCALE')
  if (!existing) return response
  response.cookies.set({
    name: 'NEXT_LOCALE',
    value: existing.value,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !USE_INSECURE_COOKIE,
  })
  return response
}

function ensureLocalePath(pathname: string): string {
  if (pathname.startsWith('/api/')) return pathname
  const first = pathname.split('/')[1]
  if (first && (LOCALES as readonly string[]).includes(first)) {
    return pathname
  }
  if (pathname === '/') return `/${DEFAULT_LOCALE}`
  return `/${DEFAULT_LOCALE}${pathname}`
}

// Production CSP with per-request nonce for inline scripts.
//
// CSP is set here instead of next.config.ts headers() because the nonce must
// vary per request. Static headers would require 'unsafe-inline' which
// permits any injected script and disables CSP protection.
// See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
//
// style-src-attr requires 'unsafe-inline' due to Framer Motion runtime
// inline style attributes. style-src-elem is locked to 'self'.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src-elem 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ')
}

function buildDevCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' ws://localhost:* ws://0.0.0.0:* ws://127.0.0.1:* wss://localhost:* wss://0.0.0.0:* wss://127.0.0.1:*",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ')
}

function applyRequestHeaderOverrides(response: NextResponse, headers: Headers) {
  const overrideResponse = NextResponse.next({
    request: {
      headers,
    },
  })

  for (const [key, value] of overrideResponse.headers) {
    if (
      key === 'x-middleware-override-headers' ||
      key.startsWith('x-middleware-request-')
    ) {
      response.headers.set(key, value)
    }
  }
}

const ALLOWED_UNAUTH_API_PREFIXES = ['/api/auth/']
const ALLOWED_UNAUTH_NON_API_PREFIXES = ['/_next/', '/favicon']
const ALLOWED_UNAUTH_EXACT = new Set([
  '/api/health',
  '/api/ready',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
])

function isAllowedWithoutAuth(pathname: string): boolean {
  if (ALLOWED_UNAUTH_EXACT.has(pathname)) return true
  if (pathname.startsWith('/api/')) {
    return ALLOWED_UNAUTH_API_PREFIXES.some(prefix =>
      pathname.startsWith(prefix),
    )
  }
  return ALLOWED_UNAUTH_NON_API_PREFIXES.some(prefix =>
    pathname.startsWith(prefix),
  )
}

function wantsJsonResponse(request: NextRequest): boolean {
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('application/json')) return true
  return request.method !== 'GET' && request.method !== 'HEAD'
}

function isMcpPath(pathname: string): boolean {
  return pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

// Locale roots (`/sv`, `/en`) only exist to redirect to `/<locale>/requirements`.
// The original implementation lived in `app/[locale]/page.tsx` as a Server
// Component `redirect('/requirements')`, but Server-Component redirects emit a
// ~83 KB `__next_error__` HTML scaffold AFTER middleware runs, which trips ZAP
// rule 10044 (Big Redirect, body > 1024 bytes) on /sv and /en. Doing the
// redirect here keeps it inside the middleware response pipeline, so
// `stripRedirectBody` and `ensureRedirectContentType` can sanitize it. Issue
// #110.
function isLocaleRootPath(pathname: string): boolean {
  const trimmed =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname
  if (!trimmed.startsWith('/')) return false
  const segment = trimmed.slice(1)
  return (LOCALES as readonly string[]).includes(segment)
}

function redirectLocaleRootToRequirements(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  const locale = pathname.replace(/\/+$/, '').slice(1)
  const target = new URL(`/${locale}/requirements${search ?? ''}`, request.url)
  return ensureRedirectContentType(
    stripRedirectBody(NextResponse.redirect(target, { status: 307 })),
  )
}

async function enforceAuth(request: NextRequest): Promise<NextResponse | null> {
  const { pathname, search } = request.nextUrl

  if (isAllowedWithoutAuth(pathname)) return null

  // /api/mcp/* is a non-browser endpoint; require a bearer token. Token
  // validity is checked inside the MCP route handler (Phase 5a).
  if (isMcpPath(pathname)) {
    const auth = request.headers.get('authorization') ?? ''
    if (!/^Bearer\s+\S+/i.test(auth)) {
      return NextResponse.json(
        { error: 'Unauthorized', detail: 'Missing Bearer token.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
      )
    }
    return null
  }

  // Cookie-based session check for everything else.
  const probe = new Response()
  const { session, rejected, reason } =
    await getSessionFromRequestWithDiagnostics(request, probe)
  if (isSignedIn(session)) return null

  if (rejected) {
    recordSecurityEvent({
      event: 'auth.session.rejected',
      outcome: 'failure',
      actor: { source: 'anonymous' },
      request,
      detail: { reason: reason ?? 'invalid_session_cookie' },
    })
  }

  if (isApiPath(pathname) || wantsJsonResponse(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'Sign in required.' },
      { status: 401 },
    )
  }

  const loginUrl = new URL('/api/auth/login', request.url)
  loginUrl.searchParams.set(
    'returnTo',
    `${ensureLocalePath(pathname)}${search ?? ''}`,
  )
  return ensureRedirectContentType(
    stripRedirectBody(NextResponse.redirect(loginUrl, { status: 302 })),
  )
}

function applyPageHeaders(request: NextRequest): NextResponse {
  // The unlocalized root page (`app/page.tsx`) renders a client-side
  // <RootLocaleRedirect> that picks the locale from localStorage. Skip
  // next-intl's middleware here so it does not 307 `/` to `/<defaultLocale>`
  // before the root page can run.
  const response =
    request.nextUrl.pathname === '/'
      ? NextResponse.next()
      : intlMiddleware(request)

  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/=+$/, '')
  const csp = USE_DEV_CSP ? buildDevCsp(nonce) : buildCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  stripUserHeaders(requestHeaders)

  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  applyRequestHeaderOverrides(response, requestHeaders)
  response.headers.set('Content-Security-Policy', csp)

  return ensureRedirectContentType(
    stripRedirectBody(hardenLocaleCookie(response)),
  )
}

export default async function middleware(request: NextRequest) {
  const authResponse = await enforceAuth(request)
  if (authResponse) return authResponse

  if (isLocaleRootPath(request.nextUrl.pathname)) {
    return redirectLocaleRootToRequirements(request)
  }

  if (isApiPath(request.nextUrl.pathname)) {
    const cleaned = stripUserHeaders(new Headers(request.headers))
    return NextResponse.next({ request: { headers: cleaned } })
  }

  return applyPageHeaders(request)
}

export const config = {
  matcher: ['/api/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
}
