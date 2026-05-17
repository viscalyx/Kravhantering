import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE2321000032-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    request: {
      method: 'POST',
      path: '/api/risk-levels',
      requestId: 'request-risk',
    },
    correlationId: 'correlation-risk',
    requestId: 'request-risk',
    source: 'rest',
  })),
  createRiskLevel: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({})),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    routeState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    routeState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/risk-levels', () => ({
  countLinkedRequirements: vi.fn(async () => ({})),
  createRiskLevel: routeState.createRiskLevel,
  listRiskLevels: vi.fn(async () => []),
}))

import { POST } from '@/app/api/risk-levels/route'

async function expectInvalidRequest(
  response: Response,
  path?: string,
): Promise<void> {
  const body = (await response.json()) as {
    error: string
    issues: Array<{ path: string }>
  }
  expect(body.error).toBe('Invalid request')
  expect(body.issues.length).toBeGreaterThan(0)
  if (path) {
    expect(body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path })]),
    )
  }
}

describe('risk-levels route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid JSON before opening the DB', async () => {
    const response = await POST(
      new NextRequest('https://example.test/api/risk-levels', {
        body: '{',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, '$')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.createRiskLevel).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('returns 400 for non-allowed icon names before opening the DB', async () => {
    const response = await POST(
      new NextRequest('https://example.test/api/risk-levels', {
        body: JSON.stringify({
          color: '#dc2626',
          iconName: 'MadeUpIcon',
          nameEn: 'High',
          nameSv: 'Hog',
          sortOrder: 4,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'iconName')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.createRiskLevel).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('returns the created risk level on success', async () => {
    const mockDb = { session: 'db' }
    const payload = {
      color: '#dc2626',
      nameEn: 'High',
      nameSv: 'Hog',
      sortOrder: 4,
    }
    const createdRiskLevel = { id: 7, ...payload }

    routeState.getRequestSqlServerDataSource.mockResolvedValueOnce(mockDb)
    routeState.createRiskLevel.mockResolvedValueOnce(createdRiskLevel)

    const response = await POST(
      new NextRequest('https://example.test/api/risk-levels', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(createdRiskLevel)
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.createRiskLevel).toHaveBeenCalledWith(mockDb, payload)
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-risk' }),
      {
        changedFields: ['color', 'nameEn', 'nameSv', 'sortOrder'],
        operation: 'create',
        resourceId: 7,
        resourceType: 'risk_level',
      },
    )
  })
})
