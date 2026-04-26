import { type NextRequest, NextResponse } from 'next/server'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getAuthConfig } from '@/lib/auth/config'
import { assertSameOriginRequest } from '@/lib/auth/csrf'
import { getOidcConfiguration, oidcClient } from '@/lib/auth/oidc'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function createLocalRedirect(request: NextRequest, target: string) {
  return NextResponse.redirect(new URL(target, request.url), { status: 302 })
}

function createPostLogoutResponse(
  request: NextRequest,
  target: string | URL,
): NextResponse {
  const url = target instanceof URL ? target : new URL(target, request.url)
  const accept = request.headers.get('accept')?.toLowerCase() ?? ''
  if (accept.includes('application/json')) {
    return NextResponse.json(
      { redirectTo: url.toString() },
      {
        headers: { 'Cache-Control': 'no-store' },
        status: 200,
      },
    )
  }
  return NextResponse.redirect(url, { status: 302 })
}

/**
 * GET /api/auth/logout — intentionally **non-destructive**.
 *
 * Only POST (which runs `assertSameOriginRequest`) is allowed to terminate
 * the session. A GET-driven logout would be CSRF-triggerable from any
 * cross-site `<a href>`, `<img src>`, or 302 redirect, letting a third
 * party silently sign users out as a denial-of-service. The GET handler
 * therefore just bounces to the post-logout redirect URI and never calls
 * `session.destroy()`.
 *
 * @see POST handler below for the CSRF-protected destructive path.
 */
export async function GET(request: NextRequest) {
  const cfg = getAuthConfig()
  return createLocalRedirect(request, cfg.postLogoutRedirectUri)
}

export async function POST(request: NextRequest) {
  const cfg = getAuthConfig()
  assertSameOriginRequest(request)

  const session = await getSession()
  const idTokenHint =
    typeof (session as { idToken?: string }).idToken === 'string'
      ? (session as { idToken: string }).idToken
      : undefined
  const sessionSub =
    typeof (session as { sub?: string }).sub === 'string'
      ? (session as { sub: string }).sub
      : undefined
  const sessionHsaId =
    typeof (session as { hsaId?: string }).hsaId === 'string'
      ? (session as { hsaId: string }).hsaId
      : undefined
  recordSecurityEvent({
    event: 'auth.logout',
    outcome: 'success',
    actor: sessionSub
      ? { source: 'oidc', sub: sessionSub, hsaId: sessionHsaId }
      : { source: 'anonymous' },
    request,
  })
  session.destroy()

  try {
    const config = await getOidcConfiguration()
    const endSessionUrl = oidcClient.buildEndSessionUrl(config, {
      post_logout_redirect_uri: cfg.postLogoutRedirectUri,
      ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
    })
    return createPostLogoutResponse(request, endSessionUrl)
  } catch (error) {
    console.warn('OIDC end_session_endpoint discovery/build failed', {
      error: error instanceof Error ? error.message : String(error),
      hasIdTokenHint: Boolean(idTokenHint),
      postLogoutRedirectUri: cfg.postLogoutRedirectUri,
    })
    // IdP did not advertise an end_session_endpoint — just bounce home.
    return createPostLogoutResponse(request, cfg.postLogoutRedirectUri)
  }
}
