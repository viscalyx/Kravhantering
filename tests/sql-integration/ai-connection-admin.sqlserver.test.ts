import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  CreateAiConnection,
  SaveAiAttestation,
} from '@/lib/ai/admin-contracts'
import {
  createSqlServerAiAdminStore,
  __testing as mapping,
} from '@/lib/dal/ai-connection-admin'
import type { SqlServerDatabase } from '@/lib/db'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

const CAPABILITIES = {
  aiAnalysis: false,
  cost: false,
  imageInput: false,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

function connectionInput(suffix = ''): CreateAiConnection {
  return {
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: `SQL admin test${suffix}`,
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    authenticationType: 'static_secret',
    dataPolicySummary: 'No production data.',
    description: null,
    egressPolicyKey: 'sql_test',
    endpointUrl: `https://ai.example.test${suffix}/v1`,
    maximumConcurrency: 2,
    publicName: `SQL test${suffix}`,
    tlsPolicyKey: 'public_web_pki',
  }
}

function attestationInput(
  revisionToken: string | null = null,
): SaveAiAttestation {
  return {
    decisionReference: 'DEC-SQL-1',
    incidentResponseReference: '00000000-0000-4000-8000-000000000021',
    isPersonalDataProcessed: false,
    isTrainingAllowed: false,
    maximumInformationClass: 'internal',
    maximumRetentionDays: 0,
    processingRegions: ['SE'],
    providerName: 'Controlled SQL test',
    purpose: 'Administrative transaction verification',
    responsibleOrganizationUnitReference:
      '00000000-0000-4000-8000-000000000022',
    reviewDueAt: '2099-01-01T00:00:00.000Z',
    reviewedAt: '2026-08-19T00:00:00.000Z',
    revisionToken,
    subprocessors: [],
  }
}

async function count(
  db: SqlServerDatabase,
  table: string,
  predicate: string,
  parameters: unknown[],
): Promise<number> {
  const rows = (await db.query(
    `SELECT COUNT_BIG(*) AS [count] FROM [${table}] WHERE ${predicate}`,
    parameters,
  )) as Array<{ count: number | string }>
  return Number(rows[0]?.count ?? 0)
}

describe('AI connection administration transactions against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it('maps nullable and malformed persisted administration metadata safely', () => {
    expect(mapping.jsonArray(null)).toBeNull()
    expect(mapping.jsonArray('["SE"]')).toEqual(['SE'])
    expect(mapping.jsonArray('{}')).toBeNull()
    expect(mapping.jsonArray('[1]')).toBeNull()
    expect(mapping.jsonArray('{')).toBeNull()
    expect(mapping.jsonCapability(null)).toBeNull()
    expect(mapping.jsonCapability(JSON.stringify(CAPABILITIES))).toEqual(
      CAPABILITIES,
    )
    expect(mapping.jsonCapability('{}')).toBeNull()
    expect(mapping.jsonCapability('{')).toBeNull()
    expect(mapping.iso(null)).toBeNull()
    expect(mapping.iso(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-01T00:00:00.000Z',
    )
    expect(mapping.iso('2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    )
    expect(mapping.sameId('ABC', 'abc')).toBe(true)
    expect(mapping.sameId(null, undefined)).toBe(false)
    expect(mapping.requireLoaded('value', 'missing')).toBe('value')
    expect(() => mapping.requireLoaded(null, 'missing')).toThrow('missing')

    const row = {
      activeSecretId: null,
      activeSecretRootKeyVersion: null,
      authenticationType: 'static_secret',
      configurationVersion: '1',
      connectionEvidenceId: null,
      hasValidAttestation: 0,
      hasVerifiedModel: 0,
      operationalHealth: null,
    }
    expect(mapping.blockers(row as never)).toHaveLength(4)
    expect(mapping.activeSecret(row as never)).toEqual({
      available: false,
      reason: 'secret_missing',
    })
    expect(
      mapping.activeSecret({
        ...row,
        activeSecretId: 'SECRET',
        activeSecretRootKeyVersion: 'root-1',
      } as never),
    ).toEqual({
      available: true,
      rootKeyVersion: 'root-1',
      secretVersionId: 'SECRET',
    })
    expect(
      mapping.summary({ ...row, operationalHealth: 'healthy' } as never)
        .operationalHealth,
    ).toBe('healthy')
    expect(
      mapping.blockers({
        ...row,
        activeSecretId: 'SECRET',
        authenticationType: 'none',
        connectionEvidenceId: 'EVIDENCE',
        hasValidAttestation: 1,
        hasVerifiedModel: 1,
      } as never),
    ).toEqual([])

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
    expect(mapping.mapProfile(profileRow as never).draftRevision).not.toBeNull()
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
        mapping.mapProfile({ ...profileRow, [field]: null } as never)
          .draftRevision,
      ).toBeNull()
    }
    expect(
      mapping.mapProfile({
        ...profileRow,
        capabilityPolicyJson: '{',
      } as never).draftRevision,
    ).toBeNull()
    expect(
      mapping.mapProfile({
        ...profileRow,
        capabilityPolicyJson: '{}',
      } as never).draftRevision,
    ).toBeNull()
    expect(
      mapping.mapProfileRevisionRow({
        capabilityPolicyJson: '{',
      } as never),
    ).toEqual([])
    expect(
      mapping.mapProfileRevisionRow({
        capabilityPolicyJson: '{}',
      } as never),
    ).toEqual([])
    const attestationRow = {
      maximumRetentionDays: null,
      processingRegionsJson: null,
      reviewDueAt: null,
      reviewedAt: null,
      revisionNumber: '1',
      subprocessorsJson: null,
    }
    expect(mapping.attestation(attestationRow as never)).toMatchObject({
      maximumRetentionDays: null,
    })
    expect(
      mapping.attestation({
        ...attestationRow,
        maximumRetentionDays: '0',
      } as never),
    ).toMatchObject({ maximumRetentionDays: 0 })
    const modelRow = {
      connectionConfigurationVersion: '1',
      declaredCapabilitiesJson: JSON.stringify(CAPABILITIES),
      discoveredCapabilitiesJson: null,
      modelId: 'MODEL',
      revisionId: 'ONE',
      revisionNumber: '1',
      verifiedCapabilitiesJson: null,
    }
    expect(
      mapping.models([
        modelRow,
        {
          ...modelRow,
          declaredCapabilitiesJson: '{}',
          revisionId: 'TWO',
        },
      ] as never)[0]?.revisions,
    ).toHaveLength(2)
  })

  it('rolls a domain mutation back when its privileged audit write fails', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => {
      throw new Error('injected audit failure')
    })

    await expect(
      store.createConnection(connectionInput('-audit')),
    ).rejects.toThrow('injected audit failure')

    expect(
      await count(appDb(), 'ai_connections', '[administration_name] = @0', [
        'SQL admin test-audit',
      ]),
    ).toBe(0)
  })

  it('rejects stale tokens across every administrative state transition', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const created = await store.createConnection(connectionInput('-stale'))
    await expect(store.getConnection(randomUUID())).resolves.toBeNull()
    await expect(
      store.updateConnection({
        connection: connectionInput('-stale'),
        connectionId: created.id,
        revisionToken: randomUUID(),
      }),
    ).resolves.toBeNull()

    await store.saveAttestation({
      attestation: {
        ...attestationInput(),
        processingRegions: null,
        subprocessors: null,
      },
      connectionId: created.id,
      currentAttestationRevisionToken: null,
      makeValid: false,
    })
    await expect(
      store.saveAttestation({
        attestation: attestationInput(randomUUID()),
        connectionId: created.id,
        currentAttestationRevisionToken: null,
        makeValid: false,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const model = await store.saveModelRevision({
      connectionId: created.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: null,
        discoveredCapabilities: null,
        externalModelId: 'controlled/stale',
        externalModelVersion: null,
        modelId: null,
        modelToken: null,
        name: 'Stale model',
      },
    })
    const draftRevision = model.revisions[0]
    if (!draftRevision) throw new Error('Draft revision missing')
    await expect(
      store.saveModelRevision({
        connectionId: created.id,
        modelRevision: {
          declaredCapabilities: CAPABILITIES,
          description: null,
          discoveredCapabilities: null,
          externalModelId: 'controlled/stale-v2',
          externalModelVersion: null,
          modelId: model.id,
          modelToken: randomUUID(),
          name: 'Stale model',
        },
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    const verifiedConnection = await store.recordConnectionVerification({
      connection: created,
      result: {
        details: {},
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
      },
    })
    if (!verifiedConnection.connectionEvidenceId) {
      throw new Error('Connection evidence missing')
    }
    await expect(
      store.recordModelVerification({
        connectionEvidenceId: verifiedConnection.connectionEvidenceId,
        modelRevision: { ...draftRevision, revisionToken: randomUUID() },
        result: {
          details: {},
          failureCategory: 'stale',
          outcome: 'failed',
          testSuiteVersion: 'sql-v1',
          verifiedCapabilities: CAPABILITIES,
        },
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      store.retireModelRevision({
        connectionId: created.id,
        modelRevisionId: draftRevision.id,
        revisionToken: randomUUID(),
      }),
    ).resolves.toBeNull()
    await expect(
      store.recordHealth({
        connectionId: created.id,
        health: 'unavailable',
        modelRevisionId: draftRevision.id,
        modelRevisionToken: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    await expect(
      store.saveRunProfileRevision({
        profileKey: 'invalid_json_repair',
        revision: {
          capabilityPolicy: {
            aiAnalysis: 'disabled',
            imageInput: 'disabled',
            jsonSchema: 'required',
            streaming: 'disabled',
            usageMetadata: 'allowed',
            validatableJson: 'required',
          },
          inactivityTimeBudgetSeconds: 300,
          modelRevisionId: draftRevision.id,
          queueCapacity: 1,
          revisionToken: null,
          totalTimeBudgetSeconds: 600,
        },
      }),
    ).rejects.toThrow('does not exist')
    await appDb().query(
      `INSERT INTO [ai_run_profiles] (
         [id], [profile_key], [operational_status], [created_at], [updated_at]
       ) VALUES (
         NEWID(), N'invalid_json_repair', N'enabled',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
    )
    await expect(store.listRunProfileActivationEntries()).resolves.toEqual([
      expect.objectContaining({ snapshot: null }),
    ])
    await expect(
      store.getActivationSnapshot({
        profileKey: 'invalid_json_repair',
        profileRevisionId: randomUUID(),
      }),
    ).resolves.toBeNull()
    const savedProfile = await store.saveRunProfileRevision({
      profileKey: 'invalid_json_repair',
      revision: {
        capabilityPolicy: {
          aiAnalysis: 'disabled',
          imageInput: 'disabled',
          jsonSchema: 'required',
          streaming: 'disabled',
          usageMetadata: 'allowed',
          validatableJson: 'required',
        },
        inactivityTimeBudgetSeconds: 300,
        modelRevisionId: draftRevision.id,
        queueCapacity: 1,
        revisionToken: null,
        totalTimeBudgetSeconds: 600,
      },
    })
    const savedDraft = savedProfile.draftRevision
    if (!savedDraft) throw new Error('Profile draft missing')
    await expect(
      store.saveRunProfileRevision({
        profileKey: 'invalid_json_repair',
        revision: { ...savedDraft, revisionToken: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      store.saveRunProfileRevision({
        profileKey: 'invalid_json_repair',
        revision: { ...savedDraft, revisionToken: savedDraft.revisionToken },
      }),
    ).resolves.toBeDefined()

    await expect(
      store.setConnectionLifecycle({
        connectionId: created.id,
        revisionToken: randomUUID(),
        status: 'retired',
      }),
    ).resolves.toBeNull()
    await expect(
      store.activateConnection({
        attestationId: randomUUID(),
        attestationRevisionToken: randomUUID(),
        connectionEvidenceId: randomUUID(),
        connectionId: created.id,
        connectionRevisionToken: randomUUID(),
        modelRevisionId: draftRevision.id,
        modelRevisionToken: randomUUID(),
        secretVersionId: null,
      }),
    ).resolves.toBeNull()
    await expect(
      store.activateRunProfileRevision({
        attestationRevisionToken: randomUUID(),
        connectionEvidenceId: randomUUID(),
        connectionRevisionToken: randomUUID(),
        modelRevisionToken: randomUUID(),
        profileRevisionId: savedDraft.id,
        profileRevisionToken: randomUUID(),
        profileToken: randomUUID(),
        secretVersionId: null,
      }),
    ).resolves.toBeNull()
    await expect(
      store.setRunProfileOperationalStatus({
        profileKey: 'invalid_json_repair',
        revisionToken: randomUUID(),
        status: 'enabled',
      }),
    ).resolves.toBeNull()
    const enabled = await store.setRunProfileOperationalStatus({
      profileKey: 'invalid_json_repair',
      revisionToken: savedProfile.revisionToken,
      status: 'enabled',
    })
    expect(enabled?.operationalStatus).toBe('enabled')
    await expect(
      store.setConnectionLifecycle({
        connectionId: created.id,
        revisionToken: verifiedConnection.revisionToken,
        status: 'retired',
      }),
    ).resolves.toMatchObject({ lifecycleStatus: 'retired' })
  })

  it('rejects a stale connection-probe completion without evidence or invalidation', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const original = await store.createConnection(connectionInput('-probe'))
    const updated = await store.updateConnection({
      connection: connectionInput('-probe-v2'),
      connectionId: original.id,
      revisionToken: original.revisionToken,
    })
    expect(updated?.configurationVersion).toBe(2)

    await expect(
      store.recordConnectionVerification({
        connection: original,
        result: {
          details: { reachable: false },
          failureCategory: 'provider_unavailable',
          outcome: 'failed',
          testSuiteVersion: 'sql-v1',
        },
      }),
    ).rejects.toThrow('AI connection changed during verification')

    expect(
      await count(
        appDb(),
        'ai_connection_verification_evidence',
        '[ai_connection_id] = @0',
        [original.id],
      ),
    ).toBe(0)
    expect((await store.getConnection(original.id))?.configurationVersion).toBe(
      2,
    )
  })

  it('serializes two administrators validating attestations from the same token', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const connection = await store.createConnection(connectionInput('-attest'))
    const first = await store.saveAttestation({
      attestation: attestationInput(),
      connectionId: connection.id,
      currentAttestationRevisionToken: null,
      makeValid: false,
    })
    const second = await store.saveAttestation({
      attestation: attestationInput(),
      connectionId: connection.id,
      currentAttestationRevisionToken: null,
      makeValid: false,
    })

    const results = await Promise.allSettled([
      store.saveAttestation({
        attestation: attestationInput(first.revisionToken),
        connectionId: connection.id,
        currentAttestationRevisionToken: null,
        makeValid: true,
      }),
      store.saveAttestation({
        attestation: attestationInput(second.revisionToken),
        connectionId: connection.id,
        currentAttestationRevisionToken: null,
        makeValid: true,
      }),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(
      1,
    )
    expect(
      await count(
        appDb(),
        'ai_connection_attestations',
        "[ai_connection_id] = @0 AND [status] = N'valid'",
        [connection.id],
      ),
    ).toBe(1)
  })

  it('creates immutable technical revisions and retires one exact revision', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const connection = await store.createConnection(connectionInput('-model'))
    const firstModel = await store.saveModelRevision({
      connectionId: connection.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: null,
        discoveredCapabilities: null,
        externalModelId: 'controlled/model-v1',
        externalModelVersion: '1',
        modelId: null,
        modelToken: null,
        name: 'Controlled model',
      },
    })
    const firstRevision = firstModel.revisions[0]
    if (!firstRevision) throw new Error('First revision missing')
    const secondModel = await store.saveModelRevision({
      connectionId: connection.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: 'Renamed stable model',
        discoveredCapabilities: CAPABILITIES,
        externalModelId: 'controlled/model-v2',
        externalModelVersion: '2',
        modelId: firstModel.id,
        modelToken: firstModel.revisionToken,
        name: 'Controlled model renamed',
      },
    })
    expect(secondModel.revisions).toHaveLength(2)
    expect(secondModel.revisions[0]?.externalModelId).toBe(
      'controlled/model-v1',
    )

    await appDb().query(
      `UPDATE [ai_connection_model_revisions]
       SET [status] = N'verification_required', [revision_token] = NEWID(),
         [updated_at] = SYSUTCDATETIME()
       WHERE [id] = @0`,
      [firstRevision.id],
    )
    const refreshed = await store.getConnection(connection.id)
    const retireCandidate = refreshed?.models
      .flatMap(model => model.revisions)
      .find(revision => revision.id === firstRevision.id)
    if (!retireCandidate) throw new Error('Retirement candidate missing')
    await expect(
      store.retireModelRevision({
        connectionId: connection.id,
        modelRevisionId: retireCandidate.id,
        revisionToken: retireCandidate.revisionToken,
      }),
    ).resolves.toMatchObject({ status: 'retired' })
  })

  it('persists the complete verified connection and profile lifecycle atomically', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const created = await store.createConnection({
      ...connectionInput('-lifecycle'),
      authenticationType: 'none',
    })
    const draftAttestation = await store.saveAttestation({
      attestation: attestationInput(),
      connectionId: created.id,
      currentAttestationRevisionToken: null,
      makeValid: false,
    })
    const validAttestation = await store.saveAttestation({
      attestation: attestationInput(draftAttestation.revisionToken),
      connectionId: created.id,
      currentAttestationRevisionToken: null,
      makeValid: true,
    })
    const model = await store.saveModelRevision({
      connectionId: created.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: null,
        discoveredCapabilities: CAPABILITIES,
        externalModelId: 'controlled/lifecycle',
        externalModelVersion: '1',
        modelId: null,
        modelToken: null,
        name: 'Lifecycle model',
      },
    })
    const draftModelRevision = model.revisions[0]
    if (!draftModelRevision) throw new Error('Draft model revision missing')
    const connectionVerified = await store.recordConnectionVerification({
      connection: created,
      result: {
        details: { reachable: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
      },
    })
    const connectionEvidenceId = connectionVerified.connectionEvidenceId
    if (!connectionEvidenceId) throw new Error('Connection evidence missing')
    const verifiedModelRevision = await store.recordModelVerification({
      connectionEvidenceId,
      modelRevision: draftModelRevision,
      result: {
        details: { resolved: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
        verifiedCapabilities: CAPABILITIES,
      },
    })
    const activated = await store.activateConnection({
      attestationId: validAttestation.id,
      attestationRevisionToken: validAttestation.revisionToken,
      connectionEvidenceId,
      connectionId: created.id,
      connectionRevisionToken: connectionVerified.revisionToken,
      modelRevisionId: verifiedModelRevision.id,
      modelRevisionToken: verifiedModelRevision.revisionToken,
      secretVersionId: null,
    })
    expect(activated?.lifecycleStatus).toBe('active')

    await appDb().query(
      `INSERT INTO [ai_run_profiles] (
         [id], [profile_key], [operational_status], [created_at], [updated_at]
       ) VALUES (
         NEWID(), N'generation_without_images', N'enabled',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
    )
    const savedProfile = await store.saveRunProfileRevision({
      profileKey: 'generation_without_images',
      revision: {
        capabilityPolicy: {
          aiAnalysis: 'allowed',
          imageInput: 'disabled',
          jsonSchema: 'required',
          streaming: 'required',
          usageMetadata: 'allowed',
          validatableJson: 'required',
        },
        inactivityTimeBudgetSeconds: 300,
        modelRevisionId: verifiedModelRevision.id,
        queueCapacity: 2,
        revisionToken: null,
        totalTimeBudgetSeconds: 600,
      },
    })
    const draftProfileRevision = savedProfile.draftRevision
    if (!draftProfileRevision) throw new Error('Draft profile revision missing')
    const snapshot = await store.getActivationSnapshot({
      profileKey: savedProfile.profileKey,
      profileRevisionId: draftProfileRevision.id,
    })
    if (!snapshot) throw new Error('Activation snapshot missing')
    const activatedProfile = await store.activateRunProfileRevision({
      attestationRevisionToken: validAttestation.revisionToken,
      connectionEvidenceId,
      connectionRevisionToken: activated?.revisionToken ?? '',
      modelRevisionToken: verifiedModelRevision.revisionToken,
      profileRevisionId: draftProfileRevision.id,
      profileRevisionToken: draftProfileRevision.revisionToken,
      profileToken: savedProfile.revisionToken,
      secretVersionId: null,
    })
    expect(activatedProfile?.activeRevisionId?.toLowerCase()).toBe(
      draftProfileRevision.id.toLowerCase(),
    )
    expect(await store.listRunProfiles()).toHaveLength(1)
    expect(await store.listRunProfileActivationEntries()).toHaveLength(1)
    expect(
      await store.listRunProfileRevisions('generation_without_images'),
    ).toHaveLength(1)

    const health = await store.recordHealth({
      connectionId: created.id,
      health: 'healthy',
      modelRevisionId: verifiedModelRevision.id,
      modelRevisionToken: verifiedModelRevision.revisionToken,
    })
    expect(health.operationalHealth).toBe('healthy')
    const suspendedProfile = await store.setRunProfileOperationalStatus({
      profileKey: 'generation_without_images',
      revisionToken: activatedProfile?.revisionToken ?? '',
      status: 'suspended',
    })
    expect(suspendedProfile?.operationalStatus).toBe('suspended')
    const latestConnection = await store.getConnection(created.id)
    const suspendedConnection = latestConnection
      ? await store.setConnectionLifecycle({
          connectionId: created.id,
          revisionToken: latestConnection.revisionToken,
          status: 'suspended',
        })
      : null
    expect(suspendedConnection?.lifecycleStatus).toBe('suspended')
    expect(await store.listConnections()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String) }),
      ]),
    )
  })
})
