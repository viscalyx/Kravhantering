import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { AiCapability } from '@/lib/ai/admin-contracts'
import type {
  AiAdminAuditDetail,
  AiAdminCandidateVerificationResult,
} from '@/lib/ai/admin-service'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'
import { createSqlServerAiRunProfileSource } from '@/lib/dal/ai-run-profiles'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

const CAPABILITIES: AiCapability = {
  reasoning: true,
  reasoningControl: true,
  aiAnalysis: true,
  cost: true,
  imageInput: true,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

const VERIFICATION: AiAdminCandidateVerificationResult = {
  reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
  baseline: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified',
  },
  canonicalExternalModelVersion: '2026-08-22',
  capabilities: Object.fromEntries(
    Object.keys(CAPABILITIES).map(key => [
      key,
      key === 'aiAnalysis' || key === 'jsonSchemaSteering'
        ? {
            diagnosticCode: 'upstream_unavailable_http_404',
            failureCategory: 'connection_unavailable',
            outcome: 'inconclusive',
          }
        : { diagnosticCode: null, failureCategory: null, outcome: 'verified' },
    ]),
  ) as AiAdminCandidateVerificationResult['capabilities'],
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

describe('AI connection administration transactions against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it.each([
    { mode: 'explicit_control', effort: 'high' },
    { mode: 'model_default', effort: null },
  ] as const)(
    'saves verified %j profiles with inconclusive optional capabilities and fences later changes',
    async reasoning => {
      const verification = {
        ...VERIFICATION,
        reasoning: {
          effort: reasoning.effort,
          mode: reasoning.mode,
        } as typeof reasoning,
        capabilities: {
          ...VERIFICATION.capabilities,
          reasoningControl: {
            outcome:
              reasoning.mode === 'explicit_control'
                ? ('verified' as const)
                : ('not_verified' as const),
            diagnosticCode: null,
            failureCategory: null,
          },
        },
      }
      const db = appDb()
      const audit = vi.fn(async (_detail: AiAdminAuditDetail) => undefined)
      const store = createSqlServerAiAdminStore(db, audit)
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

      const saveInput = {
        connection,
        connectionId: connection.id,
        modelRevision: {
          reasoning,
          attemptId: randomUUID(),
          description: null,
          externalModelId: 'controlled/verified-model',
          externalModelVersion: '2026-08-22',
          modelId: null,
          modelToken: null,
          name: 'Verified model',
        },
        verification,
      }
      for (const mismatchedReasoning of [
        { mode: 'explicit_control', effort: 'low' },
        reasoning.mode === 'explicit_control'
          ? ({ mode: 'model_default', effort: null } as const)
          : ({ mode: 'explicit_control', effort: 'high' } as const),
      ] as const) {
        await expect(
          store.saveModelRevision({
            ...saveInput,
            verification: { ...verification, reasoning: mismatchedReasoning },
          }),
        ).rejects.toThrow('AI model verification is incomplete.')
      }
      const model = await store.saveModelRevision(saveInput)
      const revision = model.revisions[0]
      if (!revision) throw new Error('Verified model revision missing')
      expect(revision.reasoning).toEqual(reasoning)
      await expect(
        db.query(
          'UPDATE [ai_connection_model_revisions] SET [reasoning_json] = @0 WHERE [id] = @1',
          ['{"mode":"model_default","effort":null}', revision.id],
        ),
      ).rejects.toThrow('immutable')

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
      expect(
        (
          await createSqlServerAiRunProfileSource(db).findProfile(
            'generation_without_images',
          )
        )?.reasoning,
      ).toEqual(reasoning)

      expect(selected.configurationStatus).toBe('configured')
      expect(selected.administrativeStatus).toBe('active')
      expect(
        audit.mock.calls
          .map(([detail]) => detail)
          .filter(detail => detail.resourceId === selected.id),
      ).toEqual([
        expect.objectContaining({ operation: 'save' }),
        expect.objectContaining({ operation: 'activate' }),
      ])

      const secondRevisionModel = await store.saveModelRevision({
        connection: activeConnection,
        connectionId: connection.id,
        modelRevision: {
          reasoning,
          attemptId: randomUUID(),
          description: null,
          externalModelId: 'controlled/verified-model-2',
          externalModelVersion: '2026-08-22',
          modelId: model.id,
          modelToken: model.revisionToken,
          name: model.name,
        },
        verification,
      })
      const secondRevision = secondRevisionModel.revisions.at(-1)
      if (!secondRevision) throw new Error('Second model revision missing')
      expect(secondRevision.revisionNumber).toBe(2)
      const endedSecondRevision = await store.endModelRevision({
        connectionId: connection.id,
        modelRevisionId: secondRevision.id,
        revisionToken: secondRevision.revisionToken,
      })
      if (!endedSecondRevision) throw new Error('Ended second revision missing')
      expect(
        await store.deleteModelRevision({
          connectionId: connection.id,
          modelRevisionId: secondRevision.id,
          revisionToken: endedSecondRevision.revisionToken,
        }),
      ).toBe(true)
      const reusedRevisionModel = await store.saveModelRevision({
        connection: activeConnection,
        connectionId: connection.id,
        modelRevision: {
          reasoning,
          attemptId: randomUUID(),
          description: null,
          externalModelId: 'controlled/verified-model-2-reused',
          externalModelVersion: '2026-08-22',
          modelId: model.id,
          modelToken: secondRevisionModel.revisionToken,
          name: model.name,
        },
        verification,
      })
      const reusedRevision = reusedRevisionModel.revisions.at(-1)
      if (!reusedRevision) throw new Error('Reused model revision missing')
      expect(reusedRevision.revisionNumber).toBe(2)
      const endedReusedRevision = await store.endModelRevision({
        connectionId: connection.id,
        modelRevisionId: reusedRevision.id,
        revisionToken: reusedRevision.revisionToken,
      })
      if (!endedReusedRevision) throw new Error('Ended reused revision missing')
      expect(
        await store.deleteModelRevision({
          connectionId: connection.id,
          modelRevisionId: reusedRevision.id,
          revisionToken: endedReusedRevision.revisionToken,
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

      const paused = await store.setRunProfileOperationalStatus({
        profileKey: selected.profileKey,
        revisionToken: selected.revisionToken,
        status: 'suspended',
      })
      if (!paused) throw new Error('Paused run profile missing')
      expect(paused.administrativeStatus).toBe('paused')
      const disconnected = await store.saveRunProfile({
        profile: {
          inactivityTimeBudgetSeconds: selected.inactivityTimeBudgetSeconds,
          maximumBufferedEvents: selected.maximumBufferedEvents,
          maximumOutputBytes: selected.maximumOutputBytes,
          maximumOutputTokens: selected.maximumOutputTokens,
          maximumRetainedMemoryBytes: selected.maximumRetainedMemoryBytes,
          modelRevisionId: null,
          queueCapacity: selected.queueCapacity,
          revisionToken: paused.revisionToken,
          totalTimeBudgetSeconds: selected.totalTimeBudgetSeconds,
        },
        profileKey: paused.profileKey,
      })
      expect(disconnected.administrativeStatus).toBe('unconfigured')
      expect(disconnected.operationalStatus).toBe('enabled')
      const ended = await store.endModelRevision({
        connectionId: connection.id,
        modelRevisionId: revision.id,
        revisionToken: revision.revisionToken,
      })
      if (!ended) throw new Error('Ended revision missing')
      expect(ended?.status).toBe('ended')
      expect(
        await store.deleteModelRevision({
          connectionId: connection.id,
          modelRevisionId: revision.id,
          revisionToken: ended.revisionToken,
        }),
      ).toBe(true)
      expect((await store.getConnection(connection.id))?.models).toEqual([])
    },
  )
})
