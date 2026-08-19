import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRouteHandlerBrand } from '@/lib/http/response-policy'
import { resolveRestPolicy } from '@/lib/http/route-security-policy'

const routeState = vi.hoisted(() => ({
  context: {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-ai-admin',
    request: {
      method: 'POST',
      path: '/api/admin/ai-connections',
      requestId: 'request-ai-admin',
    },
    requestId: 'request-ai-admin',
    source: 'rest',
  },
  createConnection: vi.fn(),
  createRequestContext: vi.fn(),
  getConnection: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(async () => ({ db: true })),
  listConnections: vi.fn(),
  listRunProfileRevisions: vi.fn(),
  listRunProfiles: vi.fn(),
  logSanitizedError: vi.fn(),
  runtime: vi.fn(),
  serviceMethods: {
    activateRunProfileRevision: vi.fn(),
    activateSecret: vi.fn(),
    confirmSecretRevocation: vi.fn(),
    deleteSecretCandidate: vi.fn(),
    fetchCatalog: vi.fn(),
    probeHealth: vi.fn(),
    retireModelRevision: vi.fn(),
    saveAttestation: vi.fn(),
    saveModelRevision: vi.fn(),
    saveRunProfileRevision: vi.fn(),
    setConnectionLifecycle: vi.fn(),
    setRunProfileOperationalStatus: vi.fn(),
    updateConnection: vi.fn(),
    verifyConnection: vi.fn(),
    verifyModelRevision: vi.fn(),
    writeSecret: vi.fn(),
  },
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => routeState.context),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: routeState.createRequestContext,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/http/safe-errors', () => ({
  logSanitizedError: routeState.logSanitizedError,
}))

vi.mock('@/lib/ai/admin-runtime', () => ({
  createAiConnectionAdministrationRuntime: routeState.runtime,
}))

vi.mock('@/lib/requirements/actor-responsibility-refresh', () => ({
  scheduleActorResponsibilityPersonRefresh: vi.fn(),
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: vi.fn(),
}))

import { POST as connectionAction } from '@/app/api/admin/ai-connections/[connectionId]/actions/route'
import {
  GET as getConnection,
  PATCH as updateConnection,
} from '@/app/api/admin/ai-connections/[connectionId]/route'
import {
  POST as createConnection,
  GET as getConnections,
} from '@/app/api/admin/ai-connections/route'
import { POST as runProfileAction } from '@/app/api/admin/ai-run-profiles/[profileKey]/actions/route'
import {
  GET as getRunProfileRevisions,
  POST as saveRunProfileRevision,
} from '@/app/api/admin/ai-run-profiles/[profileKey]/revisions/route'
import { GET as getRunProfiles } from '@/app/api/admin/ai-run-profiles/route'
import {
  createAiConnectionSchema,
  saveAiModelRevisionSchema,
} from '@/lib/ai/admin-contracts'

const connectionId = '00000000-0000-4000-8000-000000000001'
const revisionToken = '00000000-0000-4000-8000-000000000003'

const connectionInput = {
  adapterKey: 'controlled_test',
  adapterVersion: '1',
  administrationName: 'Controlled test',
  agentRuntimeKey: null,
  agentRuntimeVersion: null,
  authenticationType: 'static_secret',
  dataPolicySummary: 'No personal data.',
  description: null,
  egressPolicyKey: 'test-egress',
  endpointUrl: 'https://ai.example.test/v1',
  maximumConcurrency: 4,
  publicName: 'Test AI',
  tlsPolicyKey: 'public-web-pki',
} as const

describe('Admin AI connection routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const method of Object.values(routeState.serviceMethods)) {
      method.mockResolvedValue({ ok: true })
    }
    routeState.createRequestContext.mockResolvedValue(routeState.context)
    routeState.listConnections.mockResolvedValue([])
    routeState.createConnection.mockResolvedValue({
      ...connectionInput,
      blockers: [
        { code: 'attestation_invalid' },
        { code: 'active_secret_missing' },
      ],
      id: '00000000-0000-4000-8000-000000000001',
      lifecycleStatus: 'draft',
    })
    routeState.serviceMethods.writeSecret.mockResolvedValue({
      activatedAt: null,
      ciphertextDeletedAt: null,
      connectionId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-08-19T12:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000002',
      providerRevokedAt: null,
      revisionNumber: 1,
      revisionToken: '00000000-0000-4000-8000-000000000003',
      rootKeyVersion: 'root-a',
      status: 'candidate',
      verifiedAt: null,
    })
    routeState.runtime.mockReturnValue({
      createConnection: routeState.createConnection,
      getConnection: routeState.getConnection,
      listConnections: routeState.listConnections,
      listRunProfileRevisions: routeState.listRunProfileRevisions,
      listRunProfiles: routeState.listRunProfiles,
      ...routeState.serviceMethods,
    })
    routeState.serviceMethods.deleteSecretCandidate.mockResolvedValue(undefined)
    routeState.listRunProfiles.mockResolvedValue([])
    routeState.listRunProfileRevisions.mockResolvedValue([])
    routeState.getConnection.mockResolvedValue({ id: connectionId })
  })

  it('returns sensitive no-store metadata only to Admin users', async () => {
    const response = await getConnections(
      new NextRequest('https://example.test/api/admin/ai-connections'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.listConnections).toHaveBeenCalledOnce()

    routeState.createRequestContext.mockResolvedValueOnce({
      ...routeState.context,
      actor: { ...routeState.context.actor, roles: ['Reviewer'] },
    })
    const denied = await getConnections(
      new NextRequest('https://example.test/api/admin/ai-connections'),
    )
    expect(denied.status).toBe(403)
    expect(routeState.listConnections).toHaveBeenCalledOnce()
  })

  it('returns a sanitized 500 response for unexpected read failures', async () => {
    routeState.listConnections.mockRejectedValueOnce(
      new Error('database password must not escape'),
    )

    const response = await getConnections(
      new NextRequest('https://example.test/api/admin/ai-connections'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read AI administration metadata.',
    })
    expect(routeState.logSanitizedError).toHaveBeenCalledOnce()
  })

  it('requires paired runtime and existing-model concurrency tokens', () => {
    expect(
      createAiConnectionSchema.safeParse({
        ...connectionInput,
        agentRuntimeKey: 'agent',
      }).success,
    ).toBe(false)
    expect(
      saveAiModelRevisionSchema.safeParse({
        declaredCapabilities: {
          aiAnalysis: false,
          cost: false,
          imageInput: false,
          jsonSchemaSteering: true,
          streaming: true,
          tokenUsage: true,
          validatableJson: true,
        },
        externalModelId: 'controlled/model',
        modelId: connectionId,
        name: 'Model',
      }).success,
    ).toBe(false)
  })

  it('saves a draft without invoking verification or activation', async () => {
    const response = await createConnection(
      new NextRequest('https://example.test/api/admin/ai-connections', {
        body: JSON.stringify(connectionInput),
        headers: {
          origin: 'https://example.test',
          'x-requested-with': 'XMLHttpRequest',
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      blockers: expect.arrayContaining([
        { code: 'attestation_invalid' },
        { code: 'active_secret_missing' },
      ]),
      lifecycleStatus: 'draft',
    })
    expect(routeState.createConnection).toHaveBeenCalledWith(connectionInput)
  })

  it('rejects structurally forbidden endpoints before service work', async () => {
    const response = await createConnection(
      new NextRequest('https://example.test/api/admin/ai-connections', {
        body: JSON.stringify({
          ...connectionInput,
          endpointUrl: 'https://user:pass@ai.example.test/v1?secret=yes',
        }),
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.createConnection).not.toHaveBeenCalled()
  })

  it('writes a provider secret but never echoes its value', async () => {
    const plaintext = 'provider-secret-never-returned'
    const response = await connectionAction(
      new NextRequest(
        'https://example.test/api/admin/ai-connections/00000000-0000-4000-8000-000000000001/actions',
        {
          body: JSON.stringify({ action: 'write_secret', secret: plaintext }),
          method: 'POST',
        },
      ),
      {
        params: Promise.resolve({
          connectionId: '00000000-0000-4000-8000-000000000001',
        }),
      },
    )
    const body = await response.json()
    const serialized = JSON.stringify(body)

    expect(response.status).toBe(201)
    expect(serialized).not.toContain(plaintext)
    expect(body).not.toHaveProperty('ciphertext')
    expect(routeState.serviceMethods.writeSecret).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      plaintext,
    )
  })

  it('dispatches every explicit connection action to its service method', async () => {
    const token = '00000000-0000-4000-8000-000000000003'
    const modelId = '00000000-0000-4000-8000-000000000004'
    const attestation = {
      decisionReference: 'D-1',
      incidentResponseReference: null,
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'Provider',
      purpose: 'Test',
      responsibleOrganizationUnitReference: null,
      reviewDueAt: null,
      reviewedAt: '2026-08-19T00:00:00.000Z',
      revisionToken: token,
      subprocessors: [],
    }
    const modelRevision = {
      declaredCapabilities: {
        aiAnalysis: false,
        cost: false,
        imageInput: false,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
        validatableJson: true,
      },
      description: null,
      discoveredCapabilities: null,
      externalModelId: 'controlled/model',
      externalModelVersion: null,
      modelId: null,
      modelToken: null,
      name: 'Model',
    }
    const cases = [
      ['activateSecret', { action: 'activate_secret', secretVersionId: token }],
      [
        'saveAttestation',
        {
          action: 'attest',
          attestation,
          currentAttestationRevisionToken: null,
        },
      ],
      [
        'confirmSecretRevocation',
        { action: 'confirm_secret_revocation', secretVersionId: token },
      ],
      [
        'deleteSecretCandidate',
        { action: 'delete_secret_candidate', secretVersionId: token },
      ],
      ['fetchCatalog', { action: 'fetch_catalog' }],
      [
        'probeHealth',
        {
          action: 'probe_health',
          modelRevisionId: modelId,
          revisionToken: token,
        },
      ],
      ['saveAttestation', { action: 'save_attestation', attestation }],
      ['saveModelRevision', { action: 'save_model_revision', modelRevision }],
      [
        'retireModelRevision',
        {
          action: 'retire_model_revision',
          modelRevisionId: modelId,
          revisionToken: token,
        },
      ],
      [
        'setConnectionLifecycle',
        { action: 'set_lifecycle', revisionToken: token, status: 'suspended' },
      ],
      ['verifyConnection', { action: 'verify_connection' }],
      [
        'verifyModelRevision',
        {
          action: 'verify_model_revision',
          modelRevisionId: modelId,
          revisionToken: token,
        },
      ],
    ] as const

    for (const [method, body] of cases) {
      const response = await connectionAction(
        new NextRequest(
          `https://example.test/api/admin/ai-connections/${connectionId}/actions`,
          { body: JSON.stringify(body), method: 'POST' },
        ),
        { params: Promise.resolve({ connectionId }) },
      )
      expect([200, 204]).toContain(response.status)
      expect(routeState.serviceMethods[method]).toHaveBeenCalled()
    }
  })

  it('covers detail and run-profile reads, writes, actions, and invalid params', async () => {
    const request = new NextRequest(
      'https://example.test/api/admin/ai-connections',
    )
    expect(
      (
        await getConnection(request, {
          params: Promise.resolve({ connectionId }),
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await getConnection(request, {
          params: Promise.resolve({ connectionId: 'bad' }),
        })
      ).status,
    ).toBe(400)
    expect((await getRunProfiles(request)).status).toBe(200)
    expect(
      (
        await getRunProfileRevisions(request, {
          params: Promise.resolve({ profileKey: 'generation_without_images' }),
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await getRunProfileRevisions(request, {
          params: Promise.resolve({ profileKey: 'bad' }),
        })
      ).status,
    ).toBe(400)

    const update = await updateConnection(
      new NextRequest(
        `https://example.test/api/admin/ai-connections/${connectionId}`,
        {
          body: JSON.stringify({ ...connectionInput, revisionToken }),
          method: 'PATCH',
        },
      ),
      { params: Promise.resolve({ connectionId }) },
    )
    expect(update.status).toBe(200)
    const save = await saveRunProfileRevision(
      new NextRequest(
        'https://example.test/api/admin/ai-run-profiles/generation_without_images/revisions',
        {
          body: JSON.stringify({
            capabilityPolicy: {
              aiAnalysis: 'allowed',
              imageInput: 'disabled',
              jsonSchema: 'required',
              streaming: 'required',
              usageMetadata: 'allowed',
              validatableJson: 'required',
            },
            inactivityTimeBudgetSeconds: 300,
            modelRevisionId: connectionId,
            queueCapacity: 2,
            revisionToken: null,
            totalTimeBudgetSeconds: 600,
          }),
          method: 'POST',
        },
      ),
      { params: Promise.resolve({ profileKey: 'generation_without_images' }) },
    )
    expect(save.status).toBe(200)

    for (const body of [
      { action: 'set_operational_status', revisionToken, status: 'suspended' },
      {
        action: 'activate_revision',
        connectionRevisionToken: revisionToken,
        modelRevisionToken: revisionToken,
        profileRevisionId: connectionId,
        profileRevisionToken: revisionToken,
        profileToken: revisionToken,
      },
    ]) {
      const response = await runProfileAction(
        new NextRequest(
          'https://example.test/api/admin/ai-run-profiles/generation_without_images/actions',
          {
            body: JSON.stringify(body),
            method: 'POST',
          },
        ),
        {
          params: Promise.resolve({ profileKey: 'generation_without_images' }),
        },
      )
      expect(response.status).toBe(200)
    }
  })

  it('declares same-origin CSRF and approved wrappers for all mutations', () => {
    for (const [method, path, handler] of [
      ['POST', '/api/admin/ai-connections', createConnection],
      [
        'POST',
        '/api/admin/ai-connections/00000000-0000-4000-8000-000000000001/actions',
        connectionAction,
      ],
    ] as const) {
      expect(
        resolveRestPolicy({ method, url: `https://example.test${path}` }),
      ).toMatchObject({
        auth: 'session',
        cache: 'no-store',
        contract: 'focused',
        csrf: 'same-origin',
        sensitivity: 'sensitive',
      })
      expect(getRouteHandlerBrand(handler)).toBe('mutation')
    }
  })
})
