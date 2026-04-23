import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getAuthConfig } from '@/lib/auth/config'
import {
  getSessionFromRequestWithDiagnostics,
  isSignedIn,
} from '@/lib/auth/session'

const intlMiddleware = createMiddleware(routing)

// Locales are duplicated from `@/i18n/routing` so the locale-aware redirect
// below can run in the Edge runtime without pulling next-intl's React-flavoured
// navigation helpers (which fail to resolve under the Vitest Node runtime).
// Keep the two lists in sync.
const LOCALES = ['sv', 'en'] as const
const DEFAULT_LOCALE: (typeof LOCALES)[number] = 'sv'

// Inbound headers that the legacy `lib/requirements/auth.ts` header-trust path
// honors when `AUTH_ENABLED=false`. Once auth is enabled they MUST be stripped
// so an attacker-supplied header cannot impersonate a user (plan-auth caveat #8).
const STRIPPED_REQUEST_HEADERS = ['x-user-id', 'x-user-roles']

function stripUserHeaders(headers: Headers): Headers {
  for (const name of STRIPPED_REQUEST_HEADERS) {
    headers.delete(name)
  }
  return headers
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

async function enforceAuth(request: NextRequest): Promise<NextResponse | null> {
  const cfg = getAuthConfig()
  if (!cfg.enabled) return null

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
  return NextResponse.redirect(loginUrl, { status: 302 })
}

function applyPageHeaders(
  request: NextRequest,
  authEnabled: boolean,
): NextResponse {
  const response = intlMiddleware(request)

  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/=+$/, '')
  const csp =
    process.env.NODE_ENV === 'production' ? buildCsp(nonce) : buildDevCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  if (authEnabled) stripUserHeaders(requestHeaders)

  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  applyRequestHeaderOverrides(response, requestHeaders)
  response.headers.set('Content-Security-Policy', csp)

  return response
}

export default async function proxy(request: NextRequest) {
  const authResponse = await enforceAuth(request)
  if (authResponse) return authResponse

  const authEnabled = getAuthConfig().enabled

  if (isApiPath(request.nextUrl.pathname)) {
    if (!authEnabled) return NextResponse.next()
    const cleaned = stripUserHeaders(new Headers(request.headers))
    return NextResponse.next({ request: { headers: cleaned } })
  }

  return applyPageHeaders(request, authEnabled)
}

export const config = {
  matcher: ['/api/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
}
