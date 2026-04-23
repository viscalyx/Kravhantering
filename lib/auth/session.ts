/**
 * Iron-session wrapper. Stores a minimal projection of the validated OIDC
 * claims in a signed + encrypted cookie. Stateless — no server-side store.
 *
 * The session payload is intentionally small (<4KB cookie limit). The raw
 * ID token is kept only for `end_session_endpoint`'s `id_token_hint`; the
 * raw access token is not stored at all (browser flow uses cookies).
 */

import { getIronSession, type IronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { getAuthConfig } from '@/lib/auth/config'

export interface SessionData {
  /** Epoch seconds when the access token expires (informational). */
  accessTokenExpiresAt: number
  /** Email address; only set when the IdP asserted `email_verified === true`. */
  email?: string
  /** Family name (`family_name` claim). Required by the claim contract. */
  familyName: string
  /** Given name (`given_name` claim). Required by the claim contract. */
  givenName: string
  /**
   * HSA-id from the `employeeHsaId` claim. Required by the claim contract.
   * Validated against `lib/auth/hsa-id.ts` at login time.
   */
  hsaId: string
  /** Raw ID token JWT, used as id_token_hint for IdP-initiated logout. */
  idToken: string
  /** Resolved display name (see `resolveDisplayName`). */
  name: string
  roles: string[]
  sub: string
}

function buildSessionOptions() {
  const config = getAuthConfig()
  return {
    cookieName: config.cookieName,
    password: config.cookiePassword,
    ttl: config.sessionTtlSeconds,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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

/** True when the session carries enough data to consider the user signed in. */
export function isSignedIn(
  session: SessionData | IronSession<SessionData>,
): boolean {
  return Boolean((session as Partial<SessionData>).sub)
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
