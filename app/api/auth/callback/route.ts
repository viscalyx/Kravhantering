import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getAuthConfig } from '@/lib/auth/config'
import { HsaIdFormatError, isHsaId } from '@/lib/auth/hsa-id'
import { getLoginState } from '@/lib/auth/login-state'
import { getOidcConfiguration, oidcClient } from '@/lib/auth/oidc'
import { parseRolesClaim, resolveDisplayName } from '@/lib/auth/roles'
import {
  estimateSerializedSessionCookieLength,
  getSession,
  type LoggedInSession,
  type SessionData,
} from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const LOCALE_FREE_ALLOWED_PATHS = new Set(['/'])

const ACCESS_TOKEN_EXPIRY_FALLBACK_SECONDS = 300
const SESSION_COOKIE_SAFE_MAX_LENGTH = 3800

function sanitizeReturnTo(raw: string | null | undefined): string {
  const fallback = `/${routing.defaultLocale}`
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (raw.includes('\\') || raw.includes('\0')) return fallback

  const pathOnly = raw.split('?')[0]?.split('#')[0] ?? raw
  if (LOCALE_FREE_ALLOWED_PATHS.has(pathOnly)) return raw

  const first = pathOnly.split('/')[1]
  if (first && (routing.locales as readonly string[]).includes(first)) {
    return raw
  }
  return fallback
}

function recordLoginFailure(
  request: NextRequest,
  reason: string,
  extra?: Record<string, string>,
): void {
  recordSecurityEvent({
    event: 'auth.login.failed',
    outcome: 'failure',
    actor: { source: 'oidc' },
    request,
    detail: { reason, ...(extra ?? {}) },
  })
}

function buildMissingNameReason(
  givenNameMissing: boolean,
  familyNameMissing: boolean,
): string {
  const reasons: string[] = []
  if (givenNameMissing) reasons.push('given_name_missing')
  if (familyNameMissing) reasons.push('family_name_missing')
  return reasons.join(',')
}

async function resolveSessionIdToken(
  sessionData: SessionData,
  idToken: string | undefined,
): Promise<string | undefined> {
  if (!idToken) {
    return undefined
  }

  const estimatedCookieLength = await estimateSerializedSessionCookieLength({
    ...sessionData,
    idToken,
  })
  if (estimatedCookieLength <= SESSION_COOKIE_SAFE_MAX_LENGTH) {
    return idToken
  }

  console.warn(
    '[auth] OIDC id_token omitted from session cookie because it would exceed the safe cookie budget.',
    {
      estimatedCookieLength,
      safeLimit: SESSION_COOKIE_SAFE_MAX_LENGTH,
    },
  )
  return undefined
}

export async function GET(request: NextRequest) {
  const cfg = getAuthConfig()
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: 'Authentication is disabled.' },
      { status: 404 },
    )
  }

  // Capture prior session roles BEFORE we overwrite the cookie. Used by the
  // role-change diff below; first-ever login has no prior session and skips.
  const priorSession = await getSession()
  const priorSub =
    typeof (priorSession as { sub?: string }).sub === 'string'
      ? (priorSession as { sub: string }).sub
      : undefined
  const priorRoles = Array.isArray((priorSession as { roles?: unknown }).roles)
    ? ((priorSession as { roles: string[] }).roles ?? [])
    : []

  const loginState = await getLoginState()
  if (!loginState.codeVerifier) {
    recordLoginFailure(request, 'code_verifier_missing')
    return NextResponse.json(
      { error: 'Login session expired or missing. Please retry.' },
      { status: 400 },
    )
  }
  if (!loginState.state) {
    recordLoginFailure(request, 'state_missing')
    return NextResponse.json(
      { error: 'Login session expired or missing. Please retry.' },
      { status: 400 },
    )
  }
  if (!loginState.nonce) {
    recordLoginFailure(request, 'nonce_missing')
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
    recordLoginFailure(request, 'token_exchange_failed', {
      errorName: error instanceof Error ? error.name : 'Error',
    })
    return NextResponse.json(
      { error: 'OIDC callback failed', detail: message },
      { status: 400 },
    )
  }

  const claims = tokens.claims()
  if (!claims || typeof claims.sub !== 'string' || claims.sub === '') {
    loginState.destroy()
    recordLoginFailure(request, 'sub_claim_missing')
    return NextResponse.json(
      { error: 'ID token missing required `sub` claim.' },
      { status: 400 },
    )
  }

  const claimRecord = claims as Record<string, unknown>
  const givenNameRaw = claimRecord.given_name
  const familyNameRaw = claimRecord.family_name
  const givenNameMissing =
    typeof givenNameRaw !== 'string' || givenNameRaw.trim() === ''
  const familyNameMissing =
    typeof familyNameRaw !== 'string' || familyNameRaw.trim() === ''
  if (givenNameMissing || familyNameMissing) {
    loginState.destroy()
    recordLoginFailure(
      request,
      buildMissingNameReason(givenNameMissing, familyNameMissing),
    )
    return NextResponse.json(
      {
        error:
          'ID token missing required `given_name` and/or `family_name` claim.',
      },
      { status: 400 },
    )
  }
  const givenName = (givenNameRaw as string).trim()
  const familyName = (familyNameRaw as string).trim()

  const hsaIdRaw = claimRecord.employeeHsaId
  if (!isHsaId(hsaIdRaw)) {
    loginState.destroy()
    const detail =
      hsaIdRaw === undefined
        ? 'missing'
        : new HsaIdFormatError(hsaIdRaw).message
    recordLoginFailure(
      request,
      hsaIdRaw === undefined ? 'hsa_id_missing' : 'hsa_id_invalid',
    )
    return NextResponse.json(
      {
        error: 'ID token missing or has invalid `employeeHsaId` claim.',
        detail,
      },
      { status: 401 },
    )
  }
  const hsaId = hsaIdRaw

  const rolesRaw = claimRecord[cfg.rolesClaim]
  const roles = parseRolesClaim(rolesRaw)
  const name = resolveDisplayName(claimRecord)

  const emailVerified = claimRecord.email_verified
  const emailRaw = claimRecord.email
  const email =
    typeof emailRaw === 'string' && emailVerified === true
      ? emailRaw
      : undefined

  const tokenLifetimeSeconds = tokens.expiresIn()
  const accessTokenExpiresAt =
    Math.floor(Date.now() / 1000) +
    (typeof tokenLifetimeSeconds === 'number' && tokenLifetimeSeconds > 0
      ? tokenLifetimeSeconds
      : ACCESS_TOKEN_EXPIRY_FALLBACK_SECONDS)

  const sessionData: LoggedInSession = {
    sub: claims.sub,
    hsaId,
    givenName,
    familyName,
    name,
    email,
    roles,
    accessTokenExpiresAt,
  }
  const sessionIdToken = await resolveSessionIdToken(
    sessionData,
    tokens.id_token,
  )

  const session = await getSession()
  session.sub = sessionData.sub
  session.hsaId = sessionData.hsaId
  session.givenName = sessionData.givenName
  session.familyName = sessionData.familyName
  session.name = sessionData.name
  if (sessionData.email === undefined) {
    delete session.email
  } else {
    session.email = sessionData.email
  }
  session.roles = sessionData.roles
  if (sessionIdToken === undefined) {
    delete session.idToken
  } else {
    session.idToken = sessionIdToken
  }
  session.accessTokenExpiresAt = sessionData.accessTokenExpiresAt
  await session.save()

  recordSecurityEvent({
    event: 'auth.login.succeeded',
    outcome: 'success',
    actor: { source: 'oidc', sub: claims.sub, hsaId },
    request,
    detail: { roles: [...roles].sort() },
  })

  // Role-change diff: only emit when the user already had a session AND the
  // resolved role set differs. Skip on first-ever login.
  if (priorSub) {
    const before = [...priorRoles].sort()
    const after = [...roles].sort()
    if (before.join(',') !== after.join(',')) {
      recordSecurityEvent({
        event: 'auth.roles.changed',
        outcome: 'success',
        actor: { source: 'oidc', sub: claims.sub, hsaId },
        request,
        detail: { before, after },
      })
    }
  }

  const returnTo = sanitizeReturnTo(loginState.returnTo)
  loginState.destroy()

  return NextResponse.redirect(new URL(returnTo, cfg.redirectUri), {
    status: 302,
  })
}
