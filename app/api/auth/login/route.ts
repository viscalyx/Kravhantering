import { type NextRequest, NextResponse } from 'next/server'
import { getAuthConfig } from '@/lib/auth/config'
import { getLoginState } from '@/lib/auth/login-state'
import { getOidcConfiguration, oidcClient } from '@/lib/auth/oidc'

export const dynamic = 'force-dynamic'

/**
 * Validate `?returnTo=` against an allow-list of same-origin paths so an
 * attacker cannot use the login flow as an open redirector.
 */
function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return '/'
  // Must be absolute path on this origin, no scheme/host.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  // Reject path traversal.
  if (raw.includes('\\') || raw.includes('\0')) return '/'
  return raw
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
