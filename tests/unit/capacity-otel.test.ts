import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const eventCounterAdd = vi.fn()
const throttledCounterAdd = vi.fn()
const histogramRecord = vi.fn()
const spanAddEvent = vi.fn()
const spanEnd = vi.fn()
const spanSetStatus = vi.fn()
const startSpan = vi.fn()
const logEmit = vi.fn()

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: (name: string) => ({
        add:
          name === 'kravhantering.capacity.throttled'
            ? throttledCounterAdd
            : eventCounterAdd,
      }),
      createHistogram: () => ({
        record: histogramRecord,
      }),
    }),
  },
  SpanStatusCode: {
    ERROR: 2,
    OK: 1,
  },
  trace: {
    getTracer: () => ({
      startSpan,
    }),
  },
}))

vi.mock('@opentelemetry/api-logs', () => ({
  logs: {
    getLogger: () => ({
      emit: logEmit,
    }),
  },
  SeverityNumber: {
    ERROR: 17,
    INFO: 9,
    WARN: 13,
  },
}))

describe('capacity OpenTelemetry export', () => {
  beforeEach(() => {
    startSpan.mockReturnValue({
      addEvent: spanAddEvent,
      end: spanEnd,
      setStatus: spanSetStatus,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('does not export when OTel is not explicitly enabled', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://127.0.0.1:4318')
    const { recordCapacityOtelEvent } = await import(
      '@/lib/observability/capacity-otel'
    )

    recordCapacityOtelEvent({
      channel: 'capacity-observability',
      correlation_id: 'workflow-1',
      event: 'capacity.operation.completed',
      event_id: 'event-1',
      level: 'info',
      operation: 'reports.specification_items',
      outcome: 'success',
      request_id: 'request-1',
      source: 'rest',
      ts: '2026-05-17T10:00:00.000Z',
    })

    expect(eventCounterAdd).not.toHaveBeenCalled()
    expect(startSpan).not.toHaveBeenCalled()
    expect(logEmit).not.toHaveBeenCalled()
  })

  it('exports metrics, spans, and logs from safe capacity payloads', async () => {
    vi.stubEnv('OTEL_SDK_ENABLED', 'true')
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://127.0.0.1:4318')
    const { recordCapacityOtelEvent } = await import(
      '@/lib/observability/capacity-otel'
    )

    recordCapacityOtelEvent({
      channel: 'capacity-observability',
      correlation_id: 'workflow-1',
      cost: 0.12,
      duration_ms: 42,
      event: 'capacity.operation.completed',
      event_id: 'event-1',
      item_count: 3,
      level: 'info',
      operation: 'ai.generate-requirements',
      outcome: 'success',
      request_id: 'request-1',
      source: 'rest',
      status_code: 200,
      token_count: 100,
      ts: '2026-05-17T10:00:00.000Z',
    })

    expect(eventCounterAdd).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        event: 'capacity.operation.completed',
        operation: 'ai.generate-requirements',
        outcome: 'success',
        source: 'rest',
        status_code: '200',
      }),
    )
    expect(eventCounterAdd.mock.calls[0]?.[1]).not.toHaveProperty('request_id')
    expect(eventCounterAdd.mock.calls[0]?.[1]).not.toHaveProperty(
      'correlation_id',
    )
    expect(histogramRecord).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ operation: 'ai.generate-requirements' }),
    )
    expect(startSpan).toHaveBeenCalledWith(
      'capacity ai.generate-requirements',
      expect.objectContaining({
        attributes: expect.objectContaining({
          correlation_id: 'workflow-1',
          request_id: 'request-1',
        }),
      }),
    )
    expect(logEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          correlation_id: 'workflow-1',
          request_id: 'request-1',
        }),
        body: 'capacity.operation.completed',
      }),
    )
  })
})
