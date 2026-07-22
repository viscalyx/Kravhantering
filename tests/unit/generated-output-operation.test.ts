import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GeneratedOutputError,
  generatedOutputErrorResponse,
  sanitizeGeneratedOutputDetails,
} from '@/lib/generated-output/errors'

const observability = vi.hoisted(() => ({
  recordCapacityEvent: vi.fn(),
}))

vi.mock('@/lib/observability/capacity', () => ({
  recordCapacityEvent: observability.recordCapacityEvent,
}))

import {
  ClientCancelledGeneratedOutputError,
  createGeneratedOutputTerminalRecorder,
  createGenerationDeadline,
  GeneratedOutputTimeoutError,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'
import type { RequestContext } from '@/lib/requirements/auth'

const context = {
  actor: {
    displayName: 'Test',
    hsaId: 'test',
    id: 'test',
    isAuthenticated: true,
    roles: [],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  request: {
    method: 'GET',
    path: '/api/requirements/export',
    requestId: 'request-1',
  },
  requestId: 'request-1',
  source: 'rest',
} satisfies RequestContext

afterEach(() => {
  vi.useRealTimers()
  observability.recordCapacityEvent.mockClear()
})

describe('generated output operation contract', () => {
  it('maps stable errors to status, no-store, and Retry-After', async () => {
    const error = new GeneratedOutputError(
      'capacity_busy',
      'concurrency_limit',
      {
        output: 'csv',
        retryAfterSeconds: 5,
      },
    )
    const response = generatedOutputErrorResponse(error)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      code: 'capacity_busy',
      details: { output: 'csv', retryAfterSeconds: 5 },
      error: 'Generation capacity is temporarily busy.',
    })
  })

  it('drops unsafe or unbounded error details', () => {
    expect(
      sanitizeGeneratedOutputDetails({
        limit: -1,
        limitKind: 'items',
        output: 'pdf',
        retryAfterSeconds: 9999,
        timeoutSeconds: Number.NaN,
      }),
    ).toEqual({ limitKind: 'items', output: 'pdf' })
  })

  it('distinguishes request cancellation from deadline timeout', () => {
    vi.useFakeTimers()
    const request = new AbortController()
    const cancelled = createGenerationDeadline(10, request.signal)
    request.abort(new Error('socket gone'))
    expect(() => throwIfGenerationAborted(cancelled.signal)).toThrow(
      ClientCancelledGeneratedOutputError,
    )
    cancelled.dispose()

    const timedOut = createGenerationDeadline(2)
    vi.advanceTimersByTime(2000)
    expect(() => throwIfGenerationAborted(timedOut.signal)).toThrow(
      GeneratedOutputTimeoutError,
    )
    timedOut.dispose()
  })

  it('records exactly one terminal CSV event with closed names and metrics', () => {
    const recorder = createGeneratedOutputTerminalRecorder(
      'requirements.library_csv_export',
      context,
    )
    recorder.failed(
      new GeneratedOutputError('output_limit_exceeded', 'item_limit_exceeded', {
        limit: 1000,
        limitKind: 'items',
        output: 'csv',
      }),
      {
        activeCount: 2,
        concurrencyLimit: 5,
        itemCount: 1001,
        itemLimit: 1000,
        timeoutMs: 120000,
      },
    )
    recorder.completed({ byteCount: 10 })

    expect(observability.recordCapacityEvent).toHaveBeenCalledTimes(1)
    expect(observability.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityReason: 'item_limit_exceeded',
        event: 'capacity.threshold_exceeded',
        operation: 'requirements.library_csv_export',
        outcome: 'failure',
        source: 'rest',
        statusCode: 422,
        surface: 'export',
        metrics: expect.objectContaining({
          active_count: 2,
          concurrency_limit: 5,
          item_count: 1001,
          item_limit: 1000,
          timeout_ms: 120000,
        }),
      }),
    )
  })

  it('records PDF cancellation without leaking the cancellation cause', () => {
    const recorder = createGeneratedOutputTerminalRecorder(
      'requirements.list_pdf_report',
      context,
    )
    recorder.failed(
      new ClientCancelledGeneratedOutputError({
        cause: new Error('/private/spool/path'),
      }),
      { workerMemoryLimitBytes: 512 * 1024 * 1024 },
    )

    expect(observability.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityReason: 'client_cancelled',
        event: 'capacity.operation.cancelled',
        operation: 'requirements.list_pdf_report',
        outcome: 'cancelled',
        statusCode: 499,
        surface: 'report',
      }),
    )
    expect(
      JSON.stringify(observability.recordCapacityEvent.mock.calls),
    ).not.toContain('/private/spool/path')
  })

  it('uses one closed operation for both specification CSV profiles', () => {
    const recorder = createGeneratedOutputTerminalRecorder(
      'requirements.specification_csv_export',
      context,
    )
    recorder.completed({ byteCount: 120, itemCount: 2 })

    expect(observability.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'capacity.operation.completed',
        operation: 'requirements.specification_csv_export',
        source: 'rest',
        surface: 'export',
      }),
    )
    expect(
      JSON.stringify(observability.recordCapacityEvent.mock.calls),
    ).not.toContain('procurement')
    expect(
      JSON.stringify(observability.recordCapacityEvent.mock.calls),
    ).not.toContain('full')
  })
})
