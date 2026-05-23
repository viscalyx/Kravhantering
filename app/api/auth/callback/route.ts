import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
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
import { logSanitizedError } from '@/lib/http/safe-errors'
import { parseSearchParams } from '@/lib/http/validation'
import { USE_INSECURE_COOKIE } from '@/lib/runtime/build-target'

export const dynamic = 'force-dynamic'

const LOCALE_FREE_ALLOWED_PATHS = new Set(['/'])

const ACCESS_TOKEN_EXPIRY_FALLBACK_SECONDS = 300
const SESSION_COOKIE_SAFE_MAX_LENGTH = 3800
const LOGIN_STATE_COOKIE_MISSING_CODE = 'login_state_cookie_missing'

interface AuthCallbackFailureBody {
  code: string
  detail: string
  error: string
  reason?: string
}

interface AuthCallbackFailureOptions {
  code: string
  detail: string
  internalReason?: string
  logDetail?: Record<string, unknown>
  logError?: unknown
  returnTo?: string
  status?: number
  title?: string
}

const oidcCallbackQuerySchema = z
  .object({
    code: z.string().min(1).max(4096).optional(),
    error: z.string().min(1).max(450).optional(),
    error_description: z.string().max(4096).optional(),
    error_uri: z.string().max(2048).optional(),
    iss: z.string().min(1).max(2048).optional(),
    scope: z.string().max(2048).optional(),
    session_state: z.string().min(1).max(2048).optional(),
    state: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    const hasCode = query.code !== undefined
    const hasError = query.error !== undefined

    if (hasCode === hasError) {
      context.addIssue({
        code: 'custom',
        message: 'OIDC callback must include exactly one of code or error.',
        path: hasCode ? ['error'] : ['code'],
      })
    }
  })

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

function wantsJsonCallbackResponse(request: NextRequest): boolean {
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('application/json')) return true
  if (request.headers.get('sec-fetch-dest') === 'document') return false
  if (accept.includes('text/html')) return false
  return true
}

function pathLocale(raw: string | null | undefined): string {
  const pathOnly = raw?.split(/[?#]/, 1)[0] ?? ''
  const first = pathOnly.split('/')[1]
  return first && (routing.locales as readonly string[]).includes(first)
    ? first
    : routing.defaultLocale
}

function createAuthCallbackFailureResponse(
  request: NextRequest,
  options: AuthCallbackFailureOptions,
): NextResponse<AuthCallbackFailureBody> | NextResponse {
  const status = options.status ?? 400
  const title = options.title ?? 'OIDC callback failed'

  logSanitizedError(title, options.logError ?? new Error(options.detail), {
    code: options.code,
    ...(options.internalReason ? { reason: options.internalReason } : {}),
    ...(options.logDetail ?? {}),
  })

  if (wantsJsonCallbackResponse(request)) {
    return NextResponse.json(
      {
        error: title,
        code: options.code,
        detail: options.detail,
        ...(options.internalReason ? { reason: options.internalReason } : {}),
      },
      { status },
    )
  }

  const locale = pathLocale(options.returnTo)
  const errorUrl = new URL('/auth/error', request.url)
  errorUrl.searchParams.set('code', options.code)
  errorUrl.searchParams.set('locale', locale)
  return NextResponse.redirect(errorUrl, { status: 302 })
}

function isLocalBrowserHost(host: string): boolean {
  const ipv6End = host.indexOf(']')
  const hostname =
    host.startsWith('[') && ipv6End > 0
      ? host.slice(1, ipv6End)
      : (host.split(':')[0] ?? '')
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  )
}

function buildLoginStateFailureDiagnostics(
  request: NextRequest,
  cfg: ReturnType<typeof getAuthConfig>,
): Record<string, unknown> {
  const incomingUrl = new URL(request.url)
  const configuredCallbackUrl = new URL(cfg.redirectUri)
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? undefined
  const forwardedHost = request.headers.get('x-forwarded-host') ?? undefined
  const effectiveProtocol = (forwardedProto ?? incomingUrl.protocol).replace(
    /:$/,
    '',
  )
  const effectiveHost = forwardedHost ?? incomingUrl.host
  const secureCookiesRequired = !USE_INSECURE_COOKIE
  const loginStateCookiePresent = (request.headers.get('cookie') ?? '')
    .split(';')
    .some(part => part.trim().startsWith(`${cfg.cookieName}_login=`))

  let likelyCause = 'login_state_expired_or_missing'
  if (
    secureCookiesRequired &&
    effectiveProtocol !== 'https' &&
    !isLocalBrowserHost(effectiveHost)
  ) {
    likelyCause = 'secure_cookie_not_sent_without_tls'
  } else if (effectiveHost !== configuredCallbackUrl.host) {
    likelyCause = 'callback_host_mismatch'
  }

  return {
    secureCookiesRequired,
    incomingProtocol: incomingUrl.protocol.replace(/:$/, ''),
    incomingHost: incomingUrl.host,
    configuredCallbackProtocol: configuredCallbackUrl.protocol.replace(
      /:$/,
      '',
    ),
    configuredCallbackHost: configuredCallbackUrl.host,
    ...(forwardedProto ? { forwardedProto } : {}),
    ...(forwardedHost ? { forwardedHost } : {}),
    loginStateCookiePresent,
    likelyCause,
  }
}

function createMissingLoginStateResponse(
  request: NextRequest,
  cfg: ReturnType<typeof getAuthConfig>,
  internalReason: string,
  returnTo: string | undefined,
): NextResponse<AuthCallbackFailureBody> | NextResponse {
  return createAuthCallbackFailureResponse(request, {
    code: LOGIN_STATE_COOKIE_MISSING_CODE,
    detail:
      'Login state cookie is missing or expired. Retry the login flow. The cause may be incorrect TLS, Secure cookie handling, or callback host configuration.',
    internalReason,
    logDetail: buildLoginStateFailureDiagnostics(request, cfg),
    returnTo,
    title: 'Login callback failed',
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
): Promise<{
  auditDetail?: {
    estimatedCookieLength: number
    logoutHintOmitted: true
    safeLimit: number
  }
  value: string | undefined
}> {
  if (!idToken) {
    return { value: undefined }
  }

  const estimatedCookieLength = await estimateSerializedSessionCookieLength({
    ...sessionData,
    idToken,
  })
  if (estimatedCookieLength <= SESSION_COOKIE_SAFE_MAX_LENGTH) {
    return { value: idToken }
  }

  return {
    auditDetail: {
      estimatedCookieLength,
      logoutHintOmitted: true,
      safeLimit: SESSION_COOKIE_SAFE_MAX_LENGTH,
    },
    value: undefined,
  }
}

export async function GET(request: NextRequest) {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    oidcCallbackQuerySchema,
  )
  if (!parsedQuery.ok) {
    if (!wantsJsonCallbackResponse(request)) {
      return createAuthCallbackFailureResponse(request, {
        code: 'invalid_callback_request',
        detail: 'OIDC callback request was malformed.',
        title: 'Login callback failed',
      })
    }
    return parsedQuery.response
  }
  const cfg = getAuthConfig()

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
    const reason = 'code_verifier_missing'
    recordLoginFailure(request, reason)
    loginState.destroy()
    return createMissingLoginStateResponse(
      request,
      cfg,
      reason,
      loginState.returnTo,
    )
  }
  if (!loginState.state) {
    const reason = 'state_missing'
    recordLoginFailure(request, reason)
    loginState.destroy()
    return createMissingLoginStateResponse(
      request,
      cfg,
      reason,
      loginState.returnTo,
    )
  }
  if (!loginState.nonce) {
    const reason = 'nonce_missing'
    recordLoginFailure(request, reason)
    loginState.destroy()
    return createMissingLoginStateResponse(
      request,
      cfg,
      reason,
      loginState.returnTo,
    )
  }

  if (parsedQuery.data.error !== undefined) {
    recordLoginFailure(request, 'oidc_error', {
      error: parsedQuery.data.error,
    })
    loginState.destroy()
    return createAuthCallbackFailureResponse(request, {
      code: 'oidc_error',
      detail: parsedQuery.data.error_description || parsedQuery.data.error,
      internalReason: parsedQuery.data.error,
      returnTo: loginState.returnTo,
    })
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
  const callbackUrl = new URL(cfg.redirectUri)
  for (const [key, value] of Object.entries(parsedQuery.data)) {
    if (value !== undefined) {
      callbackUrl.searchParams.set(key, value)
    }
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
    recordLoginFailure(request, 'token_exchange_failed', {
      errorName: error instanceof Error ? error.name : 'Error',
    })
    return createAuthCallbackFailureResponse(request, {
      code: 'token_exchange_failed',
      detail: 'Token exchange failed',
      internalReason: error instanceof Error ? error.name : 'Error',
      logError: error,
      logDetail: {
        errorName: error instanceof Error ? error.name : 'Error',
      },
      returnTo: loginState.returnTo,
    })
  }

  const claims = tokens.claims()
  if (!claims || typeof claims.sub !== 'string' || claims.sub === '') {
    loginState.destroy()
    recordLoginFailure(request, 'sub_claim_missing')
    return createAuthCallbackFailureResponse(request, {
      code: 'sub_claim_missing',
      detail: 'ID token missing required `sub` claim.',
      returnTo: loginState.returnTo,
    })
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
    const missingNameReason = buildMissingNameReason(
      givenNameMissing,
      familyNameMissing,
    )
    recordLoginFailure(request, missingNameReason)
    return createAuthCallbackFailureResponse(request, {
      code: 'required_name_claim_missing',
      detail:
        'ID token missing required `given_name` and/or `family_name` claim.',
      internalReason: missingNameReason,
      returnTo: loginState.returnTo,
    })
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
    return createAuthCallbackFailureResponse(request, {
      code: hsaIdRaw === undefined ? 'hsa_id_missing' : 'hsa_id_invalid',
      detail: `ID token missing or has invalid \`employeeHsaId\` claim: ${detail}`,
      returnTo: loginState.returnTo,
      status: 401,
    })
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
  const { auditDetail: sessionIdTokenAudit, value: sessionIdToken } =
    await resolveSessionIdToken(sessionData, tokens.id_token)

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
    detail: {
      roles: [...roles].sort(),
      ...(sessionIdTokenAudit ?? {}),
    },
  })

  // Role-change diff: only emit when the user already had a session AND the
  // resolved role set differs. Skip on first-ever login.
  if (priorSub === claims.sub) {
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
