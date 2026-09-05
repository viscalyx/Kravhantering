import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AiAdminAdapterContext,
  createAiAdminConnectionAdapterRegistry,
} from '@/lib/ai/admin-adapter'
import {
  createExactLivePathRunner,
  createProductionAiAdminExternalOperations,
  loadAiDeploymentTrustPolicy,
} from '@/lib/ai/admin-external'
import type {
  AiAdminConnectionDetail,
  AiAdminLivePathSelection,
  AiAdminModelRevisionRecord,
  AiAdminVerificationProgress,
} from '@/lib/ai/admin-service'
import {
  type AiDeploymentTrustPolicy,
  authorizeAiConnectionTarget,
  enforceAiDataPolicy,
} from '@/lib/ai/connection-trust'
import { controlledTestAdminAdapterRegistration } from '@/lib/ai/controlled-test-admin-adapter'
import { openRouterAdminAdapterRegistration } from '@/lib/ai/openrouter-admin-adapter'
import type { AiPersistedRunProfile } from '@/lib/ai/profile-resolver'
import { encryptAiProviderSecret } from '@/lib/ai/provider-secret-crypto'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import type {
  AiIntegrationRunRequest,
  AiRunEvent,
  AiRunIdentity,
} from '@/lib/ai/run-contracts'
import type { SqlServerDatabase } from '@/lib/db'

const CAPABILITIES = {
  reasoning: true,
  reasoningControl: true,
  aiAnalysis: true,
  cost: true,
  imageInput: false,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

function connection(
  overrides: Partial<AiAdminConnectionDetail> = {},
): AiAdminConnectionDetail {
  return {
    activeSecret: { available: false, reason: 'secret_missing' },
    adapterAvailability: { available: true },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: 'Controlled',
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: {
      decisionReference: 'D-1',
      id: crypto.randomUUID(),
      incidentResponseReference: 'I-1',
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'Controlled',
      purpose: 'Test',
      responsibleOrganizationUnitReference: 'U-1',
      reviewDueAt: null,
      reviewedAt: '2026-08-19T00:00:00.000Z',
      revisionNumber: 1,
      revisionToken: crypto.randomUUID(),
      status: 'valid',
      subprocessors: [],
    },
    authenticationType: 'none',
    blockers: [],
    configurationVersion: 1,
    connectionEvidenceId: null,
    dataPolicySummary: 'No personal data.',
    description: null,
    egressPolicyKey: 'test',
    endpointUrl: 'https://ai.example.test/v1',
    id: crypto.randomUUID(),
    lifecycleStatus: 'draft',
    maximumConcurrency: 1,
    models: [
      {
        description: null,
        id: crypto.randomUUID(),
        name: 'Model',
        revisionToken: crypto.randomUUID(),
        revisions: [
          {
            reasoning: {
              mode: 'explicit_control' as const,
              effort: 'high' as const,
            },
            agentRuntimeVersion: null,
            connectionConfigurationVersion: 1,
            declaredCapabilities: CAPABILITIES,
            discoveredCapabilities: null,
            externalModelId: 'controlled/model',
            externalModelVersion: null,
            id: crypto.randomUUID(),
            profileCompatibility: null,
            revisionNumber: 1,
            revisionToken: crypto.randomUUID(),
            status: 'verified',
            testSuiteVersion: null,
            verifiedAt: null,
            verifiedCapabilities: null,
          },
        ],
      },
    ],
    operationalHealth: 'unknown',
    publicName: 'Controlled',
    revisionToken: crypto.randomUUID(),
    tlsPolicyKey: 'test',
    ...overrides,
    attestationDraft: overrides.attestationDraft ?? null,
  }
}

function deployment(): AiDeploymentTrustPolicy {
  return {
    dataPolicies: {
      generate_without_images: {
        allowedProcessingRegions: ['SE'],
        informationClassOrder: ['public', 'internal', 'restricted'],
        maximumInformationClass: 'internal',
        maximumRetentionDays: 0,
        personalDataAllowed: false,
        requireTrainingProhibited: true,
      },
    },
    developmentLocalOrigin: 'https://ai.example.test',
    egressPolicies: {
      test: {
        allowedOrigins: ['https://ai.example.test'],
        privateSidecarOrigins: [],
      },
    },
    environment: 'development',
    resolveHostname: vi.fn(async () => ['93.184.216.34']),
    tlsPolicies: {
      test: {
        certificateValidation: 'required',
        fetchPinned: vi.fn(),
        trustSource: 'public_web_pki',
      },
    },
  }
}

function liveSelection(
  current: AiAdminConnectionDetail,
  revision: AiAdminModelRevisionRecord,
): AiAdminLivePathSelection {
  return {
    adapterType: current.adapterKey,
    adapterVersion: current.adapterVersion,
    aiConnectionId: current.id,
    aiConnectionModelRevisionId: revision.id,
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: crypto.randomUUID(),
    connectionRevisionToken: current.revisionToken,
    expectedEnvironmentId: 'staging-admin-external-test',
    modelRevisionToken: revision.revisionToken,
    profileKey: 'generation_without_images',
    profileToken: crypto.randomUUID(),
  }
}

const emptyDb = {
  query: vi.fn(async () => []),
  transaction: vi.fn(),
} as unknown as SqlServerDatabase
const ring = parseAiProviderSecretKeyring(
  JSON.stringify({
    activeWriteVersion: 'root-1',
    formatVersion: 1,
    keys: { 'root-1': randomBytes(32).toString('base64') },
  }),
)

describe('AI administration provider composition', () => {
  beforeEach(() => {
    vi.stubEnv('KRAVHANTERING_DEPLOYMENT_ENVIRONMENT', 'staging')
    vi.stubEnv(
      'KRAVHANTERING_DEPLOYMENT_ENVIRONMENT_ID',
      'staging-admin-external-test',
    )
    vi.stubEnv('AI_STAGING_LIVE_PROBE_ENABLED', '1')
    vi.stubEnv('AI_REQUIREMENT_GENERATION_DISABLED', '1')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([
    ['controlled/rejected', 'explicit_control', 'high', 'not_verified', false],
    [
      'controlled/unavailable',
      'explicit_control',
      'high',
      'inconclusive',
      false,
    ],
    ['controlled/default-no-analysis', 'model_default', null, 'verified', true],
    ['controlled/no-analysis', 'explicit_control', 'low', 'verified', true],
    ['controlled/no-analysis', 'explicit_control', 'medium', 'verified', true],
    ['controlled/no-analysis', 'explicit_control', 'high', 'verified', true],
    [
      'controlled/default-no-analysis',
      'explicit_control',
      'high',
      'verified',
      true,
    ],
    [
      'controlled/default-no-reasoning',
      'model_default',
      null,
      'inconclusive',
      false,
    ],
    [
      'controlled/no-reasoning',
      'explicit_control',
      'high',
      'inconclusive',
      false,
    ],
  ] as const)(
    'verifies the configured reasoning path for %s / %s / %s',
    async (externalModelId, mode, effort, outcome, saveable) => {
      const external = createProductionAiAdminExternalOperations(
        emptyDb,
        () => ring,
        { deployment: deployment() },
      )
      const reasoning =
        mode === 'model_default'
          ? ({ mode, effort: null } as const)
          : ({ mode, effort: effort ?? 'high' } as const)
      const result = await external.verifyModelCandidate(
        connection(),
        { externalModelId, externalModelVersion: null, reasoning },
        { signal: new AbortController().signal },
      )
      expect(result).toMatchObject({
        reasoning: externalModelId.startsWith('controlled/default')
          ? { mode: 'model_default', effort: null }
          : reasoning,
        saveable,
        capabilities: { reasoning: { outcome } },
      })
      if (externalModelId.endsWith('no-reasoning')) {
        expect(result.capabilities.reasoning).toMatchObject({
          outcome: 'inconclusive',
          failureCategory: 'capability_mismatch',
          diagnosticCode: 'reasoning_activity_not_observed',
        })
        if (mode === 'explicit_control') {
          expect(result.capabilities.reasoningControl).toMatchObject({
            outcome: 'inconclusive',
            failureCategory: 'capability_mismatch',
            diagnosticCode: 'reasoning_control_not_observed',
          })
        }
      }
      if (saveable) {
        expect(result.capabilities.aiAnalysis.outcome).toBe('not_verified')
        expect(result.capabilities.reasoningControl.outcome).toBe(
          externalModelId.startsWith('controlled/default')
            ? 'not_verified'
            : 'verified',
        )
        expect(
          Object.values(result.profileCompatibility).every(
            profile => profile.supported,
          ),
        ).toBe(true)
      }
    },
  )

  it.each([
    ['explicit_control', true],
    ['model_default', true],
    ['explicit_control', false],
    ['model_default', false],
  ] as const)(
    'requires a computed answer and observed activity in %s mode (correct answer=%s)',
    async (mode, correctAnswer) => {
      const base = controlledTestAdminAdapterRegistration.adapter
      const registry = createAiAdminConnectionAdapterRegistry([
        {
          ...controlledTestAdminAdapterRegistration,
          adapter: {
            ...base,
            async *runFunctionalProbe(context, revision, probe) {
              const arithmetic = probe.task.content.some(
                part =>
                  part.type === 'text' &&
                  /\d+ multiplied by \d+/.test(part.text),
              )
              if (arithmetic) {
                // The provider must calculate the answer; only local validation knows it.
                expect(
                  JSON.stringify({
                    instructions: probe.task.instructions,
                    content: probe.task.content.filter(
                      part => part.type === 'text',
                    ),
                    schema: probe.task.responseSchema,
                  }),
                ).not.toContain('4053')
              }
              for await (const event of base.runFunctionalProbe(
                context,
                revision,
                probe,
              )) {
                yield event.type === 'completed'
                  ? {
                      ...event,
                      rawOutput:
                        arithmetic && !correctAnswer
                          ? JSON.stringify({
                              ...JSON.parse(event.rawOutput),
                              answer: 0,
                            })
                          : event.rawOutput,
                      reasoningEvidence: {
                        activity: arithmetic,
                        control:
                          arithmetic &&
                          revision.reasoning?.mode === 'explicit_control',
                      },
                    }
                  : event
              }
            },
          },
        },
      ])
      const external = createProductionAiAdminExternalOperations(
        emptyDb,
        () => ring,
        {
          deployment: deployment(),
          registry,
        },
      )
      const result = await external.verifyModelCandidate(
        connection(),
        {
          externalModelId:
            mode === 'model_default'
              ? 'controlled/default-no-analysis'
              : 'controlled/no-analysis',
          externalModelVersion: null,
          reasoning:
            mode === 'model_default'
              ? { mode, effort: null }
              : { mode, effort: 'high' },
        },
        { signal: new AbortController().signal },
      )
      if (!correctAnswer) {
        expect(result.capabilities.reasoning).toMatchObject({
          outcome: 'inconclusive',
          failureCategory: 'invalid_response',
        })
        expect(
          Object.values(result.profileCompatibility).every(
            profile => !profile.supported,
          ),
        ).toBe(true)
        expect(result.saveable).toBe(false)
        return
      }
      expect(result.capabilities.reasoning.outcome).toBe('verified')
      expect(result.capabilities.aiAnalysis.outcome).toBe('not_verified')
      expect(result.capabilities.reasoningControl.outcome).toBe(
        mode === 'explicit_control' ? 'verified' : 'not_verified',
      )
      expect(
        Object.values(result.profileCompatibility).every(
          profile => profile.supported,
        ),
      ).toBe(true)
      expect(result.saveable).toBe(true)
    },
  )

  it('reports exact adapter registration availability and rejects duplicates or unknowns', () => {
    const registry = createAiAdminConnectionAdapterRegistry([
      controlledTestAdminAdapterRegistration,
    ])
    expect(registry.isRegistered('controlled_test', '1')).toBe(true)
    expect(registry.isRegistered('vllm', '1')).toBe(false)
    expect(registry.resolve('controlled_test', '1')).toBeDefined()
    expect(() => registry.resolve('missing', '1')).toThrow('Unknown')
    expect(() =>
      createAiAdminConnectionAdapterRegistry([
        controlledTestAdminAdapterRegistration,
        controlledTestAdminAdapterRegistration,
      ]),
    ).toThrow('Duplicate')

    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    expect(external.adapterAvailability(connection())).toEqual({
      available: true,
    })
    expect(
      external.adapterAvailability(connection({ adapterKey: 'vllm' })),
    ).toEqual({ available: false, reason: 'adapter_not_registered' })
  })

  it('runs all controlled adapter operations through trust without a secret', async () => {
    const current = connection()
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment() },
    )

    await expect(external.authorizeConnectionTarget(current)).resolves.toBe(
      true,
    )
    await expect(
      external.authorizeRunProfile(current, 'generation_without_images'),
    ).resolves.toBe('authorized')
    await expect(external.fetchCatalog(current)).resolves.toHaveLength(1)
    await expect(
      external.probeHealth(current, revision),
    ).resolves.toMatchObject({
      health: 'healthy',
      invalidationScope: 'none',
    })
    await expect(
      external.verifyModelCandidate(
        current,
        {
          reasoning: {
            mode: 'explicit_control' as const,
            effort: 'high' as const,
          },
          externalModelId: revision.externalModelId,
          externalModelVersion: revision.externalModelVersion,
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ saveable: true })
    await expect(
      external.verifyLivePath(
        current,
        revision,
        liveSelection(current, revision),
      ),
    ).resolves.toEqual({
      adapterType: 'controlled_test',
      adapterVersion: '1',
      executionId: expect.any(String),
      externalLiveCallMade: false,
      failureCategory: 'controlled_adapter_forbidden',
      outcome: 'failed',
      testSuiteVersion: 'ai-admin-functional-probe-v2',
    })
    await expect(
      external.verifySecretCandidate(
        current,
        { connectionId: current.id, secretVersionId: crypto.randomUUID() },
        'candidate',
      ),
    ).resolves.toBeUndefined()
  })

  it('uses one deadline and abort signal for every model-verification check', async () => {
    const observedSignals = new Set<AbortSignal>()
    const observedDeadlines = new Set<string>()
    const base = controlledTestAdminAdapterRegistration.adapter
    const observe = <
      T extends { abortSignal: AbortSignal; deadlineAt: string },
    >(
      probe: T,
    ): T => {
      observedSignals.add(probe.abortSignal)
      observedDeadlines.add(probe.deadlineAt)
      return probe
    }
    const registry = createAiAdminConnectionAdapterRegistry([
      {
        ...controlledTestAdminAdapterRegistration,
        adapter: {
          ...base,
          probeConnection(context, probe) {
            if (!probe) throw new Error('Missing shared probe deadline.')
            observe(probe)
            return base.probeConnection(context, probe)
          },
          runActivationCancellationProbe(context, revision, probe) {
            return base.runActivationCancellationProbe(
              context,
              revision,
              observe(probe),
            )
          },
          runActivationNegativeProbe(context, revision, probe, negativeCase) {
            return base.runActivationNegativeProbe(
              context,
              revision,
              observe(probe),
              negativeCase,
            )
          },
          runFunctionalProbe(context, revision, probe) {
            return base.runFunctionalProbe(context, revision, observe(probe))
          },
        },
      },
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    const current = connection()
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')

    await expect(
      external.verifyModelCandidate(
        current,
        {
          reasoning: {
            mode: 'explicit_control' as const,
            effort: 'high' as const,
          },
          externalModelId: revision.externalModelId,
          externalModelVersion: revision.externalModelVersion,
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ saveable: true })

    // The cancellation proof has one linked child signal so it can trigger the
    // cancellation being verified without cancelling the whole suite.
    expect(observedSignals.size).toBe(2)
    expect(observedDeadlines.size).toBe(1)
  })

  it('stops after a rejected baseline and preserves safe diagnostics', async () => {
    const base = controlledTestAdminAdapterRegistration.adapter
    const runActivationCancellationProbe = vi.fn(
      base.runActivationCancellationProbe,
    )
    const runActivationNegativeProbe = vi.fn(base.runActivationNegativeProbe)
    const runFunctionalProbe = vi.fn(async function* (
      context: Parameters<typeof base.runFunctionalProbe>[0],
      revision: Parameters<typeof base.runFunctionalProbe>[1],
    ): AsyncIterable<AiRunEvent> {
      yield {
        failure: {
          category: 'request_rejected',
          diagnosticCode: 'upstream_request_rejected_http_400',
          retryable: false,
        },
        identity: {
          aiConnectionId: context.connection
            .id as AiRunIdentity['aiConnectionId'],
          aiConnectionModelRevisionId:
            revision.id as AiRunIdentity['aiConnectionModelRevisionId'],
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId:
            '00000000-0000-4000-8000-000000000865' as AiRunIdentity['aiRunProfileId'],
        },
        type: 'failed',
      }
    })
    const registry = createAiAdminConnectionAdapterRegistry([
      {
        ...controlledTestAdminAdapterRegistration,
        adapter: {
          ...base,
          runActivationCancellationProbe,
          runActivationNegativeProbe,
          runFunctionalProbe,
        },
      },
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    const current = connection()
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')
    const progress: Array<{
      check: string
      diagnosticCode: string | null
      outcome: string
      state: string
    }> = []

    const result = await external.verifyModelCandidate(
      current,
      {
        reasoning: {
          mode: 'explicit_control' as const,
          effort: 'high' as const,
        },
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
      },
      {
        onProgress: item => {
          progress.push(item)
        },
        signal: new AbortController().signal,
      },
    )

    expect(runFunctionalProbe).toHaveBeenCalledOnce()
    expect(runActivationCancellationProbe).not.toHaveBeenCalled()
    expect(runActivationNegativeProbe).not.toHaveBeenCalled()
    expect(result.baseline).toEqual({
      diagnosticCode: 'upstream_request_rejected_http_400',
      failureCategory: 'request_rejected',
      outcome: 'not_verified',
    })
    expect(Object.values(result.capabilities)).toEqual(
      expect.arrayContaining([
        {
          diagnosticCode: null,
          failureCategory: null,
          outcome: 'not_checked',
        },
      ]),
    )
    expect(Object.values(result.profileCompatibility)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'not_checked', supported: false }),
      ]),
    )
    expect(progress.map(item => item.check)).toEqual([
      'connection_authentication',
      'connection_authentication',
      'baseline_model_access',
      'baseline_model_access',
      'summary',
      'summary',
    ])
    expect(progress.at(-1)).toMatchObject({
      diagnosticCode: 'upstream_request_rejected_http_400',
      outcome: 'not_verified',
    })
  })

  it('does not verify image input when the adapter ignores the image', async () => {
    const base = controlledTestAdminAdapterRegistration.adapter
    const registry = createAiAdminConnectionAdapterRegistry([
      {
        ...controlledTestAdminAdapterRegistration,
        adapter: {
          ...base,
          runFunctionalProbe(context, revision, probe) {
            return base.runFunctionalProbe(context, revision, {
              ...probe,
              selectedCapabilities: {
                ...probe.selectedCapabilities,
                imageInput: false,
              },
            })
          },
        },
      },
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    const current = connection()
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')

    const result = await external.verifyModelCandidate(
      current,
      {
        reasoning: {
          mode: 'explicit_control' as const,
          effort: 'high' as const,
        },
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
      },
      { signal: new AbortController().signal },
    )
    expect(result).toMatchObject({
      profileCompatibility: {
        generation_with_images: { supported: false },
      },
    })
    expect(result.capabilities.imageInput.outcome).not.toBe('verified')
  })

  it('repeats an inconclusive analysis probe before deciding support', async () => {
    const base = controlledTestAdminAdapterRegistration.adapter
    let analysisAttempts = 0
    const registry = createAiAdminConnectionAdapterRegistry([
      {
        ...controlledTestAdminAdapterRegistration,
        adapter: {
          ...base,
          runFunctionalProbe(context, revision, probe) {
            if (probe.selectedCapabilities.aiAnalysis) analysisAttempts += 1
            return base.runFunctionalProbe(
              context,
              revision,
              analysisAttempts === 1 && probe.selectedCapabilities.aiAnalysis
                ? {
                    ...probe,
                    selectedCapabilities: {
                      ...probe.selectedCapabilities,
                      reasoning: true,
                      reasoningControl: true,
                      aiAnalysis: false,
                    },
                  }
                : probe,
            )
          },
        },
      },
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    const current = connection()
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')

    await expect(
      external.verifyModelCandidate(
        current,
        {
          reasoning: {
            mode: 'explicit_control' as const,
            effort: 'high' as const,
          },
          externalModelId: revision.externalModelId,
          externalModelVersion: revision.externalModelVersion,
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({
      capabilities: { aiAnalysis: { outcome: 'verified' } },
    })
    expect(analysisAttempts).toBeGreaterThanOrEqual(2)
  })

  it('allows saving when optional capabilities are inconclusive but every run profile is verified', async () => {
    const base = controlledTestAdminAdapterRegistration.adapter
    const progress: AiAdminVerificationProgress[] = []
    const registry = createAiAdminConnectionAdapterRegistry([
      {
        ...controlledTestAdminAdapterRegistration,
        adapter: {
          ...base,
          runFunctionalProbe(context, revision, probe) {
            const stream = base.runFunctionalProbe(context, revision, probe)
            if (
              !probe.selectedCapabilities.aiAnalysis &&
              !probe.selectedCapabilities.jsonSchemaSteering
            ) {
              return stream
            }
            return (async function* () {
              for await (const event of stream) {
                if (event.type === 'completed') {
                  yield {
                    failure: {
                      category: 'connection_unavailable' as const,
                      diagnosticCode: 'upstream_unavailable_http_404',
                      retryable: true,
                    },
                    identity: event.identity,
                    type: 'failed' as const,
                  }
                } else {
                  yield event
                }
              }
            })()
          },
        },
      },
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    const current = connection()
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')

    const result = await external.verifyModelCandidate(
      current,
      {
        reasoning: {
          mode: 'explicit_control' as const,
          effort: 'high' as const,
        },
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
      },
      {
        onProgress: item => {
          progress.push(item)
        },
        signal: new AbortController().signal,
      },
    )

    expect(result.capabilities).toMatchObject({
      aiAnalysis: { outcome: 'inconclusive' },
      jsonSchemaSteering: { outcome: 'inconclusive' },
    })
    expect(result.profileCompatibility).toMatchObject({
      generation_with_images: { supported: true },
      generation_without_images: { supported: true },
      invalid_json_repair: { supported: true },
    })
    expect(result.saveable).toBe(true)
    expect(progress.at(-1)).toMatchObject({
      check: 'summary',
      diagnosticCode: null,
      outcome: 'verified',
    })
  })

  it.each([
    { mode: 'explicit_control', effort: 'high' },
    { effort: 'high', mode: 'explicit_control' },
    { effort: null, mode: 'model_default' },
  ] as const)(
    'binds a passing live proof with %j to the exact selected runtime path',
    async reasoning => {
      const current = connection({ adapterKey: 'openrouter' })
      const revision = current.models[0]?.revisions[0]
      if (!revision) throw new Error('Revision missing')
      revision.reasoning = reasoning
      if (reasoning.mode === 'model_default') {
        revision.externalModelId = 'controlled/default-no-analysis'
      }
      const selection = liveSelection(current, revision)
      const exactLivePathRunner = {
        run: vi.fn(async () => ({
          failureCategory: null,
          outcome: 'passed' as const,
        })),
      }
      const registry = createAiAdminConnectionAdapterRegistry([
        {
          ...controlledTestAdminAdapterRegistration,
          adapterType: 'openrouter',
          executionKind: 'external_live',
        },
      ])
      const external = createProductionAiAdminExternalOperations(
        emptyDb,
        () => ring,
        { deployment: deployment(), exactLivePathRunner, registry },
      )

      await expect(
        external.verifyLivePath(current, revision, selection),
      ).resolves.toMatchObject({
        adapterType: 'openrouter',
        failureCategory: null,
        outcome: 'passed',
      })
      expect(exactLivePathRunner.run).toHaveBeenCalledWith(selection)
    },
  )

  it('executes the exact selected profile through the integration runtime', async () => {
    const current = connection({ adapterKey: 'openrouter' })
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')
    const selection = liveSelection(current, revision)
    const completed = {
      analysis: null,
      identity: {
        aiConnectionId: selection.aiConnectionId,
        aiConnectionModelRevisionId: selection.aiConnectionModelRevisionId,
        aiRunProfileConfigurationVersion: 1,
        aiRunProfileId: selection.aiRunProfileId,
      } as AiRunIdentity,
      rawOutput: '{"status":"ok"}',
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
    } satisfies Extract<AiRunEvent, { type: 'completed' }>
    const persisted = {
      reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
      adapterType: selection.adapterType,
      adapterVersion: selection.adapterVersion,
      connectionAgentRuntimeVersion: null,
      connectionConfiguration: { authenticationType: 'none' },
      connectionConfigurationVersion: 1,
      connectionDataPolicySummary: 'Synthetic only.',
      connectionId: selection.aiConnectionId,
      connectionLifecycleStatus: 'active',
      connectionMaximumConcurrency: 1,
      connectionPublicName: 'Staging live test',
      externalModelId: 'provider/model',
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 16,
      maximumOutputBytes: 65_536,
      maximumOutputTokens: 512,
      maximumRetainedMemoryBytes: 131_072,
      modelRevisionAgentRuntimeVersion: null,
      modelRevisionConfiguration: {},
      modelRevisionConnectionConfigurationVersion: 1,
      modelRevisionId: selection.aiConnectionModelRevisionId,
      modelRevisionMaximumConcurrency: null,
      modelRevisionStatus: 'verified',
      operationalStatus: 'enabled',
      profileConfigurationVersion: 1,
      profileId: selection.aiRunProfileId,
      queueCapacity: 1,
      totalTimeBudgetSeconds: 300,
      trustConfiguration: {
        authenticationType: 'none',
        dataPolicy: {
          isPersonalDataProcessed: false,
          isTrainingAllowed: false,
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          processingRegions: ['SE'],
          subprocessors: [],
        },
        egressPolicyKey: current.egressPolicyKey,
        endpointUrl: current.endpointUrl,
        tlsPolicyKey: current.tlsPolicyKey,
      },
      verifiedCapabilitiesJson: JSON.stringify(CAPABILITIES),
    } satisfies AiPersistedRunProfile
    const run = vi.fn()
    const runner = createExactLivePathRunner(
      emptyDb,
      () => ring,
      deployment(),
      {
        createIntegration: vi.fn(options => ({
          async *run(
            request: AiIntegrationRunRequest,
          ): AsyncIterable<AiRunEvent> {
            run(request)
            const profile = await options.profileResolver.resolve(request.type)
            await profile.withAdapterConfiguration(async () => undefined)
            const prepared = await options.trustBoundary.prepareRun({
              runType: request.type,
              task: request.task,
              trustConfiguration: profile.trustConfiguration,
            })
            await options.trustBoundary.approveCompleted({
              analysis: completed.analysis,
              quarantinedText: [],
              rawOutput: completed.rawOutput,
              validationSchema: prepared.task.validationSchema,
            })
            yield completed
          },
          takeSafeInvalidOutput: () => undefined,
        })),
        createProfileSource: vi.fn(() => ({
          findProfile: vi.fn(async () => persisted),
        })),
        screenInput: vi.fn(async () => ({
          allowed: true,
          categories: [],
          primaryRuleId: null,
          primaryRuleType: null,
          ruleIds: [],
          ruleTypes: [],
          textLength: 0,
        })),
        screenOutput: vi.fn(async () => ({
          allowed: true,
          categories: [],
          primaryRuleId: null,
          primaryRuleType: null,
          ruleIds: [],
          ruleTypes: [],
          textLength: 0,
        })),
      },
    )

    await expect(runner.run(selection)).resolves.toEqual({
      failureCategory: null,
      outcome: 'passed',
    })
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'generate_without_images' }),
    )

    const staleRunner = createExactLivePathRunner(
      emptyDb,
      () => ring,
      deployment(),
      {
        createProfileSource: vi.fn(() => ({
          findProfile: vi.fn(async () => null),
        })),
      },
    )
    await expect(staleRunner.run(selection)).resolves.toEqual({
      failureCategory: 'exact_profile_changed',
      outcome: 'failed',
    })

    const failedRunner = createExactLivePathRunner(
      emptyDb,
      () => ring,
      deployment(),
      {
        createIntegration: vi.fn(() => ({
          async *run(): AsyncIterable<AiRunEvent> {
            yield {
              failure: {
                category: 'request_rejected',
                diagnosticCode: 'synthetic_rejected',
                retryable: false,
              },
              identity: completed.identity,
              type: 'failed',
            }
          },
          takeSafeInvalidOutput: () => undefined,
        })),
        createProfileSource: vi.fn(() => ({
          findProfile: vi.fn(async () => persisted),
        })),
      },
    )
    await expect(failedRunner.run(selection)).resolves.toEqual({
      failureCategory: 'request_rejected',
      outcome: 'failed',
    })

    const missingTerminalRunner = createExactLivePathRunner(
      emptyDb,
      () => ring,
      deployment(),
      {
        createIntegration: vi.fn(() => ({
          async *run(): AsyncIterable<AiRunEvent> {
            yield { type: 'heartbeat' }
          },
          takeSafeInvalidOutput: () => undefined,
        })),
        createProfileSource: vi.fn(() => ({
          findProfile: vi.fn(async () => persisted),
        })),
      },
    )
    await expect(missingTerminalRunner.run(selection)).resolves.toEqual({
      failureCategory: 'exact_path_failed',
      outcome: 'failed',
    })
  })

  it('rechecks server authorization after target resolution and before egress', async () => {
    const current = connection({ adapterKey: 'openrouter' })
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')
    const policy = deployment()
    policy.resolveHostname = vi.fn(async () => {
      vi.stubEnv('AI_STAGING_LIVE_PROBE_ENABLED', '0')
      return ['93.184.216.34']
    })
    const runFunctionalProbe = vi.fn()
    const registry = createAiAdminConnectionAdapterRegistry([
      {
        ...controlledTestAdminAdapterRegistration,
        adapter: {
          ...controlledTestAdminAdapterRegistration.adapter,
          runFunctionalProbe,
        },
        adapterType: 'openrouter',
        executionKind: 'external_live',
      },
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: policy, registry },
    )

    await expect(
      external.verifyLivePath(
        current,
        revision,
        liveSelection(current, revision),
      ),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(runFunctionalProbe).not.toHaveBeenCalled()
  })

  it('separates egress, missing data-policy, and attestation denial results', async () => {
    const deniedEgress = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: { ...deployment(), egressPolicies: {} } },
    )
    await expect(
      deniedEgress.authorizeRunProfile(
        connection(),
        'generation_without_images',
      ),
    ).resolves.toBe('egress_policy_blocked')

    const deniedData = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: { ...deployment(), dataPolicies: {} } },
    )
    await expect(
      deniedData.authorizeRunProfile(connection(), 'generation_without_images'),
    ).resolves.toBe('data_policy_missing')

    const mismatchedAttestation = connection().attestation
    if (!mismatchedAttestation) throw new Error('Attestation missing')
    await expect(
      createProductionAiAdminExternalOperations(emptyDb, () => ring, {
        deployment: deployment(),
      }).authorizeRunProfile(
        connection({
          attestation: {
            ...mismatchedAttestation,
            processingRegions: ['US'],
          },
        }),
        'generation_without_images',
      ),
    ).resolves.toBe('data_policy_blocked')
  })

  it('maps a bounded OpenRouter catalog and connection probe outcomes', async () => {
    const adapter = createAiAdminConnectionAdapterRegistry([
      openRouterAdminAdapterRegistration,
    ]).resolve('openrouter', '1')
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                architecture: { modality: 'text+image->text' },
                id: 'vendor/model',
                name: 'Vendor model',
                pricing: {
                  completion: '0.00001',
                  prompt: '0.0000025',
                },
                supported_parameters: [
                  'include_reasoning',
                  'reasoning',
                  'response_format',
                ],
              },
              {
                id: 'standalone-model',
                name: 'Standalone model',
                pricing: {
                  completion: '-1',
                  prompt: 'not-a-price',
                },
              },
              {
                id: 'reasoning-metadata-model',
                name: 'Reasoning metadata model',
                reasoning: { max_tokens: 8_192 },
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    )
    const current = connection({
      adapterKey: 'openrouter',
      authenticationType: 'static_secret',
      endpointUrl: 'https://openrouter.ai/api/v1',
    })
    const context: AiAdminAdapterContext = {
      connection: current,
      credential: 'opaque-test-value',
      egress: { fetch },
    }
    await expect(adapter.fetchCatalog(context)).resolves.toMatchObject([
      {
        capabilities: {
          reasoning: false,
          reasoningControl: false,
          aiAnalysis: false,
          imageInput: true,
          jsonSchemaSteering: true,
          streaming: true,
          validatableJson: true,
        },
        capabilitySupport: {
          aiAnalysis: 'unknown',
          imageInput: 'supported',
          streaming: 'supported',
        },
        externalModelId: 'vendor/model',
        inputPricePerMillionTokens: { amount: '2.5', currency: 'USD' },
        modelProviderName: 'vendor',
        outputPricePerMillionTokens: { amount: '10', currency: 'USD' },
      },
      {
        capabilities: { aiAnalysis: false, streaming: true },
        capabilitySupport: {
          aiAnalysis: 'unsupported',
          streaming: 'supported',
        },
        externalModelId: 'standalone-model',
        inputPricePerMillionTokens: null,
        modelProviderName: null,
        outputPricePerMillionTokens: null,
      },
      {
        capabilities: { aiAnalysis: false },
        capabilitySupport: { aiAnalysis: 'unknown' },
        externalModelId: 'reasoning-metadata-model',
      },
    ])
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      outcome: 'passed',
    })
    await expect(
      adapter.verifySecretCandidate(context),
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('uses high reasoning effort for the OpenRouter AI-analysis probe', async () => {
    const adapter = openRouterAdminAdapterRegistration.adapter
    const current = connection({
      adapterKey: 'openrouter',
      authenticationType: 'static_secret',
      endpointUrl: 'https://openrouter.ai/api/v1',
    })
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')
    const fetch = vi.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"probe":"ok"}',
                  reasoning: 'Checked the arithmetic.',
                },
              },
            ],
            usage: {},
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const events: AiRunEvent[] = []
    for await (const event of adapter.runFunctionalProbe(
      {
        connection: current,
        credential: 'opaque-test-value',
        egress: { fetch },
      },
      revision,
      {
        abortSignal: new AbortController().signal,
        deadlineAt: new Date(Date.now() + 1_000).toISOString(),
        selectedCapabilities: {
          reasoning: true,
          reasoningControl: true,
          aiAnalysis: true,
          cost: false,
          imageInput: false,
          jsonSchemaSteering: false,
          streaming: false,
          tokenUsage: false,
          validatableJson: true,
        },
        task: {
          content: [{ text: 'probe', type: 'text' }],
          instructions: 'probe',
          responseSchema: {},
          validationSchema: {},
        },
      },
    )) {
      events.push(event)
    }

    expect(events).toMatchObject([
      { analysis: 'Checked the arithmetic.', type: 'completed' },
    ])
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body.reasoning).toEqual({ effort: 'high', exclude: false })
  })

  it('fails closed for malformed and oversized provider catalogs', async () => {
    const adapter = openRouterAdminAdapterRegistration.adapter
    const current = connection({ adapterKey: 'openrouter' })
    const context: AiAdminAdapterContext = {
      connection: current,
      credential: null,
      egress: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce(new Response('denied', { status: 401 }))
          .mockResolvedValueOnce(new Response('{}'))
          .mockResolvedValueOnce(
            new Response('{}', {
              headers: { 'content-length': String(5 * 1024 * 1024) },
            }),
          ),
      },
    }
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      outcome: 'failed',
    })
    await expect(adapter.fetchCatalog(context)).rejects.toThrow(
      'invalid catalog',
    )
    await expect(adapter.fetchCatalog(context)).rejects.toThrow('size limit')

    const cancel = vi.fn()
    const streamedContext: AiAdminAdapterContext = {
      ...context,
      egress: {
        fetch: vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                cancel,
                start(controller) {
                  controller.enqueue(new Uint8Array(4 * 1024 * 1024))
                  controller.enqueue(new Uint8Array(1))
                },
              }),
            ),
        ),
      },
    }
    await expect(adapter.fetchCatalog(streamedContext)).rejects.toThrow(
      'size limit',
    )
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('sanitizes status-aware connection probe failures', async () => {
    const adapter = openRouterAdminAdapterRegistration.adapter
    const current = connection({ adapterKey: 'openrouter' })
    const context: AiAdminAdapterContext = {
      connection: current,
      credential: null,
      egress: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce(
            new Response('outage details', { status: 503 }),
          )
          .mockResolvedValueOnce(
            new Response('credential details', { status: 401 }),
          )
          .mockResolvedValueOnce(
            new Response('deadline details', { status: 408 }),
          )
          .mockResolvedValueOnce(new Response('rate details', { status: 429 })),
      },
    }

    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      details: { catalogReachable: false },
      diagnosticCode: 'openrouter_admin_models_http_503',
      failureCategory: 'provider_unavailable',
      outcome: 'failed',
    })
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      details: { catalogReachable: false },
      diagnosticCode: 'openrouter_admin_models_http_401',
      failureCategory: 'authentication_failed',
      outcome: 'failed',
    })
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      diagnosticCode: 'openrouter_admin_models_http_408',
      failureCategory: 'deadline_exceeded',
      outcome: 'failed',
    })
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      diagnosticCode: 'openrouter_admin_models_http_429',
      failureCategory: 'rate_limited',
      outcome: 'failed',
    })
  })

  it('bounds catalog, connection, and candidate-secret GETs with an aborting deadline', async () => {
    vi.useFakeTimers()
    const adapter = openRouterAdminAdapterRegistration.adapter
    const current = connection({ adapterKey: 'openrouter' })
    const signals: AbortSignal[] = []
    const context: AiAdminAdapterContext = {
      connection: current,
      credential: null,
      egress: {
        fetch: vi.fn(async (_url, init) => {
          const signal = init.signal
          if (!signal) throw new Error('Missing deadline signal')
          signals.push(signal)
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          })
        }),
      },
    }

    const catalog = adapter.fetchCatalog(context)
    const catalogAssertion = expect(catalog).rejects.toThrow(
      'administration request failed',
    )
    await vi.advanceTimersByTimeAsync(15_000)
    await catalogAssertion
    const connectionProbe = adapter.probeConnection(context)
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(connectionProbe).resolves.toMatchObject({
      failureCategory: 'deadline_exceeded',
    })
    const candidate = adapter.verifySecretCandidate(context)
    const candidateAssertion = expect(candidate).rejects.toThrow(
      'administration request failed',
    )
    await vi.advanceTimersByTimeAsync(15_000)
    await candidateAssertion
    expect(signals).toHaveLength(3)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it.each([
    'generate_without_images',
    'generate_with_images',
    'repair_invalid_import_json',
  ] as const)(
    'admits synthetic OpenRouter demo data for %s using committed development policies',
    async runType => {
      const values = parseEnv(readFileSync('.env.development', 'utf8'))
      for (const key of [
        'AI_CONNECTION_DATA_POLICIES_JSON',
        'AI_CONNECTION_EGRESS_POLICIES_JSON',
        'AI_CONNECTION_TLS_POLICIES_JSON',
      ]) {
        vi.stubEnv(key, values[key])
      }
      const policy = loadAiDeploymentTrustPolicy()
      policy.resolveHostname = vi.fn(async () => ['93.184.216.34'])
      const demo = {
        authenticationType: 'static_secret' as const,
        dataPolicy: {
          isPersonalDataProcessed: false,
          isTrainingAllowed: false,
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          processingRegions: ['EU/EES (demouppgift)'],
          subprocessors: ['OpenRouter, Inc.'],
        },
        egressPolicyKey: 'openrouter_api',
        endpointUrl: 'https://openrouter.ai/api/v1',
        tlsPolicyKey: 'public_web_pki',
      }
      await expect(
        authorizeAiConnectionTarget(demo, policy),
      ).resolves.toMatchObject({
        hostname: 'openrouter.ai',
        isPrivateSidecar: false,
      })
      expect(() => enforceAiDataPolicy(demo, runType, policy)).not.toThrow()
      for (const deniedData of [
        { isPersonalDataProcessed: true },
        { isTrainingAllowed: true },
        { maximumRetentionDays: 1 },
        { processingRegions: ['unapproved'] },
      ]) {
        expect(() =>
          enforceAiDataPolicy(
            {
              ...demo,
              dataPolicy: { ...demo.dataPolicy, ...deniedData },
            },
            runType,
            policy,
          ),
        ).toThrow('trust policy blocked')
      }
      await expect(
        authorizeAiConnectionTarget(
          {
            ...demo,
            endpointUrl: 'https://other.example/api/v1',
          },
          policy,
        ),
      ).rejects.toMatchObject({ code: 'endpoint_not_allowed' })
    },
  )

  it('loads deployment-owned policy maps from environment', () => {
    vi.stubEnv(
      'AI_CONNECTION_EGRESS_POLICIES_JSON',
      JSON.stringify({ test: deployment().egressPolicies.test }),
    )
    vi.stubEnv(
      'AI_CONNECTION_DATA_POLICIES_JSON',
      JSON.stringify(deployment().dataPolicies),
    )
    vi.stubEnv(
      'AI_CONNECTION_TLS_POLICIES_JSON',
      JSON.stringify({ test: 'public_web_pki' }),
    )
    expect(loadAiDeploymentTrustPolicy()).toMatchObject({
      egressPolicies: { test: expect.any(Object) },
      tlsPolicies: { test: { certificateValidation: 'required' } },
    })

    vi.stubEnv(
      'AI_CONNECTION_TLS_POLICIES_JSON',
      JSON.stringify({ private: 'deployment_private_ca' }),
    )
    expect(() => loadAiDeploymentTrustPolicy()).toThrow(
      'requires a deployment-owned transport',
    )
  })

  it('authorizes the controlled integration connection through the configured development sidecar policy', async () => {
    vi.stubEnv(
      'AI_CONNECTION_EGRESS_POLICIES_JSON',
      JSON.stringify({
        controlled_test: {
          allowedOrigins: [],
          privateSidecarAddresses: ['127.0.0.1', '::1'],
          privateSidecarOrigins: ['https://localhost:4443'],
        },
      }),
    )
    vi.stubEnv(
      'AI_CONNECTION_DATA_POLICIES_JSON',
      JSON.stringify({
        generate_without_images: {
          allowedProcessingRegions: ['SE'],
          informationClassOrder: ['public', 'internal', 'confidential'],
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          personalDataAllowed: false,
          requireTrainingProhibited: true,
        },
      }),
    )
    vi.stubEnv(
      'AI_CONNECTION_TLS_POLICIES_JSON',
      JSON.stringify({ controlled_test: 'public_web_pki' }),
    )
    vi.stubEnv(
      'AI_CONNECTION_DEVELOPMENT_LOCAL_ORIGIN',
      'https://localhost:4443',
    )
    vi.stubEnv('NODE_ENV', 'development')
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
    )

    await expect(
      external.authorizeConnectionTarget(
        connection({
          authenticationType: 'static_secret',
          egressPolicyKey: 'controlled_test',
          endpointUrl: 'https://localhost:4443',
          tlsPolicyKey: 'controlled_test',
        }),
      ),
    ).resolves.toBe(true)
  })

  it('fails closed for malformed deployment policy and resolves configured DNS', async () => {
    vi.stubEnv('AI_CONNECTION_EGRESS_POLICIES_JSON', '[]')
    expect(() => loadAiDeploymentTrustPolicy()).toThrow('must be a JSON object')
    vi.stubEnv('AI_CONNECTION_EGRESS_POLICIES_JSON', '')
    vi.stubEnv('AI_CONNECTION_DATA_POLICIES_JSON', '')
    vi.stubEnv('AI_CONNECTION_TLS_POLICIES_JSON', '')
    vi.stubEnv('NODE_ENV', 'production')
    const production = loadAiDeploymentTrustPolicy()
    expect(production.environment).toBe('production')
    await expect(
      production.resolveHostname('localhost'),
    ).resolves.not.toHaveLength(0)
    vi.stubEnv('NODE_ENV', 'development')
    expect(loadAiDeploymentTrustPolicy().environment).toBe('development')
  })

  it('blocks every incomplete attestation shape before profile authorization', async () => {
    const registry = createAiAdminConnectionAdapterRegistry([
      controlledTestAdminAdapterRegistration,
    ])
    const external = createProductionAiAdminExternalOperations(
      emptyDb,
      () => ring,
      { deployment: deployment(), registry },
    )
    const valid = connection().attestation
    if (!valid) throw new Error('Attestation missing')
    for (const attestation of [
      null,
      { ...valid, isPersonalDataProcessed: null },
      { ...valid, isTrainingAllowed: null },
      { ...valid, maximumInformationClass: null },
      { ...valid, maximumRetentionDays: null },
      { ...valid, processingRegions: null },
      { ...valid, subprocessors: null },
    ]) {
      await expect(
        external.authorizeRunProfile(
          connection({ attestation }),
          'generation_without_images',
        ),
      ).resolves.toBe('data_policy_blocked')
    }
  })

  it('covers controlled catalog omissions and credential verification', async () => {
    const adapter = controlledTestAdminAdapterRegistration.adapter
    const noModels = connection({ models: [] })
    await expect(
      adapter.fetchCatalog({
        connection: noModels,
        credential: null,
        egress: { fetch: vi.fn() },
      }),
    ).resolves.toEqual([])
    const allFalse = Object.fromEntries(
      Object.keys(CAPABILITIES).map(capability => [capability, false]),
    ) as typeof CAPABILITIES
    const allTrue = Object.fromEntries(
      Object.keys(CAPABILITIES).map(capability => [capability, true]),
    ) as typeof CAPABILITIES
    for (const expected of [allFalse, allTrue]) {
      const catalogConnection = connection()
      const catalogRevision = catalogConnection.models[0]?.revisions[0]
      if (!catalogRevision) throw new Error('Catalog revision missing')
      catalogRevision.declaredCapabilities = expected
      await expect(
        adapter.fetchCatalog({
          connection: catalogConnection,
          credential: null,
          egress: { fetch: vi.fn() },
        }),
      ).resolves.toMatchObject([
        {
          capabilities: expected,
          capabilitySupport: Object.fromEntries(
            Object.entries(expected).map(([capability, supported]) => [
              capability,
              supported ? 'supported' : 'unsupported',
            ]),
          ),
        },
      ])
    }
    const unsortedCatalogConnection = connection()
    const catalogModel = unsortedCatalogConnection.models[0]
    const olderRevision = catalogModel?.revisions[0]
    if (!catalogModel || !olderRevision) {
      throw new Error('Catalog model revision missing')
    }
    catalogModel.revisions = [
      olderRevision,
      {
        ...olderRevision,
        externalModelId: 'controlled/newest',
        id: randomUUID(),
        revisionNumber: olderRevision.revisionNumber + 1,
      },
    ]
    await expect(
      adapter.fetchCatalog({
        connection: unsortedCatalogConnection,
        credential: null,
        egress: { fetch: vi.fn() },
      }),
    ).resolves.toMatchObject([{ externalModelId: 'controlled/newest' }])
    const authenticated = connection({ authenticationType: 'static_secret' })
    await expect(
      adapter.verifySecretCandidate({
        connection: authenticated,
        credential: null,
        egress: { fetch: vi.fn() },
      }),
    ).rejects.toThrow('credential is empty')
    await expect(
      adapter.verifySecretCandidate({
        connection: authenticated,
        credential: 'candidate',
        egress: { fetch: vi.fn() },
      }),
    ).resolves.toBeUndefined()

    const discovered = connection()
    const discoveredRevision = discovered.models[0]?.revisions[0]
    if (!discoveredRevision) throw new Error('Revision missing')
    discoveredRevision.discoveredCapabilities = CAPABILITIES
    await expect(
      adapter.fetchCatalog({
        connection: discovered,
        credential: null,
        egress: { fetch: vi.fn() },
      }),
    ).resolves.toMatchObject([{ capabilities: CAPABILITIES }])
    const events = []
    for await (const event of adapter.runFunctionalProbe(
      {
        connection: discovered,
        credential: null,
        egress: { fetch: vi.fn() },
      },
      discoveredRevision,
      {
        abortSignal: new AbortController().signal,
        deadlineAt: new Date(Date.now() + 1_000).toISOString(),
        selectedCapabilities: {
          reasoning: true,
          reasoningControl: true,
          aiAnalysis: false,
          cost: false,
          imageInput: false,
          jsonSchemaSteering: false,
          streaming: false,
          tokenUsage: false,
          validatableJson: false,
        },
        task: {
          content: [{ text: 'probe', type: 'text' }],
          instructions: 'probe',
          responseSchema: {},
          validationSchema: {},
        },
      },
    )) {
      events.push(event)
    }
    expect(events).toMatchObject([{ type: 'completed' }])
  })

  it('covers OpenRouter catalog variants and provider rejection', async () => {
    const adapter = openRouterAdminAdapterRegistration.adapter
    const current = connection({
      adapterKey: 'openrouter',
      endpointUrl: 'https://openrouter.ai/api/v1/',
    })
    const responses = [
      new Response(
        JSON.stringify({
          data: [
            {
              architecture: {},
              id: 'other/model',
              name: 'Other',
              supported_parameters: ['structured_outputs'],
            },
            { id: 1, name: null, supported_parameters: null },
          ],
        }),
      ),
      new Response('unavailable', { status: 503 }),
    ]
    const context: AiAdminAdapterContext = {
      connection: current,
      credential: null,
      egress: {
        fetch: vi.fn(async () => responses.shift() ?? new Response('{}')),
      },
    }
    await expect(adapter.fetchCatalog(context)).resolves.toHaveLength(1)
    await expect(adapter.verifySecretCandidate(context)).rejects.toThrow(
      'administration request failed',
    )
  })

  it('never treats an advertised model as verified or healthy when its functional run fails', async () => {
    const current = connection({
      adapterKey: 'openrouter',
      authenticationType: 'static_secret',
      endpointUrl: 'https://ai.example.test/v1',
    })
    const baseRevision = current.models[0]?.revisions[0]
    if (!baseRevision) throw new Error('Revision missing')
    const revision = { ...baseRevision, externalModelId: 'vendor/model' }
    const secretVersionId = crypto.randomUUID()
    const envelope = encryptAiProviderSecret(
      ring,
      { connectionId: current.id, secretVersionId },
      'opaque-test-value',
    )
    const db = {
      query: vi.fn(async () => [
        {
          activatedAt: new Date(),
          authenticationTag: envelope.authenticationTag,
          ciphertext: envelope.ciphertext,
          connectionId: current.id,
          createdAt: new Date(),
          formatVersion: envelope.formatVersion,
          id: secretVersionId,
          nonce: envelope.nonce,
          revisionNumber: 1,
          revisionToken: crypto.randomUUID(),
          rootKeyVersion: envelope.rootKeyVersion,
          status: 'active',
          verifiedAt: new Date(),
        },
      ]),
      transaction: vi.fn(),
    } as unknown as SqlServerDatabase
    const providerFetch = vi.fn(async (request: { init: RequestInit }) => {
      if (request.init.method === 'GET') {
        return new Response(
          JSON.stringify({
            data: [{ id: 'vendor/model', name: 'Advertised model' }],
          }),
        )
      }
      expect(request.init.signal?.aborted).toBe(false)
      return new Response('run failed', { status: 503 })
    })
    const basePolicy = deployment()
    const policy: AiDeploymentTrustPolicy = {
      ...basePolicy,
      tlsPolicies: {
        ...basePolicy.tlsPolicies,
        test: {
          certificateValidation: 'required',
          fetchPinned: providerFetch,
          trustSource: 'public_web_pki',
        },
      },
    }
    const external = createProductionAiAdminExternalOperations(db, () => ring, {
      deployment: policy,
    })

    await expect(external.fetchCatalog(current)).resolves.toMatchObject([
      { externalModelId: 'vendor/model' },
    ])
    await expect(
      external.verifyLivePath(
        current,
        revision,
        liveSelection(current, revision),
      ),
    ).resolves.toMatchObject({
      adapterType: 'openrouter',
      adapterVersion: '1',
      executionId: expect.any(String),
      externalLiveCallMade: true,
      outcome: 'failed',
      testSuiteVersion: 'ai-admin-functional-probe-v2',
    })
    await expect(
      external.probeHealth(current, revision),
    ).resolves.toMatchObject({
      health: 'unavailable',
      invalidationScope: 'none',
    })
    expect(
      providerFetch.mock.calls.some(
        ([request]) => request.init.method === 'POST',
      ),
    ).toBe(true)
  })
})
