import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  observeCapacity,
  recordCapacityEvent,
} from '@/lib/observability/capacity'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

describe('capacity observability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes stable JSON events with correlation metadata', () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)

    recordCapacityEvent({
      correlationId: 'workflow-1',
      durationMs: 42,
      event: 'capacity.operation.completed',
      metrics: { cost: 0.12, item_count: 3, token_count: 100 },
      operation: 'ai.generate-requirement-import',
      outcome: 'success',
      requestId: 'request-1',
      source: 'rest',
      statusCode: 200,
    })

    const [event] = parseCapacityEvents(infoSpy)
    expect(event).toMatchObject({
      channel: 'capacity-observability',
      correlation_id: 'workflow-1',
      cost: 0.12,
      duration_ms: 42,
      event: 'capacity.operation.completed',
      item_count: 3,
      operation: 'ai.generate-requirement-import',
      outcome: 'success',
      request_id: 'request-1',
      source: 'rest',
      status_code: 200,
      token_count: 100,
    })
    expect(event?.event_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('redacts sensitive operation text defensively', () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)

    recordCapacityEvent({
      correlationId: 'workflow-1',
      event: 'capacity.operation.completed',
      operation: 'sk-or-v1-secret SELECT token FROM sessions',
      outcome: 'success',
      requestId: 'request-1',
      source: 'rest',
    })

    const [event] = parseCapacityEvents(infoSpy)
    expect(JSON.stringify(event)).not.toMatch(/sk-or-v1|SELECT token/)
  })

  it('emits only non-negative safe-integer generated-output metrics', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    recordCapacityEvent({
      capacityReason: 'byte_limit_exceeded',
      correlationId: 'workflow-1',
      event: 'capacity.threshold_exceeded',
      metrics: {
        active_count: 2,
        byte_count: 1024,
        byte_limit: Number.MAX_SAFE_INTEGER,
        concurrency_limit: 5,
        item_count: -1,
        item_limit: 1000.5,
        timeout_ms: Number.POSITIVE_INFINITY,
        worker_memory_limit_bytes: 512 * 1024 * 1024,
      },
      operation: 'requirements.library_csv_export',
      outcome: 'failure',
      requestId: 'request-1',
      source: 'rest',
      surface: 'export',
    })

    const [event] = parseCapacityEvents(errorSpy)
    expect(event).toMatchObject({
      active_count: 2,
      byte_count: 1024,
      byte_limit: Number.MAX_SAFE_INTEGER,
      capacity_reason: 'byte_limit_exceeded',
      concurrency_limit: 5,
      surface: 'export',
      worker_memory_limit_bytes: 512 * 1024 * 1024,
    })
    expect(event).not.toHaveProperty('item_count')
    expect(event).not.toHaveProperty('item_limit')
    expect(event).not.toHaveProperty('timeout_ms')
  })

  it('records operation completion and threshold events', async () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_060)

    await observeCapacity(
      {
        correlationId: 'workflow-1',
        operation: 'reports.specification_items',
        requestId: 'request-1',
        slowThresholdMs: 50,
        source: 'rest',
      },
      async () => new Response(null, { status: 204 }),
    )

    nowSpy.mockRestore()
    const events = parseCapacityEvents(infoSpy)
    expect(events.map((event: Record<string, unknown>) => event.event)).toEqual(
      ['capacity.operation.completed', 'capacity.threshold_exceeded'],
    )
    expect(events[0]).toMatchObject({ duration_ms: 60, status_code: 204 })
  })

  it('records failed operations and rethrows the original error', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_025)
    const failure = new Error('operation failed')

    await expect(
      observeCapacity(
        {
          correlationId: 'workflow-1',
          operation: 'requirements.save',
          requestId: 'request-1',
          slowThresholdMs: 50,
          source: 'rest',
        },
        async () => {
          throw failure
        },
      ),
    ).rejects.toBe(failure)

    expect(parseCapacityEvents(errorSpy)).toEqual([
      expect.objectContaining({
        duration_ms: 25,
        event: 'capacity.operation.failed',
        outcome: 'failure',
        status_code: 500,
      }),
    ])
  })

  it('derives request IDs and records optional capacity fields', () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)

    recordCapacityEvent({
      cursorFailureCategory: 'invalid_cursor',
      event: 'capacity.throttled',
      level: 'warn',
      metrics: {
        continuation_available: true,
        image_bytes: 2048,
        image_count: 2,
        page_limit: 50,
        returned_count: 10,
        throttled: true,
      },
      operation: 'reports.list',
      outcome: 'throttled',
      request: new Request('https://app.example/api/reports', {
        headers: {
          'X-Correlation-Id': 'workflow-1',
          'X-Request-Id': 'request-1',
        },
      }),
      retryAfterSeconds: 30,
      source: 'rest',
      toolName: 'report.list',
    })

    expect(parseCapacityEvents(infoSpy)).toEqual([
      expect.objectContaining({
        continuation_available: true,
        correlation_id: 'workflow-1',
        cursor_failure_category: 'invalid_cursor',
        image_bytes: 2048,
        image_count: 2,
        page_limit: 50,
        request_id: 'request-1',
        retry_after_seconds: 30,
        returned_count: 10,
        throttled: true,
        tool_name: 'report.list',
      }),
    ])
  })

  it('never lets telemetry serialization failures break callers', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('Bearer raw-token')
    })

    expect(() =>
      recordCapacityEvent({
        event: 'capacity.operation.completed',
        operation: 'requirements.save',
        outcome: 'success',
        source: 'server',
      }),
    ).not.toThrow()
    expect(errorSpy).toHaveBeenCalledWith(
      '[capacity-observability] failed to record event',
      'Bearer [REDACTED]',
    )
  })
})
