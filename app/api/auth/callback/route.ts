import { type NextRequest, NextResponse } from 'next/server'
import { getAuthConfig } from '@/lib/auth/config'
import { getLoginState } from '@/lib/auth/login-state'
import { getOidcConfiguration, oidcClient } from '@/lib/auth/oidc'
import { parseRolesClaim, resolveDisplayName } from '@/lib/auth/roles'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
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

  const loginState = await getLoginState()
  if (!loginState.codeVerifier || !loginState.state || !loginState.nonce) {
    return NextResponse.json(
      { error: 'Login session expired or missing. Please retry.' },
      { status: 400 },
    )
  }

  const config = await getOidcConfiguration()

  // openid-client derives the `redirect_uri` it sends to the token endpoint
  // from the origin + pathname of the URL we hand it. `request.url` reflects
  // whatever host Next.js is bound to (e.g. `0.0.0.0:3001` under
  // `next start --hostname 0.0.0.0`, or the in-pod hostname behind a proxy),
  // which won't match the redirect URI registered with the IdP. Reconstruct
  // the URL using the configured redirect URI as the canonical origin +
  // pathname, carrying over the OIDC query params (`code`, `state`, `iss`,
  // `session_state`) from the incoming request.
  const incomingUrl = new URL(request.url)
  const callbackUrl = new URL(cfg.redirectUri)
  for (const [key, value] of incomingUrl.searchParams) {
    callbackUrl.searchParams.set(key, value)
  }

  let tokens: Awaited<ReturnType<typeof oidcClient.authorizationCodeGrant>>
  try {
    tokens = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: loginState.codeVerifier,
      expectedState: loginState.state,
      expectedNonce: loginState.nonce,
      idTokenExpected: true,
    })
  } catch (error) {
    loginState.destroy()
    const message =
      error instanceof Error ? error.message : 'Token exchange failed'
    return NextResponse.json(
      { error: 'OIDC callback failed', detail: message },
      { status: 400 },
    )
  }

  const claims = tokens.claims()
  if (!claims || typeof claims.sub !== 'string' || claims.sub === '') {
    loginState.destroy()
    return NextResponse.json(
      { error: 'ID token missing required `sub` claim.' },
      { status: 400 },
    )
  }

  const claimRecord = claims as Record<string, unknown>
  const givenNameRaw = claimRecord.given_name
  const familyNameRaw = claimRecord.family_name
  if (
    typeof givenNameRaw !== 'string' ||
    givenNameRaw.trim() === '' ||
    typeof familyNameRaw !== 'string' ||
    familyNameRaw.trim() === ''
  ) {
    loginState.destroy()
    return NextResponse.json(
      {
        error:
          'ID token missing required `given_name` and/or `family_name` claim.',
      },
      { status: 400 },
    )
  }
  const givenName = givenNameRaw.trim()
  const familyName = familyNameRaw.trim()

  const rolesRaw = claimRecord[cfg.rolesClaim]
  const roles = parseRolesClaim(rolesRaw)
  const name = resolveDisplayName(claimRecord)

  const emailVerified = claimRecord.email_verified
  const emailRaw = claimRecord.email
  const email =
    typeof emailRaw === 'string' && emailVerified === true
      ? emailRaw
      : undefined

  const accessTokenExpiresAt =
    Math.floor(Date.now() / 1000) +
    (tokens.expiresIn() ?? cfg.sessionTtlSeconds)

  const session = await getSession()
  session.sub = claims.sub
  session.givenName = givenName
  session.familyName = familyName
  session.name = name
  session.email = email
  session.roles = roles
  session.idToken = tokens.id_token ?? ''
  session.accessTokenExpiresAt = accessTokenExpiresAt
  if (typeof tokens.refresh_token === 'string') {
    session.refreshToken = tokens.refresh_token
  }
  await session.save()

  const returnTo = sanitizeReturnTo(loginState.returnTo)
  loginState.destroy()

  return NextResponse.redirect(new URL(returnTo, request.url), { status: 302 })
}
