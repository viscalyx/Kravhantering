import { NextResponse } from 'next/server'
import { withRestResponsePolicy } from '@/lib/http/response-policy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Liveness probe for CI tooling (e.g. the DAST workflow waits on this
 * before invoking ZAP). Intentionally avoids any database, auth, or
 * external dependency so it stays available even when other services
 * have not finished starting.
 */
function getHandler() {
  return NextResponse.json(
    { status: 'ok' },
    {
      status: 200,
    },
  )
}

export const GET = withRestResponsePolicy(getHandler)
