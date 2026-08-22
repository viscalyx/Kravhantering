import type {
  AiRunTelemetry,
  AiRunTelemetryEvent,
} from '@/lib/ai/run-coordinator'

type AiRunLogValue = boolean | number | string | null

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/u
const ALARM_NAMES = new Set([
  'ai_alarm_authentication_failed',
  'ai_alarm_breaker_opened',
  'ai_alarm_active_profile_blocked',
])

function safeIdentifier(value: string, field: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`Invalid ${field}.`)
  }
  return value
}

function safeInteger(value: number | undefined): number | null {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function usageValue(
  metric: AiRunTelemetryEvent['usage'] extends infer Usage
    ? Usage extends { totalTokens: infer Metric }
      ? Metric
      : never
    : never,
): number | null {
  if (!metric || metric.status === 'unavailable') return null
  return safeInteger(metric.value)
}

function writeAiRunLog(
  level: 'error' | 'info',
  payload: Record<string, AiRunLogValue>,
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

export function recordAiRunTelemetryEvent(
  event: Readonly<AiRunTelemetryEvent>,
): void {
  try {
    const level = ALARM_NAMES.has(event.name) ? 'error' : 'info'
    const payload: Record<string, AiRunLogValue> = {
      adapter_type: safeIdentifier(event.adapterType, 'adapter type'),
      adapter_version: safeIdentifier(event.adapterVersion, 'adapter version'),
      ai_connection_id: safeIdentifier(
        event.aiConnectionId,
        'AI connection identifier',
      ),
      ai_connection_model_revision_id: safeIdentifier(
        event.aiConnectionModelRevisionId,
        'AI connection model revision identifier',
      ),
      ai_run_profile_id: safeIdentifier(
        event.aiRunProfileId,
        'AI run profile identifier',
      ),
      ai_run_profile_configuration_version:
        event.aiRunProfileConfigurationVersion,
      application_run_id: safeIdentifier(
        event.applicationRunId,
        'application run identifier',
      ),
      channel: 'ai-run-observability',
      correlation_id: safeIdentifier(
        event.correlationId,
        'correlation identifier',
      ),
      event: event.name,
      event_id: crypto.randomUUID(),
      level,
      request_id: safeIdentifier(event.requestId, 'request identifier'),
      run_type: event.runType,
      ts: new Date().toISOString(),
    }
    const optionalIdentifiers = {
      actor_id: event.actorId,
      cancellation_reason: event.cancellationReason,
      failure_category: event.failureCategory,
      probe_kind: event.probeKind,
    }
    for (const [field, value] of Object.entries(optionalIdentifiers)) {
      if (value !== undefined) payload[field] = safeIdentifier(value, field)
    }
    if (event.outcome) payload.outcome = event.outcome
    if (event.breakerStatus) payload.breaker_status = event.breakerStatus
    if (event.healthStatus) payload.health_status = event.healthStatus

    const integerFields = {
      active_concurrency: event.activeConcurrency,
      attempt: event.attempt,
      duration_ms: event.durationMs,
      queue_depth: event.queueDepth,
      queue_wait_ms: event.queueWaitMs,
      retry_count: event.retryCount,
      time_to_first_analysis_delta_ms: event.timeToFirstAnalysisDeltaMs,
      time_to_first_delta_ms: event.timeToFirstDeltaMs,
      time_to_first_output_delta_ms: event.timeToFirstOutputDeltaMs,
    }
    for (const [field, value] of Object.entries(integerFields)) {
      const normalized = safeInteger(value)
      if (normalized !== null) payload[field] = normalized
    }

    if (event.usage) {
      const inputTokens = usageValue(event.usage.inputTokens)
      const outputTokens = usageValue(event.usage.outputTokens)
      const analysisTokens = usageValue(event.usage.analysisTokens)
      const totalTokens = usageValue(event.usage.totalTokens)
      if (inputTokens !== null) payload.input_tokens = inputTokens
      if (outputTokens !== null) payload.output_tokens = outputTokens
      if (analysisTokens !== null) payload.analysis_tokens = analysisTokens
      if (totalTokens !== null) payload.total_tokens = totalTokens
      if (event.usage.cost.status !== 'unavailable') {
        const { amount, currency } = event.usage.cost.value
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(amount)) {
          throw new Error('Invalid cost amount.')
        }
        payload.cost_amount = amount.slice(0, 80)
        payload.cost_currency = safeIdentifier(currency, 'cost currency')
      }
    }
    writeAiRunLog(level, payload)
  } catch {
    try {
      // eslint-disable-next-line no-console
      console.error('[ai-run-observability] failed to record event')
    } catch {
      /* AI telemetry must never break the request path. */
    }
  }
}

export const aiRunTelemetry: AiRunTelemetry = Object.freeze({
  emit: recordAiRunTelemetryEvent,
})
