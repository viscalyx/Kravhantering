import type {
  ActionAuditDecision,
  ActionAuditEventFilters,
} from '@/lib/audit/action-audit'
import { isValidClientIp } from '@/lib/auth/client-ip'

export type ActionAuditLogSearchParams = Record<
  string,
  string | string[] | undefined
>

export const DEFAULT_ACTION_AUDIT_LOG_PAGE_SIZE = 50

const ACTION_AUDIT_LOG_QUERY_KEYS = [
  'actor_hsa_id',
  'action',
  'target_kind',
  'target_id',
  'client_ip',
  'decision',
  'from',
  'to',
  'page',
  'pageSize',
] as const

type ActionAuditLogQueryKey = (typeof ACTION_AUDIT_LOG_QUERY_KEYS)[number]

type ActionAuditLogQueryValues = Partial<Record<ActionAuditLogQueryKey, string>>

type ActionAuditLogHrefInput = {
  basePath: string
  overrides?: Record<string, number | string | null | undefined>
  preservedParams?: Record<string, string>
  query: ActionAuditLogSearchParams
}

export function firstSearchParamValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/u.test(value)) return undefined
  return Number(value)
}

function date(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(value)
      ? `${value}Z`
      : value,
  )
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function decision(value: string | undefined): ActionAuditDecision | undefined {
  return value === 'allowed' || value === 'denied' ? value : undefined
}

function clientIp(value: string | undefined): string | undefined {
  return value && isValidClientIp(value) ? value : undefined
}

export function actionAuditLogPageSize(
  query: ActionAuditLogSearchParams,
): number {
  return (
    positiveInteger(firstSearchParamValue(query.pageSize)) ??
    DEFAULT_ACTION_AUDIT_LOG_PAGE_SIZE
  )
}

export function actionAuditLogFiltersFromSearchParams(
  query: ActionAuditLogSearchParams,
): ActionAuditEventFilters {
  return {
    action: firstSearchParamValue(query.action),
    actorHsaId: firstSearchParamValue(query.actor_hsa_id),
    clientIp: clientIp(firstSearchParamValue(query.client_ip)),
    decision: decision(firstSearchParamValue(query.decision)),
    from: date(firstSearchParamValue(query.from)),
    page: positiveInteger(firstSearchParamValue(query.page)),
    pageSize: positiveInteger(firstSearchParamValue(query.pageSize)),
    targetId: firstSearchParamValue(query.target_id),
    targetKind: firstSearchParamValue(query.target_kind),
    to: date(firstSearchParamValue(query.to)),
  }
}

export function pickActionAuditLogQuery(
  query: ActionAuditLogSearchParams,
): ActionAuditLogQueryValues {
  const picked: ActionAuditLogQueryValues = {}

  for (const key of ACTION_AUDIT_LOG_QUERY_KEYS) {
    const value = firstSearchParamValue(query[key])
    if (value) {
      picked[key] = value
    }
  }

  return picked
}

export function actionAuditLogHref({
  basePath,
  overrides,
  preservedParams = {},
  query,
}: ActionAuditLogHrefInput): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(preservedParams)) {
    if (value) {
      params.set(key, value)
    }
  }

  for (const [key, value] of Object.entries(pickActionAuditLogQuery(query))) {
    if (value) {
      params.set(key, value)
    }
  }

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value == null || value === '') {
      params.delete(key)
    } else {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()
  return queryString ? `${basePath}?${queryString}` : basePath
}

export function actionAuditLogCsvHref(
  query: ActionAuditLogSearchParams,
): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(pickActionAuditLogQuery(query))) {
    if (value) {
      params.set(key, value)
    }
  }

  params.set('format', 'csv')
  return `/api/admin/audit-events?${params.toString()}`
}
