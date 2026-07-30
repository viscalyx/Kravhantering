import { NextResponse } from 'next/server'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { withRestResponsePolicy } from '@/lib/http/response-policy'

export const dynamic = 'force-dynamic'

/**
 * Returns the current signed-in user's identity for the UI to render.
 *
 *   { authenticated: false }
 *   { authenticated: true, sub, hsaId, givenName, familyName, name, email?,
 *     roles, expiresAt }
 *
 * `email` is omitted when the IdP did not assert `email_verified === true`.
 * Never returns the raw id/access tokens.
 */
async function getHandler() {
  const session = await getSession()
  if (!isSignedIn(session)) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }

  return NextResponse.json(
    {
      authenticated: true,
      sub: session.sub,
      hsaId: session.hsaId,
      givenName: session.givenName,
      familyName: session.familyName,
      name: session.name,
      email: session.email,
      roles: session.roles ?? [],
      expiresAt: session.accessTokenExpiresAt,
    },
    {
      status: 200,
    },
  )
}

export const GET = withRestResponsePolicy(getHandler)
