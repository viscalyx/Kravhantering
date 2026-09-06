import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AiAdminConnectionDetail,
  AiAdminStore,
} from '@/lib/ai/admin-service'

const runtimeState = vi.hoisted(() => {
  class KeyringError extends Error {}
  return {
    activate: vi.fn(),
    audit: vi.fn(async () => undefined),
    availability: vi.fn(),
    availabilities: vi.fn(),
    confirm: vi.fn(),
    createProduction: vi.fn(),
    deleteCandidate: vi.fn(),
    external: {
      adapterAvailability: vi.fn(() => ({ available: true as const })),
      authorizeConnectionTarget: vi.fn(async () => true),
      authorizeRunProfile: vi.fn(async () => 'authorized' as const),
      fetchCatalog: vi.fn(async () => []),
      probeConnection: vi.fn(),
      probeHealth: vi.fn(),
      verifyLivePath: vi.fn(),
      verifyModelCandidate: vi.fn(),
      verifySecretCandidate: vi.fn(async () => undefined),
    },
    KeyringError,
    keyring: vi.fn(() => ({ keyring: true })),
    storeFactory: vi.fn(),
    write: vi.fn(),
  }
})

vi.mock('@/lib/admin/privileged-audit', () => ({
  recordAdminPrivilegedActionSucceeded: runtimeState.audit,
}))
vi.mock('@/lib/dal/ai-connection-admin', () => ({
  createSqlServerAiAdminStore: runtimeState.storeFactory,
}))
vi.mock('@/lib/ai/admin-external', () => ({
  createProductionAiAdminExternalOperations: runtimeState.createProduction,
}))
vi.mock('@/lib/ai/provider-secret-keyring', () => ({
  AiProviderSecretKeyringError: runtimeState.KeyringError,
  loadAiProviderSecretKeyring: runtimeState.keyring,
}))
vi.mock('@/lib/ai/provider-secret-service', () => ({
  AiProviderSecretService: class {
    readonly beforeCommit: (executor: unknown) => Promise<void>
    readonly verifier: {
      verifyCandidate(context: unknown, plaintext: string): Promise<void>
    }

    constructor(
      _db: unknown,
      _keyring: unknown,
      verifier: {
        verifyCandidate(context: unknown, plaintext: string): Promise<void>
      },
      beforeCommit: (executor: unknown) => Promise<void>,
    ) {
      this.beforeCommit = beforeCommit
      this.verifier = verifier
    }

    async activateCandidate(input: {
      connectionConfigurationVersion: number
      connectionId: string
      connectionRevisionToken: string
      secretVersionId: string
    }) {
      await this.verifier.verifyCandidate(input, 'transient-candidate')
      await this.beforeCommit({ executor: true })
      return runtimeState.activate(input)
    }
  },
  confirmAiProviderSecretRevocation: async (
    _db: unknown,
    input: unknown,
    beforeCommit: (executor: unknown) => Promise<void>,
  ) => {
    await beforeCommit({ executor: true })
    return runtimeState.confirm(input)
  },
  deleteAiProviderSecretCandidate: async (
    _db: unknown,
    input: unknown,
    beforeCommit: (executor: unknown) => Promise<void>,
  ) => {
    await beforeCommit({ executor: true })
    return runtimeState.deleteCandidate(input)
  },
  getAiProviderSecretAvailability: (...args: unknown[]) =>
    runtimeState.availability(...args),
  getAiProviderSecretAvailabilities: (...args: unknown[]) =>
    runtimeState.availabilities(...args),
  writeAiProviderSecretCandidate: async (
    _db: unknown,
    _keyring: unknown,
    input: unknown,
    beforeCommit: (executor: unknown) => Promise<void>,
  ) => {
    await beforeCommit({ executor: true })
    return runtimeState.write(input)
  },
}))

import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

const connectionId = '00000000-0000-4000-8000-000000000001'
const secretVersionId = '00000000-0000-4000-8000-000000000002'

function connection(): AiAdminConnectionDetail {
  return {
    activeSecret: { available: false, reason: 'secret_missing' },
    adapterAvailability: { available: true },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: 'Runtime',
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: null,
    attestationDraft: null,
    authenticationType: 'static_secret',
    blockers: [{ code: 'active_secret_missing' }],
    configurationVersion: 1,
    connectionEvidenceId: null,
    dataPolicySummary: 'No data.',
    description: null,
    egressPolicyKey: 'test',
    endpointUrl: 'https://ai.example.test/v1',
    id: connectionId,
    lifecycleStatus: 'draft',
    maximumConcurrency: 1,
    models: [],
    operationalHealth: 'unknown',
    publicName: 'Runtime',
    revisionToken: '00000000-0000-4000-8000-000000000003',
    tlsPolicyKey: 'test',
  }
}

const metadata = {
  activatedAt: null,
  ciphertextDeletedAt: null,
  connectionId,
  createdAt: '2026-08-19T00:00:00.000Z',
  id: secretVersionId,
  providerRevokedAt: null,
  revisionNumber: 1,
  revisionToken: '00000000-0000-4000-8000-000000000004',
  rootKeyVersion: 'root-1',
  status: 'candidate' as const,
  verifiedAt: null,
}

describe('AI administration runtime composition', () => {
  const db = {
    query: vi.fn(async () => []),
    transaction: vi.fn(),
  } as unknown as SqlServerDatabase
  const context = { actor: { id: 'admin' } } as unknown as RequestContext

  beforeEach(() => {
    vi.clearAllMocks()
    const store = {
      getConnection: vi.fn(async () => connection()),
    } as unknown as AiAdminStore
    runtimeState.storeFactory.mockReturnValue(store)
    runtimeState.createProduction.mockReturnValue(runtimeState.external)
    runtimeState.availability.mockResolvedValue({
      available: true,
      rootKeyVersion: 'root-1',
      secretVersionId,
    })
    runtimeState.availabilities.mockResolvedValue(new Map())
    runtimeState.activate.mockResolvedValue(metadata)
    runtimeState.confirm.mockResolvedValue(metadata)
    runtimeState.deleteCandidate.mockResolvedValue(true)
    runtimeState.write.mockResolvedValue(metadata)
  })

  it('uses production external operations by default and audits secret writes in-transaction', async () => {
    const service = createAiConnectionAdministrationRuntime(db, context)
    await service.writeSecret(connectionId, 'candidate')
    await service.activateSecret({
      connectionConfigurationVersion: 1,
      connectionId,
      connectionRevisionToken: '00000000-0000-4000-8000-000000000003',
      secretVersionId,
    })
    await service.confirmSecretRevocation(connectionId, secretVersionId)
    await service.deleteSecretCandidate(connectionId, secretVersionId)

    expect(runtimeState.createProduction).toHaveBeenCalledWith(
      db,
      expect.any(Function),
    )
    expect(runtimeState.audit).toHaveBeenCalledTimes(4)
    expect(runtimeState.audit).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ resourceId: connectionId }),
      { executor: true },
    )
    expect(runtimeState.external.verifySecretCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      expect.any(Object),
      'transient-candidate',
    )
  })

  it('accepts an injected external adapter and shapes missing keyring as availability', async () => {
    runtimeState.availability.mockRejectedValueOnce(
      new runtimeState.KeyringError('missing'),
    )
    const service = createAiConnectionAdministrationRuntime(db, context, {
      external: runtimeState.external,
    })

    await expect(service.getConnection(connectionId)).resolves.toMatchObject({
      activeSecret: {
        available: false,
        reason: 'root_key_version_missing',
      },
    })
    expect(runtimeState.createProduction).not.toHaveBeenCalled()
  })

  it('rethrows unexpected secret availability failures', async () => {
    runtimeState.availability.mockRejectedValueOnce(new Error('database down'))
    const service = createAiConnectionAdministrationRuntime(db, context, {
      external: runtimeState.external,
    })
    await expect(service.getConnection(connectionId)).rejects.toThrow(
      'database down',
    )
  })

  it('lists the three stable profiles directly from the administration store', async () => {
    const store = {
      listRunProfiles: vi.fn(async () => []),
    } as unknown as AiAdminStore
    runtimeState.storeFactory.mockReturnValue(store)
    const service = createAiConnectionAdministrationRuntime(db, context, {
      external: runtimeState.external,
    })

    await expect(service.listRunProfiles()).resolves.toEqual([])
    expect(store.listRunProfiles).toHaveBeenCalledOnce()
    expect(runtimeState.availabilities).not.toHaveBeenCalled()
  })

  it('rethrows unexpected stable-profile store failures', async () => {
    runtimeState.storeFactory.mockReturnValue({
      listRunProfiles: vi.fn(async () => {
        throw new Error('profile store down')
      }),
    } as unknown as AiAdminStore)
    const service = createAiConnectionAdministrationRuntime(db, context, {
      external: runtimeState.external,
    })
    await expect(service.listRunProfiles()).rejects.toThrow(
      'profile store down',
    )
  })
})
