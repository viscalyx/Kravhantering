import { describe, expect, it } from 'vitest'
import { __testing } from '@/lib/dal/ai-connection-admin'

const CAPABILITY_JSON = JSON.stringify({
  aiAnalysis: false,
  cost: false,
  imageInput: false,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
})

const connectionRow = {
  activeSecretId: null,
  activeSecretRootKeyVersion: null,
  adapterKey: 'controlled_test',
  adapterVersion: '1',
  administrationName: 'Admin',
  agentRuntimeKey: null,
  agentRuntimeVersion: null,
  authenticationType: 'static_secret',
  configurationVersion: '2',
  connectionEvidenceId: null,
  dataPolicySummary: 'No data',
  description: null,
  egressPolicyKey: 'test',
  endpointUrl: 'https://ai.example.test/v1',
  hasValidAttestation: 0,
  hasVerifiedModel: 0,
  id: 'A',
  lifecycleStatus: 'draft',
  maximumConcurrency: '2',
  operationalHealth: null,
  publicName: 'Public',
  revisionToken: 'B',
  tlsPolicyKey: 'test',
}

const profileRow = {
  activeRevisionId: null,
  capabilityPolicyJson: JSON.stringify({
    aiAnalysis: 'allowed',
    imageInput: 'disabled',
    jsonSchema: 'required',
    streaming: 'required',
    usageMetadata: 'allowed',
    validatableJson: 'required',
  }),
  draftRevisionId: 'DRAFT',
  inactivityTimeBudgetSeconds: '300',
  modelRevisionId: 'MODEL',
  operationalStatus: 'enabled',
  profileId: 'PROFILE',
  profileKey: 'generation_without_images',
  profileRevisionNumber: '1',
  profileRevisionToken: 'TOKEN',
  profileToken: 'PROFILE-TOKEN',
  queueCapacity: '2',
  totalTimeBudgetSeconds: '600',
}

describe('AI administration row mapping', () => {
  it('parses only bounded expected JSON shapes', () => {
    expect(__testing.jsonArray(null)).toBeNull()
    expect(__testing.jsonArray('["SE"]')).toEqual(['SE'])
    expect(__testing.jsonArray('{}')).toBeNull()
    expect(__testing.jsonArray('[1]')).toBeNull()
    expect(__testing.jsonArray('{')).toBeNull()
    expect(__testing.jsonCapability(null)).toBeNull()
    expect(__testing.jsonCapability(CAPABILITY_JSON)).toMatchObject({
      streaming: true,
    })
    expect(__testing.jsonCapability('{}')).toBeNull()
    expect(__testing.jsonCapability('{')).toBeNull()
  })

  it('maps nullable dates, identifiers, summaries, and blocker combinations', () => {
    expect(__testing.iso(null)).toBeNull()
    expect(__testing.iso(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-01T00:00:00.000Z',
    )
    expect(__testing.iso('2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    )
    expect(__testing.sameId('ABC', 'abc')).toBe(true)
    expect(__testing.sameId(null, undefined)).toBe(false)
    expect(__testing.sameId('a', 'b')).toBe(false)
    expect(__testing.summary(connectionRow as never)).toEqual({
      administrationName: 'Admin',
      configurationVersion: 2,
      id: 'A',
      lifecycleStatus: 'draft',
      operationalHealth: 'unknown',
      publicName: 'Public',
      revisionToken: 'B',
    })
    expect(__testing.blockers(connectionRow as never)).toEqual([
      { code: 'attestation_invalid' },
      { code: 'active_secret_missing' },
      { code: 'connection_verification_missing' },
      { code: 'model_revision_unverified' },
    ])
    expect(
      __testing.blockers({
        ...connectionRow,
        activeSecretId: 'SECRET',
        authenticationType: 'none',
        connectionEvidenceId: 'EVIDENCE',
        hasValidAttestation: 1,
        hasVerifiedModel: 1,
      } as never),
    ).toEqual([])
  })

  it('maps complete and nullable attestation metadata', () => {
    const row = {
      connectionId: 'CONNECTION',
      decisionReference: null,
      id: 'ATTESTATION',
      incidentResponseReference: null,
      isPersonalDataProcessed: null,
      isTrainingAllowed: null,
      maximumInformationClass: null,
      maximumRetentionDays: null,
      processingRegionsJson: null,
      providerName: null,
      purpose: null,
      responsibleOrganizationUnitReference: null,
      reviewDueAt: null,
      reviewedAt: null,
      revisionNumber: '1',
      revisionToken: 'TOKEN',
      status: 'draft',
      subprocessorsJson: null,
    }
    expect(__testing.attestation(row as never)).toMatchObject({
      maximumRetentionDays: null,
      processingRegions: null,
      reviewedAt: null,
    })
    expect(
      __testing.attestation({
        ...row,
        maximumRetentionDays: '0',
        processingRegionsJson: '["SE"]',
        reviewDueAt: '2099-01-01T00:00:00.000Z',
        reviewedAt: new Date('2026-01-01T00:00:00.000Z'),
        subprocessorsJson: '[]',
      } as never),
    ).toMatchObject({
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      reviewDueAt: '2099-01-01T00:00:00.000Z',
      subprocessors: [],
    })
  })

  it('groups model revisions and substitutes safe capability defaults', () => {
    const row = {
      agentRuntimeVersion: null,
      connectionConfigurationVersion: '1',
      connectionId: 'CONNECTION',
      declaredCapabilitiesJson: CAPABILITY_JSON,
      description: null,
      discoveredCapabilitiesJson: null,
      externalModelId: 'external/model',
      externalModelVersion: null,
      modelId: 'MODEL',
      modelName: 'Model',
      modelRevisionToken: 'REVISION-TOKEN',
      modelToken: 'MODEL-TOKEN',
      revisionId: 'REVISION-1',
      revisionNumber: '1',
      status: 'draft',
      verifiedCapabilitiesJson: null,
    }
    expect(
      __testing.models([
        row,
        {
          ...row,
          declaredCapabilitiesJson: '{}',
          revisionId: 'REVISION-2',
          revisionNumber: 2,
        },
      ] as never),
    ).toMatchObject([
      {
        id: 'MODEL',
        revisions: [
          { declaredCapabilities: { streaming: true } },
          { declaredCapabilities: { streaming: false } },
        ],
      },
    ])
    expect(__testing.emptyCapabilities()).toEqual(
      expect.objectContaining({ streaming: false, validatableJson: false }),
    )
  })

  it('maps valid drafts and omits every incomplete or malformed draft', () => {
    expect(
      __testing.mapProfile(profileRow as never).draftRevision,
    ).toMatchObject({
      id: 'DRAFT',
      totalTimeBudgetSeconds: 600,
    })
    for (const field of [
      'draftRevisionId',
      'capabilityPolicyJson',
      'profileRevisionToken',
      'profileRevisionNumber',
      'totalTimeBudgetSeconds',
      'inactivityTimeBudgetSeconds',
      'queueCapacity',
    ] as const) {
      expect(
        __testing.mapProfile({ ...profileRow, [field]: null } as never)
          .draftRevision,
      ).toBeNull()
    }
    expect(
      __testing.mapProfile({
        ...profileRow,
        capabilityPolicyJson: '{',
      } as never).draftRevision,
    ).toBeNull()
    expect(
      __testing.mapProfile({
        ...profileRow,
        capabilityPolicyJson: '{}',
      } as never).draftRevision,
    ).toBeNull()
  })

  it('requires loaded results and projects public summaries', () => {
    expect(__testing.requireLoaded('value', 'missing')).toBe('value')
    expect(() => __testing.requireLoaded(null, 'missing')).toThrow('missing')
    expect(
      __testing.summaryFromDetail({
        administrationName: 'Admin',
        configurationVersion: 1,
        id: 'ID',
        lifecycleStatus: 'active',
        operationalHealth: 'healthy',
        publicName: 'Public',
        revisionToken: 'TOKEN',
      } as never),
    ).toEqual({
      administrationName: 'Admin',
      configurationVersion: 1,
      id: 'ID',
      lifecycleStatus: 'active',
      operationalHealth: 'healthy',
      publicName: 'Public',
      revisionToken: 'TOKEN',
    })
  })
})
