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
  afterEach(() => vi.unstubAllEnvs())

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
    await expect(external.probeHealth(current, revision)).resolves.toBe(
      'healthy',
    )
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

  it('maps a bounded OpenRouter catalog and probe outcomes', async () => {
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
    const baseRevision = current.models[0]?.revisions[0]
    if (!baseRevision) throw new Error('Revision missing')
    const revision = {
      ...baseRevision,
      externalModelId: 'vendor/model',
    }

    await expect(adapter.fetchCatalog(context)).resolves.toMatchObject([
      { externalModelId: 'vendor/model', capabilities: { imageInput: true } },
    ])
    await expect(adapter.probeConnection(context)).resolves.toMatchObject({
      outcome: 'passed',
    })
    await expect(adapter.probeHealth(context, revision)).resolves.toBe(
      'healthy',
    )
    await expect(
      adapter.verifyModelRevision(context, revision),
    ).resolves.toMatchObject({ outcome: 'passed' })
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
  })

  it('covers OpenRouter absent-model, degraded, unavailable, and catalog variants', async () => {
    const adapter = openRouterAdminAdapterRegistration.adapter
    const current = connection({
      adapterKey: 'openrouter',
      endpointUrl: 'https://openrouter.ai/api/v1/',
    })
    const revision = current.models[0]?.revisions[0]
    if (!revision) throw new Error('Revision missing')
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
      new Response(JSON.stringify({ data: [] })),
      new Response('unavailable', { status: 503 }),
      new Response(JSON.stringify({ data: [] })),
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
    await expect(adapter.probeHealth(context, revision)).resolves.toBe(
      'degraded',
    )
    await expect(adapter.probeHealth(context, revision)).resolves.toBe(
      'unavailable',
    )
    await expect(
      adapter.verifyModelRevision(context, revision),
    ).resolves.toMatchObject({ outcome: 'failed' })
    await expect(adapter.verifySecretCandidate(context)).rejects.toThrow(
      'rejected',
    )
  })
})
