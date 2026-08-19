import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent, AiRunIdentity } from '@/lib/ai/run-contracts'
import {
  type AiRunCoordinationStore,
  type AiRunTelemetryEvent,
  createAiRunCoordinator,
} from '@/lib/ai/run-coordinator'

const IDENTITY = {
  aiConnectionId: 'connection-1',
  aiConnectionModelRevisionId: 'model-revision-1',
  aiRunProfileRevisionId: 'profile-revision-1',
} as AiRunIdentity

function store(
  overrides: Partial<AiRunCoordinationStore> = {},
): AiRunCoordinationStore {
  return {
    acquire: vi.fn(async () => ({ status: 'acquired' as const })),
    enqueue: vi.fn(async () => ({ status: 'queued' as const })),
    finish: vi.fn(async () => undefined),
    requeueForRetry: vi.fn(async () => undefined),
    renew: vi.fn(async () => true),
    ...overrides,
  }
}

function request(signal = new AbortController().signal) {
  return {
    adapterVersion: '1',
    abortSignal: signal,
    applicationRunId: '00000000-0000-4000-8000-000000000001',
    identity: IDENTITY,
    limits: {
      maxBufferedEvents: 2,
      maxOutputBytes: 8,
      maxOutputTokens: 10,
      maxRetainedMemoryBytes: 12,
    },
    profile: {
      inactivityTimeBudgetMs: 1_000,
      maximumConcurrency: 2,
      queueCapacity: 3,
      totalTimeBudgetMs: 10_000,
    },
    runType: 'generate_without_images' as const,
  }
}

async function collect(
  source: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const events: AiRunEvent[] = []
  for await (const event of source) events.push(event)
  return events
}

describe('AI run coordinator', () => {
  it('allows the exact limit and aborts before exposing the first byte over it', async () => {
    const abort = vi.fn()
    const coordination = store()
    const coordinator = createAiRunCoordinator({ coordination })
    const execute = vi.fn((_attempt, signal: AbortSignal) => {
      signal.addEventListener('abort', abort)
      return (async function* () {
        yield {
          delta: '12345678',
          type: 'output_delta' as const,
          visibility: 'internal' as const,
        }
        yield {
          delta: '9',
          type: 'output_delta' as const,
          visibility: 'internal' as const,
        }
      })()
    })

    const events = await collect(coordinator.coordinate(request(), execute))

    expect(events).toEqual([
      { delta: '12345678', type: 'output_delta', visibility: 'internal' },
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'output_byte_limit_exceeded',
          retryable: false,
        },
        identity: IDENTITY,
        type: 'failed',
      },
    ])
    expect(abort).toHaveBeenCalledTimes(1)
    expect(coordination.finish).toHaveBeenCalledTimes(1)
  })

  it('retries once against the same revision only before the first delta', async () => {
    const coordination = store()
    const coordinator = createAiRunCoordinator({
      coordination,
      delay: async () => undefined,
      random: () => 0,
    })
    const execute = vi.fn((attempt: number) =>
      (async function* () {
        if (attempt === 1) {
          yield {
            failure: {
              category: 'connection_unavailable' as const,
              retryDisposition: 'safe_before_acceptance' as const,
              retryable: true,
            },
            identity: IDENTITY,
            type: 'failed' as const,
          }
          return
        }
        yield {
          analysis: null,
          identity: IDENTITY,
          rawOutput: '{}',
          type: 'completed' as const,
          usage: {
            analysisTokens: {
              reason: 'not_reported' as const,
              status: 'unavailable' as const,
            },
            cost: {
              reason: 'not_reported' as const,
              status: 'unavailable' as const,
            },
            inputTokens: {
              reason: 'not_reported' as const,
              status: 'unavailable' as const,
            },
            outputTokens: {
              reason: 'not_reported' as const,
              status: 'unavailable' as const,
            },
            totalTokens: {
              reason: 'not_reported' as const,
              status: 'unavailable' as const,
            },
          },
        }
      })(),
    )

    const events = await collect(coordinator.coordinate(request(), execute))

    expect(events.at(-1)?.type).toBe('completed')
    expect(execute).toHaveBeenCalledTimes(2)
    expect(coordination.requeueForRetry).toHaveBeenCalledTimes(1)
    expect(coordination.acquire).toHaveBeenCalledTimes(2)
  })

  it('does not retry after the first delta', async () => {
    const coordinator = createAiRunCoordinator({ coordination: store() })
    const execute = vi.fn(() =>
      (async function* () {
        yield { delta: 'a', type: 'analysis_delta' as const }
        yield {
          failure: {
            category: 'connection_unavailable' as const,
            retryDisposition: 'safe_before_acceptance' as const,
            retryable: true,
          },
          identity: IDENTITY,
          type: 'failed' as const,
        }
      })(),
    )

    const events = await collect(coordinator.coordinate(request(), execute))

    expect(events.map(event => event.type)).toEqual([
      'analysis_delta',
      'failed',
    ])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('does not pull another adapter event while downstream is blocked', async () => {
    let pulls = 0
    const coordinator = createAiRunCoordinator({ coordination: store() })
    const stream = coordinator.coordinate(request(), () => ({
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            pulls += 1
            return pulls === 1
              ? {
                  done: false as const,
                  value: { delta: 'a', type: 'analysis_delta' as const },
                }
              : { done: true as const, value: undefined }
          },
        }
      },
    }))
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({
      value: { delta: 'a' },
    })
    expect(pulls).toBe(1)
    await iterator.return?.()
  })

  it('forwards heartbeats without treating them as terminal or idle progress', async () => {
    const coordinator = createAiRunCoordinator({ coordination: store() })
    const events = await collect(
      coordinator.coordinate(request(), () =>
        (async function* () {
          yield { type: 'heartbeat' as const }
          yield {
            analysis: null,
            identity: IDENTITY,
            rawOutput: '{}',
            type: 'completed' as const,
            usage: {
              analysisTokens: {
                reason: 'not_reported' as const,
                status: 'unavailable' as const,
              },
              cost: {
                reason: 'not_reported' as const,
                status: 'unavailable' as const,
              },
              inputTokens: {
                reason: 'not_reported' as const,
                status: 'unavailable' as const,
              },
              outputTokens: {
                reason: 'not_reported' as const,
                status: 'unavailable' as const,
              },
              totalTokens: {
                reason: 'not_reported' as const,
                status: 'unavailable' as const,
              },
            },
          }
        })(),
      ),
    )

    expect(events.map(event => event.type)).toEqual(['heartbeat', 'completed'])
  })

  it('counts queue waiting against the original total budget', async () => {
    let currentTime = 0
    const coordination = store({
      acquire: vi.fn(async () => ({ status: 'waiting' as const })),
    })
    const coordinator = createAiRunCoordinator({
      coordination,
      delay: async milliseconds => {
        currentTime += milliseconds
      },
      now: () => currentTime,
      pollIntervalMs: 100,
    })
    const execute = vi.fn(() => (async function* () {})())
    const budgetedRequest = request()
    budgetedRequest.profile.totalTimeBudgetMs = 250

    await expect(
      collect(coordinator.coordinate(budgetedRequest, execute)),
    ).resolves.toMatchObject([
      {
        failure: {
          category: 'deadline_exceeded',
          diagnosticCode: 'total_budget_exceeded',
        },
        type: 'failed',
      },
    ])
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not let heartbeats extend the inactivity budget', async () => {
    vi.useFakeTimers()
    try {
      const coordinator = createAiRunCoordinator({ coordination: store() })
      let markBlocked = (): void => undefined
      const blocked = new Promise<void>(resolve => {
        markBlocked = resolve
      })
      const collecting = collect(
        coordinator.coordinate(request(), () =>
          (async function* () {
            yield { type: 'heartbeat' as const }
            markBlocked()
            await new Promise(() => undefined)
          })(),
        ),
      )
      await blocked
      await vi.advanceTimersByTimeAsync(6_000)

      await expect(collecting).resolves.toMatchObject([
        { type: 'heartbeat' },
        {
          failure: {
            category: 'deadline_exceeded',
            diagnosticCode: 'inactivity_budget_exceeded',
          },
          type: 'failed',
        },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not honor Retry-After when fewer than five minutes would remain', async () => {
    const coordination = store()
    const coordinator = createAiRunCoordinator({ coordination })
    const budgetedRequest = request()
    budgetedRequest.profile.totalTimeBudgetMs = 300_500
    const execute = vi.fn(() =>
      (async function* () {
        yield {
          failure: {
            category: 'rate_limited' as const,
            retryAfterSeconds: 1,
            retryDisposition: 'explicit_retryable_status' as const,
            retryable: true,
          },
          identity: IDENTITY,
          type: 'failed' as const,
        }
      })(),
    )

    await expect(
      collect(coordinator.coordinate(budgetedRequest, execute)),
    ).resolves.toMatchObject([{ type: 'failed' }])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordination.requeueForRetry).not.toHaveBeenCalled()
  })

  it('normalizes silent EOF and thrown coordination failures to one terminal', async () => {
    const eof = await collect(
      createAiRunCoordinator({ coordination: store() }).coordinate(
        request(),
        () => (async function* () {})(),
      ),
    )
    expect(eof).toHaveLength(1)
    expect(eof[0]).toMatchObject({
      failure: {
        category: 'invalid_response',
        diagnosticCode: 'silent_eof',
      },
      type: 'failed',
    })

    const coordination = store({
      enqueue: vi.fn(async () => {
        throw new Error('SQL unavailable')
      }),
    })
    const failed = await collect(
      createAiRunCoordinator({ coordination }).coordinate(request(), () =>
        (async function* () {})(),
      ),
    )
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      failure: {
        category: 'adapter_failure',
        diagnosticCode: 'run_coordination_failed',
      },
      type: 'failed',
    })
    expect(coordination.finish).toHaveBeenCalledTimes(1)
  })

  it('cancels an uncooperative adapter within the five-second grace', async () => {
    vi.useFakeTimers()
    try {
      const abortController = new AbortController()
      const coordination = store()
      const adapterAbort = vi.fn()
      let markStarted = (): void => undefined
      const started = new Promise<void>(resolve => {
        markStarted = resolve
      })
      const stream = createAiRunCoordinator({ coordination }).coordinate(
        request(abortController.signal),
        (_attempt, signal) => ({
          [Symbol.asyncIterator]() {
            signal.addEventListener('abort', adapterAbort, { once: true })
            markStarted()
            return {
              next: () =>
                new Promise<IteratorResult<AiRunEvent>>(() => undefined),
              return: () =>
                new Promise<IteratorResult<AiRunEvent>>(() => undefined),
            }
          },
        }),
      )
      const collecting = collect(stream)
      await started
      abortController.abort()
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(collecting).resolves.toEqual([
        {
          identity: IDENTITY,
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
      expect(adapterAbort).toHaveBeenCalledTimes(1)
      expect(coordination.finish).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits content-free telemetry and binding alarm categories', async () => {
    const telemetry: AiRunTelemetryEvent[] = []
    const coordinator = createAiRunCoordinator({
      coordination: store(),
      telemetry: {
        emit: event => {
          telemetry.push(event)
        },
      },
    })
    const execute = () =>
      (async function* () {
        yield {
          failure: {
            category: 'authentication_failed' as const,
            retryable: false,
          },
          identity: IDENTITY,
          type: 'failed' as const,
        }
      })()

    await collect(coordinator.coordinate(request(), execute))

    expect(telemetry.map(event => event.name)).toEqual([
      'ai_run_started',
      'ai_attempt_terminal',
      'ai_alarm_authentication_failed',
      'ai_run_terminal',
    ])
    expect(telemetry.at(-1)).toMatchObject({
      adapterVersion: '1',
      retryCount: 0,
    })
    expect(JSON.stringify(telemetry)).not.toMatch(
      /prompt|output|secret|endpoint|12345678/u,
    )
  })
})
