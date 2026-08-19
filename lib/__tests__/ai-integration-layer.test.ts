import { describe, expect, it } from 'vitest'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import { createAiIntegrationLayer } from '@/lib/ai/integration-layer'
import {
  type AiPersistedRunProfile,
  createAiRunProfileResolver,
} from '@/lib/ai/profile-resolver'
import type {
  AIConnectionAdapter,
  AiConnectionAdapterRunRequest,
  AiRunEvent,
  AiRunUsage,
} from '@/lib/ai/run-contracts'
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
  approveCompleted: vi.fn(async () => undefined),
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
    capabilityPolicyJson: JSON.stringify({
      aiAnalysis: 'allowed',
      imageInput: 'disabled',
      jsonSchema: 'allowed',
      streaming: 'required',
      usageMetadata: 'allowed',
      validatableJson: 'required',
    }),
    connectionAgentRuntimeVersion: null,
    connectionConfigurationVersion: 4,
    connectionId: 'connection-17',
    connectionLifecycleStatus: 'active',
    externalModelId: 'external-model-v1',
    modelRevisionAgentRuntimeVersion: null,
    modelRevisionConnectionConfigurationVersion: 4,
    modelRevisionId: 'model-revision-23',
    modelRevisionStatus: 'verified',
    operationalStatus: 'enabled',
    profileRevisionId: 'profile-revision-31',
    profileRevisionStatus: 'active',
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
    },
    type: 'generate_without_images' as const,
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
) {
  const resolver = createAiRunProfileResolver({
    profileSource: { findActiveRevision: async () => stored },
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
  })
}

describe('AI integration layer', () => {
  it('runs one exact frozen profile revision through its exact adapter revision', async () => {
    let received: AiConnectionAdapterRunRequest | undefined
    const runRequest = request()
    const adapter: AIConnectionAdapter = {
      async *run(adapterRequest) {
        received = adapterRequest
        yield {
          analysis: null,
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileRevisionId: adapterRequest.runProfileRevisionId,
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
          aiRunProfileRevisionId: 'profile-revision-31',
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
        deadlineAt: '2026-08-19T12:30:00.000Z',
        externalRunId: expect.stringMatching(/^airun_/u),
      },
      modelRevision: {
        configuration: { opaque: 'model-configuration' },
        externalModelId: 'external-model-v1',
        id: 'model-revision-23',
      },
      runProfileRevisionId: 'profile-revision-31',
      selectedCapabilities: {
        aiAnalysis: false,
        cost: false,
        imageInput: false,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
      },
    })
    expect(JSON.stringify(received?.context)).not.toMatch(
      /app-run-private|correlation-private/u,
    )
  })

  it('blocks before egress when the exact persisted adapter version is unavailable', async () => {
    let called = false
    const adapter: AIConnectionAdapter = {
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
      async *run() {
        called = true
        yield* [] as AiRunEvent[]
      },
    }
    const resolver = createAiRunProfileResolver({
      profileSource: { findActiveRevision: async () => profile() },
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

  it('returns the selected adapter failure without trying another adapter', async () => {
    let fallbackCalled = false
    const selected: AIConnectionAdapter = {
      async *run(adapterRequest) {
        yield {
          failure: {
            category: 'connection_unavailable',
            retryable: true,
          },
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileRevisionId: adapterRequest.runProfileRevisionId,
          },
          type: 'failed',
        }
      },
    }
    const fallback: AIConnectionAdapter = {
      async *run() {
        fallbackCalled = true
        yield* [] as AiRunEvent[]
      },
    }
    const resolver = createAiRunProfileResolver({
      profileSource: { findActiveRevision: async () => profile() },
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
            aiRunProfileRevisionId: 'profile-revision-31',
          },
          type: 'failed',
        },
      ],
    )
  })

  it('keeps transient adapter configuration scoped through stream consumption', async () => {
    let scopeActive = false
    const resolver = createAiRunProfileResolver({
      profileSource: { findActiveRevision: async () => profile() },
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
            aiRunProfileRevisionId: adapterRequest.runProfileRevisionId,
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
    })

    await expect(collect(layer.run(request()))).resolves.toHaveLength(1)
    expect(scopeActive).toBe(false)
  })

  it('replaces a completed terminal when configuration teardown fails', async () => {
    const resolver = createAiRunProfileResolver({
      profileSource: { findActiveRevision: async () => profile() },
      resolveAdapterConfiguration: async (_stored, use) => {
        await use({ connection: {}, modelRevision: {} })
        throw new Error('secret cleanup details must stay private')
      },
    })
    const adapter: AIConnectionAdapter = {
      async *run(adapterRequest) {
        yield {
          analysis: null,
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileRevisionId: adapterRequest.runProfileRevisionId,
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
          aiRunProfileRevisionId: 'profile-revision-31',
        },
        type: 'failed',
      },
    ])
  })

  it('blocks before adapter egress when the app-owned input gate fails', async () => {
    let called = false
    const adapter: AIConnectionAdapter = {
      async *run() {
        called = true
        yield* [] as AiRunEvent[]
      },
    }
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: async () => undefined,
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
          aiRunProfileRevisionId: 'profile-revision-31',
        },
        type: 'failed',
      },
    ])
    expect(called).toBe(false)
  })

  it('quarantines all deltas and screens them with the buffered final output', async () => {
    const approveCompleted = vi.fn(async () => undefined)
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted,
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
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
            aiRunProfileRevisionId: adapterRequest.runProfileRevisionId,
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

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'completed' })
    expect(approveCompleted).toHaveBeenCalledWith({
      analysis: 'private analysis delta',
      quarantinedText: ['private analysis delta', '{"requirements":'],
      rawOutput: '{"requirements":[]}',
      responseSchema: { type: 'object' },
    })
  })

  it('replaces a completed result when final screening fails', async () => {
    const trustBoundary: AiRunTrustBoundary = {
      approveCompleted: async () => {
        throw new Error('unsafe raw output')
      },
      prepareRun: async input => ({ egress: TEST_EGRESS, task: input.task }),
    }
    const adapter: AIConnectionAdapter = {
      async *run(adapterRequest) {
        yield {
          analysis: null,
          identity: {
            aiConnectionId: adapterRequest.connection.id,
            aiConnectionModelRevisionId: adapterRequest.modelRevision.id,
            aiRunProfileRevisionId: adapterRequest.runProfileRevisionId,
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
