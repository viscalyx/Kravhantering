import { redactSensitiveText } from '@/lib/http/safe-errors'
import {
  type CapacityMetrics,
  recordCapacityEvent,
} from '@/lib/observability/capacity'
import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import { recordAuthorizationDenied } from '@/lib/requirements/security-audit'
import type { ResponseFormat, ResponseLocale } from '@/lib/requirements/service'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200
const SERVICE_MESSAGES = {
  en: enMessages,
  sv: svMessages,
}

export type ServiceMessageKey =
  | 'requirements.catalogTitles.areas'
  | 'requirements.catalogTitles.categories'
  | 'requirements.catalogTitles.qualityCharacteristics'
  | 'requirements.catalogTitles.requirementPackages'
  | 'requirements.catalogTitles.requirements'
  | 'requirements.catalogTitles.riskLevels'
  | 'requirements.catalogTitles.statuses'
  | 'requirements.catalogTitles.transitions'
  | 'requirements.catalogTitles.types'
  | 'requirements.catalogTitles.usageStatuses'
  | 'requirements.specifications.add.count'
  | 'requirements.specifications.add.skipped'
  | 'requirements.specifications.graduate.summary'
  | 'requirements.specifications.graduate.title'
  | 'requirements.specifications.graduationTargets.summary'
  | 'requirements.specifications.graduationTargets.title'
  | 'requirements.specifications.items.count'
  | 'requirements.specifications.remove.count'
  | 'requirements.specifications.summary.count'
  | 'requirements.specifications.summary.none'

export function clampLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) {
    return DEFAULT_PAGE_SIZE
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE)
}

export function clampOffset(offset?: number): number {
  if (offset == null || Number.isNaN(offset)) {
    return 0
  }

  return Math.max(Math.trunc(offset), 0)
}

export function localizeName(
  value: { nameEn?: string | null; nameSv?: string | null } | null | undefined,
  locale: ResponseLocale,
): string | null {
  if (!value) {
    return null
  }

  return locale === 'sv' ? (value.nameSv ?? null) : (value.nameEn ?? null)
}

export function createServiceMessage(
  title: string,
  lines: string[],
  responseFormat: ResponseFormat,
): string {
  if (responseFormat === 'json') {
    return JSON.stringify({ title, lines }, null, 2)
  }

  return [`## ${title}`, ...lines].join('\n')
}

export function getVersionDisplayName(
  status: { nameEn?: string | null; nameSv?: string | null } | null | undefined,
  locale: ResponseLocale,
): string {
  return localizeName(status, locale) ?? (locale === 'sv' ? 'Okänd' : 'Unknown')
}

export function getRequirementWord(
  locale: ResponseLocale,
  count: number,
): string {
  if (locale === 'sv') {
    return 'krav'
  }

  return count === 1 ? 'requirement' : 'requirements'
}

export function getSpecificationWord(
  locale: ResponseLocale,
  count: number,
): string {
  if (locale === 'sv') {
    return 'kravunderlag'
  }

  return count === 1 ? 'specification' : 'specifications'
}

export function getSpecificationServiceTitle(
  kind: 'add' | 'items' | 'list' | 'remove',
  locale: ResponseLocale,
): string {
  if (locale === 'sv') {
    switch (kind) {
      case 'add':
        return 'Krav tillagda i kravunderlag'
      case 'items':
        return 'Kravtillämpningar'
      case 'remove':
        return 'Krav borttagna från kravunderlag'
      default:
        return 'Kravunderlag'
    }
  }

  switch (kind) {
    case 'add':
      return 'Requirements Added to Specification'
    case 'items':
      return 'Requirement Applications'
    case 'remove':
      return 'Requirements Removed from Specification'
    default:
      return 'Requirements specifications'
  }
}

function getServiceMessageTemplate(
  locale: ResponseLocale,
  key: ServiceMessageKey,
): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[part]
          : undefined,
      SERVICE_MESSAGES[locale],
    )

  return typeof value === 'string' ? value : key
}

export function translateServiceMessage(
  locale: ResponseLocale,
  key: ServiceMessageKey,
  values: Record<string, number | string> = {},
): string {
  return getServiceMessageTemplate(locale, key).replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  )
}

export async function authorize(
  authorization: AuthorizationService,
  action: RequirementsAction,
  context: RequestContext,
): Promise<void> {
  try {
    await authorization.assertAuthorized(action, context)
  } catch (error) {
    await recordAuthorizationDenied(context, action, error)
    throw error
  }
}

export async function withLogging<T>(
  logger: RequirementsLogger,
  context: RequestContext,
  event: string,
  metadata: Record<string, string | number | boolean | null | undefined>,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()

  try {
    const result = await operation()
    const durationMs = Date.now() - startedAt
    logger.info(event, {
      actor_id: context.actor.id,
      correlation_id: context.correlationId,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      duration_ms: durationMs,
      ...metadata,
    })
    recordCapacityEvent({
      correlationId: context.correlationId,
      durationMs,
      event: 'capacity.operation.completed',
      metrics: extractCapacityMetrics(result),
      operation: event,
      outcome: 'success',
      requestId: context.requestId,
      source: context.source,
      statusCode: 200,
      toolName: context.toolName,
    })
    return result
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const statusCode = getErrorStatusCode(error)
    logger.error(`${event}.failed`, {
      actor_id: context.actor.id,
      correlation_id: context.correlationId,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      duration_ms: durationMs,
      error:
        error instanceof Error
          ? redactSensitiveText(error.message)
          : 'Unknown requirements error',
      ...metadata,
    })
    recordCapacityEvent({
      correlationId: context.correlationId,
      durationMs,
      event: 'capacity.operation.failed',
      operation: event,
      outcome: 'failure',
      requestId: context.requestId,
      source: context.source,
      statusCode,
      toolName: context.toolName,
    })
    throw error
  }
}

function getErrorStatusCode(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' && Number.isInteger(status) ? status : 500
}

function extractCapacityMetrics(value: unknown): CapacityMetrics | undefined {
  if (!value || typeof value !== 'object') return undefined

  const record = value as {
    requirements?: unknown
    stats?: {
      cost?: unknown
      totalTokens?: unknown
    }
  }
  const metrics: CapacityMetrics = {}

  if (Array.isArray(record.requirements)) {
    metrics.item_count = record.requirements.length
  }

  if (record.stats && typeof record.stats === 'object') {
    if (typeof record.stats.totalTokens === 'number') {
      metrics.token_count = record.stats.totalTokens
    }
    if (typeof record.stats.cost === 'number') {
      metrics.cost = record.stats.cost
    }
  }

  return Object.keys(metrics).length > 0 ? metrics : undefined
}
