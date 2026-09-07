import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
import { openRouterAdminAdapterRegistration } from '@/lib/ai/openrouter-admin-adapter'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import {
  AiProviderSecretAdminService,
  AiProviderSecretService,
  createAiRuntimeAdapterConfigurationResolver,
  getAiManagementCredentialMetadata,
  getAiProviderSecretAvailability,
  removeAiManagementCredential,
  writeAiProviderSecretCandidate,
} from '@/lib/ai/provider-secret-service'
import type { SqlServerDatabase } from '@/lib/db'
import {
  reencryptAiProviderSecretBatch,
  verifyAiProviderSecretRestoreSet,
} from '@/scripts/ai-provider-secret-maintenance.mjs'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

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

async function createConnection(
  db: SqlServerDatabase,
  name: string,
): Promise<string> {
  const rows = (await db.query(
    `INSERT INTO ai_connections (
       administration_name, public_name, adapter_key, adapter_version,
       endpoint_url, authentication_type, tls_policy_key, egress_policy_key,
       data_policy_summary, lifecycle_status, configuration_version,
       maximum_concurrency, created_at, updated_at
     )
     OUTPUT INSERTED.id AS id
     VALUES (
       @0, @0, N'test', N'1', N'https://ai.example.test/v1',
       N'static_secret', N'public_web_pki', N'sql_test',
       N'No production data', N'draft', 1, 4,
       SYSUTCDATETIME(), SYSUTCDATETIME()
     )`,
    [name],
  )) as Array<{ id: string }>
  return rows[0]?.id as string
}

describe('AI provider secrets against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  async function connection(id: string): Promise<AiAdminConnectionDetail> {
    const rows = await appDb().query<
      { configurationVersion: number; revisionToken: string }[]
    >(
      'SELECT [configuration_version] AS [configurationVersion], [revision_token] AS [revisionToken] FROM [ai_connections] WHERE [id] = @0',
      [id],
    )
    return {
      id,
      ...rows[0],
      adapterKey: 'openrouter',
      adapterVersion: '1',
      endpointUrl: 'https://ai.example.test/v1',
      authenticationType: 'static_secret',
    } as AiAdminConnectionDetail
  }

  it('keeps management rotation, failed verification and removal independent from runtime availability', async () => {
    const id = await createConnection(
      appDb(),
      'Independent credential purposes',
    )
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const runtime = await writeAiProviderSecretCandidate(appDb(), ring, {
      connectionId: id,
      plaintext: 'runtime-only',
    })
    const original = await connection(id)
    await new AiProviderSecretService(appDb(), ring, {
      verifyCandidate: async () => undefined,
    }).activateCandidate({
      connectionId: id,
      connectionConfigurationVersion: original.configurationVersion,
      connectionRevisionToken: original.revisionToken,
      secretVersionId: runtime.id,
    })
    const detail = await connection(id)
    const service = new AiProviderSecretAdminService(appDb(), ring)
    const adapter = openRouterAdminAdapterRegistration.adapter
    const egress = {
      fetch: vi.fn(async (_url: string, init?: RequestInit) =>
        new Headers(init?.headers).get('authorization') ===
        'Bearer invalid-candidate'
          ? new Response('untrusted-secret-error', { status: 401 })
          : Response.json({ data: { total_credits: 100, total_usage: 20 } }),
      ),
    }
    const first = await writeAiProviderSecretCandidate(appDb(), ring, {
      connectionId: id,
      purpose: 'management',
      plaintext: 'management-one',
    })
    expect(first.revisionNumber).toBe(1)
    await service.activateManagementCandidate(
      adapter,
      detail,
      egress,
      first.id,
      new AbortController().signal,
      async () => undefined,
    )
    const bad = await writeAiProviderSecretCandidate(appDb(), ring, {
      connectionId: id,
      purpose: 'management',
      plaintext: 'invalid-candidate',
    })
    await expect(
      service.activateManagementCandidate(
        adapter,
        detail,
        egress,
        bad.id,
        new AbortController().signal,
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: 'invalid_credential' })
    expect(
      (
        await getAiManagementCredentialMetadata(appDb(), id)
      ).active?.id.toLowerCase(),
    ).toBe(first.id.toLowerCase())
    expect(
      (await getAiManagementCredentialMetadata(appDb(), id)).candidates.map(
        candidate => candidate.id.toLowerCase(),
      ),
    ).toContain(bad.id.toLowerCase())
    const operation = adapter.financial?.capabilities.operations[0]
    if (!operation) throw new Error('Expected account financial operation')
    const financial = await service.fetchFinancialStatus(
      adapter,
      detail,
      egress,
      operation,
      new AbortController().signal,
    )
    expect(financial.state).toBe('success')
    expect(
      new Headers(egress.fetch.mock.lastCall?.[1]?.headers).get(
        'authorization',
      ),
    ).toBe('Bearer management-one')
    const second = await writeAiProviderSecretCandidate(appDb(), ring, {
      connectionId: id,
      purpose: 'management',
      plaintext: 'management-two',
    })
    await expect(
      service.activateManagementCandidate(
        adapter,
        detail,
        egress,
        second.id,
        new AbortController().signal,
        async () => {
          throw new Error('audit failed')
        },
      ),
    ).rejects.toThrow('audit failed')
    expect(
      (
        await getAiManagementCredentialMetadata(appDb(), id)
      ).active?.id.toLowerCase(),
    ).toBe(first.id.toLowerCase())
    await service.activateManagementCandidate(
      adapter,
      detail,
      egress,
      second.id,
      new AbortController().signal,
      async () => undefined,
    )
    await expect(
      removeAiManagementCredential(
        appDb(),
        id,
        first.id,
        async () => undefined,
      ),
    ).rejects.toThrow('Management credential changed')
    await removeAiManagementCredential(
      appDb(),
      id,
      second.id,
      async () => undefined,
    )
    await removeAiManagementCredential(
      appDb(),
      id,
      bad.id,
      async () => undefined,
    )
    expect(await getAiManagementCredentialMetadata(appDb(), id)).toEqual({
      active: null,
      candidates: [],
    })
    expect(await connection(id)).toEqual(detail)
    expect(
      await getAiProviderSecretAvailability(appDb(), ring, id),
    ).toMatchObject({ available: true, secretVersionId: runtime.id })
    const use = vi.fn()
    await createAiRuntimeAdapterConfigurationResolver(appDb(), ring)(
      {
        connectionId: id,
        connectionConfiguration: { authenticationType: 'static_secret' },
      } as never,
      use,
    )
    expect(use).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: {
          authenticationType: 'static_secret',
          credential: 'runtime-only',
        },
      }),
    )
    const retained = await appDb().query<
      { ciphertext: Buffer | null; revoked: Date | null }[]
    >(
      "SELECT [ciphertext], [provider_revoked_at] AS [revoked] FROM [ai_provider_secret_versions] WHERE [ai_connection_id] = @0 AND [credential_purpose] = N'management'",
      [id],
    )
    expect(retained).toEqual([
      { ciphertext: null, revoked: null },
      { ciphertext: null, revoked: null },
    ])
  })

  it('enforces immutable purposes, connection isolation and management-aware restore and root rotation', async () => {
    const id = await createConnection(appDb(), 'Management encrypted binding')
    const other = await createConnection(
      appDb(),
      'Different management connection',
    )
    const roots = { 'root-1': randomBytes(32), 'root-2': randomBytes(32) }
    const firstRing = keyring('root-1', roots)
    const ring = keyring('root-2', roots)
    const candidate = await writeAiProviderSecretCandidate(appDb(), firstRing, {
      connectionId: id,
      purpose: 'management',
      plaintext: 'management-restore-secret',
    })
    await expect(
      appDb().query(
        "UPDATE [ai_provider_secret_versions] SET [credential_purpose] = N'runtime' WHERE [id] = @0",
        [candidate.id],
      ),
    ).rejects.toThrow('immutable binding')
    await expect(
      appDb().query(
        "INSERT INTO [ai_provider_secret_versions] ([id], [ai_connection_id], [credential_purpose], [revision_number], [status], [cipher_format_version], [root_key_version], [created_at]) VALUES (NEWID(), @0, N'unknown', 1, N'candidate', 1, N'root-1', SYSUTCDATETIME())",
        [id],
      ),
    ).rejects.toThrow()
    const service = new AiProviderSecretAdminService(appDb(), ring)
    const fetch = vi.fn()
    await expect(
      service.activateManagementCandidate(
        openRouterAdminAdapterRegistration.adapter,
        await connection(other),
        { fetch },
        candidate.id,
        new AbortController().signal,
        async () => undefined,
      ),
    ).rejects.toThrow('candidate is unavailable')
    expect(fetch).not.toHaveBeenCalled()
    expect(
      await getAiProviderSecretAvailability(appDb(), firstRing, id),
    ).toEqual({ available: false, reason: 'secret_missing' })
    expect(await verifyAiProviderSecretRestoreSet(appDb(), ring)).toMatchObject(
      { compatible: true, checkedSecretVersionCount: 1 },
    )
    expect(
      await reencryptAiProviderSecretBatch(appDb(), ring, {
        batchSize: 10,
        fromRootKeyVersion: 'root-1',
      }),
    ).toMatchObject({ reencryptedCount: 1, remainingCount: 0 })
    expect(
      await verifyAiProviderSecretRestoreSet(appDb(), ring, {
        omitRootKeyVersion: 'root-1',
      }),
    ).toMatchObject({ compatible: true })
    await service.activateManagementCandidate(
      openRouterAdminAdapterRegistration.adapter,
      await connection(id),
      {
        fetch: async () =>
          Response.json({ data: { total_credits: 50, total_usage: 5 } }),
      },
      candidate.id,
      new AbortController().signal,
      async () => undefined,
    )
  })

  it('rolls secret persistence back when the privileged audit write fails', async () => {
    const connectionId = await createConnection(appDb(), 'Audit rollback')
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })

    await expect(
      writeAiProviderSecretCandidate(
        appDb(),
        ring,
        { connectionId, plaintext: 'must-not-commit' },
        async () => {
          throw new Error('injected secret audit failure')
        },
      ),
    ).rejects.toThrow('injected secret audit failure')

    const rows = (await appDb().query(
      `SELECT COUNT_BIG(*) AS [count]
       FROM [ai_provider_secret_versions]
       WHERE [ai_connection_id] = @0`,
      [connectionId],
    )) as Array<{ count: number | string }>
    expect(Number(rows[0]?.count ?? 0)).toBe(0)
  })

  it('rejects changing the AAD-bound secret-version ID', async () => {
    const connectionId = await createConnection(appDb(), 'Immutable binding')
    const ring = keyring('root-1', { 'root-1': randomBytes(32) })
    const candidate = await writeAiProviderSecretCandidate(appDb(), ring, {
      connectionId,
      plaintext: 'sql-trigger-secret',
    })

    await expect(
      appDb().query(
        'UPDATE ai_provider_secret_versions SET id = @0 WHERE id = @1',
        [randomUUID(), candidate.id],
      ),
    ).rejects.toThrow(
      'AI provider-secret immutable binding metadata cannot be changed',
    )
  })

  it('verifies restored encrypted rows and proves old-root removal after re-encryption', async () => {
    const firstConnectionId = await createConnection(appDb(), 'Backup root one')
    const secondConnectionId = await createConnection(
      appDb(),
      'Backup root two',
    )
    const root1 = randomBytes(32)
    const root2 = randomBytes(32)
    const root1Ring = keyring('root-1', { 'root-1': root1, 'root-2': root2 })
    const root2Ring = keyring('root-2', { 'root-1': root1, 'root-2': root2 })
    await writeAiProviderSecretCandidate(appDb(), root1Ring, {
      connectionId: firstConnectionId,
      plaintext: 'restored-sql-secret-one',
    })
    await writeAiProviderSecretCandidate(appDb(), root2Ring, {
      connectionId: secondConnectionId,
      plaintext: 'restored-sql-secret-two',
    })

    const restored = await verifyAiProviderSecretRestoreSet(appDb(), root2Ring)
    expect(restored).toMatchObject({
      checkedSecretVersionCount: 2,
      compatible: true,
      referencedRootKeyVersions: ['root-1', 'root-2'],
    })
    expect(JSON.stringify(restored)).not.toMatch(/restored-sql-secret/u)

    await expect(
      verifyAiProviderSecretRestoreSet(appDb(), root2Ring, {
        omitRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      compatible: false,
      safeToRemoveOmittedRootKeyVersion: false,
    })

    await expect(
      reencryptAiProviderSecretBatch(appDb(), root2Ring, {
        batchSize: 1,
        fromRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      reencryptedCount: 1,
      remainingCount: 0,
      safeToRemoveFromRootKeyVersion: true,
      toRootKeyVersion: 'root-2',
    })
    const prunedRing = keyring('root-2', { 'root-2': root2 })
    await expect(
      verifyAiProviderSecretRestoreSet(appDb(), prunedRing, {
        omitRootKeyVersion: 'root-1',
      }),
    ).resolves.toMatchObject({
      checkedSecretVersionCount: 2,
      compatible: true,
      referencedRootKeyVersions: ['root-2'],
      safeToRemoveOmittedRootKeyVersion: true,
    })
  })
})
