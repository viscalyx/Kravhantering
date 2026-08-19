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
  getRequestSqlServerDataSource: vi.fn(async () => ({ db: true })),
  listConnections: vi.fn(),
  runtime: vi.fn(),
  writeSecret: vi.fn(),
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

vi.mock('@/lib/ai/admin-runtime', () => ({
  createAiConnectionAdministrationRuntime: routeState.runtime,
}))

vi.mock('@/lib/requirements/actor-responsibility-refresh', () => ({
  scheduleActorResponsibilityPersonRefresh: vi.fn(),
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: vi.fn(),
}))

import {
  GET as getConnections,
  POST as createConnection,
} from '@/app/api/admin/ai-connections/route'
import { POST as connectionAction } from '@/app/api/admin/ai-connections/[connectionId]/actions/route'

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
    routeState.writeSecret.mockResolvedValue({
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
      listConnections: routeState.listConnections,
      writeSecret: routeState.writeSecret,
    })
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
    expect(routeState.writeSecret).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      plaintext,
    )
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
      expect(resolveRestPolicy({ method, url: `https://example.test${path}` }))
        .toMatchObject({
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
