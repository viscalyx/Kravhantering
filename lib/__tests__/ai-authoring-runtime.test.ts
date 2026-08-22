import { describe, expect, it, vi } from 'vitest'
import {
  type AiAuthoringProfileDescription,
  type AiAuthoringRunEvent,
  createAiAuthoringRuntime,
  createProductionAiAuthoringRuntime,
} from '@/lib/ai/authoring-runtime'
import { AiRunProfileResolutionError } from '@/lib/ai/profile-resolver'
import type {
  AIIntegrationLayer,
  AiRunEvent,
  AiRunIdentity,
} from '@/lib/ai/run-contracts'
import type { SqlServerDatabase } from '@/lib/db'

const productionState = vi.hoisted(() => {
  const state = {
    createAdapterRegistry: vi.fn(() => ({ registry: true })),
    createConfigurationResolver: vi.fn(() => vi.fn()),
    createCoordinationStore: vi.fn(() => ({ coordination: true })),
    createIntegration: vi.fn(() => ({ run: vi.fn() })),
    createProfileResolver: vi.fn(() => ({ resolve: vi.fn() })),
    createProfileSource: vi.fn(() => ({ profiles: true })),
    createRunCoordinator: vi.fn(() => ({ coordinator: true })),
    createTrustBoundary: vi.fn(),
    emitTelemetry: vi.fn(),
    loadKeyring: vi.fn(() => ({ activeKeyId: 'key-1' })),
    loadTrustPolicy: vi.fn(() => ({ deployment: true })),
    screenInput: vi.fn(),
    screenOutput: vi.fn(),
    trustOptions: undefined as
      | {
          deployment: unknown
          imageLimits: Record<string, number>
          safetyFilter: {
            screenInput(textParts: readonly string[]): Promise<void>
            screenOutput(textParts: readonly string[]): Promise<void>
          }
        }
      | undefined,
  }
  state.createTrustBoundary.mockImplementation(options => {
    state.trustOptions = options
    return { trustBoundary: true }
  })
  return state
})

vi.mock('@/lib/ai/adapter-registry', () => ({
  createAiConnectionAdapterRegistry: productionState.createAdapterRegistry,
}))
vi.mock('@/lib/ai/admin-external', () => ({
  loadAiDeploymentTrustPolicy: productionState.loadTrustPolicy,
}))
vi.mock('@/lib/ai/controlled-test-adapter', () => ({
  controlledTestAdapterRegistration: { adapterType: 'controlled-test' },
}))
vi.mock('@/lib/ai/integration-layer', () => ({
  createAiIntegrationLayer: productionState.createIntegration,
}))
vi.mock('@/lib/ai/openrouter-adapter', () => ({
  openRouterAdapterRegistration: { adapterType: 'openrouter' },
}))
vi.mock('@/lib/ai/profile-resolver', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ai/profile-resolver')>()),
  createAiRunProfileResolver: productionState.createProfileResolver,
}))
vi.mock('@/lib/ai/provider-secret-keyring', () => ({
  loadAiProviderSecretKeyring: productionState.loadKeyring,
}))
vi.mock('@/lib/ai/provider-secret-service', () => ({
  createAiRuntimeAdapterConfigurationResolver:
    productionState.createConfigurationResolver,
}))
vi.mock('@/lib/ai/run-coordination-store', () => ({
  createSqlServerAiRunCoordinationStore:
    productionState.createCoordinationStore,
}))
vi.mock('@/lib/ai/run-coordinator', () => ({
  createAiRunCoordinator: productionState.createRunCoordinator,
}))
vi.mock('@/lib/ai/run-trust-boundary', () => ({
  createAiRunTrustBoundary: productionState.createTrustBoundary,
}))
vi.mock('@/lib/observability/ai-runs', () => ({
  aiRunTelemetry: { emit: productionState.emitTelemetry },
}))
vi.mock('@/lib/ai/safety', () => ({
  screenAiInput: productionState.screenInput,
  screenAiOutput: productionState.screenOutput,
}))
vi.mock('@/lib/dal/ai-run-profiles', () => ({
  createSqlServerAiRunProfileSource: productionState.createProfileSource,
}))

const availableProfile = {
  publicMetadata: {
    connectionName: 'Approved authoring service',
    dataPolicySummary: 'EU processing; no training',
  },
  withAdapterConfiguration: vi.fn(async use => {
    await use({} as never)
  }),
}

function layer(events: readonly AiRunEvent[]): AIIntegrationLayer {
  return {
    async *run() {
      yield* events
    },
  }
}

describe('AI authoring runtime', () => {
  it('describes an available profile without exposing model or adapter fields', async () => {
    const runtime = createAiAuthoringRuntime({
      integration: layer([]),
      profileResolver: {
        resolve: vi.fn().mockResolvedValue(availableProfile),
      },
    })

    const description = await runtime.describe('generate_without_images')

    expect(description).toEqual<AiAuthoringProfileDescription>({
      available: true,
      connectionName: 'Approved authoring service',
      dataPolicySummary: 'EU processing; no training',
    })
    expect(description).not.toHaveProperty('model')
    expect(description).not.toHaveProperty('adapter')
    expect(availableProfile.withAdapterConfiguration).toHaveBeenCalledOnce()
  })

  it.each([
    ['profile_missing', 'missing'],
    ['profile_suspended', 'suspended'],
    ['profile_blocked', 'blocked'],
  ] as const)(
    'maps %s to an action-scoped %s description',
    async (code, reason) => {
      const runtime = createAiAuthoringRuntime({
        integration: layer([]),
        profileResolver: {
          resolve: vi
            .fn()
            .mockRejectedValue(new AiRunProfileResolutionError(code)),
        },
      })

      await expect(
        runtime.describe('generate_without_images'),
      ).resolves.toEqual({ available: false, reason })
    },
  )

  it('fails availability closed when adapter configuration cannot be verified', async () => {
    const runtime = createAiAuthoringRuntime({
      integration: layer([]),
      profileResolver: {
        resolve: vi.fn().mockResolvedValue({
          ...availableProfile,
          withAdapterConfiguration: vi
            .fn()
            .mockRejectedValue(new Error('secret unavailable')),
        }),
      },
    })

    await expect(runtime.describe('generate_without_images')).resolves.toEqual({
      available: false,
      reason: 'blocked',
    })
  })

  it('delegates runs to the neutral integration layer unchanged', async () => {
    const completed = {
      analysis: null,
      identity: {
        aiConnectionId: 'connection',
        aiConnectionModelRevisionId: 'model-revision',
        aiRunProfileConfigurationVersion: 1,
        aiRunProfileId: 'profile-revision',
      } as AiRunIdentity,
      rawOutput: '{"requirements":[]}',
      type: 'completed',
      usage: {
        analysisTokens: { reason: 'not_reported', status: 'unavailable' },
        cost: { reason: 'not_reported', status: 'unavailable' },
        inputTokens: { reason: 'not_reported', status: 'unavailable' },
        outputTokens: { reason: 'not_reported', status: 'unavailable' },
        totalTokens: { reason: 'not_reported', status: 'unavailable' },
      },
    } as const satisfies AiRunEvent
    const integration = layer([completed])
    const runtime = createAiAuthoringRuntime({
      integration,
      profileResolver: { resolve: vi.fn() },
    })
    const request = {
      context: {
        abortSignal: new AbortController().signal,
        applicationRunId: crypto.randomUUID(),
        correlationId: 'correlation',
        deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      },
      task: {
        content: [{ text: 'need', type: 'text' as const }],
        instructions: 'instructions',
        responseSchema: { type: 'object' },
        validationSchema: { type: 'object' },
      },
      type: 'generate_without_images' as const,
    }

    const received: AiAuthoringRunEvent[] = []
    for await (const event of runtime.run(request)) received.push(event)

    expect(received).toEqual([completed])
  })

  it('projects a failed terminal with its screened repair payload for authoring', async () => {
    const failed = {
      failure: {
        category: 'invalid_response',
        diagnosticCode: 'final_output_schema_invalid',
        retryable: false,
      },
      identity: {
        aiConnectionId: 'connection',
        aiConnectionModelRevisionId: 'model-revision',
        aiRunProfileConfigurationVersion: 1,
        aiRunProfileId: 'profile-revision',
      } as AiRunIdentity,
      type: 'failed',
    } as const satisfies AiRunEvent
    const usage = {
      analysisTokens: { reason: 'not_reported', status: 'unavailable' },
      cost: { reason: 'not_reported', status: 'unavailable' },
      inputTokens: { reason: 'not_reported', status: 'unavailable' },
      outputTokens: { reason: 'not_reported', status: 'unavailable' },
      totalTokens: { reason: 'not_reported', status: 'unavailable' },
    } as const
    const integration = {
      ...layer([failed]),
      takeSafeInvalidOutput: vi.fn(event =>
        event === failed
          ? {
              analysis: 'screened analysis',
              issues: [
                {
                  code: 'required',
                  message: "must have required property 'requirements'",
                  path: '$',
                },
              ],
              rawOutput: '{"schemaVersion":"wrong"}',
              usage,
            }
          : undefined,
      ),
    }
    const runtime = createAiAuthoringRuntime({
      integration,
      profileResolver: { resolve: vi.fn() },
    })

    const received: AiAuthoringRunEvent[] = []
    for await (const event of runtime.run({
      context: {
        abortSignal: new AbortController().signal,
        applicationRunId: crypto.randomUUID(),
        correlationId: 'correlation',
        deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      },
      task: {
        content: [{ text: 'need', type: 'text' }],
        instructions: 'instructions',
        responseSchema: { type: 'object' },
        validationSchema: { type: 'object' },
      },
      type: 'generate_without_images',
    })) {
      received.push(event)
    }

    expect(received).toEqual([
      {
        analysis: 'screened analysis',
        identity: failed.identity,
        issues: [
          {
            code: 'required',
            message: "must have required property 'requirements'",
            path: '$',
          },
        ],
        rawOutput: '{"schemaVersion":"wrong"}',
        type: 'invalid_output',
        usage,
      },
    ])
  })

  it('composes and caches the production runtime for one database', async () => {
    const db = {} as SqlServerDatabase

    const first = createProductionAiAuthoringRuntime(db)
    const second = createProductionAiAuthoringRuntime(db)

    expect(second).toBe(first)
    expect(productionState.createAdapterRegistry).toHaveBeenCalledWith([
      { adapterType: 'openrouter' },
      { adapterType: 'controlled-test' },
    ])
    expect(productionState.createProfileSource).toHaveBeenCalledWith(db)
    expect(productionState.createConfigurationResolver).toHaveBeenCalledWith(
      db,
      { activeKeyId: 'key-1' },
    )
    expect(productionState.createCoordinationStore).toHaveBeenCalledWith(db)
    expect(productionState.createRunCoordinator).toHaveBeenCalledWith({
      coordination: { coordination: true },
      telemetry: { emit: productionState.emitTelemetry },
    })
    expect(productionState.createIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterRegistry: { registry: true },
        profileResolver: expect.any(Object),
        runCoordinator: { coordinator: true },
        telemetry: { emit: productionState.emitTelemetry },
        trustBoundary: { trustBoundary: true },
      }),
    )

    const trustOptions = productionState.trustOptions
    expect(trustOptions).toBeDefined()
    if (!trustOptions) throw new Error('Expected trust-boundary options')
    expect(trustOptions).toMatchObject({
      deployment: { deployment: true },
      imageLimits: {
        maximumBytes: 10 * 1024 * 1024,
        maximumFrames: 1,
        maximumHeight: 8192,
        maximumPixels: 32 * 1024 * 1024,
        maximumWidth: 8192,
      },
    })
    await trustOptions.safetyFilter.screenInput(['need'])
    await trustOptions.safetyFilter.screenOutput(['result'])
    expect(productionState.screenInput).toHaveBeenCalledWith(db, ['need'])
    expect(productionState.screenOutput).toHaveBeenCalledWith(db, ['result'])
  })
})
