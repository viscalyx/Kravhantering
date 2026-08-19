import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __testing,
  type AiAdminCatalogItem,
  type AiAdminConnectionDetail,
  type AiAdminRunProfileRecord,
  type AiAdminStore,
  AiConnectionAdministrationService,
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
    fetchCatalog: vi.fn(async (): Promise<readonly AiAdminCatalogItem[]> => []),
    probeConnection: vi.fn(),
    probeHealth: vi.fn(),
    verifyModelRevision: vi.fn(),
    verifySecretCandidate: vi.fn(),
  }
  const secrets = {
    activateCandidate: vi.fn(),
    availability: vi.fn(),
    availabilities: vi.fn(),
    confirmRevocation: vi.fn(),
    deleteCandidate: vi.fn(),
    writeCandidate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    secrets.availability.mockResolvedValue(connection().activeSecret)
    secrets.availabilities.mockImplementation(
      async (connectionIds: string[]) =>
        new Map(
          connectionIds.map(connectionId => [
            connectionId.toLowerCase(),
            connection().activeSecret,
          ]),
        ),
    )
  })

  it('saves an incomplete draft without making external calls', async () => {
    const saved = connection()
    saved.authenticationType = 'none'
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
        authenticationType: 'none',
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
    expect(audit).not.toHaveBeenCalled()
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
      attestationRevisionToken: currentConnection.attestation?.revisionToken,
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
    external.probeHealth.mockResolvedValueOnce({
      failureCategory: 'capability_mismatch',
      health: 'degraded',
      invalidatesVerification: true,
    })
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
      invalidatesVerification: true,
      modelRevisionId: revision.id,
      modelRevisionToken: revision.revisionToken,
    })
  })

  it('covers the complete successful administration service surface', async () => {
    const currentConnection = connection()
    const currentProfile = profile()
    const modelRevision = verifiedRevision(currentConnection)
    const profileRevision = draftRevision(currentProfile)
    const metadata = {
      activatedAt: null,
      ciphertextDeletedAt: null,
      connectionId: currentConnection.id,
      createdAt: '2026-08-19T00:00:00.000Z',
      id: currentConnection.activeSecret.available
        ? currentConnection.activeSecret.secretVersionId
        : randomUUID(),
      providerRevokedAt: null,
      revisionNumber: 1,
      revisionToken: randomUUID(),
      rootKeyVersion: 'root-a',
      status: 'candidate' as const,
      verifiedAt: null,
    }
    const snapshot = {
      attestationRevisionToken:
        currentConnection.attestation?.revisionToken ?? null,
      connection: currentConnection,
      connectionEvidenceId: currentConnection.connectionEvidenceId,
      modelRevision,
      profile: currentProfile,
      profileRevision,
      secretVersionId: metadata.id,
    }
    const store = {
      activateConnection: vi.fn(async () => currentConnection),
      activateRunProfileRevision: vi.fn(async () => currentProfile),
      createConnection: vi.fn(async () => currentConnection),
      getActivationSnapshot: vi.fn(async () => snapshot),
      getConnection: vi.fn(async () => currentConnection),
      listConnections: vi.fn(async () => [currentConnection]),
      listRunProfileActivationEntries: vi.fn(async () => [
        { profile: currentProfile, snapshot },
        {
          profile: { ...currentProfile, profileKey: 'generation_with_images' },
          snapshot,
        },
        {
          profile: { ...currentProfile, profileKey: 'invalid_json_repair' },
          snapshot: null,
        },
      ]),
      listRunProfileRevisions: vi.fn(async () => [profileRevision]),
      recordConnectionVerification: vi.fn(async () => currentConnection),
      recordHealth: vi.fn(async () => currentConnection),
      recordModelVerification: vi.fn(async () => modelRevision),
      retireModelRevision: vi.fn(async () => ({
        ...modelRevision,
        status: 'retired' as const,
      })),
      saveAttestation: vi.fn(async () => currentConnection.attestation),
      saveModelRevision: vi.fn(async () => currentConnection.models[0]),
      saveRunProfileRevision: vi.fn(async () => currentProfile),
      setConnectionLifecycle: vi.fn(async () => currentConnection),
      setRunProfileOperationalStatus: vi.fn(async () => currentProfile),
      updateConnection: vi.fn(async () => currentConnection),
    } as unknown as AiAdminStore
    secrets.activateCandidate.mockResolvedValue(metadata)
    secrets.confirmRevocation.mockResolvedValue(metadata)
    secrets.deleteCandidate.mockResolvedValue(true)
    secrets.writeCandidate.mockResolvedValue(metadata)
    external.fetchCatalog.mockResolvedValue([
      {
        capabilities: capability,
        externalModelId: modelRevision.externalModelId,
        externalModelVersion: null,
        name: 'Model',
      },
    ])
    external.probeConnection.mockResolvedValue({
      details: { reachable: true },
      failureCategory: null,
      outcome: 'passed',
      testSuiteVersion: 'test-v1',
    })
    external.probeHealth.mockResolvedValue({
      failureCategory: null,
      health: 'healthy',
      invalidatesVerification: false,
    })
    external.verifyModelRevision.mockResolvedValue({
      details: { resolved: true },
      failureCategory: null,
      outcome: 'passed',
      testSuiteVersion: 'test-v1',
      verifiedCapabilities: capability,
    })
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await expect(service.listConnections()).resolves.toHaveLength(1)
    await expect(service.listRunProfiles()).resolves.toHaveLength(3)
    expect(secrets.availabilities).toHaveBeenCalledOnce()
    expect(secrets.availabilities).toHaveBeenCalledWith([
      currentConnection.id.toLowerCase(),
    ])
    expect(secrets.availability).not.toHaveBeenCalled()
    await expect(
      service.listRunProfileRevisions(currentProfile.profileKey),
    ).resolves.toEqual([profileRevision])
    await expect(
      service.getConnection(currentConnection.id),
    ).resolves.toBeDefined()
    await expect(
      service.updateConnection({
        connection: {
          adapterKey: currentConnection.adapterKey,
          adapterVersion: currentConnection.adapterVersion,
          administrationName: currentConnection.administrationName,
          agentRuntimeKey: currentConnection.agentRuntimeKey,
          agentRuntimeVersion: currentConnection.agentRuntimeVersion,
          authenticationType: currentConnection.authenticationType,
          dataPolicySummary: currentConnection.dataPolicySummary,
          description: currentConnection.description,
          egressPolicyKey: currentConnection.egressPolicyKey,
          endpointUrl: currentConnection.endpointUrl,
          maximumConcurrency: currentConnection.maximumConcurrency,
          publicName: currentConnection.publicName,
          tlsPolicyKey: currentConnection.tlsPolicyKey,
        },
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
      }),
    ).resolves.toBeDefined()
    const attestation = currentConnection.attestation
    if (!attestation) throw new Error('Attestation missing')
    await expect(
      service.saveAttestation({
        attestation,
        connectionId: currentConnection.id,
        currentAttestationRevisionToken: attestation.revisionToken,
        makeValid: true,
      }),
    ).resolves.toBeDefined()
    await expect(
      service.writeSecret(currentConnection.id, 'new-secret'),
    ).resolves.toBe(metadata)
    await expect(
      service.activateSecret({
        connectionConfigurationVersion: currentConnection.configurationVersion,
        connectionId: currentConnection.id,
        connectionRevisionToken: currentConnection.revisionToken,
        secretVersionId: metadata.id,
      }),
    ).resolves.toBe(metadata)
    await expect(
      service.confirmSecretRevocation(currentConnection.id, metadata.id),
    ).resolves.toBe(metadata)
    await expect(
      service.deleteSecretCandidate(currentConnection.id, metadata.id),
    ).resolves.toBeUndefined()
    await expect(
      service.verifyConnection(currentConnection.id),
    ).resolves.toBeDefined()
    await expect(
      service.fetchCatalog(currentConnection.id),
    ).resolves.toHaveLength(1)
    await expect(
      service.probeHealth({
        connectionId: currentConnection.id,
        modelRevisionId: modelRevision.id,
        revisionToken: modelRevision.revisionToken,
      }),
    ).resolves.toBeDefined()
    await expect(
      service.saveModelRevision({
        connectionId: currentConnection.id,
        modelRevision: {
          declaredCapabilities: capability,
          description: null,
          discoveredCapabilities: null,
          externalModelId: 'controlled/new',
          externalModelVersion: null,
          modelId: null,
          modelToken: null,
          name: 'New',
        },
      }),
    ).resolves.toBeDefined()
    await expect(
      service.verifyModelRevision({
        connectionId: currentConnection.id,
        modelRevisionId: modelRevision.id,
        revisionToken: modelRevision.revisionToken,
      }),
    ).resolves.toBe(modelRevision)
    await expect(
      service.retireModelRevision({
        connectionId: currentConnection.id,
        modelRevisionId: modelRevision.id,
        revisionToken: modelRevision.revisionToken,
      }),
    ).resolves.toMatchObject({ status: 'retired' })
    await expect(
      service.setConnectionLifecycle({
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
        status: 'suspended',
      }),
    ).resolves.toBeDefined()
    await expect(
      service.setConnectionLifecycle({
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
        status: 'active',
      }),
    ).resolves.toBeDefined()
    await expect(
      service.saveRunProfileRevision({
        profileKey: currentProfile.profileKey,
        revision: profileRevision,
      }),
    ).resolves.toBe(currentProfile)
    await expect(
      service.setRunProfileOperationalStatus({
        profileKey: currentProfile.profileKey,
        revisionToken: currentProfile.revisionToken,
        status: 'suspended',
      }),
    ).resolves.toBe(currentProfile)
  })

  it('returns safe conflicts and validation errors for stale or incomplete state', async () => {
    const currentConnection = connection()
    const modelRevision = verifiedRevision(currentConnection)
    const store = {
      getConnection: vi.fn(async () => null),
      retireModelRevision: vi.fn(async () => null),
      setConnectionLifecycle: vi.fn(async () => null),
      setRunProfileOperationalStatus: vi.fn(async () => null),
      updateConnection: vi.fn(async () => null),
    } as unknown as AiAdminStore
    secrets.deleteCandidate.mockResolvedValue(false)
    const service = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
    })

    await expect(
      service.getConnection(currentConnection.id),
    ).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(
      service.updateConnection({
        connection: {} as never,
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      service.deleteSecretCandidate(currentConnection.id, randomUUID()),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(
      service.retireModelRevision({
        connectionId: currentConnection.id,
        modelRevisionId: modelRevision.id,
        revisionToken: modelRevision.revisionToken,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      service.setConnectionLifecycle({
        connectionId: currentConnection.id,
        revisionToken: currentConnection.revisionToken,
        status: 'retired',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      service.setRunProfileOperationalStatus({
        profileKey: 'invalid_json_repair',
        revisionToken: randomUUID(),
        status: 'enabled',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const reachableStore = {
      getConnection: vi.fn(async () => currentConnection),
    } as unknown as AiAdminStore
    const reachable = new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store: reachableStore,
    })
    const reachableAttestation = currentConnection.attestation
    if (!reachableAttestation) throw new Error('Attestation missing')
    await expect(
      reachable.saveAttestation({
        attestation: {
          ...reachableAttestation,
          providerName: null,
          revisionToken: null,
        },
        connectionId: currentConnection.id,
        makeValid: true,
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      reachable.probeHealth({
        connectionId: currentConnection.id,
        modelRevisionId: randomUUID(),
        revisionToken: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(
      reachable.probeHealth({
        connectionId: currentConnection.id,
        modelRevisionId: modelRevision.id,
        revisionToken: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('evaluates attestation dates and every locked capability-policy mode', () => {
    const baseAttestation = connection().attestation
    if (!baseAttestation) throw new Error('Attestation missing')
    expect(__testing.completeAttestation(baseAttestation)).toBe(true)
    for (const field of [
      'responsibleOrganizationUnitReference',
      'purpose',
      'maximumInformationClass',
      'isPersonalDataProcessed',
      'providerName',
      'subprocessors',
      'processingRegions',
      'isTrainingAllowed',
      'maximumRetentionDays',
      'incidentResponseReference',
      'decisionReference',
      'reviewedAt',
    ] as const) {
      expect(
        __testing.completeAttestation({ ...baseAttestation, [field]: null }),
      ).toBe(false)
    }
    expect(
      __testing.completeAttestation({
        ...baseAttestation,
        processingRegions: [],
      }),
    ).toBe(false)
    expect(
      __testing.currentAttestation({ ...baseAttestation, reviewedAt: null }),
    ).toBe(false)
    expect(
      __testing.currentAttestation({
        ...baseAttestation,
        reviewDueAt: '2020-01-01T00:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      __testing.currentAttestation({
        ...baseAttestation,
        reviewedAt: '2099-01-01T00:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      __testing.currentAttestation({
        ...baseAttestation,
        reviewDueAt: 'invalid',
      }),
    ).toBe(false)

    const policy = profile().draftRevision?.capabilityPolicy
    if (!policy) throw new Error('Policy missing')
    expect(
      __testing.capabilityPolicyBlockers(
        'invalid_json_repair',
        { ...policy, streaming: 'allowed', usageMetadata: 'required' },
        null,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'capability_policy_invalid' }),
        { code: 'model_revision_unverified' },
      ]),
    )
    expect(
      __testing.capabilityPolicyBlockers(
        'generation_with_images',
        { ...policy, imageInput: 'required', jsonSchema: 'required' },
        { ...capability, imageInput: false, jsonSchemaSteering: false },
      ),
    ).toEqual(
      expect.arrayContaining([
        { code: 'capability_policy_invalid', field: 'imageInput' },
        { code: 'capability_policy_invalid', field: 'jsonSchema' },
      ]),
    )
    expect(
      __testing.capabilityPolicyBlockers(
        'generation_without_images',
        { ...policy, usageMetadata: 'required' },
        { ...capability, cost: false, tokenUsage: false },
      ),
    ).toEqual(
      expect.arrayContaining([
        { code: 'capability_policy_invalid', field: 'usageMetadata' },
      ]),
    )
    expect(
      __testing.capabilityPolicyBlockers(
        'generation_without_images',
        { ...policy, usageMetadata: 'required' },
        { ...capability, cost: true, tokenUsage: false },
      ),
    ).toEqual(expect.any(Array))
    const currentConnection = connection()
    const currentProfile = profile()
    const currentRevision = currentProfile.draftRevision
    if (!currentRevision) throw new Error('Profile revision missing')
    expect(
      __testing.profileActivationBlockers('generation_without_images', {
        attestationRevisionToken: null,
        connection: { ...currentConnection, lifecycleStatus: 'draft' },
        connectionEvidenceId: null,
        modelRevision: null,
        profile: currentProfile,
        profileRevision: currentRevision,
        secretVersionId: null,
      }),
    ).toEqual(
      expect.arrayContaining([
        { code: 'connection_inactive' },
        { code: 'model_revision_missing' },
      ]),
    )
  })
})
