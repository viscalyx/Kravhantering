import { getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import {
  type AiIntegrationLayerWithSafeInvalidOutput,
  createAiIntegrationLayer,
} from '@/lib/ai/integration-layer'
import {
  type AiPersistedRunProfile,
  createAiRunProfileResolver,
} from '@/lib/ai/profile-resolver'
import type {
  AIConnectionAdapter,
  AiConnectionAdapterRunRequest,
  AiRunEvent,
  AiRunIdentity,
  AiRunUsage,
} from '@/lib/ai/run-contracts'
import type {
  AiRecoveryProbeTarget,
  AiRunCoordinationStore,
  AiRunCoordinator,
  AiRunTelemetryEvent,
} from '@/lib/ai/run-coordinator'
import { createAiRunCoordinator } from '@/lib/ai/run-coordinator'
import type { AiRunTrustBoundary } from '@/lib/ai/run-trust-boundary'

const USAGE: AiRunUsage = {
  analysisTokens: { reason: 'not_reported', status: 'unavailable' },
  cost: { reason: 'not_reported', status: 'unavailable' },
  inputTokens: { reason: 'not_reported', status: 'unavailable' },
  outputTokens: { reason: 'not_reported', status: 'unavailable' },
  totalTokens: { reason: 'not_reported', status: 'unavailable' },
}

const TEST_EGRESS = { fetch: vi.fn() }
const PASSING_TRUST_BOUNDARY: AiRunTrustBoundary = {
  approveCompleted: vi.fn(async () => ({ valid: true }) as const),
  preflightSafetyRules: vi.fn(async () => undefined),
  prepareRun: vi.fn(async input => ({
    egress: TEST_EGRESS,
    task: input.task,
  })),
}

function profile(
  adapterType = 'capture',
  adapterVersion = '3',
): AiPersistedRunProfile {
  return {
    adapterType,
    adapterVersion,
    connectionAgentRuntimeVersion: null,
    connectionConfigurationVersion: 4,
    connectionId: 'connection-17',
    connectionLifecycleStatus: 'active',
    connectionMaximumConcurrency: 4,
    connectionPublicName: 'Test connection',
    connectionDataPolicySummary: 'Test data policy',
    externalModelId: 'external-model-v1',
    modelRevisionAgentRuntimeVersion: null,
    modelRevisionConnectionConfigurationVersion: 4,
    modelRevisionId: 'model-revision-23',
    modelRevisionMaximumConcurrency: null,
    modelRevisionStatus: 'verified',
    operationalStatus: 'enabled',
    inactivityTimeBudgetSeconds: 300,
    maximumBufferedEvents: 32,
    maximumOutputBytes: 4_194_304,
    maximumOutputTokens: 8_192,
    maximumRetainedMemoryBytes: 8_388_608,
    profileConfigurationVersion: 1,
    profileId: 'profile-31',
    trustConfiguration: {
      authenticationType: 'static_secret',
      dataPolicy: {
        isPersonalDataProcessed: false,
        isTrainingAllowed: false,
        maximumInformationClass: 'internal',
        maximumRetentionDays: 0,
        processingRegions: ['SE'],
        subprocessors: [],
      },
      egressPolicyKey: 'capture',
      endpointUrl: 'https://capture.invalid/v1',
      tlsPolicyKey: 'public_web_pki',
    },
    queueCapacity: 10,
    totalTimeBudgetSeconds: 1_200,
    verifiedCapabilitiesJson: JSON.stringify({
      aiAnalysis: false,
      cost: false,
      imageInput: false,
      jsonSchemaSteering: true,
      streaming: true,
      tokenUsage: true,
      validatableJson: true,
    }),
  }
}

let automaticRecoveryProbe:
  | Parameters<AiRunCoordinator['startAutomaticRecovery']>[0]
  | undefined

const RUN_COORDINATOR: AiRunCoordinator = {
  async *coordinate(
    request,
    executeAttempt,
    forceCloseAttempt,
    decideCompleted,
  ) {
    for await (const event of executeAttempt(
      1,
      request.abortSignal,
      new Date(Date.now() + 60_000).toISOString(),
    )) {
      yield event.type === 'completed' && decideCompleted
        ? await decideCompleted(event, 1, {
            abortSignal: request.abortSignal,
            totalDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
          })
        : event
    }
    forceCloseAttempt(request.applicationRunId)
  },
  runDueRecoveryProbes: async () => undefined,
  runManualHealthProbe: async () => ({ succeeded: true }),
  startAutomaticRecovery(executeProbe) {
    automaticRecoveryProbe = executeProbe
    return () => undefined
  },
}

function request(abortSignal = new AbortController().signal) {
  return {
    context: {
      abortSignal,
      applicationRunId: 'app-run-private',
      correlationId: 'correlation-private',
      deadlineAt: '2026-08-19T12:30:00.000Z',
    },
    task: {
      content: [{ text: 'Generate requirements', type: 'text' as const }],
      instructions: 'Return JSON.',
      responseSchema: { type: 'object' },
      validationSchema: { type: 'object' },
    },
    type: 'generate_without_images' as const,
  }
}

function recoveryTarget(
  overrides: Partial<AiRecoveryProbeTarget> = {},
): AiRecoveryProbeTarget {
  return {
    adapterType: 'capture',
    adapterVersion: '3',
    identity: {
      aiConnectionId: 'connection-17',
      aiConnectionModelRevisionId: 'model-revision-23',
      aiRunProfileConfigurationVersion: 1,
      aiRunProfileId: 'profile-31',
    } as AiRunIdentity,
    inactivityTimeBudgetMs: 1_000,
    runType: 'generate_without_images',
    totalTimeBudgetMs: 10_000,
    ...overrides,
  }
}

function completedAdapterEvent(
  adapterRequest: AiConnectionAdapterRunRequest,
): Extract<AiRunEvent, { type: 'completed' }> {
  return {
    analysis: null,
    identity: {
      aiConnectionId: adapterRequest.connection.id,
      aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
      aiRunProfileConfigurationVersion: 1,
      aiRunProfileId: adapterRequest.runProfileId,
    },
    rawOutput: '{"status":"ok"}',
    type: 'completed',
    usage: USAGE,
  }
}

async function collect(
  events: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const result: AiRunEvent[] = []
  for await (const event of events) result.push(event)
  return result
}

function integration(
  adapter: AIConnectionAdapter,
  stored = profile(),
  trustBoundary: AiRunTrustBoundary = PASSING_TRUST_BOUNDARY,
  runCoordinator: AiRunCoordinator = RUN_COORDINATOR,
): AiIntegrationLayerWithSafeInvalidOutput {
  const resolver = createAiRunProfileResolver({
    profileSource: { findProfile: async () => stored },
    resolveAdapterConfiguration: async (_profile, use) => {
      await use({
        connection: { opaque: 'connection-configuration' },
        modelRevision: { opaque: 'model-configuration' },
      })
    },
  })
  return createAiIntegrationLayer({
    adapterRegistry: createAiConnectionAdapterRegistry([
      {
        adapter,
        adapterType: 'capture',
        adapterVersion: '3',
      },
    ]),
    profileResolver: resolver,
    trustBoundary,
    runCoordinator,
  })
}

function coordinationStore(): AiRunCoordinationStore {
  return {
    abandon: vi.fn(async () => undefined),
    acquire: vi.fn(async () => ({ status: 'acquired' }) as const),
    acquireManualRecoveryProbe: vi.fn(async () => null),
    acquireRecoveryProbe: vi.fn(async () => false),
    enqueue: vi.fn(async () => ({ status: 'queued' }) as const),
    finish: vi.fn(async () => undefined),
    finishRecoveryProbe: vi.fn(async () => undefined),
    listDueRecoveryProbes: vi.fn(async () => []),
    renew: vi.fn(async () => true),
    requeueForRetry: vi.fn(async () => 'applied' as const),
  }
}

describe('AI integration layer', () => {
  it('stops on a safety-rule preflight failure before profile resolution', async () => {
    const resolve = vi.fn(async () => {
      throw new Error('profile resolution must not run')
    })
    const prepareRun = vi.fn()
    const layer = createAiIntegrationLayer({
      adapterRegistry: createAiConnectionAdapterRegistry([]),
      profileResolver: { resolve },
      runCoordinator: RUN_COORDINATOR,
      trustBoundary: {
        approveCompleted: vi.fn(async () => ({ valid: true }) as const),
        preflightSafetyRules: vi.fn(async () => {
          throw new Error('safety-rule read failed')
        }),
        prepareRun,
      },
    })

    await expect(collect(layer.run(request()))).rejects.toThrow(
      'safety-rule read failed',
    )
    expect(resolve).not.toHaveBeenCalled()
    expect(prepareRun).not.toHaveBeenCalled()
  })

  it.each([
    'generate_without_images',
    'generate_with_images',
    'repair_invalid_import_json',
  ] as const)(
    'passes the server privacy minimum to the final adapter request for %s',
    async type => {
      let received: AiConnectionAdapterRunRequest | undefined
      const adapter: AIConnectionAdapter = {
        forceClose: vi.fn(),
        async *run(adapterRequest) {
          received = adapterRequest
          yield completedAdapterEvent(adapterRequest)
        },
      }

      const stored = profile()
      stored.verifiedCapabilitiesJson = JSON.stringify({
        aiAnalysis: true,
        cost: false,
        imageInput: true,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
        validatableJson: true,
      })

      await collect(integration(adapter, stored).run({ ...request(), type }))

      expect(received).toMatchObject({
        privacyPolicy: {
          allowDataCollection: false,
          requireZeroDataRetention: true,
        },
      })
    },
  )

  it('runs the fixed synthetic recovery probe through a fresh exact profile', async () => {
    let received: AiConnectionAdapterRunRequest | undefined
    const adapter: AIConnectionAdapter = {
      forceClose: vi.fn(),
      async *run(adapterRequest) {
        received = adapterRequest
        yield { delta: 'thinking', type: 'analysis_delta' }
        yield {
          delta: '{"status":"ok"}',
          type: 'output_delta',
          visibility: 'internal',
        }
        yield {
          analysis: 'thinking',
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"status":"ok"}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }
    integration(adapter)

    await expect(
      automaticRecoveryProbe?.(
        recoveryTarget(),
        'probe-run-1',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ succeeded: true, usage: USAGE })
    expect(received).toMatchObject({
      context: {
        deadlineAt: expect.any(String),
        externalRunId: expect.any(String),
      },
      limits: { maxOutputTokens: 8_192 },
      task: {
        content: [
          {
            text: 'Return a JSON object whose status property is "ok".',
            type: 'text',
          },
        ],
      },
    })
    expect(JSON.stringify(received)).not.toContain('Generate requirements')
  })

  it('blocks recovery when the active exact profile changed', async () => {
    const adapter: AIConnectionAdapter = {
      forceClose: vi.fn(),
      async *run() {
        yield* [] as AiRunEvent[]
      },
    }
    integration(adapter)

    await expect(
      automaticRecoveryProbe?.(
        recoveryTarget({
          identity: {
            ...recoveryTarget().identity,
            aiConnectionModelRevisionId: 'retired-model-revision',
          } as AiRunIdentity,
        }),
        'probe-run-2',
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      failure: { diagnosticCode: 'health_probe_profile_changed' },
      succeeded: false,
    })
  })

  it('blocks recovery when its active profile can no longer resolve', async () => {
    const adapter: AIConnectionAdapter = {
      forceClose: vi.fn(),
      async *run() {
        yield* [] as AiRunEvent[]
      },
    }
    integration(adapter, {
      ...profile(),
      connectionLifecycleStatus: 'suspended',
    })

    await expect(
      automaticRecoveryProbe?.(
        recoveryTarget(),
        'probe-run-unavailable',
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      failure: { diagnosticCode: 'health_probe_profile_unavailable' },
      succeeded: false,
    })
  })

  it.each([
    {
      event: {
        failure: {
          category: 'connection_unavailable' as const,
          retryable: true,
        },
        identity: recoveryTarget().identity,
        type: 'failed' as const,
      },
      expected: 'connection_unavailable',
    },
    {
      event: {
        identity: recoveryTarget().identity,
        reason: 'application_cancelled' as const,
        type: 'cancelled' as const,
      },
      expected: 'connection_unavailable',
    },
  ])(
    'normalizes a recovery terminal without exposing its payload',
    async scenario => {
      const adapter: AIConnectionAdapter = {
        forceClose: vi.fn(),
        async *run() {
          yield scenario.event
        },
      }
      integration(adapter)

      await expect(
        automaticRecoveryProbe?.(
          recoveryTarget(),
          'probe-run-terminal',
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({
        failure: { category: scenario.expected },
        succeeded: false,
      })
    },
  )

  it('aborts a recovery probe at the application byte limit', async () => {
    const adapter: AIConnectionAdapter = {
      forceClose: vi.fn(),
      async *run() {
        yield {
          delta: 'x'.repeat(4_194_305),
          type: 'output_delta',
          visibility: 'internal',
        }
      },
    }
    integration(adapter)

    await expect(
      automaticRecoveryProbe?.(
        recoveryTarget(),
        'probe-run-limit',
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      failure: { diagnosticCode: 'health_probe_limit_exceeded' },
      succeeded: false,
    })
  })

  it('rejects an over-limit reported token count in a recovery completion', async () => {
    const adapter: AIConnectionAdapter = {
      forceClose: vi.fn(),
      async *run(adapterRequest) {
        yield {
          ...completedAdapterEvent(adapterRequest),
          usage: {
            ...USAGE,
            outputTokens: { status: 'reported' as const, value: 8_193 },
          },
        }
      },
    }
    integration(adapter)

    await expect(
      automaticRecoveryProbe?.(
        recoveryTarget(),
        'probe-run-token-limit',
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      failure: { diagnosticCode: 'health_probe_limit_exceeded' },
      succeeded: false,
    })
  })

  it.each(['not json', '{"status":"bad"}', '{"status":"ok","extra":true}'])(
    'rejects recovery output outside the fixed health schema: %s',
    async rawOutput => {
      const adapter: AIConnectionAdapter = {
        forceClose: vi.fn(),
        async *run(adapterRequest) {
          yield { ...completedAdapterEvent(adapterRequest), rawOutput }
        },
      }
      integration(adapter)

      await expect(
        automaticRecoveryProbe?.(
          recoveryTarget(),
          'probe-run-schema',
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({
        failure: { diagnosticCode: 'health_probe_schema_invalid' },
        succeeded: false,
      })
    },
  )

  it('ends a recovery probe when its inactivity budget expires', async () => {
    vi.useFakeTimers()
    try {
      let markStarted = (): void => undefined
      const started = new Promise<void>(resolve => {
        markStarted = resolve
      })
      const adapter: AIConnectionAdapter = {
        forceClose: vi.fn(),
        run() {
          return {
            [Symbol.asyncIterator]() {
              return {
                next: () => {
                  markStarted()
                  return new Promise<IteratorResult<AiRunEvent>>(
                    () => undefined,
                  )
                },
                return: async () => ({ done: true, value: undefined }),
              }
            },
          }
        },
      }
      integration(adapter)
      const probing = automaticRecoveryProbe?.(
        recoveryTarget({ inactivityTimeBudgetMs: 25 }),
        'probe-run-idle',
        new AbortController().signal,
      )
      await started
      await vi.advanceTimersByTimeAsync(25)
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(probing).resolves.toMatchObject({
        failure: {
          diagnosticCode: 'health_probe_inactivity_budget_exceeded',
        },
        succeeded: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('contains recovery iterator cleanup rejection', async () => {
    const adapter: AIConnectionAdapter = {
      forceClose: vi.fn(),
      run(adapterRequest) {
        let emitted = false
        return {
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                if (emitted) return { done: true as const, value: undefined }
                emitted = true
                return {
                  done: false as const,
                  value: completedAdapterEvent(adapterRequest),
                }
              },
              return: async () => {
                throw new Error('private cleanup failure')
              },
            }
          },
        }
      },
    }
    integration(adapter)

    await expect(
      automaticRecoveryProbe?.(
        recoveryTarget(),
        'probe-run-cleanup',
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ succeeded: true })
  })

  it('force-closes an uncooperative recovery transport after five seconds', async () => {
    vi.useFakeTimers()
    try {
      let markStarted = (): void => undefined
      const started = new Promise<void>(resolve => {
        markStarted = resolve
      })
      const forceClose = vi.fn()
      const adapter: AIConnectionAdapter = {
        forceClose,
        run() {
          return {
            [Symbol.asyncIterator]() {
              markStarted()
              return {
                next: () =>
                  new Promise<IteratorResult<AiRunEvent>>(() => undefined),
                return: () =>
                  new Promise<IteratorResult<AiRunEvent>>(() => undefined),
              }
            },
          }
        },
      }
      integration(adapter)
      const controller = new AbortController()
      const probing = automaticRecoveryProbe?.(
        recoveryTarget(),
        'probe-run-abort',
        controller.signal,
      )
      await started
      controller.abort()
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(probing).resolves.toMatchObject({
        failure: { diagnosticCode: 'health_probe_deadline_exceeded' },
        succeeded: false,
      })
      expect(forceClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs one exact frozen profile revision through its exact adapter revision', async () => {
    let received: AiConnectionAdapterRunRequest | undefined
    const runRequest = request()
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        received = adapterRequest
        yield {
          analysis: null,
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"requirements":[]}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }

    await expect(
      collect(integration(adapter).run(runRequest)),
    ).resolves.toEqual([
      {
        analysis: null,
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        rawOutput: '{"requirements":[]}',
        type: 'completed',
        usage: USAGE,
      },
    ])
    expect(received).toMatchObject({
      connection: {
        configuration: { opaque: 'connection-configuration' },
        id: 'connection-17',
      },
      context: {
        abortSignal: runRequest.context.abortSignal,
        deadlineAt: expect.any(String),
        externalRunId: expect.stringMatching(/^airun_/u),
      },
      limits: {
        maxBufferedEvents: 32,
        maxOutputBytes: 4_194_304,
        maxOutputTokens: 8_192,
        maxRetainedMemoryBytes: 8_388_608,
      },
      modelRevision: {
        configuration: { opaque: 'model-configuration' },
        externalModelId: 'external-model-v1',
        id: 'model-revision-23',
      },
      runProfileConfigurationVersion: 1,
      runProfileId: 'profile-31',
      selectedCapabilities: {
        aiAnalysis: false,
        cost: false,
        imageInput: false,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
        validatableJson: true,
      },
    })
    expect(JSON.stringify(received?.context)).not.toMatch(
      /app-run-private|correlation-private/u,
    )
  })

  it('blocks before egress when the exact persisted adapter version is unavailable', async () => {
    let called = false
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run() {
        called = true
        yield* [] as AiRunEvent[]
      },
    }
    const stored = profile('capture', 'retired-version')

    await expect(
      collect(integration(adapter, stored).run(request())),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
      localizationKey: 'ai.runProfile.profileBlocked',
    })
    expect(called).toBe(false)
  })

  it('blocks safely before adapter egress when transient configuration is unavailable', async () => {
    let called = false
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run() {
        called = true
        yield* [] as AiRunEvent[]
      },
    }
    const resolver = createAiRunProfileResolver({
      profileSource: { findProfile: async () => profile() },
      resolveAdapterConfiguration: async () => {
        throw new Error('provider secret must stay private')
      },
    })
    const layer = createAiIntegrationLayer({
      adapterRegistry: createAiConnectionAdapterRegistry([
        { adapter, adapterType: 'capture', adapterVersion: '3' },
      ]),
      profileResolver: resolver,
      trustBoundary: PASSING_TRUST_BOUNDARY,
      runCoordinator: RUN_COORDINATOR,
    })

    const error = await collect(layer.run(request())).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({
      code: 'profile_blocked',
      localizationKey: 'ai.runProfile.profileBlocked',
      message: 'The configured AI run profile is unavailable.',
    })
    expect(JSON.stringify(error)).not.toMatch(/provider|secret/u)
    expect(called).toBe(false)
  })

  it('emits a content-free blocked-profile alarm without replacing the safe error', async () => {
    const blocked = profile()
    blocked.modelRevisionStatus = 'new_revision_required'
    const emit = vi.fn(async () => {
      throw new Error('telemetry unavailable')
    })
    const layer = createAiIntegrationLayer({
      adapterRegistry: createAiConnectionAdapterRegistry([]),
      profileResolver: createAiRunProfileResolver({
        profileSource: { findProfile: async () => blocked },
        resolveAdapterConfiguration: async () => undefined,
      }),
      runCoordinator: RUN_COORDINATOR,
      telemetry: { emit },
      trustBoundary: PASSING_TRUST_BOUNDARY,
    })

    await expect(collect(layer.run(request()))).rejects.toMatchObject({
      code: 'profile_blocked',
    })
    expect(emit).toHaveBeenCalledWith({
      adapterType: 'capture',
      adapterVersion: '3',
      aiConnectionId: 'connection-17',
      aiConnectionModelRevisionId: 'model-revision-23',
      aiRunProfileConfigurationVersion: 1,
      aiRunProfileId: 'profile-31',
      applicationRunId: 'app-run-private',
      correlationId: 'correlation-private',
      name: 'ai_alarm_active_profile_blocked',
      requestId: 'correlation-private',
      runType: 'generate_without_images',
    })
  })

  it('returns the selected adapter failure without trying another adapter', async () => {
    let fallbackCalled = false
    const selected: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield {
          failure: {
            category: 'connection_unavailable',
            retryable: true,
          },
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          type: 'failed',
        }
      },
    }
    const fallback: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run() {
        fallbackCalled = true
        yield* [] as AiRunEvent[]
      },
    }
    const resolver = createAiRunProfileResolver({
      profileSource: { findProfile: async () => profile() },
      resolveAdapterConfiguration: async (_profile, use) => {
        await use({ connection: {}, modelRevision: {} })
      },
    })
    const layer = createAiIntegrationLayer({
      adapterRegistry: createAiConnectionAdapterRegistry([
        { adapter: selected, adapterType: 'capture', adapterVersion: '3' },
        { adapter: fallback, adapterType: 'fallback', adapterVersion: '1' },
      ]),
      profileResolver: resolver,
      trustBoundary: PASSING_TRUST_BOUNDARY,
      runCoordinator: RUN_COORDINATOR,
    })

    await expect(collect(layer.run(request()))).resolves.toMatchObject([
      {
        failure: { category: 'connection_unavailable' },
        type: 'failed',
      },
    ])
    expect(fallbackCalled).toBe(false)
  })

  it('normalizes a synchronous adapter failure without changing selection', async () => {
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      run() {
        throw new Error('provider endpoint and secret must stay private')
      },
    }

    await expect(collect(integration(adapter).run(request()))).resolves.toEqual(
      [
        {
          failure: {
            category: 'adapter_failure',
            diagnosticCode: 'adapter_run_threw',
            retryable: false,
          },
          identity: {
            aiConnectionId: 'connection-17',
            aiConnectionModelRevisionId: 'model-revision-23',
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: 'profile-31',
          },
          type: 'failed',
        },
      ],
    )
  })

  it('keeps transient adapter configuration scoped through stream consumption', async () => {
    let scopeActive = false
    const resolver = createAiRunProfileResolver({
      profileSource: { findProfile: async () => profile() },
      resolveAdapterConfiguration: async (_stored, use) => {
        scopeActive = true
        try {
          await use({
            connection: { apiKey: 'transient-secret' },
            modelRevision: {},
          })
        } finally {
          scopeActive = false
        }
      },
    })
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        expect(scopeActive).toBe(true)
        yield { delta: 'thinking', type: 'analysis_delta' }
        await Promise.resolve()
        expect(scopeActive).toBe(true)
        yield {
          analysis: 'thinking',
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"requirements":[]}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }
    const layer = createAiIntegrationLayer({
      adapterRegistry: createAiConnectionAdapterRegistry([
        { adapter, adapterType: 'capture', adapterVersion: '3' },
      ]),
      profileResolver: resolver,
      runCoordinator: RUN_COORDINATOR,
      trustBoundary: PASSING_TRUST_BOUNDARY,
    })

    await expect(collect(layer.run(request()))).resolves.toMatchObject([
      { type: 'heartbeat' },
      { type: 'completed' },
    ])
    expect(scopeActive).toBe(false)
  })

  it('replaces a completed terminal when configuration teardown fails', async () => {
    const resolver = createAiRunProfileResolver({
      profileSource: { findProfile: async () => profile() },
      resolveAdapterConfiguration: async (_stored, use) => {
        await use({ connection: {}, modelRevision: {} })
        throw new Error('secret cleanup details must stay private')
      },
    })
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield {
          analysis: null,
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"requirements":[]}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }
    const layer = createAiIntegrationLayer({
      adapterRegistry: createAiConnectionAdapterRegistry([
        { adapter, adapterType: 'capture', adapterVersion: '3' },
      ]),
      profileResolver: resolver,
      trustBoundary: PASSING_TRUST_BOUNDARY,
      runCoordinator: RUN_COORDINATOR,
    })

    await expect(collect(layer.run(request()))).resolves.toEqual([
      {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'adapter_configuration_scope_failed',
          retryable: false,
        },
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        type: 'failed',
      },
    ])
  })

  it('blocks before adapter egress when the app-owned input gate fails', async () => {
    let called = false
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run() {
        called = true
        yield* [] as AiRunEvent[]
      },
    }
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: async () => ({ valid: true }),
      preflightSafetyRules: async () => undefined,
      prepareRun: async () => {
        throw new Error('raw prompt and endpoint must stay private')
      },
    }

    await expect(
      collect(integration(adapter, profile(), trustBoundary).run(request())),
    ).resolves.toEqual([
      {
        failure: {
          category: 'request_rejected',
          diagnosticCode: 'trust_boundary_blocked',
          retryable: false,
        },
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        type: 'failed',
      },
    ])
    expect(called).toBe(false)
  })

  it('quarantines all deltas and screens them with the buffered final output', async () => {
    const approveCompleted = vi.fn(async () => ({ valid: true }) as const)
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted,
      preflightSafetyRules: async () => undefined,
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield { delta: 'private analysis delta', type: 'analysis_delta' }
        yield {
          delta: '{"requirements":',
          type: 'output_delta',
          visibility: 'internal',
        }
        yield {
          analysis: 'private analysis delta',
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"requirements":[]}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }

    const events = await collect(
      integration(adapter, profile(), trustBoundary).run(request()),
    )

    expect(events).toMatchObject([
      { type: 'heartbeat' },
      { type: 'heartbeat' },
      { type: 'completed' },
    ])
    expect(approveCompleted).toHaveBeenCalledWith({
      analysis: 'private analysis delta',
      quarantinedText: ['private analysis delta', '{"requirements":'],
      rawOutput: '{"requirements":[]}',
      validationSchema: { type: 'object' },
    })
  })

  it('includes the canonical schema in instructions when native schema steering is unavailable', async () => {
    let received: AiConnectionAdapterRunRequest | undefined
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        received = adapterRequest
        yield completedAdapterEvent(adapterRequest)
      },
    }
    const stored = profile()
    stored.verifiedCapabilitiesJson = JSON.stringify({
      aiAnalysis: false,
      cost: false,
      imageInput: false,
      jsonSchemaSteering: false,
      streaming: true,
      tokenUsage: true,
      validatableJson: true,
    })
    const baseRequest = request()
    const runRequest = {
      ...baseRequest,
      task: {
        ...baseRequest.task,
        validationSchema: {
          additionalProperties: false,
          properties: { requirements: { type: 'array' } },
          required: ['requirements'],
          type: 'object',
        },
      },
    }

    await collect(integration(adapter, stored).run(runRequest))

    expect(received?.task.instructions).toContain(
      'The following JSON Schema is the mandatory output contract.',
    )
    expect(received?.task.instructions).toContain('"required":["requirements"]')
  })

  it('accounts for schema-invalid output as one failed coordinated terminal', async () => {
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: vi.fn(async () => ({
        issues: [
          {
            code: 'required',
            message: "must have required property 'requirements'",
            path: '$',
          },
        ],
        valid: false as const,
      })),
      preflightSafetyRules: async () => undefined,
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield {
          delta: '{"partial":"must remain quarantined"}',
          type: 'output_delta',
          visibility: 'internal',
        }
        yield {
          analysis: 'screened analysis',
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"schemaVersion":"wrong"}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }

    const coordination = coordinationStore()
    const telemetry: AiRunTelemetryEvent[] = []
    const runCoordinator = createAiRunCoordinator({
      coordination,
      telemetry: {
        emit: event => {
          telemetry.push(event)
        },
      },
    })

    await expect(
      collect(
        integration(adapter, profile(), trustBoundary, runCoordinator).run(
          request(),
        ),
      ),
    ).resolves.toEqual([
      { type: 'heartbeat' },
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'final_output_schema_invalid',
          retryable: false,
        },
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        type: 'failed',
      },
    ])
    expect(coordination.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({ category: 'invalid_response' }),
        outcome: 'failed',
      }),
    )
    expect(telemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureCategory: 'invalid_response',
          name: 'ai_attempt_terminal',
          outcome: 'failed',
        }),
        expect.objectContaining({
          failureCategory: 'invalid_response',
          name: 'ai_run_terminal',
          outcome: 'failed',
        }),
      ]),
    )
    expect(telemetry).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'completed' }),
      ]),
    )
  })

  it('retains screened invalid output only for its failed terminal projection', async () => {
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: vi.fn(async () => ({
        issues: [
          {
            code: 'required',
            message: "must have required property 'requirements'",
            path: '$',
          },
        ],
        valid: false as const,
      })),
      preflightSafetyRules: async () => undefined,
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield {
          analysis: 'screened analysis',
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"schemaVersion":"wrong"}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }
    const layer = integration(adapter, profile(), trustBoundary)
    const events = await collect(layer.run(request()))

    expect(events).toMatchObject([
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'final_output_schema_invalid',
        },
        type: 'failed',
      },
    ])
    expect(layer.takeSafeInvalidOutput(events[0])).toEqual({
      analysis: 'screened analysis',
      issues: [
        {
          code: 'required',
          message: "must have required property 'requirements'",
          path: '$',
        },
      ],
      rawOutput: '{"schemaVersion":"wrong"}',
      usage: USAGE,
    })
    expect(layer.takeSafeInvalidOutput(events[0])).toBeUndefined()
  })

  it('does not publish repair output when caller cancellation wins final screening', async () => {
    const controller = new AbortController()
    let resolveApproval = (
      _value: Awaited<ReturnType<AiRunTrustBoundary['approveCompleted']>>,
    ): void => undefined
    let markApprovalStarted = (): void => undefined
    const approvalStarted = new Promise<void>(resolve => {
      markApprovalStarted = resolve
    })
    const approval = new Promise<
      Awaited<ReturnType<AiRunTrustBoundary['approveCompleted']>>
    >(resolve => {
      resolveApproval = resolve
    })
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: vi.fn(() => {
        markApprovalStarted()
        return approval
      }),
      preflightSafetyRules: async () => undefined,
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield {
          analysis: 'screened analysis',
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"schemaVersion":"wrong"}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }
    const coordination = coordinationStore()
    const layer = integration(
      adapter,
      profile(),
      trustBoundary,
      createAiRunCoordinator({ coordination }),
    )
    const collecting = collect(layer.run(request(controller.signal)))
    await approvalStarted

    controller.abort()

    const events = await collecting
    expect(events).toEqual([
      {
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        reason: 'application_cancelled',
        type: 'cancelled',
      },
    ])
    resolveApproval({
      issues: [{ code: 'required', message: 'required', path: '$' }],
      valid: false,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(layer.takeSafeInvalidOutput(events[0])).toBeUndefined()
    expect(coordination.finish).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'cancelled' }),
    )
  })

  it('does not publish repair output when final screening aborts synchronously', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const trustBoundary: AiRunTrustBoundary = {
        approveCompleted: vi.fn(() => {
          controller.abort()
          return new Promise<never>(() => undefined)
        }),
        preflightSafetyRules: async () => undefined,
        prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
      }
      const adapter: AIConnectionAdapter = {
        forceClose: () => undefined,
        async *run(adapterRequest) {
          yield {
            analysis: 'screened analysis',
            identity: {
              aiConnectionId: adapterRequest.connection.id,
              aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
              aiRunProfileConfigurationVersion: 1,
              aiRunProfileId: adapterRequest.runProfileId,
            },
            rawOutput: '{"schemaVersion":"wrong"}',
            type: 'completed',
            usage: USAGE,
          }
        },
      }
      const coordination = coordinationStore()
      const coordinator = createAiRunCoordinator({ coordination })
      const layer = integration(adapter, profile(), trustBoundary, {
        ...coordinator,
        startAutomaticRecovery: () => () => undefined,
      })

      const events = await collect(layer.run(request(controller.signal)))

      expect(events).toEqual([
        {
          identity: {
            aiConnectionId: 'connection-17',
            aiConnectionModelRevisionId: 'model-revision-23',
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: 'profile-31',
          },
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
      expect(layer.takeSafeInvalidOutput(events[0])).toBeUndefined()
      expect(coordination.finish).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'cancelled' }),
      )
      expect(getEventListeners(controller.signal, 'abort')).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('replaces a completed result when final screening fails', async () => {
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: async () => {
        throw new Error('unsafe raw output')
      },
      preflightSafetyRules: async () => undefined,
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
      forceClose: () => undefined,
      async *run(adapterRequest) {
        yield {
          analysis: null,
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: adapterRequest.runProfileId,
          },
          rawOutput: '{"secret":"must-not-escape"}',
          type: 'completed',
          usage: USAGE,
        }
      },
    }

    await expect(
      collect(integration(adapter, profile(), trustBoundary).run(request())),
    ).resolves.toMatchObject([
      {
        failure: {
          category: 'request_rejected',
          diagnosticCode: 'final_safety_gate_blocked',
        },
        type: 'failed',
      },
    ])
  })
})
