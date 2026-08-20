import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import { writeAiProviderSecretCandidate } from '@/lib/ai/provider-secret-service'
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
