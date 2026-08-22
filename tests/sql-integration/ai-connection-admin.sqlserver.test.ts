import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AiCapability } from '@/lib/ai/admin-contracts'
import type { AiAdminCandidateVerificationResult } from '@/lib/ai/admin-service'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

const CAPABILITIES: AiCapability = {
  aiAnalysis: true,
  cost: true,
  imageInput: true,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

const VERIFICATION: AiAdminCandidateVerificationResult = {
  baseline: { failureCategory: null, outcome: 'verified' },
  canonicalExternalModelVersion: '2026-08-22',
  capabilities: Object.fromEntries(
    Object.keys(CAPABILITIES).map(key => [
      key,
      { failureCategory: null, outcome: 'verified' },
    ]),
  ) as AiAdminCandidateVerificationResult['capabilities'],
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
  testSuiteVersion: 'ai-admin-functional-v5',
}

describe('AI connection administration transactions against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it('atomically saves verified models and fences stable profile and destructive changes', async () => {
    const db = appDb()
    const store = createSqlServerAiAdminStore(db, async () => undefined)
    const connection = await store.createConnection({
      adapterKey: 'controlled_test',
      adapterVersion: '1',
      administrationName: 'SQL verified model',
      agentRuntimeKey: null,
      agentRuntimeVersion: null,
      authenticationType: 'none',
      dataPolicySummary: 'No production data.',
      description: null,
      egressPolicyKey: 'sql_test',
      endpointUrl: 'https://ai.example.test/v1',
      maximumConcurrency: 2,
      publicName: 'SQL verified model',
      tlsPolicyKey: 'public_web_pki',
    })
    const attestation = await store.saveAttestation({
      attestation: {
        decisionReference: 'DEC-SQL-1096',
        incidentResponseReference: randomUUID(),
        isPersonalDataProcessed: false,
        isTrainingAllowed: false,
        maximumInformationClass: 'internal',
        maximumRetentionDays: 0,
        processingRegions: ['SE'],
        providerName: 'Controlled SQL test',
        purpose: 'Verify transactional model administration',
        responsibleOrganizationUnitReference: randomUUID(),
        reviewDueAt: '2099-01-01T00:00:00.000Z',
        reviewedAt: '2026-08-22T00:00:00.000Z',
        revisionToken: null,
        subprocessors: [],
      },
      connectionId: connection.id,
      currentAttestationRevisionToken: null,
      makeValid: true,
    })

    const model = await store.saveModelRevision({
      connection,
      connectionId: connection.id,
      modelRevision: {
        attemptId: randomUUID(),
        description: null,
        externalModelId: 'controlled/verified-model',
        externalModelVersion: '2026-08-22',
        modelId: null,
        modelToken: null,
        name: 'Verified model',
      },
      verification: VERIFICATION,
    })
    const revision = model.revisions[0]
    if (!revision) throw new Error('Verified model revision missing')
    expect(revision.status).toBe('verified')

    const verifiedConnection = await store.getConnection(connection.id)
    if (!verifiedConnection?.connectionEvidenceId) {
      throw new Error('Connection evidence missing')
    }
    await db.query(
      `INSERT INTO [ai_run_profiles] (
         [profile_key], [operational_status], [created_at], [updated_at]
       ) VALUES (
         N'generation_without_images', N'enabled',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
    )
    const activated = await store.activateConnection({
      attestationId: attestation.id,
      attestationRevisionToken: attestation.revisionToken,
      connectionEvidenceId: verifiedConnection.connectionEvidenceId,
      connectionId: connection.id,
      connectionRevisionToken: verifiedConnection.revisionToken,
      modelRevisionId: revision.id,
      modelRevisionToken: revision.revisionToken,
      secretVersionId: null,
    })
    expect(activated?.lifecycleStatus).toBe('active')
    const activeConnection = await store.getConnection(connection.id)
    if (!activeConnection) throw new Error('Active connection missing')

    const [profile] = await store.listRunProfiles()
    if (!profile) throw new Error('Stable run profile missing')
    const selected = await store.saveRunProfile({
      profile: {
        inactivityTimeBudgetSeconds: 300,
        maximumBufferedEvents: 32,
        maximumOutputBytes: 4_194_304,
        maximumOutputTokens: 8192,
        maximumRetainedMemoryBytes: 8_388_608,
        modelRevisionId: revision.id,
        queueCapacity: 10,
        revisionToken: profile.revisionToken,
        totalTimeBudgetSeconds: 1200,
      },
      profileKey: 'generation_without_images',
    })
    expect(selected.configurationStatus).toBe('configured')

    const secondRevisionModel = await store.saveModelRevision({
      connection: activeConnection,
      connectionId: connection.id,
      modelRevision: {
        attemptId: randomUUID(),
        description: null,
        externalModelId: 'controlled/verified-model-2',
        externalModelVersion: '2026-08-22',
        modelId: model.id,
        modelToken: model.revisionToken,
        name: model.name,
      },
      verification: VERIFICATION,
    })
    const secondRevision = secondRevisionModel.revisions.at(-1)
    if (!secondRevision) throw new Error('Second model revision missing')
    expect(secondRevision.revisionNumber).toBe(2)
    const endedSecondRevision = await store.endModelRevision({
      connectionId: connection.id,
      modelRevisionId: secondRevision.id,
      revisionToken: secondRevision.revisionToken,
    })
    expect(
      await store.deleteModelRevision({
        connectionId: connection.id,
        modelRevisionId: secondRevision.id,
        revisionToken: endedSecondRevision?.revisionToken as string,
      }),
    ).toBe(true)
    const reusedRevisionModel = await store.saveModelRevision({
      connection: activeConnection,
      connectionId: connection.id,
      modelRevision: {
        attemptId: randomUUID(),
        description: null,
        externalModelId: 'controlled/verified-model-2-reused',
        externalModelVersion: '2026-08-22',
        modelId: model.id,
        modelToken: secondRevisionModel.revisionToken,
        name: model.name,
      },
      verification: VERIFICATION,
    })
    const reusedRevision = reusedRevisionModel.revisions.at(-1)
    if (!reusedRevision) throw new Error('Reused model revision missing')
    expect(reusedRevision.revisionNumber).toBe(2)
    const endedReusedRevision = await store.endModelRevision({
      connectionId: connection.id,
      modelRevisionId: reusedRevision.id,
      revisionToken: reusedRevision.revisionToken,
    })
    expect(
      await store.deleteModelRevision({
        connectionId: connection.id,
        modelRevisionId: reusedRevision.id,
        revisionToken: endedReusedRevision?.revisionToken as string,
      }),
    ).toBe(true)

    await expect(
      store.endModelRevision({
        connectionId: connection.id,
        modelRevisionId: revision.id,
        revisionToken: revision.revisionToken,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { profileKeys: ['generation_without_images'], runCount: 0 },
    })

    await store.saveRunProfile({
      profile: {
        inactivityTimeBudgetSeconds: selected.inactivityTimeBudgetSeconds,
        maximumBufferedEvents: selected.maximumBufferedEvents,
        maximumOutputBytes: selected.maximumOutputBytes,
        maximumOutputTokens: selected.maximumOutputTokens,
        maximumRetainedMemoryBytes: selected.maximumRetainedMemoryBytes,
        modelRevisionId: null,
        queueCapacity: selected.queueCapacity,
        revisionToken: selected.revisionToken,
        totalTimeBudgetSeconds: selected.totalTimeBudgetSeconds,
      },
      profileKey: selected.profileKey,
    })
    const ended = await store.endModelRevision({
      connectionId: connection.id,
      modelRevisionId: revision.id,
      revisionToken: revision.revisionToken,
    })
    expect(ended?.status).toBe('ended')
    expect(
      await store.deleteModelRevision({
        connectionId: connection.id,
        modelRevisionId: revision.id,
        revisionToken: ended?.revisionToken as string,
      }),
    ).toBe(true)
    expect((await store.getConnection(connection.id))?.models).toEqual([])
  })
})
