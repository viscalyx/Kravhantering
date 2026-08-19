import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AiConnectionAdministrationService,
  type AiAdminConnectionDetail,
  type AiAdminRunProfileRecord,
  type AiAdminStore,
} from '@/lib/ai/admin-service'

const capability = {
  aiAnalysis: false,
  cost: false,
  imageInput: false,
  jsonSchemaSteering: false,
  streaming: true,
  tokenUsage: false,
  validatableJson: true,
}

function connection(): AiAdminConnectionDetail {
  return {
    activeSecret: {
      available: true,
      rootKeyVersion: 'root-a',
      secretVersionId: '00000000-0000-4000-8000-000000000005',
    },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: 'Test connection',
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: {
      decisionReference: 'DEC-1',
      id: '00000000-0000-4000-8000-000000000004',
      incidentResponseReference: '00000000-0000-4000-8000-000000000009',
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'Controlled test',
      purpose: 'Contract verification',
      responsibleOrganizationUnitReference:
        '00000000-0000-4000-8000-000000000008',
      reviewDueAt: null,
      reviewedAt: '2026-08-19T10:00:00.000Z',
      revisionNumber: 1,
      revisionToken: '00000000-0000-4000-8000-000000000006',
      status: 'valid',
      subprocessors: [],
    },
    authenticationType: 'static_secret',
    blockers: [],
    connectionEvidenceId: '00000000-0000-4000-8000-000000000016',
    configurationVersion: 1,
    dataPolicySummary: 'No personal data.',
    description: null,
    egressPolicyKey: 'test',
    endpointUrl: 'https://ai.example.test/v1',
    id: '00000000-0000-4000-8000-000000000001',
    lifecycleStatus: 'active',
    maximumConcurrency: 2,
    models: [
      {
        description: null,
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Verified model',
        revisionToken: '00000000-0000-4000-8000-000000000012',
        revisions: [
          {
            agentRuntimeVersion: null,
            connectionConfigurationVersion: 1,
            declaredCapabilities: capability,
            discoveredCapabilities: null,
            externalModelId: 'controlled/model',
            externalModelVersion: '1',
            id: '00000000-0000-4000-8000-000000000003',
            revisionNumber: 1,
            revisionToken: '00000000-0000-4000-8000-000000000007',
            status: 'verified',
            verifiedCapabilities: capability,
          },
        ],
      },
    ],
    operationalHealth: 'healthy',
    publicName: 'Test AI',
    revisionToken: '00000000-0000-4000-8000-000000000010',
    tlsPolicyKey: 'test',
  }
}

function profile(): AiAdminRunProfileRecord {
  return {
    activeRevisionId: null,
    blockers: [],
    draftRevision: {
      capabilityPolicy: {
        aiAnalysis: 'disabled',
        imageInput: 'disabled',
        jsonSchema: 'allowed',
        streaming: 'required',
        usageMetadata: 'allowed',
        validatableJson: 'required',
      },
      id: '00000000-0000-4000-8000-000000000011',
      inactivityTimeBudgetSeconds: 300,
      modelRevisionId: '00000000-0000-4000-8000-000000000003',
      queueCapacity: 4,
      revisionNumber: 1,
      revisionToken: '00000000-0000-4000-8000-000000000013',
      status: 'draft',
      totalTimeBudgetSeconds: 600,
    },
    id: '00000000-0000-4000-8000-000000000014',
    operationalStatus: 'enabled',
    profileKey: 'generation_without_images',
    revisionToken: '00000000-0000-4000-8000-000000000015',
  }
}

function verifiedRevision(connection: AiAdminConnectionDetail) {
  const revision = connection.models[0]?.revisions[0]
  if (!revision) throw new Error('Test fixture lacks a verified model revision')
  return revision
}

function draftRevision(profile: AiAdminRunProfileRecord) {
  const revision = profile.draftRevision
  if (!revision) throw new Error('Test fixture lacks a draft profile revision')
  return revision
}

describe('AI connection administration service', () => {
  const audit = vi.fn(async () => undefined)
  const external = {
    authorizeConnectionTarget: vi.fn(async () => true),
    authorizeRunProfile: vi.fn(async () => 'authorized' as const),
    fetchCatalog: vi.fn(async () => []),
    probeConnection: vi.fn(),
    probeHealth: vi.fn(),
    verifyModelRevision: vi.fn(),
    verifySecretCandidate: vi.fn(),
  }
  const secrets = {
    activateCandidate: vi.fn(),
    availability: vi.fn(),
    confirmRevocation: vi.fn(),
    deleteCandidate: vi.fn(),
    writeCandidate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    secrets.availability.mockResolvedValue(connection().activeSecret)
  })

  it('saves an incomplete draft without making external calls', async () => {
    const saved = connection()
    const store = {
      createConnection: vi.fn(async () => saved),
    } as unknown as AiAdminStore
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await expect(
      service.createConnection({
        adapterKey: 'controlled_test',
        adapterVersion: '1',
        administrationName: 'Test connection',
        agentRuntimeKey: null,
        agentRuntimeVersion: null,
        authenticationType: 'static_secret',
        dataPolicySummary: 'No personal data.',
        description: null,
        egressPolicyKey: 'test',
        endpointUrl: 'https://ai.example.test/v1',
        maximumConcurrency: 2,
        publicName: 'Test AI',
        tlsPolicyKey: 'test',
      }),
    ).resolves.toMatchObject(saved)

    expect(external.probeConnection).not.toHaveBeenCalled()
    expect(external.fetchCatalog).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith({
      operation: 'create',
      resourceId: saved.id,
      resourceType: 'ai_connection',
    })
  })

  it('passes the exact dependency evidence into atomic profile activation', async () => {
    const currentConnection = connection()
    const currentProfile = profile()
    const modelRevision = verifiedRevision(currentConnection)
    const profileRevision = draftRevision(currentProfile)
    const connectionEvidenceId = randomUUID()
    const store = {
      activateRunProfileRevision: vi.fn(async () => currentProfile),
      getActivationSnapshot: vi.fn(async () => ({
        attestationRevisionToken:
          currentConnection.attestation?.revisionToken ?? null,
        connection: currentConnection,
        connectionEvidenceId,
        modelRevision,
        profile: currentProfile,
        profileRevision,
        secretVersionId: currentConnection.activeSecret.available
          ? currentConnection.activeSecret.secretVersionId
          : null,
      })),
    } as unknown as AiAdminStore
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await service.activateRunProfileRevision({
      connectionRevisionToken: currentConnection.revisionToken,
      modelRevisionToken: modelRevision.revisionToken,
      profileKey: 'generation_without_images',
      profileRevisionId: profileRevision.id,
      profileRevisionToken: profileRevision.revisionToken,
      profileToken: currentProfile.revisionToken,
    })

    expect(store.activateRunProfileRevision).toHaveBeenCalledWith({
      attestationRevisionToken:
        currentConnection.attestation?.revisionToken,
      connectionEvidenceId,
      connectionRevisionToken: currentConnection.revisionToken,
      modelRevisionToken: modelRevision.revisionToken,
      profileRevisionId: profileRevision.id,
      profileRevisionToken: profileRevision.revisionToken,
      profileToken: currentProfile.revisionToken,
      secretVersionId: currentConnection.activeSecret.available
        ? currentConnection.activeSecret.secretVersionId
        : null,
    })
  })

  it('blocks activation when locked profile capabilities are weakened', async () => {
    const currentConnection = connection()
    const currentProfile = profile()
    const modelRevision = verifiedRevision(currentConnection)
    const profileRevision = draftRevision(currentProfile)
    profileRevision.capabilityPolicy.streaming = 'allowed'
    const store = {
      activateRunProfileRevision: vi.fn(),
      getActivationSnapshot: vi.fn(async () => ({
        attestationRevisionToken:
          currentConnection.attestation?.revisionToken ?? null,
        connection: currentConnection,
        connectionEvidenceId: randomUUID(),
        modelRevision,
        profile: currentProfile,
        profileRevision,
        secretVersionId: currentConnection.activeSecret.available
          ? currentConnection.activeSecret.secretVersionId
          : null,
      })),
    } as unknown as AiAdminStore
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await expect(
      service.activateRunProfileRevision({
        connectionRevisionToken: currentConnection.revisionToken,
        modelRevisionToken: modelRevision.revisionToken,
        profileKey: 'generation_without_images',
        profileRevisionId: profileRevision.id,
        profileRevisionToken: profileRevision.revisionToken,
        profileToken: currentProfile.revisionToken,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: {
        blockers: expect.arrayContaining([
          { code: 'capability_policy_invalid', field: 'streaming' },
        ]),
      },
    })
    expect(store.activateRunProfileRevision).not.toHaveBeenCalled()
  })

  it('blocks activation when the active secret cannot be decrypted', async () => {
    const currentConnection = connection()
    const store = {
      activateConnection: vi.fn(),
      getConnection: vi.fn(async () => currentConnection),
    } as unknown as AiAdminStore
    secrets.availability.mockResolvedValueOnce({
      available: false,
      reason: 'root_key_version_missing',
      secretVersionId: currentConnection.activeSecret.available
        ? currentConnection.activeSecret.secretVersionId
        : undefined,
    })
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await expect(
      service.setConnectionLifecycle({
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
        status: 'active',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: {
        blockers: expect.arrayContaining([{ code: 'active_secret_missing' }]),
      },
    })
    expect(external.authorizeConnectionTarget).not.toHaveBeenCalled()
    expect(store.activateConnection).not.toHaveBeenCalled()
  })

  it('requires egress authorization before an atomic activation write', async () => {
    const currentConnection = connection()
    const store = {
      activateConnection: vi.fn(),
      getConnection: vi.fn(async () => currentConnection),
    } as unknown as AiAdminStore
    external.authorizeConnectionTarget.mockResolvedValueOnce(false)
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await expect(
      service.setConnectionLifecycle({
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
        status: 'active',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { blockers: [{ code: 'egress_policy_blocked' }] },
    })
    expect(store.activateConnection).not.toHaveBeenCalled()
  })

  it('records health only for the exact verified model revision', async () => {
    const currentConnection = connection()
    const revision = verifiedRevision(currentConnection)
    const store = {
      getConnection: vi.fn(async () => currentConnection),
      recordHealth: vi.fn(async () => currentConnection),
    } as unknown as AiAdminStore
    external.probeHealth.mockResolvedValueOnce('degraded')
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await service.probeHealth({
      connectionId: currentConnection.id,
      modelRevisionId: revision.id,
      revisionToken: revision.revisionToken,
    })

    expect(external.probeHealth).toHaveBeenCalledWith(
      expect.objectContaining({ id: currentConnection.id }),
      revision,
    )
    expect(store.recordHealth).toHaveBeenCalledWith({
      connectionId: currentConnection.id,
      health: 'degraded',
      modelRevisionId: revision.id,
      modelRevisionToken: revision.revisionToken,
    })
  })
})
