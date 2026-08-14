import { NextResponse } from 'next/server'
import { getAuthConfig, getMcpAuthConfig } from '@/lib/auth/config'
import {
  type DatabaseSchemaStatusReason,
  readDatabaseSchemaStatus,
} from '@/lib/database-schema-status'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { probeGeneratedOutputTempDirectory } from '@/lib/generated-output/spool'
import {
  getHsaPersonLookupConfig,
  type HsaPersonLookupConfigDiagnostic,
  hsaPersonLookupConfigDiagnostic,
} from '@/lib/hsa/person-lookup'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { resolveRequestCorrelationIds } from '@/lib/observability/request-ids'
import {
  createReadinessCoordinator,
  type ReadinessEvaluationContext,
  type ReadinessResult,
} from '@/lib/readiness/coordinator'
import { getSqlServerDatabaseUrl } from '@/lib/typeorm/sqlserver-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const OIDC_DISCOVERY_TIMEOUT_MS = 2_000
const READINESS_LOG_ID_PATTERN = /^[A-Za-z0-9._@-]{1,128}$/

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

function readinessLogIds(context: ReadinessEvaluationContext) {
  const safeId = (value: string) =>
    READINESS_LOG_ID_PATTERN.test(value) ? value : 'redacted'

  return {
    correlation_id: safeId(context.correlationId),
    request_id: safeId(context.requestId),
  }
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
): NextResponse {
  return NextResponse.json({ status }, { status: httpStatus })
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

function readinessDiagnostic(
  check: ReadinessCheckName,
  error: unknown,
):
  | 'check_failed'
  | HsaPersonLookupConfigDiagnostic
  | 'sql_server_driver_unavailable' {
  if (check === 'runtime_config') {
    const hsaDiagnostic = hsaPersonLookupConfigDiagnostic(error)
    if (hsaDiagnostic) return hsaDiagnostic
  }
  if (
    check === 'sql_server' &&
    error instanceof Error &&
    error.name === 'DriverPackageNotInstalledError'
  ) {
    return 'sql_server_driver_unavailable'
  }

  return 'check_failed'
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
  getMcpAuthConfig()
  getHsaPersonLookupConfig()
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
  context: ReadinessEvaluationContext,
): Promise<boolean> {
  try {
    await check.run()
    return true
  } catch (error) {
    const reason = failureReason(error, check.defaultReason)
    console.warn('[readiness] check failed', {
      check: check.name,
      diagnostic: readinessDiagnostic(check.name, error),
      reason,
      ...readinessLogIds(context),
    })
    return false
  }
}

async function evaluateReadiness(
  context: ReadinessEvaluationContext,
): Promise<ReadinessResult> {
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
    if (!(await runCheck(check, context))) return { status: 'not_ready' }
  }

  return { status: 'ready' }
}

function createRouteReadinessCoordinator() {
  return createReadinessCoordinator({
    evaluate: evaluateReadiness,
    onUnexpectedError: (_error, context) => {
      console.warn('[readiness] evaluation failed', {
        check: 'readiness_evaluation',
        diagnostic: 'unexpected_evaluation_failure',
        reason: 'readiness_evaluation_failed',
        ...readinessLogIds(context),
      })
    },
  })
}

let readinessCoordinator = createRouteReadinessCoordinator()

export function __resetReadinessStateForTests(): void {
  readinessCoordinator = createRouteReadinessCoordinator()
}

async function getHandler(request: Request): Promise<NextResponse> {
  const result = await readinessCoordinator.get(
    resolveRequestCorrelationIds(request.headers),
  )
  return result.status === 'ready'
    ? jsonResponse('ready', 200)
    : jsonResponse('not_ready', 503)
}

export const GET = withRestResponsePolicy(getHandler)
