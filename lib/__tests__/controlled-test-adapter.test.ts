import { describe, expect, it } from 'vitest'
import {
  ADAPTER_CONTRACT_USAGE,
  describeAiConnectionAdapterContract,
} from '@/lib/__tests__/ai-connection-adapter-contract'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import {
  CONTROLLED_TEST_ADAPTER_TYPE,
  CONTROLLED_TEST_ADAPTER_VERSION,
  controlledTestAdapterRegistration,
} from '@/lib/ai/controlled-test-adapter'
import {
  AI_REQUEST_PRIVACY_MINIMUM,
  type AIConnectionAdapter,
  type AiCapabilitySelection,
  type AiConnectionAdapterRunRequest,
  type AiConnectionId,
  type AiConnectionModelRevisionId,
  type AiRunEvent,
  type AiRunIdentity,
  type AiRunProfileId,
  type AiRunUsage,
  createAiAdapterRunContext,
  guardAiRunEventStream,
} from '@/lib/ai/run-contracts'

const ZERO_USAGE: AiRunUsage = {
  analysisTokens: { status: 'reported', value: 0 },
  cost: {
    status: 'reported',
    value: { amount: '0.00', currency: 'USD' },
  },
  inputTokens: { status: 'reported', value: 0 },
  outputTokens: { status: 'reported', value: 0 },
  totalTokens: { status: 'reported', value: 0 },
}

const MIXED_USAGE: AiRunUsage = {
  analysisTokens: { reason: 'not_reported', status: 'unavailable' },
  cost: { reason: 'unknown_price', status: 'unavailable' },
  inputTokens: { status: 'reported', value: 12 },
  outputTokens: {
    calculatedAt: '2026-08-19T11:59:00.000Z',
    status: 'calculated',
    value: 7,
  },
  totalTokens: {
    calculatedAt: '2026-08-19T11:59:00.000Z',
    status: 'calculated',
    value: 19,
  },
}

const ALL_CAPABILITIES = {
  aiAnalysis: true,
  cost: true,
  imageInput: true,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
} as const

const CONNECTION_ID = 'connection-17' as AiConnectionId
const MODEL_REVISION_ID = 'model-revision-23' as AiConnectionModelRevisionId
const RUN_PROFILE_ID = 'profile-31' as AiRunProfileId

const RUN_IDENTITY: AiRunIdentity = {
  aiConnectionId: CONNECTION_ID,
  aiConnectionModelRevisionId: MODEL_REVISION_ID,
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: RUN_PROFILE_ID,
}

function registeredAdapter(): AIConnectionAdapter {
  return createAiConnectionAdapterRegistry([
    controlledTestAdapterRegistration,
  ]).resolve(CONTROLLED_TEST_ADAPTER_TYPE, CONTROLLED_TEST_ADAPTER_VERSION)
}

function request(
  configuration: unknown,
  abortSignal: AbortSignal = new AbortController().signal,
  selectedCapabilities: Readonly<AiCapabilitySelection> = ALL_CAPABILITIES,
  verifiedCapabilities: Readonly<AiCapabilitySelection> = selectedCapabilities,
): AiConnectionAdapterRunRequest {
  return {
    connection: {
      configuration,
      id: CONNECTION_ID,
    },
    context: createAiAdapterRunContext(
      {
        abortSignal,
        applicationRunId: 'app-run-98',
        correlationId: 'correlation-42',
        deadlineAt: '2026-08-19T12:00:00.000Z',
      },
      { fetch: vi.fn() },
    ),
    limits: {
      maxBufferedEvents: 32,
      maxOutputBytes: 4_194_304,
      maxOutputTokens: 8_192,
      maxRetainedMemoryBytes: 8_388_608,
    },
    modelRevision: {
      configuration: {},
      externalModelId: 'controlled/model-v1',
      id: MODEL_REVISION_ID,
      verifiedCapabilities,
    },
    privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
    runProfileConfigurationVersion: 1,
    runProfileId: RUN_PROFILE_ID,
    selectedCapabilities,
    task: {
      content: [{ text: 'Generate safe JSON', type: 'text' }],
      instructions: 'Return a requirement import file.',
      responseSchema: { type: 'object' },
      validationSchema: { type: 'object' },
    },
  }
}

async function collectEvents(
  events: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const collected: AiRunEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

describeAiConnectionAdapterContract('controlled test adapter', () => ({
  adapterType: CONTROLLED_TEST_ADAPTER_TYPE,
  completedRequest: () =>
    request({
      scenario: {
        analysis: 'partial analysis',
        analysisDeltas: ['partial analysis'],
        output: '{"requirements":[]}',
        outputDeltas: ['{"requirements"', ':[]}'],
        type: 'completed',
        usage: ADAPTER_CONTRACT_USAGE,
      },
    }),
  missingCapabilityRequest: () =>
    request(
      {
        scenario: {
          output: '{}',
          type: 'completed',
          usage: ADAPTER_CONTRACT_USAGE,
        },
      },
      new AbortController().signal,
      ALL_CAPABILITIES,
      { ...ALL_CAPABILITIES, imageInput: false },
    ),
  registration: controlledTestAdapterRegistration,
  waitForAbortRequest: signal =>
    request({ scenario: { type: 'wait_for_abort' } }, signal),
}))

describe('controlled AI connection test adapter', () => {
  it('accepts an encrypted-store credential as its persisted scenario envelope', async () => {
    const adapter = registeredAdapter()

    await expect(
      collectEvents(
        adapter.run(
          request({
            credential: JSON.stringify({
              scenario: {
                analysis: null,
                output: '{"requirements":[]}',
                type: 'completed',
                usage: ZERO_USAGE,
              },
            }),
          }),
        ),
      ),
    ).resolves.toEqual([
      {
        analysis: null,
        identity: RUN_IDENTITY,
        rawOutput: '{"requirements":[]}',
        type: 'completed',
        usage: ZERO_USAGE,
      },
    ])
  })

  it('is registrable and returns self-contained output only at completion', async () => {
    const registry = createAiConnectionAdapterRegistry([
      controlledTestAdapterRegistration,
    ])
    const adapter = registry.resolve(
      CONTROLLED_TEST_ADAPTER_TYPE,
      CONTROLLED_TEST_ADAPTER_VERSION,
    )

    const events = await collectEvents(
      adapter.run(
        request({
          scenario: {
            analysis: 'complete analysis',
            analysisDeltas: ['partial analysis'],
            output: '{"requirements":[]}',
            outputDeltas: ['{"requirements"'],
            type: 'completed',
            usage: ZERO_USAGE,
          },
        }),
      ),
    )

    expect(events).toEqual([
      { delta: 'partial analysis', type: 'analysis_delta' },
      {
        delta: '{"requirements"',
        type: 'output_delta',
        visibility: 'internal',
      },
      {
        analysis: 'complete analysis',
        identity: RUN_IDENTITY,
        rawOutput: '{"requirements":[]}',
        type: 'completed',
        usage: ZERO_USAGE,
      },
    ])
    expect(events.at(-1)).toMatchObject({
      rawOutput: '{"requirements":[]}',
      type: 'completed',
    })
  })

  it.each([
    'authentication_failed',
    'rate_limited',
    'connection_unavailable',
    'request_rejected',
    'deadline_exceeded',
    'invalid_response',
    'capability_mismatch',
    'adapter_failure',
  ] as const)(
    'deterministically emits the %s failure category',
    async category => {
      const adapter = registeredAdapter()

      await expect(
        collectEvents(
          adapter.run(
            request({
              scenario: {
                category,
                diagnosticCode: 'controlled_failure',
                retryAfterSeconds: 17,
                retryable: true,
                type: 'failed',
              },
            }),
          ),
        ),
      ).resolves.toEqual([
        {
          failure: {
            category,
            diagnosticCode: 'controlled_failure',
            retryAfterSeconds: 17,
            retryable: true,
          },
          identity: RUN_IDENTITY,
          type: 'failed',
        },
      ])
    },
  )

  it.each([
    'user_cancelled',
    'client_disconnected',
    'application_cancelled',
  ] as const)(
    'deterministically emits the %s cancellation reason',
    async reason => {
      const adapter = registeredAdapter()

      await expect(
        collectEvents(
          adapter.run(
            request({
              scenario: { reason, type: 'cancelled' },
            }),
          ),
        ),
      ).resolves.toEqual([
        {
          identity: RUN_IDENTITY,
          reason,
          type: 'cancelled',
        },
      ])
    },
  )

  it('turns an active abort signal into application cancellation', async () => {
    const abortController = new AbortController()
    const adapter = registeredAdapter()
    const eventsPromise = collectEvents(
      adapter.run(
        request(
          {
            scenario: { type: 'wait_for_abort' },
          },
          abortController.signal,
        ),
      ),
    )

    await Promise.resolve()
    abortController.abort()

    await expect(eventsPromise).resolves.toEqual([
      {
        identity: RUN_IDENTITY,
        reason: 'application_cancelled',
        type: 'cancelled',
      },
    ])
  })

  it('can simulate silent EOF for protocol-guard verification', async () => {
    const adapter = registeredAdapter()
    const adapterRequest = request({
      scenario: { type: 'silent_eof' },
    })
    const identity = {
      aiConnectionId: adapterRequest.connection.id,
      aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
      aiRunProfileConfigurationVersion: 1,
      aiRunProfileId: adapterRequest.runProfileId,
    }

    await expect(collectEvents(adapter.run(adapterRequest))).resolves.toEqual(
      [],
    )
    await expect(
      collectEvents(
        guardAiRunEventStream(adapter.run(adapterRequest), identity),
      ),
    ).resolves.toEqual([
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'silent_eof',
          retryable: false,
        },
        identity,
        type: 'failed',
      },
    ])
  })

  it('deterministically rejects a selected capability the test model does not support', async () => {
    const adapter = registeredAdapter()

    const events = await collectEvents(
      adapter.run(
        request(
          {
            scenario: {
              analysis: null,
              output: '{}',
              type: 'completed',
              usage: ZERO_USAGE,
            },
          },
          new AbortController().signal,
          ALL_CAPABILITIES,
          { ...ALL_CAPABILITIES, imageInput: false },
        ),
      ),
    )

    expect(events).toEqual([
      {
        failure: {
          category: 'capability_mismatch',
          diagnosticCode: 'controlled_capability_mismatch:imageInput',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
  })

  it('supports every deterministic capability combination', async () => {
    const adapter = registeredAdapter()
    const capabilityNames = Object.keys(ALL_CAPABILITIES) as Array<
      keyof typeof ALL_CAPABILITIES
    >

    for (let mask = 0; mask < 2 ** capabilityNames.length; mask += 1) {
      const capabilities: AiCapabilitySelection = { ...ALL_CAPABILITIES }
      capabilityNames.forEach((capability, index) => {
        capabilities[capability] = Boolean(mask & (1 << index))
      })
      const events = await collectEvents(
        adapter.run(
          request(
            {
              scenario: {
                output: '{}',
                type: 'completed',
                usage: ZERO_USAGE,
              },
            },
            new AbortController().signal,
            capabilities,
          ),
        ),
      )

      expect(events.at(-1)).toMatchObject({ type: 'completed' })
    }
  })

  it('fails safely when usage availability is omitted from a controlled completion', async () => {
    const adapter = registeredAdapter()

    const events = await collectEvents(
      adapter.run(
        request({
          scenario: {
            output: '{}',
            type: 'completed',
            usage: {
              analysisTokens: { status: 'reported', value: 0 },
              inputTokens: { status: 'reported', value: 0 },
              outputTokens: { status: 'reported', value: 0 },
              totalTokens: { status: 'reported', value: 0 },
            },
          },
        }),
      ),
    )

    expect(events).toEqual([
      {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'invalid_controlled_test_configuration',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
  })

  it('rejects analysis deltas when completion omits the complete analysis', async () => {
    const adapter = registeredAdapter()

    const events = await collectEvents(
      adapter.run(
        request({
          scenario: {
            analysis: null,
            analysisDeltas: ['partial analysis without final analysis'],
            output: '{}',
            type: 'completed',
            usage: ZERO_USAGE,
          },
        }),
      ),
    )

    expect(events).toEqual([
      {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'invalid_controlled_test_configuration',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
  })

  it('preserves reported, calculated, and unavailable usage states', async () => {
    const adapter = registeredAdapter()

    const events = await collectEvents(
      adapter.run(
        request({
          scenario: {
            output: '{}',
            type: 'completed',
            usage: MIXED_USAGE,
          },
        }),
      ),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'completed', usage: MIXED_USAGE })
  })

  it('rejects unsafe controlled diagnostics instead of emitting their contents', async () => {
    const adapter = registeredAdapter()

    const events = await collectEvents(
      adapter.run(
        request({
          scenario: {
            category: 'adapter_failure',
            diagnosticCode:
              'https://provider.test response token=must-not-be-emitted',
            retryable: false,
            type: 'failed',
          },
        }),
      ),
    )

    expect(events).toEqual([
      {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'invalid_controlled_test_configuration',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
    expect(JSON.stringify(events)).not.toMatch(/provider|must-not-be-emitted/u)
  })
})
