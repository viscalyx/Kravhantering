// cSpell:words traceparent TRACEPARENT

export interface RequestCorrelationIds {
  correlationId: string
  requestId: string
}

const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,128}$/
const TRACEPARENT_PATTERN = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i

function randomId(): string {
  return crypto.randomUUID()
}

export function normalizeExternalId(value: string | null): string | null {
  const normalized = value?.trim()
  if (!normalized) return null
  return EXTERNAL_ID_PATTERN.test(normalized) ? normalized : null
}

export function correlationIdFromTraceparent(
  value: string | null,
): string | null {
  const match = value?.trim().match(TRACEPARENT_PATTERN)
  return match?.[1]?.toLowerCase() ?? null
}

export function resolveRequestCorrelationIds(
  headers: Headers,
): RequestCorrelationIds {
  const requestId =
    normalizeExternalId(headers.get('x-request-id')) ?? randomId()
  const correlationId =
    normalizeExternalId(headers.get('x-correlation-id')) ??
    correlationIdFromTraceparent(headers.get('traceparent')) ??
    requestId

  return { correlationId, requestId }
}

export function applyRequestCorrelationHeaders(
  headers: Headers,
  ids: RequestCorrelationIds,
): Headers {
  headers.set('x-request-id', ids.requestId)
  headers.set('x-correlation-id', ids.correlationId)
  return headers
}

export function applyResponseCorrelationHeaders(
  response: Response,
  ids: RequestCorrelationIds,
): Response {
  response.headers.set('X-Request-Id', ids.requestId)
  response.headers.set('X-Correlation-Id', ids.correlationId)
  return response
}
