/**
 * Short-lived signed cookie used to carry PKCE verifier, OIDC state, nonce,
 * and the post-login `returnTo` path across the IdP redirect round-trip.
 *
 * Separate from the main session cookie:
 *   - much shorter TTL (5 minutes is plenty for a real login)
 *   - cleared on the callback route as soon as it has been read
 *   - never carries any user-identifying data
 */

import {
  getIronSession,
  type IronSession,
  type SessionOptions,
} from 'iron-session'
import { cookies } from 'next/headers'
import { getAuthConfig } from '@/lib/auth/config'
import { COOKIE_SECURE } from '@/lib/runtime/build-target'

export interface LoginStateData {
  codeVerifier: string
  /** Issued-at epoch seconds, for diagnostics. */
  issuedAt: number
  nonce: string
  /** Same-origin path to redirect to after successful login. */
  returnTo: string
  state: string
}

const LOGIN_STATE_TTL_SECONDS = 5 * 60

function buildOptions(): SessionOptions {
  const cfg = getAuthConfig()
  return {
    cookieName: `${cfg.cookieName}_login`,
    password: cfg.cookiePassword,
    ttl: LOGIN_STATE_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax' as const,
      path: '/',
    },
  }
}

export async function getLoginState(): Promise<IronSession<LoginStateData>> {
  const cookieStore = await cookies()
  return getIronSession<LoginStateData>(cookieStore, buildOptions())
}
