import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { getAuthConfig } from '@/lib/auth/config'
import { getLoginState } from '@/lib/auth/login-state'
import { getOidcConfiguration, oidcClient } from '@/lib/auth/oidc'

export const dynamic = 'force-dynamic'

const LOCALE_FREE_ALLOWED_PATHS = new Set(['/'])

/**
 * Validate `?returnTo=` against an allow-list of same-origin paths so an
 * attacker cannot use the login flow as an open redirector. The path must
 * either start with `/<known-locale>/` (or equal `/<known-locale>`) or be
 * one of the explicitly allowed locale-free paths (just `/` today).
 */
function sanitizeReturnTo(raw: string | null): string {
  const fallback = `/${routing.defaultLocale}`
  if (!raw) return fallback
  // Must be absolute path on this origin, no scheme/host.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  // Reject path traversal.
  if (raw.includes('\\') || raw.includes('\0')) return fallback

  const pathOnly = raw.split('?')[0]?.split('#')[0] ?? raw
  if (LOCALE_FREE_ALLOWED_PATHS.has(pathOnly)) return raw

  const first = pathOnly.split('/')[1]
  if (first && (routing.locales as readonly string[]).includes(first)) {
    return raw
  }
  return fallback
}

export async function GET(request: NextRequest) {
  const cfg = getAuthConfig()
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: 'Authentication is disabled.' },
      { status: 404 },
    )
  }

  const url = new URL(request.url)
  const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'))

  const codeVerifier = oidcClient.randomPKCECodeVerifier()
  const codeChallenge =
    await oidcClient.calculatePKCECodeChallenge(codeVerifier)
  const state = oidcClient.randomState()
  const nonce = oidcClient.randomNonce()

  const loginState = await getLoginState()
  loginState.codeVerifier = codeVerifier
  loginState.state = state
  loginState.nonce = nonce
  loginState.returnTo = returnTo
  loginState.issuedAt = Math.floor(Date.now() / 1000)
  await loginState.save()

  const config = await getOidcConfiguration()
  const authorizationUrl = oidcClient.buildAuthorizationUrl(config, {
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return NextResponse.redirect(authorizationUrl, { status: 302 })
}
