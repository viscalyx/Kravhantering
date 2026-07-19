import {
  GeneratedOutputError,
  type GeneratedOutputKind,
  isGeneratedOutputError,
} from '@/lib/generated-output/errors'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import type { RequestContext } from '@/lib/requirements/auth'

export class ClientCancelledGeneratedOutputError extends Error {
  constructor(options?: ErrorOptions) {
    super('Generated output request was cancelled', options)
    this.name = 'ClientCancelledGeneratedOutputError'
  }
}

export class GeneratedOutputTimeoutError extends Error {
  readonly timeoutSeconds: number

  constructor(timeoutSeconds: number) {
    super('Generated output timed out')
    this.name = 'GeneratedOutputTimeoutError'
    this.timeoutSeconds = timeoutSeconds
  }
}

export interface GenerationDeadline {
  dispose: () => void
  signal: AbortSignal
}

export interface GeneratedOutputTerminalMetrics {
  activeCount?: number
  byteCount?: number
  concurrencyLimit?: number
  itemCount?: number
  itemLimit?: number
  timeoutMs?: number
  workerMemoryLimitBytes?: number
}

export interface GeneratedOutputTerminalRecorder {
  cancelled: (metrics?: GeneratedOutputTerminalMetrics) => void
  completed: (metrics?: GeneratedOutputTerminalMetrics) => void
  failed: (error: unknown, metrics?: GeneratedOutputTerminalMetrics) => void
}

export function createGenerationDeadline(
  timeoutSeconds: number,
  requestSignal?: AbortSignal,
): GenerationDeadline {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new GeneratedOutputTimeoutError(timeoutSeconds))
  }, timeoutSeconds * 1000)
  timeout.unref()
  const cancelFromRequest = (): void => {
    controller.abort(
      new ClientCancelledGeneratedOutputError({
        cause: requestSignal?.reason,
      }),
    )
  }
  requestSignal?.addEventListener('abort', cancelFromRequest, { once: true })
  if (requestSignal?.aborted) cancelFromRequest()

  return {
    dispose: () => {
      clearTimeout(timeout)
      requestSignal?.removeEventListener('abort', cancelFromRequest)
    },
    signal: controller.signal,
  }
}

export function throwIfGenerationAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new ClientCancelledGeneratedOutputError()
  }
}

export function createGeneratedOutputTerminalRecorder(
  output: GeneratedOutputKind,
  context: RequestContext,
): GeneratedOutputTerminalRecorder {
  const startedAt = Date.now()
  const operation =
    output === 'csv'
      ? 'requirements.library_csv_export'
      : 'requirements.list_pdf_report'
  const surface = output === 'csv' ? 'export' : 'report'
  let terminalRecorded = false

  const record = (
    event:
      | 'capacity.operation.cancelled'
      | 'capacity.operation.completed'
      | 'capacity.operation.failed'
      | 'capacity.threshold_exceeded'
      | 'capacity.throttled',
    outcome: 'cancelled' | 'failure' | 'success' | 'throttled',
    statusCode: number,
    metrics: GeneratedOutputTerminalMetrics = {},
    error?: unknown,
  ): void => {
    if (terminalRecorded) return
    terminalRecorded = true
    const generatedError = isGeneratedOutputError(error) ? error : undefined
    recordCapacityEvent({
      capacityReason: generatedError?.capacityReason,
      correlationId: context.correlationId,
      durationMs: Date.now() - startedAt,
      event,
      level:
        outcome === 'failure'
          ? 'error'
          : outcome === 'success'
            ? 'info'
            : 'warn',
      metrics: {
        active_count: metrics.activeCount,
        byte_count: metrics.byteCount,
        byte_limit:
          generatedError?.details.limitKind === 'bytes'
            ? generatedError.details.limit
            : undefined,
        concurrency_limit: metrics.concurrencyLimit,
        item_count: metrics.itemCount,
        item_limit:
          generatedError?.details.limitKind === 'items'
            ? generatedError.details.limit
            : metrics.itemLimit,
        timeout_ms: metrics.timeoutMs,
        worker_memory_limit_bytes: metrics.workerMemoryLimitBytes,
      },
      operation,
      outcome,
      requestId: context.requestId,
      source: 'rest',
      statusCode,
      surface,
    })
  }

  return {
    cancelled: metrics =>
      record(
        'capacity.operation.cancelled',
        'cancelled',
        499,
        metrics,
        new GeneratedOutputError('generation_timeout', 'client_cancelled', {
          output,
        }),
      ),
    completed: metrics =>
      record('capacity.operation.completed', 'success', 200, metrics),
    failed: (error, metrics) => {
      if (error instanceof ClientCancelledGeneratedOutputError) {
        record(
          'capacity.operation.cancelled',
          'cancelled',
          499,
          metrics,
          new GeneratedOutputError('generation_timeout', 'client_cancelled', {
            output,
          }),
        )
        return
      }
      if (error instanceof GeneratedOutputTimeoutError) {
        record(
          'capacity.operation.failed',
          'failure',
          503,
          metrics,
          new GeneratedOutputError('generation_timeout', 'generation_timeout', {
            output,
            timeoutSeconds: error.timeoutSeconds,
          }),
        )
        return
      }
      if (isGeneratedOutputError(error)) {
        const event =
          error.code === 'capacity_busy'
            ? 'capacity.throttled'
            : error.code === 'output_limit_exceeded'
              ? 'capacity.threshold_exceeded'
              : 'capacity.operation.failed'
        const outcome = error.code === 'capacity_busy' ? 'throttled' : 'failure'
        record(event, outcome, error.status, metrics, error)
        return
      }
      record('capacity.operation.failed', 'failure', 500, metrics, error)
    },
  }
}

export function generatedOutputErrorFromTimeout(
  output: GeneratedOutputKind,
  error: GeneratedOutputTimeoutError,
): GeneratedOutputError {
  return new GeneratedOutputError(
    'generation_timeout',
    'generation_timeout',
    { output, timeoutSeconds: error.timeoutSeconds },
    { cause: error },
  )
}
