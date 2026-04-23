import { type NextRequest, NextResponse } from 'next/server'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getAuthConfig } from '@/lib/auth/config'
import { getOidcConfiguration, oidcClient } from '@/lib/auth/oidc'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const cfg = getAuthConfig()
  if (!cfg.enabled) {
    return NextResponse.redirect(new URL('/', request.url), { status: 302 })
  }

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

  let endSessionUrl: URL
  try {
    const config = await getOidcConfiguration()
    endSessionUrl = oidcClient.buildEndSessionUrl(config, {
      post_logout_redirect_uri: cfg.postLogoutRedirectUri,
      ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
    })
  } catch {
    // IdP did not advertise an end_session_endpoint — just bounce home.
    return NextResponse.redirect(
      new URL(cfg.postLogoutRedirectUri, request.url),
      { status: 302 },
    )
  }

  return NextResponse.redirect(endSessionUrl, { status: 302 })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
