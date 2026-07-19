import { NextResponse } from 'next/server'
import { getAuthConfig } from '@/lib/auth/config'
import {
  type DatabaseSchemaStatusReason,
  readDatabaseSchemaStatus,
} from '@/lib/database-schema-status'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { probeGeneratedOutputTempDirectory } from '@/lib/generated-output/spool'
import { getSqlServerDatabaseUrl } from '@/lib/typeorm/sqlserver-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const OIDC_DISCOVERY_TIMEOUT_MS = 2_000

type ReadinessCheckName =
  | 'runtime_config'
  | 'sql_server'
  | 'database_migration_compatibility'
  | 'oidc_discovery'
  | 'temporary_storage'

type ReadinessFailureReason =
  | 'runtime_config_invalid'
  | 'sql_server_unavailable'
  | DatabaseSchemaStatusReason
  | 'oidc_discovery_unavailable'
  | 'temporary_storage_unavailable'

interface ReadinessCheck {
  defaultReason: ReadinessFailureReason
  name: ReadinessCheckName
  run: () => Promise<void> | void
}

interface FailedReadinessCheck {
  name: ReadinessCheckName
  reason: ReadinessFailureReason
}

class ReadinessFailure extends Error {
  readonly reason: ReadinessFailureReason

  constructor(reason: ReadinessFailureReason) {
    super(reason)
    this.name = 'ReadinessFailure'
    this.reason = reason
  }
}

function jsonResponse(
  status: 'ready' | 'not_ready',
  httpStatus: 200 | 503,
  failedChecks: FailedReadinessCheck[] = [],
) {
  return NextResponse.json(
    status === 'ready' ? { status } : { failedChecks, status },
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

function failureReason(
  error: unknown,
  fallback: ReadinessFailureReason,
): ReadinessFailureReason {
  return error instanceof ReadinessFailure ? error.reason : fallback
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

async function checkDatabaseMigrationCompatibility() {
  const status = await readDatabaseSchemaStatus()
  if (status.status !== 'matches') {
    throw new ReadinessFailure(status.reason)
  }
}

async function checkTemporaryStorage() {
  await probeGeneratedOutputTempDirectory()
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

async function runCheck(
  check: ReadinessCheck,
): Promise<FailedReadinessCheck | null> {
  try {
    await check.run()
    return null
  } catch (error) {
    const reason = failureReason(error, check.defaultReason)
    console.warn('[readiness] check failed', {
      check: check.name,
      error: sanitizeError(error),
      reason,
    })
    return { name: check.name, reason }
  }
}

export async function GET() {
  const checks: ReadinessCheck[] = [
    {
      defaultReason: 'runtime_config_invalid',
      name: 'runtime_config',
      run: checkRuntimeConfig,
    },
    {
      defaultReason: 'sql_server_unavailable',
      name: 'sql_server',
      run: checkSqlServer,
    },
    {
      defaultReason: 'database_schema_version_check_failed',
      name: 'database_migration_compatibility',
      run: checkDatabaseMigrationCompatibility,
    },
    {
      defaultReason: 'temporary_storage_unavailable',
      name: 'temporary_storage',
      run: checkTemporaryStorage,
    },
    {
      defaultReason: 'oidc_discovery_unavailable',
      name: 'oidc_discovery',
      run: checkOidcDiscovery,
    },
  ]

  for (const check of checks) {
    const failedCheck = await runCheck(check)
    if (failedCheck) {
      return jsonResponse('not_ready', 503, [failedCheck])
    }
  }

  return jsonResponse('ready', 200)
}
