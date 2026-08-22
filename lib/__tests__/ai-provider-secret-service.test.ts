import { randomBytes, randomUUID } from 'node:crypto'
import type { AiAdminConnectionAdapter } from '@/lib/ai/admin-adapter'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
import { controlledTestAdminAdapterRegistration } from '@/lib/ai/controlled-test-admin-adapter'
import {
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from '@/lib/ai/provider-secret-crypto'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import {
  AiProviderSecretAdminService,
  AiProviderSecretService,
  confirmAiProviderSecretRevocation,
  createAiRuntimeAdapterConfigurationResolver,
  deleteAiProviderSecretCandidate,
  getAiProviderSecretAvailabilities,
  getAiProviderSecretAvailability,
  listReferencedAiProviderSecretRootKeyVersions,
  reencryptAiProviderSecrets,
  verifyAiProviderSecretRestoreSet,
  writeAiProviderSecretCandidate,
} from '@/lib/ai/provider-secret-service'
import type { AiEgressTransport } from '@/lib/ai/run-contracts'
import type { SqlServerDatabase } from '@/lib/db'

function keyring(activeWriteVersion: string, keys: Record<string, Buffer>) {
  return parseAiProviderSecretKeyring(
    JSON.stringify({
      activeWriteVersion,
      formatVersion: 1,
      keys: Object.fromEntries(
        Object.entries(keys).map(([version, key]) => [
          version,
          key.toString('base64'),
        ]),
      ),
    }),
  )
}

function database(query: ReturnType<typeof vi.fn>) {
  const manager = { query: vi.fn(query) }
  const db = {
    query: vi.fn(query),
    transaction: vi.fn(
      async (
        isolationOrCallback: string | ((value: typeof manager) => unknown),
        callback?: (value: typeof manager) => unknown,
      ) =>
        typeof isolationOrCallback === 'function'
          ? isolationOrCallback(manager)
          : callback?.(manager),
    ),
  }
  return {
    db: db as unknown as SqlServerDatabase,
    manager,
    transaction: db.transaction,
  }
}

function persistedRow(
  connectionId: string,
  secretVersionId: string,
  plaintext: string,
  ring: ReturnType<typeof keyring>,
  status: 'active' | 'candidate' | 'superseded' = 'active',
) {
  const envelope = encryptAiProviderSecret(
    ring,
    { connectionId, secretVersionId },
    plaintext,
  )
  return {
    activatedAt:
      status === 'candidate' ? null : new Date('2026-08-19T10:00:00Z'),
    authenticationTag: envelope.authenticationTag,
    ciphertext: envelope.ciphertext,
    connectionId,
    createdAt: new Date('2026-08-19T09:00:00Z'),
    formatVersion: envelope.formatVersion,
    id: secretVersionId,
    nonce: envelope.nonce,
    revisionNumber: 1,
    revisionToken: randomUUID(),
    rootKeyVersion: envelope.rootKeyVersion,
    status,
    verifiedAt:
      status === 'candidate' ? null : new Date('2026-08-19T09:59:00Z'),
  }
}

describe('AI provider-secret service', () => {
  it('injects an active credential only for the bounded runtime callback', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const query = vi.fn(async () => [
      persistedRow(connectionId, secretVersionId, 'runtime-secret', ring),
    ])
    const resolve = createAiRuntimeAdapterConfigurationResolver(
      database(query).db,
      ring,
    )
    const use = vi.fn(async configuration => {
      expect(configuration).toEqual({
        connection: {
          authenticationType: 'static_secret',
          credential: 'runtime-secret',
          endpointUrl: 'https://provider.example/v1',
        },
        modelRevision: { responseMode: 'json' },
      })
    })

    await resolve(
      {
        connectionConfiguration: {
          authenticationType: 'static_secret',
          endpointUrl: 'https://provider.example/v1',
        },
        connectionId,
        modelRevisionConfiguration: { responseMode: 'json' },
      } as never,
      use,
    )

    expect(use).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledOnce()
  })

  it('does not load a secret for an unauthenticated controlled adapter', async () => {
    const query = vi.fn()
    const resolve = createAiRuntimeAdapterConfigurationResolver(
      database(query).db,
      keyring('root-1', { 'root-1': randomBytes(32) }),
    )
    const use = vi.fn()

    await resolve(
      {
        connectionConfiguration: { authenticationType: 'none' },
        connectionId: randomUUID(),
        modelRevisionConfiguration: { scenario: { type: 'silent_eof' } },
      } as never,
      use,
    )

    expect(use).toHaveBeenCalledWith({
      connection: { authenticationType: 'none' },
      modelRevision: { scenario: { type: 'silent_eof' } },
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('fails closed when an authenticated admin operation has no active secret', async () => {
    const connectionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const adapter = {
      fetchCatalog: vi.fn(),
    } as unknown as AiAdminConnectionAdapter
    const service = new AiProviderSecretAdminService(
      database(vi.fn(async () => [])).db,
      ring,
    )

    await expect(
      service.fetchCatalog(
        adapter,
        {
          authenticationType: 'static_secret',
          id: connectionId,
        } as AiAdminConnectionDetail,
        { fetch: vi.fn() } as AiEgressTransport,
      ),
    ).rejects.toMatchObject({
      connectionId,
      reason: 'secret_missing',
    })
    expect(adapter.fetchCatalog).not.toHaveBeenCalled()
  })

  it('verifies every capability and fixed run-profile contract before a model can be saved', async () => {
    const progress: string[] = []
    const cancellationProbe = vi.fn(
      controlledTestAdminAdapterRegistration.adapter
        .runActivationCancellationProbe,
    )
    const negativeProbe = vi.fn(
      controlledTestAdminAdapterRegistration.adapter.runActivationNegativeProbe,
    )
    const adapter: AiAdminConnectionAdapter = {
      ...controlledTestAdminAdapterRegistration.adapter,
      runActivationCancellationProbe: cancellationProbe,
      runActivationNegativeProbe: negativeProbe,
    }
    const service = new AiProviderSecretAdminService(
      database(vi.fn()).db,
      keyring('root-1', { 'root-1': randomBytes(32) }),
    )

    const result = await service.verifyModelCandidate(
      adapter,
      {
        authenticationType: 'none',
        configurationVersion: 3,
        id: randomUUID(),
        models: [],
      } as unknown as AiAdminConnectionDetail,
      { fetch: vi.fn() } as AiEgressTransport,
      {
        externalModelId: 'controlled/verified-model',
        externalModelVersion: '2026-08-22',
      },
      {
        onProgress: event => {
          if (event.state === 'completed') progress.push(event.check)
        },
        signal: new AbortController().signal,
      },
    )

    expect(result.saveable).toBe(true)
    expect(cancellationProbe).toHaveBeenCalledOnce()
    expect(negativeProbe).toHaveBeenCalledTimes(4)
    expect(result.capabilities).toEqual(
      Object.fromEntries(
        [
          'aiAnalysis',
          'cost',
          'imageInput',
          'jsonSchemaSteering',
          'streaming',
          'tokenUsage',
          'validatableJson',
        ].map(capability => [
          capability,
          {
            diagnosticCode: null,
            failureCategory: null,
            outcome: 'verified',
          },
        ]),
      ),
    )
    expect(result.profileCompatibility).toEqual({
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
    })
    expect(progress).toEqual([
      'connection_authentication',
      'baseline_model_access',
      'capability:aiAnalysis',
      'capability:cost',
      'capability:imageInput',
      'capability:jsonSchemaSteering',
      'capability:streaming',
      'capability:tokenUsage',
      'capability:validatableJson',
      'profile:generation_without_images',
      'profile:generation_with_images',
      'profile:invalid_json_repair',
      'summary',
    ])
  })

  it('encrypts before candidate persistence and never sends plaintext to SQL', async () => {
    const connectionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const query = vi.fn(async (_sql: string, parameters?: unknown[]) => [
      {
        connectionId,
        createdAt: new Date('2026-08-19T10:00:00Z'),
        id: parameters?.[1],
        revisionNumber: 1,
        revisionToken: randomUUID(),
        rootKeyVersion: 'root-1',
        status: 'candidate',
      },
    ])
    const { db, manager, transaction } = database(query)

    const result = await writeAiProviderSecretCandidate(db, ring, {
      connectionId,
      plaintext: 'never-send-this-to-sql',
    })

    expect(result).toMatchObject({
      connectionId,
      revisionNumber: 1,
      rootKeyVersion: 'root-1',
      status: 'candidate',
    })
    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    const parameters = manager.query.mock.calls[0]?.[1] as unknown[]
    expect(parameters).not.toContain('never-send-this-to-sql')
    expect(parameters.some(value => Buffer.isBuffer(value))).toBe(true)
  })

  it('tests a candidate before atomically superseding and activating revisions', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const row = persistedRow(
      connectionId,
      secretVersionId,
      'candidate-secret',
      ring,
      'candidate',
    )
    const query = vi
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([
        {
          ...row,
          activatedAt: new Date('2026-08-19T10:10:00Z'),
          revisionToken: randomUUID(),
          status: 'active',
          verifiedAt: new Date('2026-08-19T10:10:00Z'),
        },
      ])
    const { db, manager, transaction } = database(query)
    const verify = vi.fn(async () => undefined)

    const service = new AiProviderSecretService(db, ring, {
      verifyCandidate: verify,
    })
    await service.activateCandidate({
      connectionConfigurationVersion: 1,
      connectionId,
      connectionRevisionToken: randomUUID(),
      secretVersionId,
    })

    expect(verify).toHaveBeenCalledWith(
      { connectionId, secretVersionId },
      'candidate-secret',
    )
    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    const activationSql = manager.query.mock.calls.find(call =>
      String(call[0]).includes("SET [status] = N'active'"),
    )?.[0]
    expect(activationSql).toContain("SET [status] = N'superseded'")
    expect(activationSql).toContain("SET [status] = N'active'")
    expect(activationSql).toContain("SET [status] = N'new_revision_required'")
    expect(activationSql).not.toContain(
      "SET [status] = N'verification_required'",
    )
    expect(activationSql).not.toContain('[verified_capabilities_json] = NULL')
  })

  it('keeps the caller-facing activation request and result opaque', async () => {
    type ActivationInput = Parameters<
      AiProviderSecretService['activateCandidate']
    >[0]
    expectTypeOf<ActivationInput>().toEqualTypeOf<{
      connectionConfigurationVersion: number
      connectionId: string
      connectionRevisionToken: string
      secretVersionId: string
    }>()

    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const plaintext = 'never-public'
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const row = persistedRow(
      connectionId,
      secretVersionId,
      plaintext,
      ring,
      'candidate',
    )
    const query = vi
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: 'active' }])
    const service = new AiProviderSecretService(database(query).db, ring, {
      verifyCandidate: async () => undefined,
    })

    const result = await service.activateCandidate({
      connectionConfigurationVersion: 1,
      connectionId,
      connectionRevisionToken: randomUUID(),
      secretVersionId,
    })

    expect(Object.keys(result)).not.toContain('plaintext')
    expect(JSON.stringify(result)).not.toContain(plaintext)
    expect('withActiveAiProviderSecret' in service).toBe(false)
  })

  it('restores a still-encrypted superseded revision only after retesting it', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const row = persistedRow(
      connectionId,
      secretVersionId,
      'restorable-secret',
      ring,
      'superseded',
    )
    const query = vi
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([
        {
          ...row,
          revisionToken: randomUUID(),
          status: 'active',
        },
      ])
    const { db } = database(query)
    const verify = vi.fn(async () => undefined)

    const service = new AiProviderSecretService(db, ring, {
      verifyCandidate: verify,
    })
    const restored = await service.activateCandidate({
      connectionConfigurationVersion: 1,
      connectionId,
      connectionRevisionToken: randomUUID(),
      secretVersionId,
    })

    expect(verify).toHaveBeenCalledWith(
      { connectionId, secretVersionId },
      'restorable-secret',
    )
    expect(restored).toMatchObject({ id: secretVersionId, status: 'active' })
  })

  it('keeps a candidate inactive when provider verification fails', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const row = persistedRow(
      connectionId,
      secretVersionId,
      'rejected-secret',
      ring,
      'candidate',
    )
    const { db, transaction } = database(vi.fn(async () => [row]))

    await expect(
      new AiProviderSecretService(db, ring, {
        verifyCandidate: async () => {
          throw new Error('provider rejected candidate')
        },
      }).activateCandidate({
        connectionConfigurationVersion: 1,
        connectionId,
        connectionRevisionToken: randomUUID(),
        secretVersionId,
      }),
    ).rejects.toThrow('provider rejected candidate')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('hard-deletes only an unactivated candidate', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const query = vi.fn(async () => [{ deletedId: secretVersionId }])
    const { db, manager } = database(query)

    await expect(
      deleteAiProviderSecretCandidate(db, { connectionId, secretVersionId }),
    ).resolves.toBe(true)

    expect(manager.query.mock.calls[0]?.[0]).toContain(
      "AND [status] = N'candidate'",
    )
    expect(manager.query.mock.calls[0]?.[0]).toContain(
      'OUTPUT DELETED.[id] INTO @deleted',
    )
  })

  it('keeps superseded audit metadata while deleting revoked ciphertext', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const query = vi.fn(async () => [
      {
        ciphertextDeletedAt: new Date('2026-08-19T10:20:00Z'),
        connectionId,
        id: secretVersionId,
        providerRevokedAt: new Date('2026-08-19T10:20:00Z'),
        revisionNumber: 1,
        rootKeyVersion: 'root-1',
        status: 'superseded',
      },
    ])
    const { db, manager } = database(query)

    const result = await confirmAiProviderSecretRevocation(db, {
      connectionId,
      secretVersionId,
    })

    expect(result).toMatchObject({
      ciphertextDeletedAt: expect.any(String),
      id: secretVersionId,
      providerRevokedAt: expect.any(String),
      rootKeyVersion: 'root-1',
      status: 'superseded',
    })
    const sql = manager.query.mock.calls[0]?.[0] as string
    expect(sql).toContain('[ciphertext] = NULL')
    expect(sql).toContain('[nonce] = NULL')
    expect(sql).toContain('[authentication_tag] = NULL')
    expect(sql).toContain('INTO @revoked')
    expect(sql).not.toContain('DELETE FROM')
  })

  it('blocks only a connection whose active secret references a missing root version', async () => {
    const availableConnectionId = randomUUID()
    const blockedConnectionId = randomUUID()
    const root1 = randomBytes(32)
    const root2 = randomBytes(32)
    const fullRing = keyring('root-1', { 'root-1': root1, 'root-2': root2 })
    const deployedRing = keyring('root-1', { 'root-1': root1 })
    const rows = new Map<string, ReturnType<typeof persistedRow>>([
      [
        availableConnectionId,
        persistedRow(
          availableConnectionId,
          randomUUID(),
          'available',
          fullRing,
        ),
      ],
      [
        blockedConnectionId,
        persistedRow(
          blockedConnectionId,
          randomUUID(),
          'blocked',
          keyring('root-2', { 'root-1': root1, 'root-2': root2 }),
        ),
      ],
    ])
    const { db } = database(
      vi.fn(async (_sql: string, parameters?: unknown[]) => [
        rows.get(String(parameters?.[0])),
      ]),
    )

    await expect(
      getAiProviderSecretAvailability(db, deployedRing, availableConnectionId),
    ).resolves.toMatchObject({ available: true })
    await expect(
      getAiProviderSecretAvailability(db, deployedRing, blockedConnectionId),
    ).resolves.toEqual({
      available: false,
      reason: 'root_key_version_missing',
      rootKeyVersion: 'root-2',
      secretVersionId: rows.get(blockedConnectionId)?.id,
    })
  })

  it('re-encrypts selected rows to the explicit active root version with fresh nonces', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const root1 = randomBytes(32)
    const root2 = randomBytes(32)
    const oldRing = keyring('root-1', { 'root-1': root1, 'root-2': root2 })
    const rotationRing = keyring('root-2', { 'root-1': root1, 'root-2': root2 })
    const row = persistedRow(
      connectionId,
      secretVersionId,
      'rotate-me',
      oldRing,
    )
    const query = vi.fn(async (sql: string) =>
      sql.includes('SELECT') ? [row] : [{ updatedCount: 1 }],
    )
    const { db, manager } = database(query)

    const result = await reencryptAiProviderSecrets(db, rotationRing, {
      fromRootKeyVersion: 'root-1',
    })

    expect(result).toEqual({
      fromRootKeyVersion: 'root-1',
      reencryptedCount: 1,
      skippedCount: 0,
      toRootKeyVersion: 'root-2',
    })
    expect(manager.query.mock.calls[1]?.[0]).toContain(
      'OUTPUT INSERTED.[id] INTO @updated',
    )
    const parameters = manager.query.mock.calls[1]?.[1] as unknown[]
    const rotated = {
      authenticationTag: parameters[3] as Buffer,
      ciphertext: parameters[1] as Buffer,
      formatVersion: parameters[4] as 1,
      nonce: parameters[2] as Buffer,
      rootKeyVersion: parameters[5] as string,
    }
    expect(rotated.nonce.equals(row.nonce)).toBe(false)
    expect(
      decryptAiProviderSecret(
        rotationRing,
        { connectionId, secretVersionId },
        rotated,
      ),
    ).toBe('rotate-me')
  })

  it('commits bounded rotation batches and counts only fenced updates', async () => {
    const root1 = randomBytes(32)
    const root2 = randomBytes(32)
    const oldRing = keyring('root-1', { 'root-1': root1, 'root-2': root2 })
    const rotationRing = keyring('root-2', {
      'root-1': root1,
      'root-2': root2,
    })
    const rows = [
      persistedRow(
        randomUUID(),
        '10000000-0000-4000-8000-000000000001',
        'first',
        oldRing,
      ),
      persistedRow(
        randomUUID(),
        '20000000-0000-4000-8000-000000000002',
        'second',
        oldRing,
      ),
    ]
    const managerQueries = [
      vi
        .fn()
        .mockResolvedValueOnce([rows[0]])
        .mockResolvedValueOnce([{ updatedId: rows[0]?.id }]),
      vi.fn().mockResolvedValueOnce([rows[1]]).mockResolvedValueOnce([]),
      vi.fn().mockResolvedValueOnce([]),
    ]
    const db = {
      transaction: vi.fn(async (_isolation, use) =>
        use({ query: managerQueries.shift() }),
      ),
    } as unknown as SqlServerDatabase

    await expect(
      reencryptAiProviderSecrets(db, rotationRing, {
        batchSize: 1,
        fromRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({ reencryptedCount: 1, skippedCount: 1 })
    expect(db.transaction).toHaveBeenCalledTimes(3)
    await expect(
      reencryptAiProviderSecrets(db, rotationRing, {
        batchSize: 0,
        fromRootKeyVersion: 'root-1',
      }),
    ).rejects.toThrow('batch size must be 1-1000')
  })

  it('verifies a restored SQL backup with its keyring before safely removing an old root', async () => {
    const firstConnectionId = randomUUID()
    const secondConnectionId = randomUUID()
    const firstSecretVersionId = randomUUID()
    const secondSecretVersionId = randomUUID()
    const root1 = randomBytes(32)
    const root2 = randomBytes(32)
    const root1Ring = keyring('root-1', { 'root-1': root1, 'root-2': root2 })
    const root2Ring = keyring('root-2', { 'root-1': root1, 'root-2': root2 })
    const restoredRows = [
      persistedRow(
        firstConnectionId,
        firstSecretVersionId,
        'backup-secret-one',
        root1Ring,
      ),
      persistedRow(
        secondConnectionId,
        secondSecretVersionId,
        'backup-secret-two',
        root2Ring,
      ),
    ]
    const query = vi.fn(async () => restoredRows)
    const { db } = database(query)

    const restored = await verifyAiProviderSecretRestoreSet(db, root2Ring)

    expect(restored).toEqual({
      batchSize: 100,
      checkedSecretVersionCount: 2,
      compatible: true,
      failedSecretVersionCount: 0,
      failureSample: [],
      failureSampleLimit: 20,
      failureSampleTruncated: false,
      omittedRootKeyVersion: null,
      referencedRootKeyVersions: ['root-1', 'root-2'],
      referencedRootKeyVersionsTruncated: false,
      safeToRemoveOmittedRootKeyVersion: null,
    })
    expect(JSON.stringify(restored)).not.toMatch(
      /backup-secret-one|backup-secret-two/u,
    )

    await expect(
      verifyAiProviderSecretRestoreSet(db, root2Ring, {
        omitRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      compatible: false,
      safeToRemoveOmittedRootKeyVersion: false,
    })

    const rotatedRows = [
      persistedRow(
        firstConnectionId,
        firstSecretVersionId,
        'backup-secret-one',
        root2Ring,
      ),
      persistedRow(
        secondConnectionId,
        secondSecretVersionId,
        'backup-secret-two',
        root2Ring,
      ),
    ]
    query.mockResolvedValue(rotatedRows)
    const prunedRing = keyring('root-2', { 'root-2': root2 })

    await expect(
      verifyAiProviderSecretRestoreSet(db, prunedRing, {
        omitRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      checkedSecretVersionCount: 2,
      compatible: true,
      referencedRootKeyVersions: ['root-2'],
      safeToRemoveOmittedRootKeyVersion: true,
    })
  })

  it('reports missing, deleted, and unauthenticated active material safely', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const active = persistedRow(
      connectionId,
      secretVersionId,
      'availability-secret',
      ring,
    )
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...active,
          authenticationTag: null,
          ciphertext: null,
          nonce: null,
        },
      ])
      .mockResolvedValueOnce([
        { ...active, ciphertext: Buffer.from(active.ciphertext).fill(0) },
      ])
    const { db } = database(query)

    await expect(
      getAiProviderSecretAvailability(db, ring, connectionId),
    ).resolves.toEqual({ available: false, reason: 'secret_missing' })
    await expect(
      getAiProviderSecretAvailability(db, ring, connectionId),
    ).resolves.toMatchObject({
      available: false,
      reason: 'encrypted_material_deleted',
    })
    await expect(
      getAiProviderSecretAvailability(db, ring, connectionId),
    ).resolves.toMatchObject({
      available: false,
      reason: 'authentication_failed',
    })
  })

  it('loads deduplicated secret availability in one bounded query', async () => {
    const firstConnectionId = randomUUID()
    const secondConnectionId = randomUUID()
    const missingConnectionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const first = persistedRow(
      firstConnectionId,
      randomUUID(),
      'first-secret',
      ring,
    )
    const second = persistedRow(
      secondConnectionId,
      randomUUID(),
      'second-secret',
      ring,
    )
    const { db } = database(
      vi.fn(async () => [
        first,
        { ...second, ciphertext: Buffer.from(second.ciphertext).fill(0) },
      ]),
    )

    const result = await getAiProviderSecretAvailabilities(db, ring, [
      firstConnectionId.toUpperCase(),
      firstConnectionId,
      secondConnectionId,
      missingConnectionId,
    ])

    expect(db.query).toHaveBeenCalledOnce()
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('OPENJSON(@0)'),
      [
        JSON.stringify([
          firstConnectionId,
          secondConnectionId,
          missingConnectionId,
        ]),
      ],
    )
    expect(result.get(firstConnectionId)).toMatchObject({ available: true })
    expect(result.get(secondConnectionId)).toMatchObject({
      available: false,
      reason: 'authentication_failed',
    })
    expect(result.get(missingConnectionId)).toEqual({
      available: false,
      reason: 'secret_missing',
    })
    await expect(
      getAiProviderSecretAvailabilities(db, ring, []),
    ).resolves.toEqual(new Map())
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('fails closed when lifecycle mutations no longer match a secret version', async () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const candidate = persistedRow(
      connectionId,
      secretVersionId,
      'candidate',
      ring,
      'candidate',
    )
    const missingCandidateDb = database(vi.fn(async () => [])).db
    await expect(
      new AiProviderSecretService(missingCandidateDb, ring, {
        verifyCandidate: async () => undefined,
      }).activateCandidate({
        connectionConfigurationVersion: 1,
        connectionId,
        connectionRevisionToken: randomUUID(),
        secretVersionId,
      }),
    ).rejects.toMatchObject({ reason: 'secret_missing' })

    const noActivation = vi
      .fn()
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([])
    await expect(
      new AiProviderSecretService(database(noActivation).db, ring, {
        verifyCandidate: async () => undefined,
      }).activateCandidate({
        connectionConfigurationVersion: 1,
        connectionId,
        connectionRevisionToken: randomUUID(),
        secretVersionId,
      }),
    ).rejects.toThrow('state changed')
    await expect(
      confirmAiProviderSecretRevocation(database(vi.fn(async () => [])).db, {
        connectionId,
        secretVersionId,
      }),
    ).rejects.toThrow('Only a superseded')
    await expect(
      deleteAiProviderSecretCandidate(database(vi.fn(async () => [])).db, {
        connectionId,
        secretVersionId,
      }),
    ).resolves.toBe(false)
  })

  it('handles empty writes, no-op rotation, and referenced-version inventory', async () => {
    const connectionId = randomUUID()
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    await expect(
      writeAiProviderSecretCandidate(database(vi.fn(async () => [])).db, ring, {
        connectionId,
        plaintext: 'candidate',
      }),
    ).rejects.toThrow('candidate was not created')
    await expect(
      reencryptAiProviderSecrets(database(vi.fn()).db, ring, {
        fromRootKeyVersion: 'root-1',
      }),
    ).resolves.toEqual({
      fromRootKeyVersion: 'root-1',
      reencryptedCount: 0,
      skippedCount: 0,
      toRootKeyVersion: 'root-1',
    })
    await expect(
      listReferencedAiProviderSecretRootKeyVersions(
        database(
          vi.fn(async () => [
            { rootKeyVersion: 'root-1' },
            { rootKeyVersion: 'root-2' },
          ]),
        ).db,
      ),
    ).resolves.toEqual(['root-1', 'root-2'])
  })

  it('returns safe empty restore evidence and never removes the active write root', async () => {
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const emptyDb = database(vi.fn(async () => [])).db
    await expect(
      verifyAiProviderSecretRestoreSet(emptyDb, ring),
    ).resolves.toEqual({
      batchSize: 100,
      checkedSecretVersionCount: 0,
      compatible: true,
      failedSecretVersionCount: 0,
      failureSample: [],
      failureSampleLimit: 20,
      failureSampleTruncated: false,
      omittedRootKeyVersion: null,
      referencedRootKeyVersions: [],
      referencedRootKeyVersionsTruncated: false,
      safeToRemoveOmittedRootKeyVersion: null,
    })
    await expect(
      verifyAiProviderSecretRestoreSet(emptyDb, ring, {
        omitRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      compatible: true,
      safeToRemoveOmittedRootKeyVersion: false,
    })
  })

  it('checks every restore page while capping failure evidence', async () => {
    const root = randomBytes(32)
    const ring = keyring('root-1', { 'root-1': root })
    const rows = Array.from({ length: 25 }, () => {
      const row = persistedRow(
        randomUUID(),
        randomUUID(),
        'paged-restore-secret',
        ring,
      )
      return { ...row, authenticationTag: Buffer.alloc(16) }
    })
    const query = vi
      .fn()
      .mockResolvedValueOnce(rows.slice(0, 10))
      .mockResolvedValueOnce(rows.slice(10, 20))
      .mockResolvedValueOnce(rows.slice(20))
    const { db } = database(query)

    const report = await verifyAiProviderSecretRestoreSet(db, ring, {
      batchSize: 10,
    })

    expect(report).toMatchObject({
      batchSize: 10,
      checkedSecretVersionCount: 25,
      compatible: false,
      failedSecretVersionCount: 25,
      failureSampleTruncated: true,
    })
    expect(report.failureSample).toHaveLength(20)
    expect(query).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(report)).not.toContain('paged-restore-secret')
    await expect(
      verifyAiProviderSecretRestoreSet(db, ring, { batchSize: 0 }),
    ).rejects.toThrow('batch size must be 1-1000')
    await expect(
      verifyAiProviderSecretRestoreSet(db, ring, { batchSize: 1_001 }),
    ).rejects.toThrow('batch size must be 1-1000')
    await expect(
      verifyAiProviderSecretRestoreSet(db, ring, { batchSize: Number.NaN }),
    ).rejects.toThrow('batch size must be 1-1000')
  })

  it('bounds the referenced-root sample and fails closed without an active runtime secret', async () => {
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...persistedRow(randomUUID(), randomUUID(), 'sample-secret', ring),
      ciphertext: null,
      rootKeyVersion: `root-${String(index).padStart(3, '0')}`,
    }))
    const query = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([])

    await expect(
      verifyAiProviderSecretRestoreSet(database(query).db, ring, {
        batchSize: 101,
      }),
    ).resolves.toMatchObject({
      checkedSecretVersionCount: 101,
      failedSecretVersionCount: 101,
      referencedRootKeyVersionsTruncated: true,
    })

    const resolve = createAiRuntimeAdapterConfigurationResolver(
      database(vi.fn(async () => [])).db,
      ring,
    )
    await expect(
      resolve(
        {
          connectionConfiguration: { authenticationType: 'static_secret' },
          connectionId: randomUUID(),
        } as never,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ reason: 'secret_missing' })
  })
})
