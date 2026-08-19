import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import { controlledTestAdapterRegistration } from '@/lib/ai/controlled-test-adapter'
import { createAiIntegrationLayer } from '@/lib/ai/integration-layer'
import { openRouterAdapterRegistration } from '@/lib/ai/openrouter-adapter'
import {
  type AiPersistedRunProfile,
  createAiRunProfileResolver,
} from '@/lib/ai/profile-resolver'
import {
  AI_REQUEST_PRIVACY_MINIMUM,
  type AiConnectionAdapterRegistration,
  type AiConnectionAdapterRunRequest,
  type AiEgressTransport,
  type AiRunEvent,
  type AiRunIdentity,
  type AiRunLimits,
  createAiAdapterRunContext,
  guardAiRunEventStream,
} from '@/lib/ai/run-contracts'
import {
  type AiRunCoordinationStore,
  createAiRunCoordinator,
} from '@/lib/ai/run-coordinator'

const IDENTITY = Object.freeze({
  aiConnectionId: 'connection-17',
  aiConnectionModelRevisionId: 'model-revision-23',
  aiRunProfileRevisionId: 'profile-revision-31',
}) as AiRunIdentity
const NO_USAGE = Object.freeze({
  analysisTokens: {
    reason: 'not_reported' as const,
    status: 'unavailable' as const,
  },
  cost: { reason: 'not_reported' as const, status: 'unavailable' as const },
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
})

type ContractScenario =
  | {
      analysis?: string
      deltas?: readonly string[]
      output: string
      outputTokens?: number
      streaming?: boolean
      type: 'completed'
    }
  | { count: number; type: 'buffered_events' }
  | { retainedBytes: number; type: 'retained_memory' }
  | { type: 'cancel' | 'read_error' | 'retryable' | 'silent_eof' }

interface ScenarioExecution {
  connectionConfiguration: unknown
  egress: AiEgressTransport
  modelConfiguration: unknown
  streaming: boolean
}

interface CoordinatedAdapterHarness {
  createScenario(scenario: ContractScenario): ScenarioExecution
  registration: AiConnectionAdapterRegistration
}

function controlledScenario(scenario: ContractScenario): ScenarioExecution {
  let controlled: unknown
  if (
    scenario.type === 'completed' ||
    scenario.type === 'buffered_events' ||
    scenario.type === 'retained_memory'
  ) {
    const deltas =
      scenario.type === 'buffered_events'
        ? Array.from({ length: scenario.count }, () => 'x')
        : scenario.type === 'completed'
          ? [...(scenario.deltas ?? [])]
          : []
    const output =
      scenario.type === 'completed'
        ? scenario.output
        : scenario.type === 'retained_memory'
          ? 'x'.repeat(scenario.retainedBytes)
          : deltas.join('')
    controlled = {
      analysis:
        scenario.type === 'completed' ? (scenario.analysis ?? null) : null,
      analysisDeltas: [],
      output,
      outputDeltas: deltas,
      type: 'completed',
      usage: {
        ...NO_USAGE,
        outputTokens:
          scenario.type === 'completed' && scenario.outputTokens !== undefined
            ? { status: 'reported', value: scenario.outputTokens }
            : NO_USAGE.outputTokens,
      },
    }
  } else if (scenario.type === 'retryable') {
    controlled = {
      category: 'connection_unavailable',
      diagnosticCode: 'controlled_retryable',
      retryDisposition: 'safe_before_acceptance',
      retryable: true,
      type: 'failed',
    }
  } else if (scenario.type === 'cancel') {
    controlled = { type: 'wait_for_abort' }
  } else {
    controlled = { type: scenario.type }
  }
  return {
    connectionConfiguration: { scenario: controlled },
    egress: { fetch: vi.fn() },
    modelConfiguration: {},
    streaming:
      scenario.type === 'buffered_events' ||
      (scenario.type === 'completed' && Boolean(scenario.streaming)),
  }
}

function sseResponse(frames: readonly string[]): Response {
  return new Response(
    `${frames.map(frame => `data: ${frame}\n\n`).join('')}data: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

function openRouterScenario(scenario: ContractScenario): ScenarioExecution {
  let fetch: AiEgressTransport['fetch']
  let streaming = false
  if (scenario.type === 'completed' || scenario.type === 'retained_memory') {
    streaming =
      scenario.type === 'completed' ? Boolean(scenario.streaming) : false
    fetch = vi.fn(async () => {
      const output =
        scenario.type === 'completed'
          ? scenario.output
          : (() => {
              const emptyEnvelope = JSON.stringify({
                choices: [{ message: { content: '' } }],
                usage: {},
              })
              return 'x'.repeat(scenario.retainedBytes - emptyEnvelope.length)
            })()
      if (!streaming) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: output,
                  reasoning:
                    scenario.type === 'completed'
                      ? scenario.analysis
                      : undefined,
                },
              },
            ],
            usage:
              scenario.type === 'completed'
                ? { completion_tokens: scenario.outputTokens }
                : {},
          }),
          { headers: { 'content-type': 'application/json' } },
        )
      }
      const frames = [
        ...(scenario.type === 'completed' && scenario.analysis
          ? [
              JSON.stringify({
                choices: [{ delta: { reasoning: scenario.analysis } }],
              }),
            ]
          : []),
        ...(scenario.type === 'completed' ? (scenario.deltas ?? []) : []).map(
          delta => JSON.stringify({ choices: [{ delta: { content: delta } }] }),
        ),
        JSON.stringify({
          choices: [],
          usage: {
            completion_tokens:
              scenario.type === 'completed' ? scenario.outputTokens : undefined,
          },
        }),
      ]
      return sseResponse(frames)
    })
  } else if (scenario.type === 'buffered_events') {
    streaming = true
    fetch = vi.fn(async () =>
      sseResponse(
        Array.from({ length: Math.max(0, scenario.count - 1) }, () =>
          JSON.stringify({ choices: [{ delta: { content: 'x' } }] }),
        ),
      ),
    )
  } else if (scenario.type === 'retryable') {
    fetch = vi.fn(async () => new Response('{}', { status: 503 }))
  } else if (scenario.type === 'cancel') {
    fetch = vi.fn(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init.signal
          const abort = (): void =>
            reject(new DOMException('aborted', 'AbortError'))
          signal?.addEventListener('abort', abort, { once: true })
          if (signal?.aborted) abort()
        }),
    )
  } else if (scenario.type === 'read_error') {
    streaming = true
    fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('provider read failed'))
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )
  } else {
    streaming = true
    fetch = vi.fn(
      async () =>
        new Response('', { headers: { 'content-type': 'text/event-stream' } }),
    )
  }
  return {
    connectionConfiguration: {
      credential: 'test-provider-secret',
      endpointUrl: 'https://openrouter.test/api/v1',
    },
    egress: { fetch },
    modelConfiguration: {},
    streaming,
  }
}

function coordinationStore(): AiRunCoordinationStore {
  return {
    abandon: vi.fn(async () => undefined),
    acquire: vi.fn(async () => ({ status: 'acquired' as const })),
    acquireManualRecoveryProbe: vi.fn(async () => false),
    acquireRecoveryProbe: vi.fn(async () => false),
    enqueue: vi.fn(async () => ({ status: 'queued' as const })),
    finish: vi.fn(async () => undefined),
    finishRecoveryProbe: vi.fn(async () => undefined),
    listDueRecoveryProbes: vi.fn(async () => []),
    renew: vi.fn(async () => true),
    requeueForRetry: vi.fn(async () => 'applied' as const),
  }
}

function profile(
  harness: CoordinatedAdapterHarness,
  execution: ScenarioExecution,
  limits: AiRunLimits,
): AiPersistedRunProfile {
  return {
    adapterType: harness.registration.adapterType,
    adapterVersion: harness.registration.adapterVersion,
    capabilityPolicyJson: JSON.stringify({
      aiAnalysis: execution.streaming ? 'allowed' : 'disabled',
      imageInput: 'disabled',
      jsonSchema: 'allowed',
      streaming: execution.streaming ? 'required' : 'disabled',
      usageMetadata: 'allowed',
      validatableJson: 'required',
    }),
    connectionAgentRuntimeVersion: null,
    connectionConfigurationVersion: 1,
    connectionDataPolicySummary: 'Synthetic contract data.',
    connectionId: IDENTITY.aiConnectionId,
    connectionLifecycleStatus: 'active',
    connectionMaximumConcurrency: 2,
    connectionPublicName: 'Contract adapter',
    externalModelId: 'provider/model-v1',
    inactivityTimeBudgetSeconds: 300,
    maximumBufferedEvents: limits.maxBufferedEvents,
    maximumOutputBytes: limits.maxOutputBytes,
    maximumOutputTokens: limits.maxOutputTokens,
    maximumRetainedMemoryBytes: limits.maxRetainedMemoryBytes,
    modelRevisionAgentRuntimeVersion: null,
    modelRevisionConnectionConfigurationVersion: 1,
    modelRevisionId: IDENTITY.aiConnectionModelRevisionId,
    modelRevisionMaximumConcurrency: null,
    modelRevisionStatus: 'verified',
    operationalStatus: 'enabled',
    profileRevisionId: IDENTITY.aiRunProfileRevisionId,
    profileRevisionStatus: 'active',
    queueCapacity: 2,
    totalTimeBudgetSeconds: 300,
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
      egressPolicyKey: 'contract',
      endpointUrl: 'https://openrouter.test/api/v1',
      tlsPolicyKey: 'public_web_pki',
    },
    verifiedCapabilitiesJson: JSON.stringify({
      aiAnalysis: true,
      cost: true,
      imageInput: false,
      jsonSchemaSteering: true,
      streaming: true,
      tokenUsage: true,
      validatableJson: true,
    }),
  }
}

const DEFAULT_LIMITS: AiRunLimits = {
  maxBufferedEvents: 32,
  maxOutputBytes: 1_024,
  maxOutputTokens: 1_024,
  maxRetainedMemoryBytes: 2_048,
}

function coordinatedRun(
  harness: CoordinatedAdapterHarness,
  scenario: ContractScenario,
  options: {
    limits?: AiRunLimits
    now?: () => number
    signal?: AbortSignal
  } = {},
) {
  const execution = harness.createScenario(scenario)
  let adapterRuns = 0
  const observedRegistration: AiConnectionAdapterRegistration = {
    ...harness.registration,
    adapter: {
      forceClose: id => harness.registration.adapter.forceClose(id),
      run: request => {
        adapterRuns += 1
        return harness.registration.adapter.run(request)
      },
    },
  }
  const resolver = createAiRunProfileResolver({
    profileSource: {
      findActiveRevision: async () =>
        profile(harness, execution, options.limits ?? DEFAULT_LIMITS),
    },
    resolveAdapterConfiguration: async (_stored, use) => {
      await use({
        connection: execution.connectionConfiguration,
        modelRevision: execution.modelConfiguration,
      })
    },
  })
  const coordinator = createAiRunCoordinator({
    coordination: coordinationStore(),
    delay: async () => undefined,
    now: options.now,
    random: () => 0,
  })
  const layer = createAiIntegrationLayer({
    adapterRegistry: createAiConnectionAdapterRegistry([observedRegistration]),
    profileResolver: resolver,
    runCoordinator: coordinator,
    trustBoundary: {
      approveCompleted: async () => ({ valid: true }),
      prepareRun: async input => ({
        egress: execution.egress,
        task: input.task,
      }),
    },
  })
  return {
    adapterRuns: () => adapterRuns,
    events: layer.run({
      context: {
        abortSignal: options.signal ?? new AbortController().signal,
        applicationRunId: 'application-run-1',
        correlationId: 'correlation-1',
        deadlineAt: new Date(Date.now() + 600_000).toISOString(),
      },
      task: {
        content: [{ text: 'Synthetic adapter contract.', type: 'text' }],
        instructions: 'Return JSON.',
        responseSchema: { type: 'object' },
      },
      type: execution.streaming
        ? 'generate_without_images'
        : 'repair_invalid_import_json',
    }),
  }
}

async function collect(
  source: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const events: AiRunEvent[] = []
  for await (const event of source) events.push(event)
  return events
}

function terminalEvents(events: readonly AiRunEvent[]) {
  return events.filter(event =>
    ['cancelled', 'completed', 'failed'].includes(event.type),
  )
}

function adapterRequest(execution: ScenarioExecution, limits: AiRunLimits) {
  return {
    connection: {
      configuration: execution.connectionConfiguration,
      id: IDENTITY.aiConnectionId,
    },
    context: createAiAdapterRunContext(
      {
        abortSignal: new AbortController().signal,
        applicationRunId: 'application-run-raw',
        correlationId: 'correlation-raw',
        deadlineAt: new Date(Date.now() + 600_000).toISOString(),
      },
      execution.egress,
    ),
    limits,
    modelRevision: {
      configuration: execution.modelConfiguration,
      externalModelId: 'provider/model-v1',
      id: IDENTITY.aiConnectionModelRevisionId,
      verifiedCapabilities: {
        aiAnalysis: true,
        cost: true,
        imageInput: false,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
      },
    },
    privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
    runProfileRevisionId: IDENTITY.aiRunProfileRevisionId,
    selectedCapabilities: {
      aiAnalysis: true,
      cost: true,
      imageInput: false,
      jsonSchemaSteering: true,
      streaming: execution.streaming,
      tokenUsage: true,
    },
    task: {
      content: [{ text: 'Synthetic adapter contract.', type: 'text' as const }],
      instructions: 'Return JSON.',
      responseSchema: { type: 'object' },
    },
  } as unknown as AiConnectionAdapterRunRequest
}

function describeCoordinatedAdapterContract(
  name: string,
  harness: CoordinatedAdapterHarness,
) {
  describe(`${name} coordinated shared adapter contract`, () => {
    it('keeps the original total deadline under continuous activity', async () => {
      let now = Date.now()
      const run = coordinatedRun(
        harness,
        {
          deltas: Array.from({ length: 20 }, () => 'x'),
          output: 'x'.repeat(20),
          streaming: true,
          type: 'completed',
        },
        {
          now: () => {
            now += 25_000
            return now
          },
        },
      )

      const events = await collect(run.events)
      expect(terminalEvents(events)).toHaveLength(1)
      expect(events.at(-1)).toMatchObject({
        failure: { diagnosticCode: 'total_budget_exceeded' },
        type: 'failed',
      })
    })

    it('shares one total queue and retry budget and emits one terminal', async () => {
      const run = coordinatedRun(harness, { type: 'retryable' })
      const events = await collect(run.events)

      expect(run.adapterRuns()).toBe(2)
      expect(terminalEvents(events)).toHaveLength(1)
      expect(events.at(-1)?.type).toBe('failed')
    })

    it.each([
      [
        'tokens',
        { maxOutputTokens: 4 },
        { output: '{}', outputTokens: 4 },
        { output: '{}', outputTokens: 5 },
        'output_token_limit_exceeded',
      ],
      [
        'bytes',
        { maxOutputBytes: 4 },
        { output: '1234' },
        { output: '12345' },
        'output_byte_limit_exceeded',
      ],
    ] as const)(
      'accepts exact %s limit and rejects the first value over it',
      async (_axis, limit, exact, over, diagnosticCode) => {
        const limits = { ...DEFAULT_LIMITS, ...limit }
        const exactEvents = await collect(
          coordinatedRun(harness, { ...exact, type: 'completed' }, { limits })
            .events,
        )
        expect(exactEvents.at(-1)?.type).toBe('completed')

        const overEvents = await collect(
          coordinatedRun(harness, { ...over, type: 'completed' }, { limits })
            .events,
        )
        expect(overEvents.at(-1)).toMatchObject({
          failure: { diagnosticCode },
          type: 'failed',
        })
        expect(terminalEvents(overEvents)).toHaveLength(1)
      },
    )

    it('accepts the exact retained-memory limit and rejects the first byte over', async () => {
      const limits = { ...DEFAULT_LIMITS, maxRetainedMemoryBytes: 128 }
      const exact = await collect(
        coordinatedRun(
          harness,
          { retainedBytes: 128, type: 'retained_memory' },
          { limits },
        ).events,
      )
      const over = await collect(
        coordinatedRun(
          harness,
          { retainedBytes: 129, type: 'retained_memory' },
          { limits },
        ).events,
      )

      expect(exact.at(-1)?.type).toBe('completed')
      expect(over.at(-1)?.type).toBe('failed')
      expect(terminalEvents(over)).toHaveLength(1)
    })

    it('accepts the exact buffered-event limit and rejects the first event over', async () => {
      const limits = { ...DEFAULT_LIMITS, maxBufferedEvents: 4 }
      const exact = harness.createScenario({
        count: 4,
        type: 'buffered_events',
      })
      const over = harness.createScenario({ count: 5, type: 'buffered_events' })

      expect(
        (
          await collect(
            guardAiRunEventStream(
              harness.registration.adapter.run(adapterRequest(exact, limits)),
              IDENTITY,
            ),
          )
        ).at(-1)?.type,
      ).toBe('completed')
      expect(
        (
          await collect(
            guardAiRunEventStream(
              harness.registration.adapter.run(adapterRequest(over, limits)),
              IDENTITY,
            ),
          )
        ).at(-1),
      ).toMatchObject({ type: 'failed' })
    })

    it('emits linear deltas and does not pull ahead of its consumer', async () => {
      const execution = harness.createScenario({
        analysis: 'a',
        deltas: ['{', '"ok":true', '}'],
        output: '{"ok":true}',
        streaming: true,
        type: 'completed',
      })
      const source = harness.registration.adapter.run(
        adapterRequest(execution, DEFAULT_LIMITS),
      )
      const iterator = source[Symbol.asyncIterator]()

      const first = await iterator.next()
      expect(first).toMatchObject({ done: false })
      await Promise.resolve()
      const remaining: AiRunEvent[] = []
      for (;;) {
        const next = await iterator.next()
        if (next.done) break
        remaining.push(next.value)
      }
      const all = [first.value, ...remaining] as AiRunEvent[]
      expect(
        all
          .filter(event => event.type === 'output_delta')
          .map(event => (event.type === 'output_delta' ? event.delta : ''))
          .join(''),
      ).toBe('{"ok":true}')
      expect(all.at(-1)).toMatchObject({
        rawOutput: '{"ok":true}',
        type: 'completed',
      })
    })

    it('keeps coordinator pulls behind downstream demand', async () => {
      const execution = harness.createScenario({
        deltas: ['first', 'second'],
        output: 'first-second',
        streaming: true,
        type: 'completed',
      })
      const raw = harness.registration.adapter
        .run(adapterRequest(execution, DEFAULT_LIMITS))
        [Symbol.asyncIterator]()
      let pulls = 0
      const coordinator = createAiRunCoordinator({
        coordination: coordinationStore(),
      })
      const stream = coordinator
        .coordinate(
          {
            abortSignal: new AbortController().signal,
            adapterType: harness.registration.adapterType,
            adapterVersion: harness.registration.adapterVersion,
            applicationRunId: 'pull-run',
            correlationId: 'pull-correlation',
            identity: IDENTITY,
            limits: DEFAULT_LIMITS,
            profile: {
              inactivityTimeBudgetMs: 300_000,
              queueCapacity: 2,
              totalTimeBudgetMs: 300_000,
            },
            requestId: 'pull-request',
            runType: 'generate_without_images',
          },
          () => ({
            [Symbol.asyncIterator]() {
              return {
                next: () => {
                  pulls += 1
                  return raw.next()
                },
                return: () =>
                  raw.return?.() ??
                  Promise.resolve({ done: true, value: undefined }),
              }
            },
          }),
          () => undefined,
        )
        [Symbol.asyncIterator]()

      await expect(stream.next()).resolves.toMatchObject({ done: false })
      await Promise.resolve()
      expect(pulls).toBe(1)
      await stream.return?.()
    })

    it('cancels within five seconds with exactly one normalized terminal', async () => {
      const controller = new AbortController()
      const run = coordinatedRun(
        harness,
        { type: 'cancel' },
        { signal: controller.signal },
      )
      const startedAt = performance.now()
      const collected = collect(run.events)
      await Promise.resolve()
      controller.abort()
      const events = await collected

      expect(performance.now() - startedAt).toBeLessThan(5_000)
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: 'cancelled' }),
      ])
    })

    it.each(['read_error', 'silent_eof'] as const)(
      'normalizes %s into exactly one terminal',
      async type => {
        const events = await collect(coordinatedRun(harness, { type }).events)
        expect(terminalEvents(events)).toHaveLength(1)
        expect(events.at(-1)?.type).toBe('failed')
      },
    )
  })
}

describeCoordinatedAdapterContract('OpenRouter', {
  createScenario: openRouterScenario,
  registration: openRouterAdapterRegistration,
})

describeCoordinatedAdapterContract('controlled_test', {
  createScenario: controlledScenario,
  registration: controlledTestAdapterRegistration,
})
