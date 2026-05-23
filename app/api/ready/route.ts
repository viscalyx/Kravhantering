import { NextResponse } from 'next/server'
import { getAuthConfig } from '@/lib/auth/config'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { getSqlServerDatabaseUrl } from '@/lib/typeorm/sqlserver-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const OIDC_DISCOVERY_TIMEOUT_MS = 2_000

type ReadinessCheckName = 'runtime_config' | 'sql_server' | 'oidc_discovery'

interface ReadinessCheck {
  name: ReadinessCheckName
  run: () => Promise<void> | void
}

function jsonResponse(status: 'ready' | 'not_ready', httpStatus: 200 | 503) {
  return NextResponse.json(
    { status },
    {
      headers: { 'Cache-Control': 'no-store' },
      status: httpStatus,
    },
  )
}

function assertSiteUrlConfigured() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!siteUrl) {
    throw new Error('NEXT_PUBLIC_SITE_URL is not configured')
  }
  const parsed = new URL(siteUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an http:// or https:// URL')
  }
}

function discoveryUrl(issuerUrl: string): string {
  return `${issuerUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error && error.name) return error.name
  return 'Error'
}

async function checkRuntimeConfig() {
  assertSiteUrlConfigured()
  getAuthConfig()
  getSqlServerDatabaseUrl(process.env, false)
}

async function checkSqlServer() {
  const db = await getRequestSqlServerDataSource()
  await db.query('SELECT 1 AS ready')
}

async function checkOidcDiscovery() {
  const cfg = getAuthConfig()
  const response = await fetch(discoveryUrl(cfg.issuerUrl), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(OIDC_DISCOVERY_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error('OIDC discovery returned a non-success status')
  }

  const metadata = (await response.json()) as unknown
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error('OIDC discovery returned invalid JSON metadata')
  }
}

async function runCheck(check: ReadinessCheck): Promise<boolean> {
  try {
    await check.run()
    return true
  } catch (error) {
    console.warn('[readiness] check failed', {
      check: check.name,
      error: sanitizeError(error),
    })
    return false
  }
}

export async function GET() {
  const checks: ReadinessCheck[] = [
    { name: 'runtime_config', run: checkRuntimeConfig },
    { name: 'sql_server', run: checkSqlServer },
    { name: 'oidc_discovery', run: checkOidcDiscovery },
  ]

  for (const check of checks) {
    if (!(await runCheck(check))) {
      return jsonResponse('not_ready', 503)
    }
  }

  return jsonResponse('ready', 200)
}
