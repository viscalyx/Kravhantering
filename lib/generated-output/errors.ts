import {
  requestErrorLocale,
  serviceLimitMessage,
} from '@/lib/http/service-limit-message'
export type GeneratedOutputKind = 'csv' | 'json' | 'pdf'
export type GeneratedOutputErrorCode =
  | 'actor_rate_limit'
  | 'actor_concurrency_limit'
  | 'quota_check_unavailable'
  | 'capacity_busy'
  | 'generation_timeout'
  | 'output_limit_exceeded'
  | 'pdf_worker_failed'
  | 'pdf_worker_memory_exceeded'
  | 'temporary_storage_unavailable'

export type GeneratedOutputCapacityReason =
  | 'actor_rate_limit'
  | 'actor_concurrency_limit'
  | 'quota_check_unavailable'
  | 'byte_limit_exceeded'
  | 'client_cancelled'
  | 'concurrency_limit'
  | 'generation_timeout'
  | 'item_limit_exceeded'
  | 'temporary_storage_unavailable'
  | 'worker_failed'
  | 'worker_memory_exceeded'

export interface GeneratedOutputErrorDetails {
  activeLimit?: number
  limit?: number
  limitKind?: 'bytes' | 'items'
  output: GeneratedOutputKind
  retryAfterSeconds?: number
  timeoutSeconds?: number
}

const FALLBACK_MESSAGES: Record<GeneratedOutputErrorCode, string> = {
  actor_rate_limit: 'You have reached your export and report limit.',
  actor_concurrency_limit:
    'Your export and report active-work limit has been reached.',
  quota_check_unavailable:
    'We could not check whether a new export or report can start. Please try again shortly.',
  capacity_busy: 'Generation capacity is temporarily busy.',
  generation_timeout: 'Output generation exceeded its configured time limit.',
  output_limit_exceeded: 'Output exceeds its configured limit.',
  pdf_worker_failed: 'The PDF renderer failed.',
  pdf_worker_memory_exceeded:
    'The PDF renderer exceeded its configured memory limit.',
  temporary_storage_unavailable: 'Temporary storage is unavailable.',
}

const STATUS_BY_CODE: Record<GeneratedOutputErrorCode, 422 | 429 | 503> = {
  actor_rate_limit: 429,
  actor_concurrency_limit: 429,
  quota_check_unavailable: 503,
  capacity_busy: 429,
  generation_timeout: 503,
  output_limit_exceeded: 422,
  pdf_worker_failed: 503,
  pdf_worker_memory_exceeded: 503,
  temporary_storage_unavailable: 503,
}

export class GeneratedOutputError extends Error {
  readonly capacityReason: GeneratedOutputCapacityReason
  readonly code: GeneratedOutputErrorCode
  readonly details: GeneratedOutputErrorDetails
  readonly status: 422 | 429 | 503

  constructor(
    code: GeneratedOutputErrorCode,
    capacityReason: GeneratedOutputCapacityReason,
    details: GeneratedOutputErrorDetails,
    options?: ErrorOptions,
  ) {
    super(FALLBACK_MESSAGES[code], options)
    this.name = 'GeneratedOutputError'
    this.capacityReason = capacityReason
    this.code = code
    this.details = sanitizeGeneratedOutputDetails(details)
    this.status = STATUS_BY_CODE[code]
  }
}

export function isGeneratedOutputError(
  error: unknown,
): error is GeneratedOutputError {
  return error instanceof GeneratedOutputError
}

export function sanitizeGeneratedOutputDetails(
  details: GeneratedOutputErrorDetails,
): GeneratedOutputErrorDetails {
  const safe: GeneratedOutputErrorDetails = { output: details.output }
  if (isBoundedInteger(details.activeLimit, 1, 10))
    safe.activeLimit = details.activeLimit
  if (details.limitKind === 'bytes' || details.limitKind === 'items') {
    safe.limitKind = details.limitKind
  }
  if (isBoundedInteger(details.limit, 0, 2_147_483_647)) {
    safe.limit = details.limit
  }
  if (isBoundedInteger(details.retryAfterSeconds, 0, 600)) {
    safe.retryAfterSeconds = details.retryAfterSeconds
  }
  if (isBoundedInteger(details.timeoutSeconds, 0, 600)) {
    safe.timeoutSeconds = details.timeoutSeconds
  }
  return safe
}

export function generatedOutputErrorResponse(
  error: GeneratedOutputError,
  request?: Request,
): Response {
  const status = STATUS_BY_CODE[error.code]
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  })
  if (
    error.details.retryAfterSeconds != null ||
    error.code === 'capacity_busy'
  ) {
    headers.set('Retry-After', String(error.details.retryAfterSeconds ?? 5))
  }
  if (
    request &&
    (request.headers.get('accept')?.includes('text/html') ||
      request.headers.get('sec-fetch-mode') === 'navigate')
  ) {
    const locale = requestErrorLocale(request)
    const message =
      serviceLimitMessage(error.code, error.details, locale) ??
      FALLBACK_MESSAGES[error.code]
    const escaped = message.replace(
      /[&<>"']/g,
      character =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] ?? '',
    )
    headers.set('Content-Type', 'text/html; charset=utf-8')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    )
    return new Response(
      `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${status}</title><main><h1>${status}</h1><p>${escaped}</p></main></html>`,
      { status, headers },
    )
  }
  return Response.json(
    {
      code: error.code,
      details: error.details,
      error: error.message,
    },
    { headers, status },
  )
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}
