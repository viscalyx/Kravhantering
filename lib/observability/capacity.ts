import { redactSensitiveText } from '@/lib/http/safe-errors'
import {
  type RequestCorrelationIds,
  resolveRequestCorrelationIds,
} from '@/lib/observability/request-ids'

export type CapacityEventName =
  | 'capacity.operation.completed'
  | 'capacity.operation.failed'
  | 'capacity.threshold_exceeded'
  | 'capacity.throttled'

export type CapacityEventLevel = 'error' | 'info' | 'warn'
export type CapacityEventOutcome = 'failure' | 'success' | 'throttled'
export type CapacityEventSource = 'mcp' | 'rest' | 'server'
export type CapacityPageSurface = 'editor-preload' | 'mcp' | 'rest'
export type CapacityCursorFailureCategory = 'invalid_cursor'

export interface CapacityMetrics {
  continuation_available?: boolean | null
  cost?: number | null
  image_bytes?: number | null
  image_count?: number | null
  item_count?: number | null
  page_limit?: number | null
  returned_count?: number | null
  throttled?: boolean | null
  token_count?: number | null
}

export interface CapacityEventInput extends Partial<RequestCorrelationIds> {
  cursorFailureCategory?: CapacityCursorFailureCategory
  durationMs?: number
  event: CapacityEventName
  level?: CapacityEventLevel
  metrics?: CapacityMetrics
  operation: string
  outcome: CapacityEventOutcome
  request?: Request
  retryAfterSeconds?: number
  source: CapacityEventSource
  statusCode?: number
  surface?: CapacityPageSurface
  toolName?: string
}

export interface ObserveCapacityOptions extends Partial<RequestCorrelationIds> {
  metrics?: CapacityMetrics
  operation: string
  request?: Request
  slowThresholdMs?: number
  source: CapacityEventSource
  statusCode?: number
  toolName?: string
}

type CapacityLogValue = boolean | number | string | null

function sanitizeOperation(value: string): string {
  return redactSensitiveText(value).slice(0, 160)
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function collectIds(
  input: Partial<RequestCorrelationIds> & { request?: Request },
) {
  if (input.request) {
    const ids = resolveRequestCorrelationIds(input.request.headers)
    return {
      correlationId: input.correlationId ?? ids.correlationId,
      requestId: input.requestId ?? ids.requestId,
    }
  }

  return {
    correlationId:
      input.correlationId ?? input.requestId ?? crypto.randomUUID(),
    requestId: input.requestId ?? crypto.randomUUID(),
  }
}

function writeCapacityLog(
  level: CapacityEventLevel,
  payload: Record<string, CapacityLogValue>,
): void {
  const serialized = JSON.stringify(payload)
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(serialized)
    return
  }

  // eslint-disable-next-line no-console
  console.info(serialized)
}

export function recordCapacityEvent(input: CapacityEventInput): void {
  try {
    const ids = collectIds(input)
    const level =
      input.level ?? (input.outcome === 'failure' ? 'error' : 'info')
    const metrics = input.metrics ?? {}
    const payload: Record<string, CapacityLogValue> = {
      channel: 'capacity-observability',
      ts: new Date().toISOString(),
      level,
      event: input.event,
      event_id: crypto.randomUUID(),
      request_id: ids.requestId,
      correlation_id: ids.correlationId,
      source: input.source,
      operation: sanitizeOperation(input.operation),
      outcome: input.outcome,
    }

    const durationMs = safeNumber(input.durationMs)
    const statusCode = safeNumber(input.statusCode)
    const retryAfterSeconds = safeNumber(input.retryAfterSeconds)
    const itemCount = safeNumber(metrics.item_count)
    const imageCount = safeNumber(metrics.image_count)
    const imageBytes = safeNumber(metrics.image_bytes)
    const tokenCount = safeNumber(metrics.token_count)
    const cost = safeNumber(metrics.cost)

    if (durationMs !== null) payload.duration_ms = durationMs
    if (statusCode !== null) payload.status_code = statusCode
    if (retryAfterSeconds !== null) {
      payload.retry_after_seconds = retryAfterSeconds
    }
    if (input.toolName) payload.tool_name = sanitizeOperation(input.toolName)
    if (input.surface) payload.surface = input.surface
    if (input.cursorFailureCategory) {
      payload.cursor_failure_category = input.cursorFailureCategory
    }
    if (itemCount !== null) payload.item_count = itemCount
    const returnedCount = safeNumber(metrics.returned_count)
    const pageLimit = safeNumber(metrics.page_limit)
    if (returnedCount !== null) payload.returned_count = returnedCount
    if (pageLimit !== null) payload.page_limit = pageLimit
    if (typeof metrics.continuation_available === 'boolean') {
      payload.continuation_available = metrics.continuation_available
    }
    if (imageCount !== null) payload.image_count = imageCount
    if (imageBytes !== null) payload.image_bytes = imageBytes
    if (tokenCount !== null) payload.token_count = tokenCount
    if (cost !== null) payload.cost = cost
    if (typeof metrics.throttled === 'boolean') {
      payload.throttled = metrics.throttled
    }

    writeCapacityLog(level, payload)
  } catch (error) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[capacity-observability] failed to record event',
        redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
      )
    } catch {
      /* capacity telemetry must never break the request path */
    }
  }
}

function recordThresholdIfNeeded(
  options: ObserveCapacityOptions,
  durationMs: number,
): void {
  if (!options.slowThresholdMs || durationMs < options.slowThresholdMs) return

  recordCapacityEvent({
    ...options,
    durationMs,
    event: 'capacity.threshold_exceeded',
    level: 'warn',
    metrics: options.metrics,
    operation: options.operation,
    outcome: 'success',
    source: options.source,
    statusCode: options.statusCode,
  })
}

export async function observeCapacity<T>(
  options: ObserveCapacityOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()

  try {
    const result = await operation()
    const durationMs = Date.now() - startedAt
    const statusCode =
      result instanceof Response ? result.status : (options.statusCode ?? 200)
    recordCapacityEvent({
      ...options,
      durationMs,
      event: 'capacity.operation.completed',
      level: 'info',
      outcome: 'success',
      statusCode,
    })
    recordThresholdIfNeeded(options, durationMs)
    return result
  } catch (error) {
    const durationMs = Date.now() - startedAt
    recordCapacityEvent({
      ...options,
      durationMs,
      event: 'capacity.operation.failed',
      level: 'error',
      outcome: 'failure',
      statusCode: options.statusCode ?? 500,
    })
    recordThresholdIfNeeded(options, durationMs)
    throw error
  }
}
