import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { AiAdminSecretOperations } from '@/lib/ai/admin-service'
import {
  type AiAdminCandidateVerificationResult,
  type AiAdminExternalOperations,
  type AiAdminStore,
  type AiAdminStoredConnectionDetail,
  AiConnectionAdministrationService,
} from '@/lib/ai/admin-service'
import { createAiModelVerificationAttemptStore } from '@/lib/ai/model-verification-attempts'

const capabilities = {
  aiAnalysis: { failureCategory: null, outcome: 'verified' as const },
  cost: { failureCategory: null, outcome: 'verified' as const },
  imageInput: { failureCategory: null, outcome: 'verified' as const },
  jsonSchemaSteering: { failureCategory: null, outcome: 'verified' as const },
  streaming: { failureCategory: null, outcome: 'verified' as const },
  tokenUsage: { failureCategory: null, outcome: 'verified' as const },
  validatableJson: { failureCategory: null, outcome: 'verified' as const },
}

const verification: AiAdminCandidateVerificationResult = {
  baseline: { failureCategory: null, outcome: 'verified' },
  canonicalExternalModelVersion: '2026-08-22',
  capabilities,
  connection: { failureCategory: null, outcome: 'verified' },
  profileCompatibility: {
    generation_with_images: {
      failureCategory: null,
      missingCapabilities: [],
      supported: true,
    },
    generation_without_images: {
      failureCategory: null,
      missingCapabilities: [],
      supported: true,
    },
    invalid_json_repair: {
      failureCategory: null,
      missingCapabilities: [],
      supported: true,
    },
  },
  saveable: true,
  testSuiteVersion: 'ai-admin-functional-probe-v5',
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

function harness(saveModelRevision = vi.fn()): {
  connection: AiAdminStoredConnectionDetail
  saveModelRevision: ReturnType<typeof vi.fn>
  service: AiConnectionAdministrationService
} {
  const current = connection()
  const store = {
    getConnection: vi.fn(async () => current),
    saveModelRevision,
  } as unknown as AiAdminStore
  const external = {
    adapterAvailability: vi.fn(() => ({ available: true })),
    authorizeConnectionTarget: vi.fn(async () => true),
    verifyModelCandidate: vi.fn(async () => verification),
  } as unknown as AiAdminExternalOperations
  const secrets = {} as AiAdminSecretOperations
  return {
    connection: current,
    saveModelRevision,
    service: new AiConnectionAdministrationService({
      actorKey: 'administrator-1',
      audit: vi.fn(async () => undefined),
      external,
      secrets,
      store,
      verificationAttempts: createAiModelVerificationAttemptStore(),
    }),
  }
}

describe('AI administration model verification attempts', () => {
  it('binds technical fields but permits name and description edits before the save commit', async () => {
    const savedModel = {
      description: 'Edited description',
      id: randomUUID(),
      name: 'Edited name',
      revisions: [],
      revisionToken: randomUUID(),
    }
    const save = vi.fn(async () => savedModel)
    const { connection: current, service } = harness(save)
    const attempt = await service.verifyModelCandidate({
      candidate: {
        externalModelId: 'controlled/model',
        externalModelVersion: '2026-08-22',
      },
      connectionId: current.id,
      signal: new AbortController().signal,
    })

    const modelRevision = {
      attemptId: attempt.attemptId as string,
      description: 'Edited description',
      externalModelId: 'controlled/model',
      externalModelVersion: '2026-08-22',
      modelId: null,
      modelToken: null,
      name: 'Edited name',
    }
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
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      },
      connectionId: current.id,
      signal: new AbortController().signal,
    })
    const input = {
      connectionId: current.id,
      modelRevision: {
        attemptId: attempt.attemptId as string,
        description: null,
        externalModelId: 'controlled/model',
        externalModelVersion: null,
        modelId: null,
        modelToken: null,
        name: 'Model',
      },
    }

    await expect(service.saveModelRevision(input)).rejects.toThrow(
      'database unavailable',
    )
    await expect(service.saveModelRevision(input)).resolves.toBe(savedModel)
  })

  it('rejects a technical model change and a discarded attempt', async () => {
    const { connection: current, service } = harness(vi.fn())
    const attempt = await service.verifyModelCandidate({
      candidate: {
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      },
      connectionId: current.id,
      signal: new AbortController().signal,
    })
    const changed = {
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
    service.discardModelVerification(attempt.attemptId as string)
    await expect(
      service.saveModelRevision({
        connectionId: current.id,
        modelRevision: { ...changed, externalModelId: 'controlled/model' },
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('AI run profile authorization', () => {
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
      actorKey: 'administrator-1',
      audit: vi.fn(async () => undefined),
      external,
      secrets: {} as AiAdminSecretOperations,
      store,
      verificationAttempts: createAiModelVerificationAttemptStore(),
    })
    const profile = {
      inactivityTimeBudgetSeconds: 30,
      maximumBufferedEvents: 16,
      maximumOutputBytes: 65_536,
      maximumOutputTokens: 1_536,
      maximumRetainedMemoryBytes: 131_072,
      modelRevisionId: randomUUID(),
      queueCapacity: 10,
      revisionToken: randomUUID(),
      totalTimeBudgetSeconds: 60,
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
