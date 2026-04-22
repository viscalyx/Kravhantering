import { type NextRequest, NextResponse } from 'next/server'
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
