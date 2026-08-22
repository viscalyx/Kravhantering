import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiRunTelemetryEvent } from '@/lib/ai/run-coordinator'
import {
  aiRunTelemetry,
  recordAiRunTelemetryEvent,
} from '@/lib/observability/ai-runs'

function event(
  overrides: Partial<AiRunTelemetryEvent> = {},
): AiRunTelemetryEvent {
  return {
    adapterType: 'openrouter',
    adapterVersion: '1',
    aiConnectionId: '10000000-0000-4000-8000-000000000001',
    aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: '30000000-0000-4000-8000-000000000001',
    applicationRunId: '40000000-0000-4000-8000-000000000001',
    correlationId: '50000000-0000-4000-8000-000000000001',
    name: 'ai_run_terminal',
    requestId: '60000000-0000-4000-8000-000000000001',
    runType: 'generate_without_images',
    ...overrides,
  }
}

describe('AI run observability', () => {
  afterEach(() => vi.restoreAllMocks())

  it('emits bounded content-free operational dimensions', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    recordAiRunTelemetryEvent(
      event({
        durationMs: 125,
        outcome: 'completed',
        retryCount: 1,
        usage: {
          analysisTokens: { reason: 'not_reported', status: 'unavailable' },
          cost: {
            status: 'reported',
            value: { amount: '0.0042', currency: 'USD' },
          },
          inputTokens: { status: 'reported', value: 12 },
          outputTokens: { status: 'reported', value: 7 },
          totalTokens: { status: 'reported', value: 19 },
        },
      }),
    )

    const payload = JSON.parse(String(info.mock.calls[0]?.[0]))
    expect(payload).toMatchObject({
      adapter_type: 'openrouter',
      channel: 'ai-run-observability',
      event: 'ai_run_terminal',
      level: 'info',
      outcome: 'completed',
      retry_count: 1,
      total_tokens: 19,
    })
    for (const forbiddenField of [
      'prompt',
      'image_bytes',
      'output_text',
      'endpoint',
      'credential',
      'secret_reference',
    ]) {
      expect(payload).not.toHaveProperty(forbiddenField)
    }
  })

  it.each([
    'ai_alarm_authentication_failed',
    'ai_alarm_breaker_opened',
    'ai_alarm_active_profile_blocked',
  ] as const)('marks binding alarm event %s as error', name => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    aiRunTelemetry.emit(event({ name }))

    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      channel: 'ai-run-observability',
      event: name,
      level: 'error',
    })
  })

  it('fails telemetry closed without breaking the request path', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() =>
      recordAiRunTelemetryEvent(
        event({ applicationRunId: 'unsafe\n{"prompt":"leak"}' }),
      ),
    ).not.toThrow()
    expect(String(error.mock.calls[0]?.[0])).toContain(
      '[ai-run-observability] failed to record event',
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain('leak')
  })

  it('normalizes every optional operational field without content', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    recordAiRunTelemetryEvent(
      event({
        activeConcurrency: 2,
        actorId: 'actor:opaque',
        attempt: 1,
        breakerStatus: 'closed',
        cancellationReason: 'client_abort',
        failureCategory: 'adapter_failure',
        healthStatus: 'healthy',
        probeKind: 'manual',
        queueDepth: 0,
        queueWaitMs: 4,
        timeToFirstAnalysisDeltaMs: 6,
        timeToFirstDeltaMs: 5,
        timeToFirstOutputDeltaMs: 7,
        usage: {
          analysisTokens: { status: 'reported', value: 2 },
          cost: { status: 'unavailable', reason: 'not_reported' },
          inputTokens: { status: 'unavailable', reason: 'not_reported' },
          outputTokens: { status: 'reported', value: -1 },
          totalTokens: { status: 'reported', value: 12 },
        },
      }),
    )

    const payload = JSON.parse(String(info.mock.calls[0]?.[0]))
    expect(payload).toMatchObject({
      active_concurrency: 2,
      actor_id: 'actor:opaque',
      analysis_tokens: 2,
      breaker_status: 'closed',
      health_status: 'healthy',
      probe_kind: 'manual',
      queue_depth: 0,
    })
    expect(payload).not.toHaveProperty('output_tokens')
  })

  it('contains invalid cost and a failing fallback logger', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('logger unavailable')
    })

    expect(() =>
      recordAiRunTelemetryEvent(
        event({
          usage: {
            analysisTokens: { status: 'reported', value: 1 },
            cost: {
              status: 'reported',
              value: { amount: '-1', currency: 'USD' },
            },
            inputTokens: { status: 'reported', value: 1 },
            outputTokens: { status: 'reported', value: 1 },
            totalTokens: { status: 'reported', value: 3 },
          },
        }),
      ),
    ).not.toThrow()
    expect(error).toHaveBeenCalledTimes(1)
  })
})
