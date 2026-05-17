import type {
  Attributes,
  MetricAttributes,
  SpanAttributes,
} from '@opentelemetry/api'
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api'
import type { LogAttributes } from '@opentelemetry/api-logs'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { redactSensitiveText } from '@/lib/http/safe-errors'
import { isOpenTelemetryEnabled } from '@/lib/observability/otel-config'

export type CapacityOtelValue = boolean | number | string | null
export type CapacityOtelPayload = Record<string, CapacityOtelValue>

const tracer = trace.getTracer('kravhantering.capacity')
const meter = metrics.getMeter('kravhantering.capacity')
const logger = logs.getLogger('kravhantering.capacity')

const eventCounter = meter.createCounter('kravhantering.capacity.events', {
  description: 'Capacity observability events emitted by Kravhantering.',
  unit: '{event}',
})
const throttledCounter = meter.createCounter(
  'kravhantering.capacity.throttled',
  {
    description: 'Capacity events that represent throttled requests.',
    unit: '{request}',
  },
)
const durationHistogram = meter.createHistogram(
  'kravhantering.capacity.duration',
  {
    description: 'Measured operation duration.',
    unit: 'ms',
  },
)
const itemCountHistogram = meter.createHistogram(
  'kravhantering.capacity.item_count',
  {
    description: 'Items processed by measured operations.',
    unit: '{item}',
  },
)
const imageCountHistogram = meter.createHistogram(
  'kravhantering.capacity.image_count',
  {
    description: 'Images processed by measured operations.',
    unit: '{image}',
  },
)
const imageBytesHistogram = meter.createHistogram(
  'kravhantering.capacity.image_bytes',
  {
    description: 'Image bytes processed by measured operations.',
    unit: 'By',
  },
)
const tokenCountHistogram = meter.createHistogram(
  'kravhantering.capacity.token_count',
  {
    description: 'Tokens used by measured operations.',
    unit: '{token}',
  },
)
const costHistogram = meter.createHistogram('kravhantering.capacity.cost', {
  description: 'Provider cost reported by measured operations.',
  unit: 'USD',
})

function isAttributeValue(
  value: CapacityOtelValue | undefined,
): value is boolean | number | string {
  return value !== null && value !== undefined
}

function asNumber(value: CapacityOtelValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getString(value: CapacityOtelValue | undefined): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : 'unknown'
}

function getStatusCodeLabel(value: CapacityOtelValue | undefined): string {
  const statusCode = asNumber(value)
  if (statusCode === null) return 'unknown'
  const normalized = Math.trunc(statusCode)
  if (normalized < 100 || normalized > 599) return 'unknown'
  return String(normalized)
}

function getMetricAttributes(payload: CapacityOtelPayload): MetricAttributes {
  return {
    event: getString(payload.event),
    operation: getString(payload.operation),
    outcome: getString(payload.outcome),
    source: getString(payload.source),
    status_code: getStatusCodeLabel(payload.status_code),
  }
}

function getSignalAttributes(payload: CapacityOtelPayload): Attributes {
  const attributes: Attributes = {}
  for (const [key, value] of Object.entries(payload)) {
    if (isAttributeValue(value)) {
      attributes[key] = value
    }
  }
  return attributes
}

function getSeverityNumber(level: CapacityOtelValue | undefined): number {
  if (level === 'error') return SeverityNumber.ERROR
  if (level === 'warn') return SeverityNumber.WARN
  return SeverityNumber.INFO
}

function getSpanStartAndEnd(payload: CapacityOtelPayload): {
  endTime?: Date
  startTime?: Date
} {
  const durationMs = asNumber(payload.duration_ms)
  const ts =
    typeof payload.ts === 'string' ? Date.parse(payload.ts) : Number.NaN
  if (durationMs === null || !Number.isFinite(ts)) return {}

  return {
    endTime: new Date(ts),
    startTime: new Date(ts - durationMs),
  }
}

function recordMetrics(payload: CapacityOtelPayload): void {
  const attributes = getMetricAttributes(payload)
  eventCounter.add(1, attributes)

  if (payload.event === 'capacity.throttled' || payload.throttled === true) {
    throttledCounter.add(1, attributes)
  }

  const durationMs = asNumber(payload.duration_ms)
  const itemCount = asNumber(payload.item_count)
  const imageCount = asNumber(payload.image_count)
  const imageBytes = asNumber(payload.image_bytes)
  const tokenCount = asNumber(payload.token_count)
  const cost = asNumber(payload.cost)

  if (durationMs !== null) durationHistogram.record(durationMs, attributes)
  if (itemCount !== null) itemCountHistogram.record(itemCount, attributes)
  if (imageCount !== null) imageCountHistogram.record(imageCount, attributes)
  if (imageBytes !== null) imageBytesHistogram.record(imageBytes, attributes)
  if (tokenCount !== null) tokenCountHistogram.record(tokenCount, attributes)
  if (cost !== null) costHistogram.record(cost, attributes)
}

function recordSpan(payload: CapacityOtelPayload): void {
  const attributes = getSignalAttributes(payload) as SpanAttributes
  const { endTime, startTime } = getSpanStartAndEnd(payload)
  const span = tracer.startSpan(`capacity ${getString(payload.operation)}`, {
    attributes,
    startTime,
  })
  span.addEvent(getString(payload.event), attributes)
  span.setStatus({
    code:
      payload.outcome === 'failure' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
  })
  span.end(endTime)
}

function recordLog(payload: CapacityOtelPayload): void {
  const attributes = getSignalAttributes(payload) as LogAttributes
  const severityNumber = getSeverityNumber(payload.level)
  logger.emit({
    attributes,
    body: getString(payload.event),
    severityNumber,
    severityText: getString(payload.level).toUpperCase(),
  })
}

export function recordCapacityOtelEvent(payload: CapacityOtelPayload): void {
  if (!isOpenTelemetryEnabled()) return

  try {
    recordMetrics(payload)
    recordSpan(payload)
    recordLog(payload)
  } catch (error) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[capacity-observability] failed to export OpenTelemetry event',
        redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
      )
    } catch {
      /* OpenTelemetry export must never break the request path */
    }
  }
}
