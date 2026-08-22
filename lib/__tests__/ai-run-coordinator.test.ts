import { getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent, AiRunIdentity } from '@/lib/ai/run-contracts'
import {
  type AiHealthProbeResult,
  type AiRunCoordinationStore,
  type AiRunTelemetryEvent,
  createAiRunCoordinator,
} from '@/lib/ai/run-coordinator'

const IDENTITY = {
  aiConnectionId: 'connection-1',
  aiConnectionModelRevisionId: 'model-revision-1',
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: 'profile-revision-1',
} as AiRunIdentity

const MANUAL_PROBE_ACQUISITION = {
  breakerStatus: 'closed',
  healthStatus: 'healthy',
} as const

function store(
  overrides: Partial<AiRunCoordinationStore> = {},
): AiRunCoordinationStore {
  return {
    abandon: vi.fn(async () => undefined),
    acquire: vi.fn(async () => ({ status: 'acquired' as const })),
    enqueue: vi.fn(async () => ({ status: 'queued' as const })),
    finish: vi.fn(async () => undefined),
    acquireRecoveryProbe: vi.fn(async () => false),
    acquireManualRecoveryProbe: vi.fn(async () => null),
    finishRecoveryProbe: vi.fn(async () => undefined),
    listDueRecoveryProbes: vi.fn(async () => []),
    requeueForRetry: vi.fn(async () => 'applied' as const),
    renew: vi.fn(async () => true),
    ...overrides,
  }
}

function request(signal = new AbortController().signal) {
  return {
    adapterType: 'controlled_test',
    adapterVersion: '1',
    abortSignal: signal,
    applicationRunId: '00000000-0000-4000-8000-000000000001',
    correlationId: 'correlation-1',
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
    requestId: 'request-1',
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

function completed(): Extract<AiRunEvent, { type: 'completed' }> {
  return {
    analysis: null,
    identity: IDENTITY,
    rawOutput: '{}',
    type: 'completed',
    usage: {
      analysisTokens: { reason: 'not_reported', status: 'unavailable' },
      cost: { reason: 'not_reported', status: 'unavailable' },
      inputTokens: { reason: 'not_reported', status: 'unavailable' },
      outputTokens: { reason: 'not_reported', status: 'unavailable' },
      totalTokens: { reason: 'not_reported', status: 'unavailable' },
    },
  }
}

function completedProbeResult(succeeded: boolean): AiHealthProbeResult {
  return succeeded
    ? { succeeded: true, usage: completed().usage }
    : {
        failure: {
          category: 'deadline_exceeded',
          diagnosticCode: 'health_probe_deadline_exceeded',
          retryable: false,
        },
        succeeded: false,
      }
}

describe('AI run coordinator', () => {
  it('claims durable due recovery rows and emits probe and health telemetry', async () => {
    const target = {
      adapterType: 'controlled_test',
      adapterVersion: '1',
      identity: IDENTITY,
      inactivityTimeBudgetMs: 1_000,
      runType: 'generate_without_images' as const,
      totalTimeBudgetMs: 10_000,
    }
    const telemetry: AiRunTelemetryEvent[] = []
    const coordination = store({
      acquireRecoveryProbe: vi.fn(async () => true),
      finishRecoveryProbe: vi.fn(async () => ({
        breakerOpened: false,
        breakerStatus: 'closed' as const,
        healthStateChanged: true,
        healthStatus: 'healthy' as const,
      })),
      listDueRecoveryProbes: vi.fn(async () => [target]),
    })
    const coordinator = createAiRunCoordinator({
      coordination,
      telemetry: {
        emit: event => {
          telemetry.push(event)
        },
      },
    })

    await coordinator.runDueRecoveryProbes(async () => ({
      succeeded: true,
      usage: completed().usage,
    }))

    expect(coordination.acquireRecoveryProbe).toHaveBeenCalledTimes(1)
    expect(coordination.finishRecoveryProbe).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: true }),
    )
    expect(telemetry.map(event => event.name)).toEqual([
      'ai_health_probe_started',
      'ai_health_state_changed',
      'ai_health_probe_terminal',
      'ai_health_state_changed',
    ])
    expect(telemetry[2]).toMatchObject({
      outcome: 'completed',
      probeKind: 'automatic',
      usage: completed().usage,
    })
  })

  it('records manual health checks with actor, duration, usage, and outcome', async () => {
    let currentTime = 1_000
    const telemetry: AiRunTelemetryEvent[] = []
    const coordination = store({
      acquireManualRecoveryProbe: vi.fn(async () => MANUAL_PROBE_ACQUISITION),
      finishRecoveryProbe: vi.fn(async () => ({
        breakerOpened: false,
        breakerStatus: 'closed' as const,
        healthStateChanged: true,
        healthStatus: 'healthy' as const,
      })),
    })
    const coordinator = createAiRunCoordinator({
      coordination,
      now: () => currentTime,
      telemetry: {
        emit: event => {
          telemetry.push(event)
        },
      },
    })
    const target = {
      adapterType: 'controlled_test',
      adapterVersion: '1',
      identity: IDENTITY,
      inactivityTimeBudgetMs: 1_000,
      runType: 'generate_without_images' as const,
      totalTimeBudgetMs: 10_000,
    }

    await coordinator.runManualHealthProbe(
      target,
      'admin-fingerprint',
      async () => {
        currentTime = 1_125
        return { succeeded: true, usage: completed().usage }
      },
    )

    expect(telemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 'admin-fingerprint',
          durationMs: 125,
          name: 'admin_health_check',
          outcome: 'completed',
          probeKind: 'manual',
          usage: completed().usage,
        }),
      ]),
    )
    expect(telemetry[0]).toMatchObject({
      breakerStatus: 'closed',
      healthStatus: 'healthy',
      name: 'ai_health_probe_started',
    })
  })

  it.each(['automatic', 'manual'] as const)(
    'emits the breaker-open alarm for a %s probe transition',
    async kind => {
      const target = {
        adapterType: 'controlled_test',
        adapterVersion: '1',
        identity: IDENTITY,
        inactivityTimeBudgetMs: 1_000,
        runType: 'generate_without_images' as const,
        totalTimeBudgetMs: 10_000,
      }
      const telemetry: AiRunTelemetryEvent[] = []
      const coordination = store({
        acquireManualRecoveryProbe: vi.fn(async () => MANUAL_PROBE_ACQUISITION),
        acquireRecoveryProbe: vi.fn(async () => true),
        finishRecoveryProbe: vi.fn(async () => ({
          breakerOpened: true,
          breakerStatus: 'open' as const,
          healthStateChanged: false,
          healthStatus: 'unavailable' as const,
        })),
        listDueRecoveryProbes: vi.fn(async () => [target]),
      })
      const coordinator = createAiRunCoordinator({
        coordination,
        telemetry: {
          emit: event => {
            telemetry.push(event)
          },
        },
      })

      if (kind === 'automatic') {
        await coordinator.runDueRecoveryProbes(async () => ({
          succeeded: false,
        }))
      } else {
        await coordinator.runManualHealthProbe(target, 'actor', async () => ({
          succeeded: false,
        }))
      }

      expect(telemetry.map(event => event.name)).toContain(
        'ai_alarm_breaker_opened',
      )
    },
  )

  it('skips a lost recovery race and normalizes a probe exception', async () => {
    const target = {
      adapterType: 'controlled_test',
      adapterVersion: '1',
      identity: IDENTITY,
      inactivityTimeBudgetMs: 1_000,
      runType: 'generate_without_images' as const,
      totalTimeBudgetMs: 10_000,
    }
    const telemetry: AiRunTelemetryEvent[] = []
    const coordination = store({
      acquireRecoveryProbe: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      finishRecoveryProbe: vi.fn(async () => ({
        breakerOpened: false,
        healthStateChanged: false,
      })),
      listDueRecoveryProbes: vi.fn(async () => [target, target]),
    })
    const coordinator = createAiRunCoordinator({
      coordination,
      telemetry: {
        emit: event => {
          telemetry.push(event)
        },
      },
    })

    await coordinator.runDueRecoveryProbes(async () => {
      throw new Error('private provider failure')
    })

    expect(coordination.finishRecoveryProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({
          diagnosticCode: 'automatic_health_probe_failed',
        }),
        succeeded: false,
      }),
    )
    expect(telemetry.map(event => event.name)).toEqual([
      'ai_health_probe_started',
      'ai_health_state_changed',
      'ai_health_probe_terminal',
    ])
  })

  it('reports an unavailable manual probe and normalizes execution failure', async () => {
    const target = {
      adapterType: 'controlled_test',
      adapterVersion: '1',
      identity: IDENTITY,
      inactivityTimeBudgetMs: 1_000,
      runType: 'generate_without_images' as const,
      totalTimeBudgetMs: 10_000,
    }
    const coordination = store({
      acquireManualRecoveryProbe: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(MANUAL_PROBE_ACQUISITION),
      finishRecoveryProbe: vi.fn(async () => ({
        breakerOpened: false,
        healthStateChanged: false,
      })),
    })
    const coordinator = createAiRunCoordinator({ coordination })

    await expect(
      coordinator.runManualHealthProbe(target, 'actor', async () => ({
        succeeded: true,
      })),
    ).resolves.toMatchObject({
      failure: { diagnosticCode: 'manual_health_probe_unavailable' },
      succeeded: false,
    })
    await expect(
      coordinator.runManualHealthProbe(target, 'actor', async () => {
        throw new Error('private provider failure')
      }),
    ).resolves.toMatchObject({
      failure: { diagnosticCode: 'manual_health_probe_failed' },
      succeeded: false,
    })
  })

  it('starts recovery immediately and contains scan failures', async () => {
    const listDueRecoveryProbes = vi.fn(async () => {
      throw new Error('SQL unavailable')
    })
    const coordinator = createAiRunCoordinator({
      coordination: store({ listDueRecoveryProbes }),
      recoveryPollIntervalMs: 60_000,
    })

    const stop = coordinator.startAutomaticRecovery(async () => ({
      succeeded: true,
    }))
    await vi.waitFor(() => expect(listDueRecoveryProbes).toHaveBeenCalled())
    stop()
  })

  it.each(['automatic', 'manual'] as const)(
    'aborts a %s health probe at its total budget',
    async kind => {
      vi.useFakeTimers()
      try {
        const target = {
          adapterType: 'controlled_test',
          adapterVersion: '1',
          identity: IDENTITY,
          inactivityTimeBudgetMs: 10,
          runType: 'generate_without_images' as const,
          totalTimeBudgetMs: 100,
        }
        const coordination = store({
          acquireManualRecoveryProbe: vi.fn(
            async () => MANUAL_PROBE_ACQUISITION,
          ),
          acquireRecoveryProbe: vi.fn(async () => true),
          finishRecoveryProbe: vi.fn(async () => ({
            breakerOpened: false,
            healthStateChanged: false,
          })),
          listDueRecoveryProbes: vi.fn(async () => [target]),
        })
        const coordinator = createAiRunCoordinator({ coordination })
        const execute = vi.fn(
          (_target, _probeRunId, signal: AbortSignal) =>
            new Promise<ReturnType<typeof completedProbeResult>>(resolve => {
              signal.addEventListener(
                'abort',
                () => resolve(completedProbeResult(false)),
                { once: true },
              )
            }),
        )
        const probing =
          kind === 'automatic'
            ? coordinator.runDueRecoveryProbes(execute)
            : coordinator.runManualHealthProbe(target, 'actor', execute)
        await vi.advanceTimersByTimeAsync(100)

        await probing
        expect(execute.mock.calls[0]?.[2].aborted).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.each([
    ['queue_full', 'rate_limited'],
    ['breaker_open', 'connection_unavailable'],
  ] as const)('normalizes rejected %s admission', async (status, category) => {
    const coordination = store({
      enqueue: vi.fn(async () =>
        status === 'queue_full'
          ? {
              activeConcurrency: 2,
              queueDepth: 3,
              retryAfterSeconds: 60,
              status,
            }
          : { retryAfterSeconds: 60, status },
      ),
    })

    await expect(
      collect(
        createAiRunCoordinator({ coordination }).coordinate(
          request(),
          () => (async function* () {})(),
          () => undefined,
        ),
      ),
    ).resolves.toMatchObject([{ failure: { category }, type: 'failed' }])
    expect(coordination.finish).not.toHaveBeenCalled()
  })

  it.each([
    ['breaker_open', 'circuit_breaker_open'],
    ['expired', 'total_budget_exceeded'],
  ] as const)(
    'normalizes %s while acquiring capacity',
    async (status, code) => {
      const coordination = store({
        acquire: vi.fn(async () => ({
          ...(status === 'breaker_open' ? { retryAfterSeconds: 60 } : {}),
          status,
        })),
      })

      await expect(
        collect(
          createAiRunCoordinator({ coordination }).coordinate(
            request(),
            () => (async function* () {})(),
            () => undefined,
          ),
        ),
      ).resolves.toMatchObject([
        { failure: { diagnosticCode: code }, type: 'failed' },
      ])
    },
  )

  it.each([
    ['output', 'output_byte_limit_exceeded'],
    ['memory', 'retained_memory_limit_exceeded'],
    ['tokens', 'output_token_limit_exceeded'],
  ] as const)('enforces the completed %s limit', async (kind, code) => {
    const limited = request()
    if (kind === 'output') limited.limits.maxOutputBytes = 1
    if (kind === 'memory') limited.limits.maxRetainedMemoryBytes = 1
    const event = completed()
    if (kind === 'tokens') {
      event.usage.outputTokens = { status: 'reported', value: 11 }
    }

    await expect(
      collect(
        createAiRunCoordinator({ coordination: store() }).coordinate(
          limited,
          () =>
            (async function* () {
              yield event
            })(),
          () => undefined,
        ),
      ),
    ).resolves.toMatchObject([
      { failure: { diagnosticCode: code }, type: 'failed' },
    ])
  })

  it('enforces retained memory independently while streaming analysis', async () => {
    const limited = request()
    limited.limits.maxRetainedMemoryBytes = 1

    await expect(
      collect(
        createAiRunCoordinator({ coordination: store() }).coordinate(
          limited,
          () =>
            (async function* () {
              yield { delta: 'ab', type: 'analysis_delta' as const }
            })(),
          () => undefined,
        ),
      ),
    ).resolves.toMatchObject([
      {
        failure: { diagnosticCode: 'retained_memory_limit_exceeded' },
        type: 'failed',
      },
    ])
  })

  it.each(['lost', 'threw'] as const)(
    'cancels when lease renewal is %s',
    async renewal => {
      vi.useFakeTimers()
      try {
        const renew = vi.fn(() =>
          renewal === 'lost'
            ? Promise.resolve(false)
            : Promise.reject(new Error('SQL unavailable')),
        )
        let markStarted = (): void => undefined
        const started = new Promise<void>(resolve => {
          markStarted = resolve
        })
        const coordination = store({ renew })
        const leasedRequest = request()
        leasedRequest.profile.inactivityTimeBudgetMs = 30_000
        leasedRequest.profile.totalTimeBudgetMs = 40_000
        const collecting = collect(
          createAiRunCoordinator({ coordination }).coordinate(
            leasedRequest,
            (_attempt, signal) => ({
              [Symbol.asyncIterator]() {
                markStarted()
                return {
                  next: () =>
                    new Promise<IteratorResult<AiRunEvent>>(resolve => {
                      signal.addEventListener(
                        'abort',
                        () => resolve({ done: true, value: undefined }),
                        { once: true },
                      )
                    }),
                }
              },
            }),
            () => undefined,
          ),
        )
        await started
        await vi.advanceTimersByTimeAsync(10_000)

        await expect(collecting).resolves.toMatchObject([
          {
            failure: { diagnosticCode: 'coordination_lease_lost' },
            type: 'failed',
          },
        ])
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('cancels an in-flight attempt when administration requests durable cancellation', async () => {
    vi.useFakeTimers()
    try {
      const cancellationRequested = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          reason: 'connection_suspended',
          requestedAt: new Date(),
        })
      let markStarted = (): void => undefined
      const started = new Promise<void>(resolve => {
        markStarted = resolve
      })
      const coordination = store({ cancellationRequested })
      const suspendedRequest = request()
      suspendedRequest.profile.inactivityTimeBudgetMs = 30_000
      suspendedRequest.profile.totalTimeBudgetMs = 40_000
      const collecting = collect(
        createAiRunCoordinator({ coordination }).coordinate(
          suspendedRequest,
          (_attempt, signal) => ({
            [Symbol.asyncIterator]() {
              markStarted()
              return {
                next: () =>
                  new Promise<IteratorResult<AiRunEvent>>(resolve => {
                    signal.addEventListener(
                      'abort',
                      () => resolve({ done: true, value: undefined }),
                      { once: true },
                    )
                  }),
              }
            },
          }),
          () => undefined,
        ),
      )
      await started
      await vi.advanceTimersByTimeAsync(2_000)

      await expect(collecting).resolves.toEqual([
        {
          identity: IDENTITY,
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
      expect(cancellationRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationRunId: request().applicationRunId,
          fencingToken: expect.any(String),
        }),
      )
      expect(coordination.finish).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'cancelled' }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('force-closes an uncooperative attempt within five seconds of the durable admin request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    try {
      const requestedAt = new Date(Date.now() + 1)
      const cancellationRequested = vi.fn(async () => ({
        reason: 'connection_suspended' as const,
        requestedAt,
      }))
      let markStarted = (): void => undefined
      const started = new Promise<void>(resolve => {
        markStarted = resolve
      })
      const forceClosedAt: number[] = []
      const coordination = store({ cancellationRequested })
      const suspendedRequest = request()
      suspendedRequest.profile.inactivityTimeBudgetMs = 30_000
      suspendedRequest.profile.totalTimeBudgetMs = 40_000
      const collecting = collect(
        createAiRunCoordinator({ coordination }).coordinate(
          suspendedRequest,
          () => ({
            [Symbol.asyncIterator]() {
              markStarted()
              return {
                next: () => new Promise<IteratorResult<AiRunEvent>>(() => {}),
                return: () => new Promise<IteratorResult<AiRunEvent>>(() => {}),
              }
            },
          }),
          () => forceClosedAt.push(Date.now()),
        ),
      )
      await started
      await vi.advanceTimersByTimeAsync(5_001)

      await expect(collecting).resolves.toMatchObject([{ type: 'cancelled' }])
      expect(forceClosedAt).toHaveLength(1)
      expect(forceClosedAt[0] - requestedAt.getTime()).toBeLessThanOrEqual(
        5_000,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['connection_suspended', 'connection_retired'] as const)(
    'maps queued admin cancellation %s to one health-neutral terminal',
    async reason => {
      const execute = vi.fn(() => (async function* () {})())
      const telemetry: AiRunTelemetryEvent[] = []
      const coordination = store({
        acquire: vi.fn(async () => ({
          reason,
          requestedAt: new Date('2026-08-20T12:00:00.000Z'),
          status: 'cancelled' as const,
        })),
      })

      await expect(
        collect(
          createAiRunCoordinator({
            coordination,
            telemetry: {
              emit: event => {
                telemetry.push(event)
              },
            },
          }).coordinate(request(), execute, () => undefined),
        ),
      ).resolves.toEqual([
        {
          identity: IDENTITY,
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
      expect(execute).not.toHaveBeenCalled()
      expect(coordination.abandon).toHaveBeenCalledOnce()
      expect(coordination.finish).not.toHaveBeenCalled()
      expect(telemetry.at(-1)).toMatchObject({
        cancellationReason: reason,
        name: 'ai_run_terminal',
        outcome: 'cancelled',
      })
    },
  )

  it('preserves profile suspension when an admin-cancelled run is in retry wait', async () => {
    const reason = 'profile_suspended' as const
    const coordination = store({
      acquire: vi
        .fn()
        .mockResolvedValueOnce({ status: 'acquired' })
        .mockResolvedValueOnce({
          reason,
          requestedAt: new Date('2026-08-20T12:00:00.000Z'),
          status: 'cancelled',
        }),
    })
    const execute = vi.fn(() =>
      (async function* () {
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
    const telemetry: AiRunTelemetryEvent[] = []

    await expect(
      collect(
        createAiRunCoordinator({
          coordination,
          delay: async () => undefined,
          random: () => 0,
          telemetry: {
            emit: event => {
              telemetry.push(event)
            },
          },
        }).coordinate(request(), execute, () => undefined),
      ),
    ).resolves.toMatchObject([{ type: 'cancelled' }])
    expect(execute).toHaveBeenCalledOnce()
    expect(coordination.abandon).toHaveBeenCalledOnce()
    expect(coordination.finish).not.toHaveBeenCalled()
    expect(telemetry.at(-1)).toMatchObject({
      cancellationReason: reason,
      outcome: 'cancelled',
    })
  })

  it('polls durable admin cancellation during a real long retry-after wait', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    try {
      const requestedAt = new Date(Date.now() + 1)
      const cancellationRequested = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          reason: 'profile_suspended',
          requestedAt,
        })
      const coordination = store({ cancellationRequested })
      const retryingRequest = request()
      retryingRequest.profile.inactivityTimeBudgetMs = 300_000
      retryingRequest.profile.totalTimeBudgetMs = 1_000_000
      const execute = vi.fn(() =>
        (async function* () {
          yield {
            failure: {
              category: 'rate_limited' as const,
              retryAfterSeconds: 600,
              retryDisposition: 'explicit_retryable_status' as const,
              retryable: true,
            },
            identity: IDENTITY,
            type: 'failed' as const,
          }
        })(),
      )
      const telemetry: AiRunTelemetryEvent[] = []
      const collecting = collect(
        createAiRunCoordinator({
          coordination,
          telemetry: {
            emit: event => {
              telemetry.push(event)
            },
          },
        }).coordinate(retryingRequest, execute, () => undefined),
      )
      await vi.waitFor(() => {
        expect(coordination.requeueForRetry).toHaveBeenCalledOnce()
      })
      await vi.advanceTimersByTimeAsync(2_000)

      await expect(collecting).resolves.toMatchObject([{ type: 'cancelled' }])
      expect(execute).toHaveBeenCalledOnce()
      expect(coordination.abandon).toHaveBeenCalledOnce()
      expect(coordination.finish).not.toHaveBeenCalled()
      expect(Date.now() - requestedAt.getTime()).toBeLessThanOrEqual(5_000)
      expect(telemetry.at(-1)).toMatchObject({
        cancellationReason: 'profile_suspended',
        outcome: 'cancelled',
      })
    } finally {
      vi.useRealTimers()
    }
  })

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

    const events = await collect(
      coordinator.coordinate(request(), execute, () => undefined),
    )

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

    const events = await collect(
      coordinator.coordinate(request(), execute, () => undefined),
    )

    expect(events.at(-1)?.type).toBe('completed')
    expect(execute).toHaveBeenCalledTimes(2)
    expect(coordination.requeueForRetry).toHaveBeenCalledTimes(1)
    expect(coordination.acquire).toHaveBeenCalledTimes(2)
  })

  it('stops with one safe terminal when retry requeue loses its live lease', async () => {
    const coordination = store({
      requeueForRetry: vi.fn(async () => 'lease_lost' as const),
    })
    const execute = vi.fn(() =>
      (async function* () {
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

    await expect(
      collect(
        createAiRunCoordinator({
          coordination,
          delay: async () => undefined,
          random: () => 0,
        }).coordinate(request(), execute, () => undefined),
      ),
    ).resolves.toMatchObject([
      {
        failure: { diagnosticCode: 'coordination_lease_lost' },
        type: 'failed',
      },
    ])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordination.acquire).toHaveBeenCalledTimes(1)
    expect(coordination.finish).not.toHaveBeenCalled()
    expect(coordination.abandon).not.toHaveBeenCalled()
  })

  it('abandons a queued row when cancelled before capacity acquisition', async () => {
    const controller = new AbortController()
    controller.abort()
    const coordination = store()

    await expect(
      collect(
        createAiRunCoordinator({ coordination }).coordinate(
          request(controller.signal),
          () => (async function* () {})(),
          () => undefined,
        ),
      ),
    ).resolves.toMatchObject([{ type: 'cancelled' }])
    expect(coordination.abandon).toHaveBeenCalledWith({
      applicationRunId: request().applicationRunId,
      fencingToken: expect.any(String),
    })
    expect(coordination.finish).not.toHaveBeenCalled()
  })

  it('abandons a retry-wait row when cancelled during retry delay', async () => {
    const controller = new AbortController()
    const coordination = store()
    const execute = vi.fn(() =>
      (async function* () {
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

    await expect(
      collect(
        createAiRunCoordinator({
          coordination,
          delay: async () => controller.abort(),
          random: () => 0,
        }).coordinate(request(controller.signal), execute, () => undefined),
      ),
    ).resolves.toMatchObject([{ type: 'cancelled' }])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordination.requeueForRetry).toHaveBeenCalledTimes(1)
    expect(coordination.abandon).toHaveBeenCalledTimes(1)
    expect(coordination.finish).not.toHaveBeenCalled()
  })

  it('cancels the default retry wait without waiting for its timer', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const coordination = store()
      const execute = vi.fn(() =>
        (async function* () {
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
      const collecting = collect(
        createAiRunCoordinator({
          coordination,
          random: () => 0,
        }).coordinate(request(controller.signal), execute, () => undefined),
      )

      await vi.waitFor(() => {
        expect(coordination.requeueForRetry).toHaveBeenCalledTimes(1)
      })
      controller.abort()

      await expect(collecting).resolves.toMatchObject([{ type: 'cancelled' }])
      expect(vi.getTimerCount()).toBe(0)
      expect(coordination.abandon).toHaveBeenCalledTimes(1)
      expect(coordination.finish).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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

    const events = await collect(
      coordinator.coordinate(request(), execute, () => undefined),
    )

    expect(events.map(event => event.type)).toEqual([
      'analysis_delta',
      'failed',
    ])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('does not pull another adapter event while downstream is blocked', async () => {
    let pulls = 0
    const coordinator = createAiRunCoordinator({ coordination: store() })
    const stream = coordinator.coordinate(
      request(),
      () => ({
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
      }),
      () => undefined,
    )
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({
      value: { delta: 'a' },
    })
    expect(pulls).toBe(1)
    await iterator.return?.()
  })

  it('forwards heartbeats and treats them as idle progress', async () => {
    const coordinator = createAiRunCoordinator({ coordination: store() })
    const events = await collect(
      coordinator.coordinate(
        request(),
        () =>
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
        () => undefined,
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
      collect(
        coordinator.coordinate(budgetedRequest, execute, () => undefined),
      ),
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

  it('ends a never-settling completion decision at the total deadline', async () => {
    vi.useFakeTimers()
    try {
      let markDecisionStarted = (): void => undefined
      const decisionStarted = new Promise<void>(resolve => {
        markDecisionStarted = resolve
      })
      const coordination = store()
      const budgetedRequest = request()
      budgetedRequest.profile.totalTimeBudgetMs = 100
      let decisionSignal: AbortSignal | undefined
      const decideCompleted = vi.fn((_event, _attempt, context) => {
        decisionSignal = context.abortSignal
        markDecisionStarted()
        return new Promise<never>(() => undefined)
      })
      const collecting = collect(
        createAiRunCoordinator({ coordination }).coordinate(
          budgetedRequest,
          () =>
            (async function* () {
              yield completed()
            })(),
          () => undefined,
          decideCompleted,
        ),
      )
      let settled = false
      void collecting.then(() => {
        settled = true
      })
      await decisionStarted

      await vi.advanceTimersByTimeAsync(100)

      expect(settled).toBe(true)
      await expect(collecting).resolves.toMatchObject([
        {
          failure: {
            category: 'deadline_exceeded',
            diagnosticCode: 'total_budget_exceeded',
          },
          type: 'failed',
        },
      ])
      expect(coordination.finish).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed' }),
      )
      expect(decisionSignal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a never-settling completion decision when the caller aborts', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      let decisionSignal: AbortSignal | undefined
      let markDecisionStarted = (): void => undefined
      const decisionStarted = new Promise<void>(resolve => {
        markDecisionStarted = resolve
      })
      const coordination = store()
      const decideCompleted = vi.fn((_event, _attempt, context) => {
        decisionSignal = context.abortSignal
        markDecisionStarted()
        return new Promise<never>(() => undefined)
      })
      const collecting = collect(
        createAiRunCoordinator({ coordination }).coordinate(
          request(controller.signal),
          () =>
            (async function* () {
              yield completed()
            })(),
          () => undefined,
          decideCompleted,
        ),
      )
      await decisionStarted

      controller.abort()

      await expect(collecting).resolves.toEqual([
        {
          identity: IDENTITY,
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
      expect(decisionSignal?.aborted).toBe(true)
      expect(coordination.finish).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'cancelled' }),
      )
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('observes caller abort while a completion decision starts synchronously', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const coordination = store()
      let decisionSignal: AbortSignal | undefined
      const decideCompleted = vi.fn((_event, _attempt, context) => {
        decisionSignal = context.abortSignal
        controller.abort()
        return new Promise<never>(() => undefined)
      })
      const collecting = collect(
        createAiRunCoordinator({ coordination }).coordinate(
          request(controller.signal),
          () =>
            (async function* () {
              yield completed()
            })(),
          () => undefined,
          decideCompleted,
        ),
      )
      await expect(collecting).resolves.toEqual([
        {
          identity: IDENTITY,
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
      expect(coordination.finish).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'cancelled' }),
      )
      expect(decisionSignal).toBeDefined()
      expect(getEventListeners(decisionSignal as AbortSignal, 'abort')).toEqual(
        [],
      )
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets each heartbeat reset only the inactivity budget', async () => {
    let currentTime = 0
    const coordinator = createAiRunCoordinator({
      coordination: store(),
      now: () => currentTime,
    })
    const events = await collect(
      coordinator.coordinate(
        request(),
        () =>
          (async function* () {
            currentTime = 900
            yield { type: 'heartbeat' as const }
            currentTime = 1_800
            yield completed()
          })(),
        () => undefined,
      ),
    )

    expect(events.map(event => event.type)).toEqual(['heartbeat', 'completed'])
  })

  it.each([
    'authentication_failed',
    'deadline_exceeded',
    'invalid_response',
    'capability_mismatch',
  ] as const)('never retries forbidden %s failures', async category => {
    const coordination = store()
    const execute = vi.fn(() =>
      (async function* () {
        yield {
          failure: {
            category,
            retryDisposition: 'idempotent' as const,
            retryable: true,
          },
          identity: IDENTITY,
          type: 'failed' as const,
        }
      })(),
    )

    await collect(
      createAiRunCoordinator({ coordination }).coordinate(
        request(),
        execute,
        () => undefined,
      ),
    )

    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordination.requeueForRetry).not.toHaveBeenCalled()
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
            category: 'connection_unavailable' as const,
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
      collect(
        coordinator.coordinate(budgetedRequest, execute, () => undefined),
      ),
    ).resolves.toMatchObject([
      {
        failure: {
          category: 'rate_limited',
          diagnosticCode: 'retry_after_exceeds_remaining_budget',
        },
        type: 'failed',
      },
    ])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordination.requeueForRetry).not.toHaveBeenCalled()
  })

  it('normalizes silent EOF and thrown coordination failures to one terminal', async () => {
    const eof = await collect(
      createAiRunCoordinator({ coordination: store() }).coordinate(
        request(),
        () => (async function* () {})(),
        () => undefined,
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
      createAiRunCoordinator({ coordination }).coordinate(
        request(),
        () => (async function* () {})(),
        () => undefined,
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
    expect(coordination.finish).not.toHaveBeenCalled()
  })

  it('cancels an uncooperative adapter within the five-second grace', async () => {
    vi.useFakeTimers()
    try {
      const abortController = new AbortController()
      const coordination = store()
      const adapterAbort = vi.fn()
      const forceClose = vi.fn()
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
        forceClose,
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
      expect(forceClose).toHaveBeenCalledTimes(1)
      expect(coordination.finish).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never finalizes a run that this invocation failed to admit', async () => {
    const coordination = store({
      enqueue: vi.fn(async () => {
        throw new Error('duplicate application run id')
      }),
    })

    await collect(
      createAiRunCoordinator({ coordination }).coordinate(
        request(),
        () => (async function* () {})(),
        () => undefined,
      ),
    )

    expect(coordination.finish).not.toHaveBeenCalled()
  })

  it('emits content-free telemetry and binding alarm categories', async () => {
    const telemetry: AiRunTelemetryEvent[] = []
    const coordination = store()
    const coordinator = createAiRunCoordinator({
      coordination,
      leaseOwnerId: 'worker-1',
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

    await collect(coordinator.coordinate(request(), execute, () => undefined))

    expect(telemetry.map(event => event.name)).toEqual([
      'ai_run_started',
      'ai_attempt_terminal',
      'ai_alarm_authentication_failed',
      'ai_run_terminal',
    ])
    expect(telemetry.at(-1)).toMatchObject({
      adapterType: 'controlled_test',
      adapterVersion: '1',
      correlationId: 'correlation-1',
      requestId: 'request-1',
      retryCount: 0,
    })
    expect(coordination.finish).toHaveBeenCalledWith(
      expect.objectContaining({ leaseOwnerId: 'worker-1' }),
    )
    expect(JSON.stringify(telemetry)).not.toMatch(
      /prompt|output|secret|endpoint|12345678/u,
    )
  })

  it('reports queue saturation with request and correlation identifiers', async () => {
    const telemetry: AiRunTelemetryEvent[] = []
    const coordination = store({
      enqueue: vi.fn(async () => ({
        activeConcurrency: 4,
        queueDepth: 7,
        retryAfterSeconds: 60,
        status: 'queue_full' as const,
      })),
    })

    await collect(
      createAiRunCoordinator({
        coordination,
        telemetry: {
          emit: event => {
            telemetry.push(event)
          },
        },
      }).coordinate(
        request(),
        () => (async function* () {})(),
        () => undefined,
      ),
    )

    expect(telemetry.at(-1)).toMatchObject({
      activeConcurrency: 4,
      correlationId: 'correlation-1',
      failureCategory: 'rate_limited',
      queueDepth: 7,
      requestId: 'request-1',
    })
  })
})
