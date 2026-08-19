import { describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import type { CreateAiConnection } from '@/lib/ai/admin-contracts'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'

const connectionId = '00000000-0000-4000-8000-000000000001'
const revisionToken = '00000000-0000-4000-8000-000000000002'

const connectionInput: CreateAiConnection = {
  adapterKey: 'controlled_test',
  adapterVersion: '1',
  administrationName: 'Controlled test',
  agentRuntimeKey: null,
  agentRuntimeVersion: null,
  authenticationType: 'static_secret',
  dataPolicySummary: 'No personal data.',
  description: null,
  egressPolicyKey: 'controlled_test',
  endpointUrl: 'https://ai.example.test/v1',
  maximumConcurrency: 2,
  publicName: 'Controlled test AI',
  tlsPolicyKey: 'controlled_test',
}

function database(
  transactionQuery: ReturnType<typeof vi.fn>,
  query: ReturnType<typeof vi.fn> = vi.fn(async () => []),
): SqlServerDatabase {
  const manager = { query: transactionQuery }
  return {
    query,
    transaction: vi.fn(
      async (
        _isolation: string,
        callback: (executor: typeof manager) => Promise<unknown>,
      ) => callback(manager),
    ),
  } as unknown as SqlServerDatabase
}

describe('SQL Server AI administration store', () => {
  it('invalidates every verified child only for a technical connection change', async () => {
    const transactionQuery = vi
      .fn()
      .mockResolvedValueOnce([{ technicalChanged: true }])
      .mockResolvedValueOnce([])
    const db = database(transactionQuery)
    const store = createSqlServerAiAdminStore(db)

    await expect(
      store.updateConnection({
        connection: connectionInput,
        connectionId,
        revisionToken,
      }),
    ).resolves.toBeNull()

    expect(db.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    const sql = String(transactionQuery.mock.calls[0]?.[0])
    expect(sql).toContain('DECLARE @technical_changed bit')
    expect(sql).toContain('[configuration_version] = [configuration_version]')
    expect(sql).toContain("[lifecycle_status] <> N'draft'")
    expect(sql).toContain("SET [status] = N'verification_required'")
    expect(sql).toContain("AND [revision].[status] = N'verified'")
    expect(sql).toContain('IF @technical_changed = 1')
  })

  it('atomically checks every exact dependency before switching a profile revision', async () => {
    const transactionQuery = vi.fn(async (_sql: string) => [])
    const db = database(transactionQuery)
    const store = createSqlServerAiAdminStore(db)

    await expect(
      store.activateRunProfileRevision({
        attestationRevisionToken: '00000000-0000-4000-8000-000000000003',
        connectionEvidenceId: '00000000-0000-4000-8000-000000000004',
        connectionRevisionToken: revisionToken,
        modelRevisionToken: '00000000-0000-4000-8000-000000000005',
        profileRevisionId: '00000000-0000-4000-8000-000000000006',
        profileRevisionToken: '00000000-0000-4000-8000-000000000007',
        profileToken: '00000000-0000-4000-8000-000000000010',
        secretVersionId: '00000000-0000-4000-8000-000000000008',
      }),
    ).resolves.toBeNull()

    expect(db.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    const sql = String(transactionQuery.mock.calls[0]?.[0])
    for (const fragment of [
      "[candidate].[status] IN (N'draft', N'superseded')",
      '[candidate].[revision_token] = @1',
      '[profile].[revision_token] = @7',
      '[model_revision].[revision_token] = @2',
      "[model_revision].[status] = N'verified'",
      '[connection].[revision_token] = @3',
      "[connection].[lifecycle_status] = N'active'",
      '[attestation].[revision_token] = @4',
      '[evidence].[id] = @5',
      '[secret].[id] = @6',
      '[model_revision].[connection_configuration_version]',
      "SET [status] = N'superseded'",
      "SET [status] = N'active'",
    ]) {
      expect(sql).toContain(fragment)
    }
  })

  it('updates operational health for one exact verified revision', async () => {
    const transactionQuery = vi.fn(async (_sql: string) => [])
    const db = database(transactionQuery)
    const store = createSqlServerAiAdminStore(db)

    await expect(
      store.recordHealth({
        connectionId,
        health: 'healthy',
        modelRevisionId: '00000000-0000-4000-8000-000000000009',
        modelRevisionToken: revisionToken,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const sql = String(transactionQuery.mock.calls[0]?.[0])
    expect(sql).toContain('[revision].[id] = @1')
    expect(sql).toContain('[revision].[revision_token] = @2')
    expect(sql).toContain("[revision].[status] = N'verified'")
    expect(sql).toContain('[health_status] = @3')
  })
})
