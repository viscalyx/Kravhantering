import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Liveness probe for CI tooling (e.g. the DAST workflow waits on this
 * before invoking ZAP). Intentionally avoids any database, auth, or
 * external dependency so it stays available even when other services
 * have not finished starting.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    {
      headers: { 'Cache-Control': 'no-store' },
      status: 200,
    },
  )
}
