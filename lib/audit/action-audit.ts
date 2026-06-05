import { isValidClientIp } from '@/lib/auth/client-ip'
import type { SqlServerDatabase } from '@/lib/db'
import { exportToCsv } from '@/lib/export-csv'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError, unauthorizedError } from '@/lib/requirements/errors'
import type {
  ActionAuditActorKind,
  ActionAuditDecision,
} from '@/lib/typeorm/entities/action-audit-event'
import { toIsoString } from '@/lib/typeorm/value-mappers'

export type {
  ActionAuditActorKind,
  ActionAuditDecision,
} from '@/lib/typeorm/entities/action-audit-event'

export type ActionAuditDetailValue =
  | boolean
  | number
  | readonly boolean[]
  | readonly number[]
  | readonly string[]
  | string

export interface ActionAuditEventInput {
  action: string
  actorClientId?: string | null
  actorDisplayName?: string | null
  actorHsaId?: string | null
  actorKind: ActionAuditActorKind
  clientIp?: string | null
  correlationId?: string | null
  decision: ActionAuditDecision
  denialReason?: string | null
  details?: Record<string, ActionAuditDetailValue | null | undefined>
  occurredAt?: Date
  requestId?: string | null
  targetId?: number | string | null
  targetKind: string
  targetUniqueId?: string | null
}

export interface ActionAuditEventRow {
  action: string
  actorClientId: string | null
  actorDisplayName: string | null
  actorHsaId: string | null
  actorKind: ActionAuditActorKind
  clientIp: string | null
  correlationId: string | null
  decision: ActionAuditDecision
  denialReason: string | null
  detailsJson: string | null
  id: string
  occurredAt: string
  requestId: string | null
  targetId: string | null
  targetKind: string
  targetUniqueId: string | null
}

export interface ActionAuditEventFilters {
  action?: string
  actorHsaId?: string
  clientIp?: string
  decision?: ActionAuditDecision
  from?: Date
  page?: number
  pageSize?: number
  targetId?: string
  targetKind?: string
  to?: Date
}

export interface ActionAuditEventListResult {
  events: ActionAuditEventRow[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export type ActionAuditCsvLocale = 'en' | 'sv'

interface ActionAuditCsvColumn {
  header: Record<ActionAuditCsvLocale, string>
  value: (event: ActionAuditEventRow, locale: ActionAuditCsvLocale) => string
}

const ACTION_AUDIT_CSV_COLUMNS: ActionAuditCsvColumn[] = [
  {
    header: { en: 'Occurred', sv: 'Tidpunkt' },
    value: event => event.occurredAt,
  },
  {
    header: { en: 'Actor type', sv: 'Aktörstyp' },
    value: event => event.actorKind,
  },
  {
    header: { en: 'Actor HSA-ID', sv: 'Aktörens HSA-ID' },
    value: event => event.actorHsaId ?? '',
  },
  {
    header: { en: 'Actor display name', sv: 'Aktörsnamn' },
    value: event => event.actorDisplayName ?? '',
  },
  {
    header: { en: 'Actor client ID', sv: 'Aktörens klient-ID' },
    value: event => event.actorClientId ?? '',
  },
  {
    header: { en: 'Action', sv: 'Åtgärd' },
    value: event => event.action,
  },
  {
    header: { en: 'Target type', sv: 'Måltyp' },
    value: event => event.targetKind,
  },
  {
    header: { en: 'Target ID', sv: 'Mål-ID' },
    value: event => event.targetId ?? '',
  },
  {
    header: { en: 'Target unique ID', sv: 'Målets unika ID' },
    value: event => event.targetUniqueId ?? '',
  },
  {
    header: { en: 'Decision', sv: 'Beslut' },
    value: (event, locale) =>
      event.decision === 'allowed'
        ? locale === 'sv'
          ? 'Tillåten'
          : 'Allowed'
        : locale === 'sv'
          ? 'Nekad'
          : 'Denied',
  },
  {
    header: { en: 'Denial reason', sv: 'Orsak' },
    value: event => event.denialReason ?? '',
  },
  {
    header: { en: 'Request ID', sv: 'Request-ID' },
    value: event => event.requestId ?? '',
  },
  {
    header: { en: 'Correlation ID', sv: 'Korrelations-ID' },
    value: event => event.correlationId ?? '',
  },
  {
    header: { en: 'Client IP', sv: 'Klient-IP' },
    value: event => event.clientIp ?? '',
  },
  {
    header: { en: 'Details JSON', sv: 'Detaljer JSON' },
    value: event => event.detailsJson ?? '',
  },
]

export interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

const MAX_DETAIL_KEYS = 30
const MAX_DETAIL_STRING_LENGTH = 255
const MAX_DETAIL_ARRAY_LENGTH = 50
const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50
const REDACTED_DETAIL_VALUE = '[REDACTED]'

const DETAIL_KEY_DENY_LIST: readonly RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /prompt/i,
  /description/i,
  /acceptance/i,
  /motivation/i,
  /comment/i,
  /content/i,
  /^text$/i,
  /email/i,
  /hsa/i,
  /display.*name/i,
]

const DETAIL_VALUE_DENY_LIST: readonly RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\bSE\d{10}-[A-Za-z0-9_-]+\b/u,
  /\b(?:19|20)?\d{6}[-+]\d{4}\b/u,
  /\b\d{10,16}\b/u,
  /\b[0-9a-f]{32,}\b/iu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/u,
  /\b(?:api[_-]?key|authorization|bearer|secret|token)\s*[:=]\s*["']?[^"',\s}]+/iu,
  /^sk-[A-Za-z0-9_-]{20,}$/u,
]

function boundedString(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`Action audit field ${field} is required`)
  }
  return trimmed
}

function nullableBoundedString(
  value: number | string | null | undefined,
  maxLength: number,
): string | null {
  if (value == null) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function safeDenialReason(value: string | null | undefined): string | null {
  return nullableBoundedString(value, 255)
}

function isDeniedDetailKey(key: string): boolean {
  return DETAIL_KEY_DENY_LIST.some(pattern => pattern.test(key))
}

function sanitizeDetailString(value: string): string {
  return DETAIL_VALUE_DENY_LIST.some(pattern => pattern.test(value))
    ? REDACTED_DETAIL_VALUE
    : value
}

function normalizeDetailValue(
  value: ActionAuditDetailValue,
): ActionAuditDetailValue {
  if (typeof value === 'string') {
    return sanitizeDetailString(value).slice(0, MAX_DETAIL_STRING_LENGTH)
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DETAIL_ARRAY_LENGTH)
      .map(item =>
        typeof item === 'string'
          ? sanitizeDetailString(item).slice(0, MAX_DETAIL_STRING_LENGTH)
          : item,
      )
  }
  return value
}

function detailsJson(details: ActionAuditEventInput['details']): string | null {
  if (!details) return null
  const out: Record<string, ActionAuditDetailValue> = {}
  for (const [key, value] of Object.entries(details)) {
    if (value == null || isDeniedDetailKey(key)) continue
    if (Object.keys(out).length >= MAX_DETAIL_KEYS) break
    out[key] = normalizeDetailValue(value)
  }
  return Object.keys(out).length === 0 ? null : JSON.stringify(out)
}

export function actionAuditActorFromContext(context: RequestContext): {
  actorClientId: string | null
  actorDisplayName: string | null
  actorHsaId: string | null
  actorKind: ActionAuditActorKind
} {
  if (context.source === 'mcp' || context.actor.source === 'mcp') {
    return {
      actorClientId: context.actor.id ?? context.toolName ?? null,
      actorDisplayName: context.actor.displayName || null,
      actorHsaId: context.actor.hsaId?.startsWith('mcp-')
        ? null
        : (context.actor.hsaId ?? null),
      actorKind: 'mcp_client',
    }
  }

  return {
    actorClientId: null,
    actorDisplayName: context.actor.displayName || null,
    actorHsaId: context.actor.hsaId ?? null,
    actorKind: context.actor.isAuthenticated ? 'user' : 'system',
  }
}

export async function recordActionAuditEvent(
  executor: QueryExecutor,
  input: ActionAuditEventInput,
): Promise<void> {
  await executor.query(
    `INSERT INTO action_audit_events (
      occurred_at,
      actor_hsa_id,
      actor_display_name,
      actor_kind,
      actor_client_id,
      action,
      target_kind,
      target_id,
      target_unique_id,
      decision,
      denial_reason,
      request_id,
      correlation_id,
      client_ip,
      details_json
    ) VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14)`,
    [
      input.occurredAt ?? new Date(),
      nullableBoundedString(input.actorHsaId, 64),
      nullableBoundedString(input.actorDisplayName, 512),
      input.actorKind,
      nullableBoundedString(input.actorClientId, 255),
      boundedString(input.action, 'action').slice(0, 64),
      boundedString(input.targetKind, 'targetKind').slice(0, 64),
      nullableBoundedString(input.targetId, 255),
      nullableBoundedString(input.targetUniqueId, 255),
      input.decision,
      safeDenialReason(input.denialReason),
      nullableBoundedString(input.requestId, 64),
      nullableBoundedString(input.correlationId, 64),
      isValidClientIp(input.clientIp) ? input.clientIp : null,
      detailsJson(input.details),
    ],
  )
}

export async function recordAllowedActionAuditEvent(
  executor: QueryExecutor,
  context: RequestContext,
  input: Omit<
    ActionAuditEventInput,
    | 'actorClientId'
    | 'actorDisplayName'
    | 'actorHsaId'
    | 'actorKind'
    | 'clientIp'
    | 'correlationId'
    | 'decision'
    | 'requestId'
  >,
): Promise<void> {
  await recordAllowedActionAuditEventWithExecutor(executor, context, input)
}

export async function recordAllowedActionAuditEventWithExecutor(
  executor: QueryExecutor,
  context: RequestContext,
  input: Omit<
    ActionAuditEventInput,
    | 'actorClientId'
    | 'actorDisplayName'
    | 'actorHsaId'
    | 'actorKind'
    | 'clientIp'
    | 'correlationId'
    | 'decision'
    | 'requestId'
  >,
): Promise<void> {
  await recordActionAuditEvent(executor, {
    ...actionAuditActorFromContext(context),
    ...input,
    clientIp: context.request?.ip ?? null,
    correlationId: context.correlationId,
    decision: 'allowed',
    requestId: context.requestId,
  })
}

export async function recordDeniedActionAuditEvent(
  db: SqlServerDatabase,
  context: RequestContext,
  input: Omit<
    ActionAuditEventInput,
    | 'actorClientId'
    | 'actorDisplayName'
    | 'actorHsaId'
    | 'actorKind'
    | 'clientIp'
    | 'correlationId'
    | 'decision'
    | 'requestId'
  >,
): Promise<void> {
  await db.transaction(async manager => {
    await recordActionAuditEvent(manager, {
      ...actionAuditActorFromContext(context),
      ...input,
      clientIp: context.request?.ip ?? null,
      correlationId: context.correlationId,
      decision: 'denied',
      requestId: context.requestId,
    })
  })
}

function mapRow(row: Record<string, unknown>): ActionAuditEventRow {
  return {
    action: String(row.action ?? ''),
    actorClientId: row.actorClientId == null ? null : String(row.actorClientId),
    actorDisplayName:
      row.actorDisplayName == null ? null : String(row.actorDisplayName),
    actorHsaId: row.actorHsaId == null ? null : String(row.actorHsaId),
    actorKind: String(row.actorKind ?? 'system') as ActionAuditActorKind,
    clientIp: row.clientIp == null ? null : String(row.clientIp),
    correlationId: row.correlationId == null ? null : String(row.correlationId),
    decision: String(row.decision ?? 'allowed') as ActionAuditDecision,
    denialReason: row.denialReason == null ? null : String(row.denialReason),
    detailsJson: row.detailsJson == null ? null : String(row.detailsJson),
    id: String(row.id ?? ''),
    occurredAt: toIsoString(row.occurredAt as Date | string),
    requestId: row.requestId == null ? null : String(row.requestId),
    targetId: row.targetId == null ? null : String(row.targetId),
    targetKind: String(row.targetKind ?? ''),
    targetUniqueId:
      row.targetUniqueId == null ? null : String(row.targetUniqueId),
  }
}

function pageSize(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(Math.trunc(value), 1), MAX_PAGE_SIZE)
}

function page(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1
  return Math.max(Math.trunc(value), 1)
}

export async function listActionAuditEvents(
  db: SqlServerDatabase,
  filters: ActionAuditEventFilters = {},
): Promise<ActionAuditEventListResult> {
  const where: string[] = []
  const params: unknown[] = []
  const addParam = (value: unknown) => {
    params.push(value)
    return `@${params.length - 1}`
  }

  if (filters.actorHsaId) {
    where.push(`actor_hsa_id = ${addParam(filters.actorHsaId)}`)
  }
  if (filters.clientIp) {
    where.push(`client_ip = ${addParam(filters.clientIp)}`)
  }
  if (filters.action) {
    where.push(`action = ${addParam(filters.action)}`)
  }
  if (filters.targetKind) {
    where.push(`target_kind = ${addParam(filters.targetKind)}`)
  }
  if (filters.targetId) {
    where.push(`target_id = ${addParam(filters.targetId)}`)
  }
  if (filters.decision) {
    where.push(`decision = ${addParam(filters.decision)}`)
  }
  if (filters.from) {
    where.push(`occurred_at >= ${addParam(filters.from)}`)
  }
  if (filters.to) {
    where.push(`occurred_at <= ${addParam(filters.to)}`)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const currentPage = page(filters.page)
  const currentPageSize = pageSize(filters.pageSize)
  const offset = (currentPage - 1) * currentPageSize

  const countRows = (await db.query(
    `SELECT COUNT(*) AS count FROM action_audit_events ${whereSql}`,
    params,
  )) as Array<Record<string, unknown>>
  const total = Number(countRows[0]?.count ?? 0)
  const rows = (await db.query(
    `SELECT
      id,
      occurred_at AS occurredAt,
      actor_hsa_id AS actorHsaId,
      actor_display_name AS actorDisplayName,
      actor_kind AS actorKind,
      actor_client_id AS actorClientId,
      action,
      target_kind AS targetKind,
      target_id AS targetId,
      target_unique_id AS targetUniqueId,
      decision,
      denial_reason AS denialReason,
      request_id AS requestId,
      correlation_id AS correlationId,
      client_ip AS clientIp,
      details_json AS detailsJson
    FROM action_audit_events
    ${whereSql}
    ORDER BY occurred_at DESC, id DESC
    OFFSET ${addParam(offset)} ROWS FETCH NEXT ${addParam(currentPageSize)} ROWS ONLY`,
    params,
  )) as Array<Record<string, unknown>>

  return {
    events: rows.map(mapRow),
    pagination: {
      page: currentPage,
      pageSize: currentPageSize,
      total,
    },
  }
}

export function actionAuditEventsToCsv(
  events: ActionAuditEventRow[],
  locale: ActionAuditCsvLocale = 'en',
): string {
  const headers = ACTION_AUDIT_CSV_COLUMNS.map(column => column.header[locale])
  return exportToCsv(
    headers,
    events.map(event =>
      Object.fromEntries(
        ACTION_AUDIT_CSV_COLUMNS.map(column => [
          column.header[locale],
          column.value(event, locale),
        ]),
      ),
    ),
  )
}

export function assertAdminForActionAudit(context: RequestContext): void {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError()
  }
  if (!context.actor.roles.includes('Admin')) {
    throw forbiddenError('Admin role is required for action audit events', {
      reason: 'admin_required',
      requiredRoles: ['Admin'],
    })
  }
}
