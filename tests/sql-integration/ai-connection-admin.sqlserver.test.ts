import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  CreateAiConnection,
  SaveAiAttestation,
} from '@/lib/ai/admin-contracts'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import {
  AiProviderSecretService,
  writeAiProviderSecretCandidate,
} from '@/lib/ai/provider-secret-service'
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

function secretKeyring() {
  return parseAiProviderSecretKeyring(
    JSON.stringify({
      activeWriteVersion: 'sql-root-1',
      formatVersion: 1,
      keys: { 'sql-root-1': randomBytes(32).toString('base64') },
    }),
  )
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
      id: '40000000-0000-4000-8000-000000000001',
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
        connection: verifiedConnection,
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
        connectionConfigurationVersion: created.configurationVersion,
        connectionId: created.id,
        connectionRevisionToken: created.revisionToken,
        health: 'unavailable',
        invalidationScope: 'none',
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

  it('rejects a model verification completed against an older connection configuration', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const original = await store.createConnection(
      connectionInput('-model-race'),
    )
    const model = await store.saveModelRevision({
      connectionId: original.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: null,
        discoveredCapabilities: CAPABILITIES,
        externalModelId: 'controlled/model-race-v1',
        externalModelVersion: '1',
        modelId: null,
        modelToken: null,
        name: 'Model race',
      },
    })
    const revision = model.revisions[0]
    if (!revision) throw new Error('Model revision missing')
    const verifiedConnection = await store.recordConnectionVerification({
      connection: original,
      result: {
        details: { reachable: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
      },
    })
    if (!verifiedConnection.connectionEvidenceId) {
      throw new Error('Connection evidence missing')
    }
    const updated = await store.updateConnection({
      connection: connectionInput('-model-race-v2'),
      connectionId: original.id,
      revisionToken: verifiedConnection.revisionToken,
    })
    expect(updated?.configurationVersion).toBe(2)

    await expect(
      store.recordModelVerification({
        connection: verifiedConnection,
        connectionEvidenceId: verifiedConnection.connectionEvidenceId,
        modelRevision: revision,
        result: {
          details: { resolved: true },
          failureCategory: null,
          outcome: 'passed',
          testSuiteVersion: 'sql-v1',
          verifiedCapabilities: CAPABILITIES,
        },
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(
      await count(
        appDb(),
        'ai_connection_model_verification_evidence',
        '[ai_connection_model_revision_id] = @0',
        [revision.id],
      ),
    ).toBe(0)
    const persistedRevision = (await store.getConnection(original.id))?.models
      .flatMap(candidate => candidate.revisions)
      .find(candidate => candidate.id === revision.id)
    expect(persistedRevision?.status).not.toBe('verified')
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

  it('rejects secret activation when the connection changes during candidate verification', async () => {
    const db = appDb()
    const store = createSqlServerAiAdminStore(db, async () => undefined)
    const original = await store.createConnection(
      connectionInput('-secret-race'),
    )
    const ring = secretKeyring()
    const candidate = await writeAiProviderSecretCandidate(db, ring, {
      connectionId: original.id,
      plaintext: 'candidate-secret',
    })
    let releaseVerification = (): void => undefined
    let markStarted = (): void => undefined
    const verificationStarted = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const verificationRelease = new Promise<void>(resolve => {
      releaseVerification = resolve
    })
    const activation = new AiProviderSecretService(db, ring, {
      async verifyCandidate() {
        markStarted()
        await verificationRelease
      },
    }).activateCandidate({
      connectionConfigurationVersion: original.configurationVersion,
      connectionId: original.id,
      connectionRevisionToken: original.revisionToken,
      secretVersionId: candidate.id,
    })
    await verificationStarted
    const updated = await store.updateConnection({
      connection: connectionInput('-secret-race-v2'),
      connectionId: original.id,
      revisionToken: original.revisionToken,
    })
    expect(updated?.configurationVersion).toBe(2)
    releaseVerification()

    await expect(activation).rejects.toMatchObject({ code: 'conflict' })
    expect(
      await count(
        db,
        'ai_provider_secret_versions',
        "[id] = @0 AND [status] = N'candidate'",
        [candidate.id],
      ),
    ).toBe(1)
    expect(
      await count(
        db,
        'ai_provider_secret_versions',
        "[ai_connection_id] = @0 AND [status] = N'active'",
        [original.id],
      ),
    ).toBe(0)
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

  it('updates stable model metadata without changing revision verification history', async () => {
    const store = createSqlServerAiAdminStore(appDb(), async () => undefined)
    const connection = await store.createConnection(
      connectionInput('-metadata'),
    )
    const model = await store.saveModelRevision({
      connectionId: connection.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: null,
        discoveredCapabilities: CAPABILITIES,
        externalModelId: 'controlled/metadata',
        externalModelVersion: '1',
        modelId: null,
        modelToken: null,
        name: 'Original model name',
      },
    })
    const revision = model.revisions[0]
    if (!revision) throw new Error('Model revision missing')
    const verifiedConnection = await store.recordConnectionVerification({
      connection,
      result: {
        details: { reachable: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
      },
    })
    if (!verifiedConnection.connectionEvidenceId) {
      throw new Error('Connection evidence missing')
    }
    const verifiedRevision = await store.recordModelVerification({
      connection: verifiedConnection,
      connectionEvidenceId: verifiedConnection.connectionEvidenceId,
      modelRevision: revision,
      result: {
        details: { resolved: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
        verifiedCapabilities: CAPABILITIES,
      },
    })
    const evidenceCount = await count(
      appDb(),
      'ai_connection_model_verification_evidence',
      '[ai_connection_model_revision_id] = @0',
      [revision.id],
    )

    const renamed = await store.saveModelRevision({
      connectionId: connection.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: 'Metadata only',
        discoveredCapabilities: CAPABILITIES,
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
        modelId: model.id,
        modelToken: model.revisionToken,
        name: 'Renamed model',
      },
    })

    expect(renamed.name).toBe('Renamed model')
    expect(renamed.description).toBe('Metadata only')
    expect(renamed.revisions).toHaveLength(1)
    expect(renamed.revisions[0]).toMatchObject({
      id: verifiedRevision.id,
      revisionToken: verifiedRevision.revisionToken,
      status: 'verified',
    })
    expect(
      await count(
        appDb(),
        'ai_connection_model_verification_evidence',
        '[ai_connection_model_revision_id] = @0',
        [revision.id],
      ),
    ).toBe(evidenceCount)
  })

  it('atomically invalidates an active connection and profile dependencies on credential rotation', async () => {
    const db = appDb()
    const store = createSqlServerAiAdminStore(db, async () => undefined)
    const ring = secretKeyring()
    const created = await store.createConnection(connectionInput('-rotation'))
    const firstCandidate = await writeAiProviderSecretCandidate(db, ring, {
      connectionId: created.id,
      plaintext: 'first-secret',
    })
    const secretService = new AiProviderSecretService(db, ring, {
      verifyCandidate: async () => undefined,
    })
    const firstSecret = await secretService.activateCandidate({
      connectionConfigurationVersion: created.configurationVersion,
      connectionId: created.id,
      connectionRevisionToken: created.revisionToken,
      secretVersionId: firstCandidate.id,
    })
    const configured = await store.getConnection(created.id)
    if (!configured) throw new Error('Configured connection missing')
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
        externalModelId: 'controlled/rotation',
        externalModelVersion: '1',
        modelId: null,
        modelToken: null,
        name: 'Rotation model',
      },
    })
    const draftRevision = model.revisions[0]
    if (!draftRevision) throw new Error('Draft model revision missing')
    const verifiedConnection = await store.recordConnectionVerification({
      connection: configured,
      result: {
        details: { reachable: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
      },
    })
    if (!verifiedConnection.connectionEvidenceId) {
      throw new Error('Connection evidence missing')
    }
    const verifiedRevision = await store.recordModelVerification({
      connection: verifiedConnection,
      connectionEvidenceId: verifiedConnection.connectionEvidenceId,
      modelRevision: draftRevision,
      result: {
        details: { resolved: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'sql-v1',
        verifiedCapabilities: CAPABILITIES,
      },
    })
    const activeConnection = await store.activateConnection({
      attestationId: validAttestation.id,
      attestationRevisionToken: validAttestation.revisionToken,
      connectionEvidenceId: verifiedConnection.connectionEvidenceId,
      connectionId: created.id,
      connectionRevisionToken: verifiedConnection.revisionToken,
      modelRevisionId: verifiedRevision.id,
      modelRevisionToken: verifiedRevision.revisionToken,
      secretVersionId: firstSecret.id,
    })
    if (!activeConnection) throw new Error('Connection activation failed')
    await db.query(
      `INSERT INTO [ai_run_profiles] (
         [id], [profile_key], [operational_status], [created_at], [updated_at]
       ) VALUES (
         NEWID(), N'generation_without_images', N'enabled',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
    )
    const profile = await store.saveRunProfileRevision({
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
        modelRevisionId: verifiedRevision.id,
        queueCapacity: 2,
        revisionToken: null,
        totalTimeBudgetSeconds: 600,
      },
    })
    const draftProfile = profile.draftRevision
    if (!draftProfile) throw new Error('Profile draft missing')
    await expect(
      store.activateRunProfileRevision({
        attestationRevisionToken: validAttestation.revisionToken,
        connectionEvidenceId: verifiedConnection.connectionEvidenceId,
        connectionRevisionToken: activeConnection.revisionToken,
        modelRevisionToken: verifiedRevision.revisionToken,
        profileRevisionId: draftProfile.id,
        profileRevisionToken: draftProfile.revisionToken,
        profileToken: profile.revisionToken,
        secretVersionId: firstSecret.id,
      }),
    ).resolves.toMatchObject({ activeRevisionId: draftProfile.id })

    const beforeRotation = await store.getConnection(created.id)
    if (!beforeRotation) throw new Error('Active connection missing')
    const secondCandidate = await writeAiProviderSecretCandidate(db, ring, {
      connectionId: created.id,
      plaintext: 'second-secret',
    })
    await secretService.activateCandidate({
      connectionConfigurationVersion: beforeRotation.configurationVersion,
      connectionId: created.id,
      connectionRevisionToken: beforeRotation.revisionToken,
      secretVersionId: secondCandidate.id,
    })

    const rotated = await store.getConnection(created.id)
    expect(rotated).toMatchObject({
      configurationVersion: beforeRotation.configurationVersion + 1,
      lifecycleStatus: 'verification_required',
    })
    expect(rotated?.connectionEvidenceId).toBeNull()
    expect(
      rotated?.models.flatMap(candidate => candidate.revisions)[0],
    ).toMatchObject({
      status: 'verification_required',
      verifiedCapabilities: null,
    })
    expect(rotated?.blockers).toEqual(
      expect.arrayContaining([
        { code: 'connection_verification_missing' },
        { code: 'model_revision_unverified' },
      ]),
    )
    const entries = await store.listRunProfileActivationEntries()
    expect(entries[0]?.profile.activeRevisionId).toBe(draftProfile.id)
    expect(entries[0]?.snapshot?.connection.blockers).toEqual(
      expect.arrayContaining([
        { code: 'connection_verification_missing' },
        { code: 'model_revision_unverified' },
      ]),
    )
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
      connection: connectionVerified,
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
    const siblingModel = await store.saveModelRevision({
      connectionId: created.id,
      modelRevision: {
        declaredCapabilities: CAPABILITIES,
        description: null,
        discoveredCapabilities: CAPABILITIES,
        externalModelId: 'controlled/lifecycle-sibling',
        externalModelVersion: '1',
        modelId: null,
        modelToken: null,
        name: 'Lifecycle sibling model',
      },
    })
    const siblingDraftRevision = siblingModel.revisions[0]
    if (!siblingDraftRevision) throw new Error('Sibling model revision missing')
    const siblingVerifiedRevision = await store.recordModelVerification({
      connection: connectionVerified,
      connectionEvidenceId,
      modelRevision: siblingDraftRevision,
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
    await appDb().query(
      `INSERT INTO [ai_run_profiles] (
         [id], [profile_key], [operational_status], [created_at], [updated_at]
       ) VALUES (
         NEWID(), N'invalid_json_repair', N'enabled',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
    )
    const siblingProfile = await store.saveRunProfileRevision({
      profileKey: 'invalid_json_repair',
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
        modelRevisionId: siblingVerifiedRevision.id,
        queueCapacity: 2,
        revisionToken: null,
        totalTimeBudgetSeconds: 600,
      },
    })
    const siblingProfileRevision = siblingProfile.draftRevision
    if (!siblingProfileRevision) throw new Error('Sibling profile missing')
    await expect(
      store.activateRunProfileRevision({
        attestationRevisionToken: validAttestation.revisionToken,
        connectionEvidenceId,
        connectionRevisionToken: activated?.revisionToken ?? '',
        modelRevisionToken: siblingVerifiedRevision.revisionToken,
        profileRevisionId: siblingProfileRevision.id,
        profileRevisionToken: siblingProfileRevision.revisionToken,
        profileToken: siblingProfile.revisionToken,
        secretVersionId: null,
      }),
    ).resolves.toMatchObject({ activeRevisionId: siblingProfileRevision.id })
    expect(await store.listRunProfiles()).toHaveLength(2)
    expect(await store.listRunProfileActivationEntries()).toHaveLength(2)
    expect(
      await store.listRunProfileRevisions('generation_without_images'),
    ).toHaveLength(1)

    const suspendedBeforeDelayedHealth = await store.setConnectionLifecycle({
      connectionId: created.id,
      revisionToken: activated?.revisionToken ?? '',
      status: 'suspended',
    })
    if (!suspendedBeforeDelayedHealth)
      throw new Error('Connection suspension failed')
    await expect(
      store.recordHealth({
        connectionConfigurationVersion: activated?.configurationVersion ?? 0,
        connectionId: created.id,
        connectionRevisionToken: activated?.revisionToken ?? '',
        health: 'degraded',
        invalidationScope: 'connection',
        modelRevisionId: siblingVerifiedRevision.id,
        modelRevisionToken: siblingVerifiedRevision.revisionToken,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(
      await count(
        appDb(),
        'ai_connection_model_operational_states',
        '[ai_connection_model_revision_id] = @0',
        [siblingVerifiedRevision.id],
      ),
    ).toBe(0)
    const detailAfterSuspension = await store.getConnection(created.id)
    expect(detailAfterSuspension?.lifecycleStatus).toBe('suspended')
    expect(detailAfterSuspension?.connectionEvidenceId).toBe(
      connectionEvidenceId,
    )
    expect(
      detailAfterSuspension?.models
        .flatMap(candidate => candidate.revisions)
        .map(revision => ({
          revisionToken: revision.revisionToken,
          status: revision.status,
        })),
    ).toEqual(
      expect.arrayContaining([
        {
          revisionToken: verifiedModelRevision.revisionToken,
          status: 'verified',
        },
        {
          revisionToken: siblingVerifiedRevision.revisionToken,
          status: 'verified',
        },
      ]),
    )

    const reactivatedBeforeMetadata = await store.activateConnection({
      attestationId: validAttestation.id,
      attestationRevisionToken: validAttestation.revisionToken,
      connectionEvidenceId,
      connectionId: created.id,
      connectionRevisionToken: suspendedBeforeDelayedHealth.revisionToken,
      modelRevisionId: siblingVerifiedRevision.id,
      modelRevisionToken: siblingVerifiedRevision.revisionToken,
      secretVersionId: null,
    })
    if (!reactivatedBeforeMetadata)
      throw new Error('Connection reactivation failed')
    const metadataUpdated = await store.updateConnection({
      connection: {
        ...connectionInput('-lifecycle'),
        administrationName: 'Updated lifecycle administration name',
        authenticationType: 'none',
      },
      connectionId: created.id,
      revisionToken: reactivatedBeforeMetadata.revisionToken,
    })
    if (!metadataUpdated) throw new Error('Connection metadata update failed')
    expect(metadataUpdated.lifecycleStatus).toBe('active')
    expect(metadataUpdated.configurationVersion).toBe(
      reactivatedBeforeMetadata.configurationVersion,
    )
    await expect(
      store.recordHealth({
        connectionConfigurationVersion:
          reactivatedBeforeMetadata.configurationVersion,
        connectionId: created.id,
        connectionRevisionToken: reactivatedBeforeMetadata.revisionToken,
        health: 'degraded',
        invalidationScope: 'connection',
        modelRevisionId: siblingVerifiedRevision.id,
        modelRevisionToken: siblingVerifiedRevision.revisionToken,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(metadataUpdated.connectionEvidenceId).toBe(connectionEvidenceId)
    expect(
      metadataUpdated.models
        .flatMap(candidate => candidate.revisions)
        .map(revision => revision.revisionToken),
    ).toEqual(
      expect.arrayContaining([
        verifiedModelRevision.revisionToken,
        siblingVerifiedRevision.revisionToken,
      ]),
    )
    expect(
      await count(
        appDb(),
        'ai_connection_model_operational_states',
        '[ai_connection_model_revision_id] = @0',
        [siblingVerifiedRevision.id],
      ),
    ).toBe(0)

    const health = await store.recordHealth({
      connectionConfigurationVersion: metadataUpdated.configurationVersion,
      connectionId: created.id,
      connectionRevisionToken: metadataUpdated.revisionToken,
      health: 'healthy',
      invalidationScope: 'none',
      modelRevisionId: verifiedModelRevision.id,
      modelRevisionToken: verifiedModelRevision.revisionToken,
    })
    expect(health.operationalHealth).toBe('healthy')
    const transientConnectionFailure = await store.recordConnectionVerification(
      {
        connection: health,
        result: {
          details: { status: 503 },
          failureCategory: 'provider_unavailable',
          outcome: 'failed',
          testSuiteVersion: 'sql-v1',
        },
      },
    )
    expect(transientConnectionFailure.lifecycleStatus).toBe('active')
    expect(
      transientConnectionFailure.models.flatMap(model => model.revisions)[0]
        ?.status,
    ).toBe('verified')
    const transientHealth = await store.recordHealth({
      connectionConfigurationVersion: health.configurationVersion,
      connectionId: created.id,
      connectionRevisionToken: health.revisionToken,
      health: 'unavailable',
      invalidationScope: 'none',
      modelRevisionId: verifiedModelRevision.id,
      modelRevisionToken: verifiedModelRevision.revisionToken,
    })
    expect(
      transientHealth.models.flatMap(model => model.revisions)[0]?.status,
    ).toBe('verified')
    const contradictedHealth = await store.recordHealth({
      connectionConfigurationVersion: transientHealth.configurationVersion,
      connectionId: created.id,
      connectionRevisionToken: transientHealth.revisionToken,
      health: 'degraded',
      invalidationScope: 'model',
      modelRevisionId: verifiedModelRevision.id,
      modelRevisionToken: verifiedModelRevision.revisionToken,
    })
    expect(contradictedHealth.operationalHealth).toBe('degraded')
    expect(
      contradictedHealth.models.flatMap(model => model.revisions)[0],
    ).toMatchObject({
      status: 'verification_required',
      verifiedCapabilities: null,
    })
    expect(
      contradictedHealth.models
        .flatMap(model => model.revisions)
        .find(revision => revision.id === siblingVerifiedRevision.id)?.status,
    ).toBe('verified')
    const entriesAfterModelContradiction =
      await store.listRunProfileActivationEntries()
    expect(
      entriesAfterModelContradiction.find(
        entry => entry.profile.profileKey === 'generation_without_images',
      )?.snapshot?.modelRevision?.status,
    ).toBe('verification_required')
    expect(
      entriesAfterModelContradiction.find(
        entry => entry.profile.profileKey === 'invalid_json_repair',
      )?.snapshot?.modelRevision?.status,
    ).toBe('verified')
    const authenticationFailure = await store.recordHealth({
      connectionConfigurationVersion: contradictedHealth.configurationVersion,
      connectionId: created.id,
      connectionRevisionToken: contradictedHealth.revisionToken,
      health: 'degraded',
      invalidationScope: 'connection',
      modelRevisionId: siblingVerifiedRevision.id,
      modelRevisionToken: siblingVerifiedRevision.revisionToken,
    })
    expect(authenticationFailure.lifecycleStatus).toBe('verification_required')
    expect(authenticationFailure.connectionEvidenceId).toBeNull()
    expect(
      authenticationFailure.models
        .flatMap(model => model.revisions)
        .every(revision => revision.status === 'verification_required'),
    ).toBe(true)
    expect(
      (await store.listRunProfileActivationEntries()).every(entry =>
        entry.snapshot?.connection.blockers.some(
          blocker => blocker.code === 'connection_verification_missing',
        ),
      ),
    ).toBe(true)
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
