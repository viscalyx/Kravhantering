import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestAiVerificationAttemptStore } from '@/lib/__tests__/fixtures/ai-verification-attempt-store'
import type { AiAdminSecretOperations } from '@/lib/ai/admin-service'
import {
  type AiAdminCandidateVerificationResult,
  type AiAdminExternalOperations,
  type AiAdminStore,
  type AiAdminStoredConnectionDetail,
  AiConnectionAdministrationService,
} from '@/lib/ai/admin-service'
import { AiModelVerificationAttemptError } from '@/lib/ai/model-verification-attempts'

const capabilities = {
  reasoning: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  reasoningControl: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  aiAnalysis: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  cost: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  imageInput: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  jsonSchemaSteering: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  streaming: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  tokenUsage: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
  validatableJson: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified' as const,
  },
}

const verification: AiAdminCandidateVerificationResult = {
  reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
  baseline: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified',
  },
  canonicalExternalModelVersion: '2026-08-22',
  capabilities,
  connection: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified',
  },
  profileCompatibility: {
    generation_with_images: {
      diagnosticCode: null,
      failureCategory: null,
      missingCapabilities: [],
      outcome: 'verified',
      supported: true,
    },
    generation_without_images: {
      diagnosticCode: null,
      failureCategory: null,
      missingCapabilities: [],
      outcome: 'verified',
      supported: true,
    },
    invalid_json_repair: {
      diagnosticCode: null,
      failureCategory: null,
      missingCapabilities: [],
      outcome: 'verified',
      supported: true,
    },
  },
  saveable: true,
  testSuiteVersion: 'ai-admin-functional-probe-v2',
}

function connection(): AiAdminStoredConnectionDetail {
  return {
    activeSecret: { available: false, reason: 'secret_missing' },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: 'Controlled',
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: null,
    attestationDraft: null,
    authenticationType: 'none',
    blockers: [],
    configurationVersion: 4,
    connectionEvidenceId: null,
    dataPolicySummary: 'Synthetic data only',
    description: null,
    egressPolicyKey: 'controlled',
    endpointUrl: 'https://controlled.invalid',
    id: randomUUID(),
    lifecycleStatus: 'draft',
    maximumConcurrency: 1,
    models: [],
    operationalHealth: 'unknown',
    publicName: 'Controlled',
    revisionToken: randomUUID(),
    tlsPolicyKey: 'controlled',
  }
}

function harness(
  saveModelRevision = vi.fn(),
  verifyModelCandidate = vi.fn(async () => verification),
): {
  audit: ReturnType<typeof vi.fn>
  connection: AiAdminStoredConnectionDetail
  saveModelRevision: ReturnType<typeof vi.fn>
  service: AiConnectionAdministrationService
  store: AiAdminStore
  external: AiAdminExternalOperations
  secrets: AiAdminSecretOperations
  verificationAttempts: ReturnType<typeof createTestAiVerificationAttemptStore>
} {
  const current = connection()
  const verificationAttempts = createTestAiVerificationAttemptStore()
  const store = {
    getConnection: vi.fn(async () => current),
    activateConnection: vi.fn(async () => current),
    recordHealth: vi.fn(async () => current),
    saveModelRevision: (
      input: Parameters<AiAdminStore['saveModelRevision']>[0],
    ) =>
      verificationAttempts.transaction(async manager => {
        const verification = await input.verification(manager)
        return saveModelRevision({ ...input, verification })
      }),
  } as unknown as AiAdminStore
  const external = {
    adapterAvailability: vi.fn(() => ({ available: true })),
    authorizeConnectionTarget: vi.fn(async () => true),
    verifyModelCandidate,
    fetchCatalog: vi.fn(async () => []),
    probeHealth: vi.fn(async () => ({
      health: 'healthy',
      invalidationScope: 'none',
    })),
  } as unknown as AiAdminExternalOperations
  const secrets = {
    availability: vi.fn(async () => ({
      available: true,
      secretVersionId: 'active-secret',
    })),
    activateCandidate: vi.fn(),
  } as unknown as AiAdminSecretOperations
  const audit = vi.fn(async () => undefined)
  return {
    audit,
    connection: current,
    store,
    external,
    secrets,
    verificationAttempts,
    saveModelRevision,
    service: new AiConnectionAdministrationService({
      audit,
      external,
      secrets,
      store,
      verificationAttempts,
    }),
  }
}

describe('AI administration model verification attempts', () => {
  it('keeps non-verification operations available when pending verification loading fails', async () => {
    const {
      connection: current,
      service,
      store,
      external,
      secrets,
      verificationAttempts,
    } = harness()
    current.authenticationType = 'static_secret'
    current.connectionEvidenceId = randomUUID()
    current.attestation = {
      id: randomUUID(),
      revisionToken: randomUUID(),
      revisionNumber: 1,
      status: 'valid',
      decisionReference: 'Approved',
      incidentResponseReference: randomUUID(),
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'Controlled',
      purpose: 'Synthetic tests',
      responsibleOrganizationUnitReference: randomUUID(),
      reviewDueAt: null,
      reviewedAt: new Date().toISOString(),
      subprocessors: [],
    }
    const revision = {
      agentRuntimeVersion: null,
      connectionConfigurationVersion: current.configurationVersion,
      declaredCapabilities: {
        reasoning: true,
        reasoningControl: true,
        aiAnalysis: true,
        cost: true,
        imageInput: true,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
        validatableJson: true,
      },
      discoveredCapabilities: null,
      externalModelId: 'controlled/model',
      externalModelVersion: null,
      id: randomUUID(),
      profileCompatibility: verification.profileCompatibility,
      reasoning: verification.reasoning,
      revisionNumber: 1,
      revisionToken: randomUUID(),
      status: 'verified' as const,
      testSuiteVersion: verification.testSuiteVersion,
      verifiedAt: new Date().toISOString(),
      verifiedCapabilities: null,
    }
    current.models = [
      {
        id: randomUUID(),
        name: 'Controlled',
        description: null,
        revisionToken: randomUUID(),
        revisions: [revision],
      },
    ]
    const unavailable = new AiModelVerificationAttemptError(
      'attempt_unavailable',
    )
    const list = vi
      .spyOn(verificationAttempts, 'list')
      .mockRejectedValue(unavailable)

    await service.activateSecret({
      connectionId: current.id,
      connectionConfigurationVersion: current.configurationVersion,
      connectionRevisionToken: current.revisionToken,
      secretVersionId: 'candidate-secret',
    })
    expect(secrets.activateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({
          activeSecret: { available: true, secretVersionId: 'active-secret' },
          adapterAvailability: { available: true },
        }),
      }),
    )
    await expect(service.fetchCatalog(current.id)).resolves.toEqual([])
    expect(external.fetchCatalog).toHaveBeenCalledOnce()
    await service.probeHealth({
      connectionId: current.id,
      modelRevisionId: revision.id,
      revisionToken: revision.revisionToken,
    })
    expect(store.recordHealth).toHaveBeenCalledWith(
      expect.objectContaining({ health: 'healthy' }),
    )
    await expect(
      service.setConnectionLifecycle({
        connectionId: current.id,
        revisionToken: current.revisionToken,
        status: 'active',
      }),
    ).resolves.toEqual(current)
    expect(store.activateConnection).toHaveBeenCalledWith(
      expect.objectContaining({ secretVersionId: 'active-secret' }),
    )
    expect(list).not.toHaveBeenCalled()

    await expect(service.getConnection(current.id)).rejects.toBe(unavailable)
    await expect(
      service.verifyModelCandidate({
        connectionId: current.id,
        candidate: {
          externalModelId: revision.externalModelId,
          externalModelVersion: null,
          reasoning: verification.reasoning,
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(unavailable)
    expect(external.verifyModelCandidate).not.toHaveBeenCalled()
    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision: {
          attemptId: randomUUID(),
          name: 'Controlled',
          description: null,
          modelId: null,
          modelToken: null,
          externalModelId: revision.externalModelId,
          externalModelVersion: null,
          reasoning: verification.reasoning,
        },
      }),
    ).rejects.toBe(unavailable)
  })

  it('does not persist a successful result returned after cancellation', async () => {
    const abortController = new AbortController()
    const verifyModelCandidate = vi.fn(async () => {
      abortController.abort()
      return verification
    })
    const {
      audit,
      connection: current,
      service,
    } = harness(vi.fn(), verifyModelCandidate)

    await expect(
      service.verifyModelCandidate({
        candidate: {
          reasoning: {
            mode: 'explicit_control' as const,
            effort: 'high' as const,
          },
          externalModelId: 'controlled/model',
          externalModelVersion: null,
        },
        connectionId: current.id,
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(audit).not.toHaveBeenCalled()
  })

  it('binds technical fields but permits name and description edits before the save commit', async () => {
    const savedModel = {
      description: 'Edited description',
      id: randomUUID(),
      name: 'Edited name',
      revisions: [],
      revisionToken: randomUUID(),
    }
    const save = vi.fn(async () => savedModel)
    const { audit, connection: current, service } = harness(save)
    const attempt = await service.verifyModelCandidate({
      candidate: {
        externalModelVersion: '2026-08-22',
        externalModelId: 'controlled/model',
        reasoning: { effort: 'high', mode: 'explicit_control' },
      },
      connectionId: current.id,
      signal: new AbortController().signal,
    })

    const modelRevision = {
      reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
      attemptId: attempt.attemptId as string,
      description: 'Edited description',
      externalModelId: 'controlled/model',
      externalModelVersion: '2026-08-22',
      modelId: null,
      modelToken: null,
      name: 'Edited name',
    }
    expect(audit).toHaveBeenCalledWith({
      operation: 'verify',
      resourceId: current.id,
      resourceType: 'ai_connection',
    })
    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision,
      }),
    ).resolves.toBe(savedModel)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ verification }))
    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('releases a valid attempt after database failure so the exact save can be retried', async () => {
    const savedModel = {
      description: null,
      id: randomUUID(),
      name: 'Model',
      revisions: [],
      revisionToken: randomUUID(),
    }
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(savedModel)
    const { connection: current, service } = harness(save)
    const attempt = await service.verifyModelCandidate({
      candidate: {
        reasoning: {
          mode: 'explicit_control' as const,
          effort: 'high' as const,
        },
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      },
      connectionId: current.id,
      signal: new AbortController().signal,
    })
    const input = {
      connectionId: current.id,
      modelRevision: {
        reasoning: {
          mode: 'explicit_control' as const,
          effort: 'high' as const,
        },
        attemptId: attempt.attemptId as string,
        description: null,
        externalModelId: 'controlled/model',
        externalModelVersion: null,
        modelId: null,
        modelToken: null,
        name: 'Model',
      },
    }

    await expect(service.saveModelRevision(input)).rejects.toMatchObject({
      message: 'The model save outcome is unavailable.',
      details: { blocker: 'attempt_unavailable' },
    })
    await expect(service.saveModelRevision(input)).resolves.toBe(savedModel)
  })

  it('rejects a technical model change and a discarded attempt', async () => {
    const { connection: current, service } = harness(vi.fn())
    const attempt = await service.verifyModelCandidate({
      candidate: {
        reasoning: {
          mode: 'explicit_control' as const,
          effort: 'high' as const,
        },
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      },
      connectionId: current.id,
      signal: new AbortController().signal,
    })
    const changed = {
      reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
      attemptId: attempt.attemptId as string,
      description: null,
      externalModelId: 'controlled/other-model',
      externalModelVersion: null,
      modelId: null,
      modelToken: null,
      name: 'Model',
    }

    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision: changed,
      }),
    ).rejects.toMatchObject({ status: 409 })
    for (const reasoning of [
      { mode: 'explicit_control', effort: 'low' },
      { mode: 'model_default', effort: null },
    ] as const) {
      await expect(
        service.saveModelRevision({
          connectionId: current.id,
          modelRevision: {
            ...changed,
            externalModelId: 'controlled/model',
            reasoning,
          },
        }),
      ).rejects.toMatchObject({ status: 409 })
    }
    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision: {
          ...changed,
          externalModelId: 'controlled/model',
          modelId: randomUUID(),
          modelToken: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ details: { blocker: 'attempt_mismatch' } })
    await service.discardModelVerification(
      current.id,
      attempt.attemptId as string,
    )

    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision: { ...changed, externalModelId: 'controlled/model' },
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('AI run profile authorization', () => {
  it('rejects pausing an unconfigured profile before persistence work', async () => {
    const setRunProfileOperationalStatus = vi.fn()
    const store = {
      listRunProfiles: vi.fn(async () => [
        {
          administrativeStatus: 'unconfigured',
          blockers: [{ code: 'model_revision_missing' }],
          configurationStatus: 'unconfigured',
          modelRevisionId: null,
          operationalStatus: 'enabled',
          profileKey: 'generation_without_images',
        },
      ]),
      setRunProfileOperationalStatus,
    } as unknown as AiAdminStore
    const service = new AiConnectionAdministrationService({
      audit: vi.fn(async () => undefined),
      external: {} as AiAdminExternalOperations,
      secrets: {} as AiAdminSecretOperations,
      store,
      verificationAttempts: createTestAiVerificationAttemptStore(),
    })

    await expect(
      service.setRunProfileOperationalStatus({
        profileKey: 'generation_without_images',
        revisionToken: randomUUID(),
        status: 'suspended',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { blockers: [{ code: 'model_revision_missing' }] },
    })
    expect(setRunProfileOperationalStatus).not.toHaveBeenCalled()
  })

  it('authorizes the selected model connection before saving the profile', async () => {
    const selectedConnection = connection()
    const saveRunProfile = vi.fn()
    const authorizeRunProfile = vi.fn(
      async () => 'data_policy_blocked' as const,
    )
    const store = {
      getModelRevisionConnection: vi.fn(async () => selectedConnection),
      saveRunProfile,
    } as unknown as AiAdminStore
    const external = {
      adapterAvailability: vi.fn(() => ({ available: true })),
      authorizeRunProfile,
    } as unknown as AiAdminExternalOperations
    const service = new AiConnectionAdministrationService({
      audit: vi.fn(async () => undefined),
      external,
      secrets: {} as AiAdminSecretOperations,
      store,
      verificationAttempts: createTestAiVerificationAttemptStore(),
    })
    const profile = {
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 16,
      maximumOutputBytes: 65_536,
      maximumOutputTokens: 1_536,
      maximumRetainedMemoryBytes: 131_072,
      modelRevisionId: randomUUID(),
      queueCapacity: 10,
      revisionToken: randomUUID(),
      totalTimeBudgetSeconds: 600,
    }

    await expect(
      service.saveRunProfile({
        profileKey: 'generation_without_images',
        profile,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { blockers: [{ code: 'data_policy_blocked' }] },
    })

    expect(authorizeRunProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: selectedConnection.id }),
      'generation_without_images',
    )
    expect(saveRunProfile).not.toHaveBeenCalled()
  })
})
