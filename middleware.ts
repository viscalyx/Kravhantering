// NOTE: This file is intentionally named middleware.ts instead of proxy.ts
// OpenNext for Cloudflare does not yet support the new Next.js 16 "proxy" convention.
// The proxy.ts file runs on Node.js runtime, but Cloudflare Workers only supports
// edge middleware. Keep this as middleware.ts until OpenNext adds proxy support.
// See: https://github.com/opennextjs/opennextjs-cloudflare/issues/1093

import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

const intlMiddleware = createMiddleware(routing)

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

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request)

  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/=+$/, '')
  const csp =
    process.env.NODE_ENV === 'production' ? buildCsp(nonce) : buildDevCsp(nonce)
  const requestHeaders = new Headers(request.headers)

  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  applyRequestHeaderOverrides(response, requestHeaders)
  response.headers.set('Content-Security-Policy', csp)

  return response
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
