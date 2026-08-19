import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type AiAdminAdapterContext,
  createAiAdminConnectionAdapterRegistry,
} from '@/lib/ai/admin-adapter'
import {
  createProductionAiAdminExternalOperations,
  loadAiDeploymentTrustPolicy,
} from '@/lib/ai/admin-external'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
import type { AiDeploymentTrustPolicy } from '@/lib/ai/connection-trust'
import { controlledTestAdminAdapterRegistration } from '@/lib/ai/controlled-test-admin-adapter'
import { openRouterAdminAdapterRegistration } from '@/lib/ai/openrouter-admin-adapter'
import { encryptAiProviderSecret } from '@/lib/ai/provider-secret-crypto'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import type { SqlServerDatabase } from '@/lib/db'

const CAPABILITIES = {
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
            agentRuntimeVersion: null,
            connectionConfigurationVersion: 1,
            declaredCapabilities: CAPABILITIES,
            discoveredCapabilities: null,
            externalModelId: 'controlled/model',
            externalModelVersion: null,
            id: crypto.randomUUID(),
            revisionNumber: 1,
            revisionToken: crypto.randomUUID(),
            status: 'draft',
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
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('resolves exact adapter registrations and rejects duplicates or unknowns', () => {
    const registry = createAiAdminConnectionAdapterRegistry([
      controlledTestAdminAdapterRegistration,
    ])
    expect(registry.resolve('controlled_test', '1')).toBeDefined()
    expect(() => registry.resolve('missing', '1')).toThrow('Unknown')
    expect(() =>
      createAiAdminConnectionAdapterRegistry([
        controlledTestAdminAdapterRegistration,
        controlledTestAdminAdapterRegistration,
      ]),
    ).toThrow('Duplicate')
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
    await expect(external.probeConnection(current)).resolves.toMatchObject({
      outcome: 'passed',
    })
    await expect(
      external.probeHealth(current, revision),
    ).resolves.toMatchObject({
      health: 'healthy',
      invalidatesVerification: false,
    })
    await expect(
      external.verifyModelRevision(current, revision),
    ).resolves.toMatchObject({ outcome: 'passed' })
    await expect(
      external.verifySecretCandidate(
        current,
        { connectionId: current.id, secretVersionId: crypto.randomUUID() },
        'candidate',
      ),
    ).resolves.toBeUndefined()
  })

  it('separates egress and data-policy denial results', async () => {
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
                supported_parameters: [
                  'reasoning',
                  'response_format',
                  'stream',
                ],
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
      { externalModelId: 'vendor/model', capabilities: { imageInput: true } },
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
          ),
      },
    }

    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      details: { catalogReachable: false },
      failureCategory: 'provider_unavailable',
      outcome: 'failed',
    })
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      details: { catalogReachable: false },
      failureCategory: 'authentication_failed',
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
          aiAnalysis: false,
          cost: false,
          imageInput: false,
          jsonSchemaSteering: false,
          streaming: false,
          tokenUsage: false,
        },
        task: {
          content: [{ text: 'probe', type: 'text' }],
          instructions: 'probe',
          responseSchema: {},
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
    let functionalRequestCount = 0
    const providerFetch = vi.fn(async (request: { init: RequestInit }) => {
      if (request.init.method === 'GET') {
        return new Response(
          JSON.stringify({
            data: [{ id: 'vendor/model', name: 'Advertised model' }],
          }),
        )
      }
      functionalRequestCount += 1
      return new Response('run failed', {
        status: functionalRequestCount === 3 ? 404 : 503,
      })
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
      external.verifyModelRevision(current, revision),
    ).resolves.toMatchObject({ outcome: 'failed' })
    await expect(
      external.probeHealth(current, revision),
    ).resolves.toMatchObject({
      health: 'unavailable',
      invalidatesVerification: false,
    })
    await expect(
      external.probeHealth(current, revision),
    ).resolves.toMatchObject({
      failureCategory: 'request_rejected',
      health: 'degraded',
      invalidatesVerification: true,
    })
    expect(
      providerFetch.mock.calls.some(
        ([request]) => request.init.method === 'POST',
      ),
    ).toBe(true)
  })
})
