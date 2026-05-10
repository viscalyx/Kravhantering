import { redactSensitiveText } from '@/lib/http/safe-errors'
import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import { recordAuthorizationDenied } from '@/lib/requirements/security-audit'
import type { ResponseFormat, ResponseLocale } from '@/lib/requirements/service'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

export function clampLimit(limit?: number) {
  if (limit == null) {
    return DEFAULT_PAGE_SIZE
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE)
}

export function clampOffset(offset?: number) {
  if (offset == null || Number.isNaN(offset)) {
    return 0
  }

  return Math.max(Math.trunc(offset), 0)
}

export function localizeName(
  value: { nameEn?: string | null; nameSv?: string | null } | null | undefined,
  locale: ResponseLocale,
) {
  if (!value) {
    return null
  }

  return locale === 'sv' ? (value.nameSv ?? null) : (value.nameEn ?? null)
}

export function createServiceMessage(
  title: string,
  lines: string[],
  responseFormat: ResponseFormat,
) {
  if (responseFormat === 'json') {
    return JSON.stringify({ title, lines }, null, 2)
  }

  return [`## ${title}`, ...lines].join('\n')
}

export function getVersionDisplayName(
  status: { nameEn?: string | null; nameSv?: string | null } | null | undefined,
  locale: ResponseLocale,
) {
  return localizeName(status, locale) ?? (locale === 'sv' ? 'Okand' : 'Unknown')
}

export function getRequirementWord(locale: ResponseLocale, count: number) {
  if (locale === 'sv') {
    return 'krav'
  }

  return count === 1 ? 'requirement' : 'requirements'
}

export function getSpecificationWord(locale: ResponseLocale, count: number) {
  if (locale === 'sv') {
    return 'kravunderlag'
  }

  return count === 1 ? 'specification' : 'specifications'
}

export function getSpecificationServiceTitle(
  kind: 'add' | 'items' | 'list' | 'remove',
  locale: ResponseLocale,
) {
  if (locale === 'sv') {
    switch (kind) {
      case 'add':
        return 'Krav tillagda i kravunderlag'
      case 'items':
        return 'Krav i kravunderlag'
      case 'remove':
        return 'Krav borttagna fran kravunderlag'
      default:
        return 'Kravunderlag'
    }
  }

  switch (kind) {
    case 'add':
      return 'Requirements Added to Specification'
    case 'items':
      return 'Specification Requirements'
    case 'remove':
      return 'Requirements Removed from Specification'
    default:
      return 'Requirements Specifications'
  }
}

export async function authorize(
  authorization: AuthorizationService,
  action: RequirementsAction,
  context: RequestContext,
): Promise<void> {
  try {
    await authorization.assertAuthorized(action, context)
  } catch (error) {
    recordAuthorizationDenied(context, action, error)
    throw error
  }
}

export async function withLogging<T>(
  logger: RequirementsLogger,
  context: RequestContext,
  event: string,
  metadata: Record<string, string | number | boolean | null | undefined>,
  operation: () => Promise<T>,
) {
  const startedAt = Date.now()

  try {
    const result = await operation()
    logger.info(event, {
      actor_id: context.actor.id,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      duration_ms: Date.now() - startedAt,
      ...metadata,
    })
    return result
  } catch (error) {
    logger.error(`${event}.failed`, {
      actor_id: context.actor.id,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      duration_ms: Date.now() - startedAt,
      error:
        error instanceof Error
          ? redactSensitiveText(error.message)
          : 'Unknown requirements error',
      ...metadata,
    })
    throw error
  }
}
