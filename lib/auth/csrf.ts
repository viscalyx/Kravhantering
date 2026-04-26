/**
 * Same-origin enforcement for cookie-authenticated mutating requests.
 *
 * Browsers attach the session cookie automatically, so any cross-site form
 * post or `fetch()` could ride a logged-in session unless we reject it. We
 * apply two cheap, browser-enforced checks:
 *
 * 1. `Origin` (or `Referer` as a fallback) must match the current request's
 *    origin. Browsers always set `Origin` on non-`GET`/`HEAD` requests in
 *    modern UAs, so missing-and-not-a-safe-method is also rejected.
 * 2. `X-Requested-With: XMLHttpRequest` must be present. This forces the
 *    caller to make a CORS-preflighted request, which a plain HTML form
 *    cannot do.
 *
 * Idempotent reads (`GET`, `HEAD`, `OPTIONS`) are exempt — they must be
 * side-effect-free anyway.
 */

import { recordSecurityEvent } from '@/lib/auth/audit'
import { getAuthConfig } from '@/lib/auth/config'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class CsrfError extends Error {
  readonly status = 403
  constructor(message: string) {
    super(message)
    this.name = 'CsrfError'
  }
}

function originFromUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function recordCsrfRejection(
  request: Request,
  detail: Record<string, string>,
): void {
  recordSecurityEvent({
    event: 'auth.csrf.rejected',
    outcome: 'failure',
    actor: { source: 'oidc' },
    request,
    detail,
  })
}

function firstForwardedValue(value: string | null): string | null {
  if (!value) return null
  const first = value.split(',')[0]?.trim()
  return first && first.length > 0 ? first : null
}

function resolveExpectedOrigin(request: Request): string {
  const cfg = getAuthConfig()
  const configuredOrigin = originFromUrl(cfg.redirectUri)
  if (configuredOrigin) {
    return configuredOrigin
  }

  const forwardedProto = firstForwardedValue(
    request.headers.get('x-forwarded-proto'),
  )
  const forwardedHost = firstForwardedValue(
    request.headers.get('x-forwarded-host'),
  )
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return new URL(request.url).origin
}

/**
 * Throws {@link CsrfError} when `request` is a state-changing call that
 * fails the same-origin / `X-Requested-With` checks. No-op on safe methods.
 */
export function assertSameOriginRequest(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return

  const expected = resolveExpectedOrigin(request)
  const originHeader = request.headers.get('origin')
  const refererOrigin = originFromUrl(request.headers.get('referer'))
  const claimed = originHeader ?? refererOrigin
  if (!claimed) {
    recordCsrfRejection(request, { reason: 'origin_missing' })
    throw new CsrfError('Cross-origin request rejected.')
  }
  if (claimed !== expected) {
    recordCsrfRejection(request, {
      reason: 'origin_mismatch',
      requestOrigin: claimed,
      allowedOrigin: expected,
    })
    throw new CsrfError('Cross-origin request rejected.')
  }

  const xrw = request.headers.get('x-requested-with')
  if (!xrw) {
    recordCsrfRejection(request, { reason: 'x_requested_with_missing' })
    throw new CsrfError('Missing X-Requested-With header.')
  }
  if (xrw.toLowerCase() !== 'xmlhttprequest') {
    recordCsrfRejection(request, { reason: 'x_requested_with_invalid' })
    throw new CsrfError('Invalid X-Requested-With header.')
  }
}
