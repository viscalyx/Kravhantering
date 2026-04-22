import { NextResponse } from 'next/server'
import { getAuthConfig } from '@/lib/auth/config'
import { getSession, isSignedIn } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Returns the current signed-in user's identity for the UI to render.
 *
 *   { authenticated: false }
 *   { authenticated: true, sub, givenName, familyName, name, email?,
 *     roles, expiresAt }
 *
 * `email` is omitted when the IdP did not assert `email_verified === true`.
 * Never returns the raw id/access/refresh tokens.
 */
export async function GET() {
  const cfg = getAuthConfig()
  if (!cfg.enabled) {
    return NextResponse.json(
      { authenticated: false, authDisabled: true },
      { status: 200 },
    )
  }

  const session = await getSession()
  if (!isSignedIn(session)) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }

  return NextResponse.json(
    {
      authenticated: true,
      sub: session.sub,
      givenName: session.givenName,
      familyName: session.familyName,
      name: session.name,
      email: session.email,
      roles: session.roles ?? [],
      expiresAt: session.accessTokenExpiresAt,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
