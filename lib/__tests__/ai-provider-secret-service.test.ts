import { randomBytes, randomUUID } from 'node:crypto'
import {
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from '@/lib/ai/provider-secret-crypto'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import {
  AiProviderSecretAdminService,
  AiProviderSecretService,
  confirmAiProviderSecretRevocation,
  deleteAiProviderSecretCandidate,
  getAiProviderSecretAvailability,
  listReferencedAiProviderSecretRootKeyVersions,
  reencryptAiProviderSecrets,
  verifyAiProviderSecretRestoreSet,
  writeAiProviderSecretCandidate,
} from '@/lib/ai/provider-secret-service'
import type { AiAdminConnectionAdapter } from '@/lib/ai/admin-adapter'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
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
      connectionId,
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
  })

  it('keeps the caller-facing activation request and result opaque', async () => {
    type ActivationInput = Parameters<
      AiProviderSecretService['activateCandidate']
    >[0]
    expectTypeOf<ActivationInput>().toEqualTypeOf<{
      connectionId: string
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
      connectionId,
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
      connectionId,
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
        connectionId,
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
      toRootKeyVersion: 'root-2',
    })
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
      checkedSecretVersionCount: 2,
      compatible: true,
      omittedRootKeyVersion: null,
      referencedRootKeyVersions: ['root-1', 'root-2'],
      results: [
        {
          available: true,
          connectionId: firstConnectionId,
          rootKeyVersion: 'root-1',
          secretVersionId: firstSecretVersionId,
        },
        {
          available: true,
          connectionId: secondConnectionId,
          rootKeyVersion: 'root-2',
          secretVersionId: secondSecretVersionId,
        },
      ],
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
        connectionId,
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
        connectionId,
        secretVersionId,
      }),
    ).rejects.toThrow('was not activated')
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
      checkedSecretVersionCount: 0,
      compatible: true,
      omittedRootKeyVersion: null,
      referencedRootKeyVersions: [],
      results: [],
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
})
