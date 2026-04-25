/**
 * Iron-session wrapper. Stores a minimal projection of the validated OIDC
 * claims in a signed + encrypted cookie. Stateless — no server-side store.
 *
 * The session payload is intentionally small (<4KB cookie limit). The raw
 * ID token is stored only when it still fits the cookie budget so logout can
 * send `id_token_hint`; the raw access token is not stored at all (browser
 * flow uses cookies).
 */

import {
  getIronSession,
  type IronSession,
  type SessionOptions,
  sealData,
} from 'iron-session'
import { cookies } from 'next/headers'
import { getAuthConfig } from '@/lib/auth/config'
import { USE_INSECURE_COOKIE } from '@/lib/runtime/build-target'

export interface SessionData {
  /** Epoch seconds when the access token expires (informational). */
  accessTokenExpiresAt?: number
  /** Email address; only set when the IdP asserted `email_verified === true`. */
  email?: string
  /** Family name (`family_name` claim). Required by the claim contract. */
  familyName?: string
  /** Given name (`given_name` claim). Required by the claim contract. */
  givenName?: string
  /**
   * HSA-id from the `employeeHsaId` claim. Required by the claim contract.
   * Validated against `lib/auth/hsa-id.ts` at login time.
   */
  hsaId?: string
  /**
   * Raw ID token JWT, used as id_token_hint for IdP-initiated logout when it
   * fits inside the session cookie budget.
   */
  idToken?: string
  /** Resolved display name (see `resolveDisplayName`). */
  name?: string
  roles?: string[]
  sub?: string
}

export interface LoggedInSession extends SessionData {
  accessTokenExpiresAt: number
  familyName: string
  givenName: string
  hsaId: string
  idToken?: string
  name: string
  roles: string[]
  sub: string
}

const SESSION_COOKIE_EXPIRY_SKEW_SECONDS = 60

function buildSessionOptions(): SessionOptions {
  const config = getAuthConfig()
  return {
    cookieName: config.cookieName,
    password: config.cookiePassword,
    ttl: config.sessionTtlSeconds,
    cookieOptions: {
      httpOnly: true,
      secure: !USE_INSECURE_COOKIE,
      sameSite: 'lax' as const,
      path: '/',
      // iron-session subtracts 60s automatically; leave maxAge undefined to
      // let the lib derive it from `ttl`.
    },
  }
}

/**
 * Read the current session from the Next.js `cookies()` store. Returns an
 * IronSession proxy: empty object until the user logs in, then carries the
 * `SessionData` fields plus `save()` and `destroy()`.
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, buildSessionOptions())
}

/**
 * Read the session from a raw `Request`/`Response` pair (for use in
 * `middleware.ts` where `cookies()` is also available, but for tests we want
 * a Request-only path too). Pass an empty `Response` if you only need to
 * read; pass a real Response to allow `save()`/`destroy()` to mutate the
 * `Set-Cookie` header.
 */
export async function getSessionFromRequest(
  request: Request,
  response: Response,
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(request, response, buildSessionOptions())
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** True when the session carries enough data to consider the user signed in. */
export function isSignedIn(
  session: SessionData | IronSession<SessionData>,
): session is LoggedInSession {
  return (
    hasNonEmptyString(session.sub) &&
    hasNonEmptyString(session.givenName) &&
    hasNonEmptyString(session.familyName) &&
    hasNonEmptyString(session.hsaId) &&
    hasNonEmptyString(session.name) &&
    Array.isArray(session.roles) &&
    hasFiniteNumber(session.accessTokenExpiresAt)
  )
}

function computeCookieMaxAge(ttl: number): number {
  if (ttl === 0) {
    return 2_147_483_647
  }
  return Math.max(0, ttl - SESSION_COOKIE_EXPIRY_SKEW_SECONDS)
}

function toCookieSameSite(
  value: NonNullable<SessionOptions['cookieOptions']>['sameSite'],
): string | null {
  if (value === undefined || value === false) {
    return null
  }
  if (value === true) {
    return 'Strict'
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

export async function estimateSerializedSessionCookieLength(
  sessionData: SessionData,
): Promise<number> {
  const options = buildSessionOptions()
  const cookieOptions =
    options.cookieOptions ??
    ({} as NonNullable<SessionOptions['cookieOptions']>)
  const seal = await sealData(sessionData, {
    password: options.password,
    ttl: options.ttl,
  })

  const maxAge = cookieOptions.maxAge ?? computeCookieMaxAge(options.ttl ?? 0)
  const parts = [`${options.cookieName}=${seal}`]
  parts.push(`Max-Age=${maxAge}`)

  if (cookieOptions.domain) {
    parts.push(`Domain=${cookieOptions.domain}`)
  }
  if (cookieOptions.expires instanceof Date) {
    parts.push(`Expires=${cookieOptions.expires.toUTCString()}`)
  }
  if (cookieOptions.path) {
    parts.push(`Path=${cookieOptions.path}`)
  }
  if (cookieOptions.httpOnly) {
    parts.push('HttpOnly')
  }
  if (cookieOptions.secure) {
    parts.push('Secure')
  }
  const sameSite = toCookieSameSite(cookieOptions.sameSite)
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`)
  }

  return parts.join('; ').length
}

export interface SessionDiagnostics {
  reason?: 'invalid_session_cookie'
  rejected: boolean
  session: IronSession<SessionData>
}

/**
 * Read the session like {@link getSessionFromRequest} but additionally
 * reports whether a session cookie was present-but-invalid. `iron-session`
 * silently returns an empty session on decrypt/expiry/tamper failures, so
 * detection is "cookie present in request but resulting session has no
 * `sub`". Used by `proxy.ts` to emit the `auth.session.rejected`
 * security audit event without changing the public read API.
 */
export async function getSessionFromRequestWithDiagnostics(
  request: Request,
  response: Response,
): Promise<SessionDiagnostics> {
  const cfg = getAuthConfig()
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookiePresent = cookieHeader
    .split(';')
    .some(part => part.trim().startsWith(`${cfg.cookieName}=`))
  const session = await getIronSession<SessionData>(
    request,
    response,
    buildSessionOptions(),
  )
  if (cookiePresent && !isSignedIn(session)) {
    return { session, rejected: true, reason: 'invalid_session_cookie' }
  }
  return { session, rejected: false }
}
