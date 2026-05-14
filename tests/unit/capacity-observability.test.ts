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
      operation: 'ai.generate-requirements',
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
      operation: 'ai.generate-requirements',
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
})
