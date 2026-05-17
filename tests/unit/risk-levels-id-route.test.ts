import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MinimalLinkedRequirement = { id: number; uniqueId: string }

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
      method: 'PUT',
      path: '/api/risk-levels/1',
      requestId: 'request-risk',
    },
    correlationId: 'correlation-risk',
    requestId: 'request-risk',
    source: 'rest',
  })),
  getLinkedRequirements: vi.fn(
    async (): Promise<MinimalLinkedRequirement[]> => [],
  ),
  getRequestSqlServerDataSource: vi.fn(() => ({})),
  getRiskLevelById: vi.fn(),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
  updateRiskLevel: vi.fn(),
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
  getLinkedRequirements: routeState.getLinkedRequirements,
  getRiskLevelById: routeState.getRiskLevelById,
  updateRiskLevel: routeState.updateRiskLevel,
}))

import * as route from '@/app/api/risk-levels/[id]/route'
import { conflictError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('risk-levels/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns risk level detail with linked requirements', async () => {
    routeState.getRiskLevelById.mockResolvedValueOnce({
      color: '#22c55e',
      iconName: 'ArrowDownLeft',
      id: 1,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    })
    routeState.getLinkedRequirements.mockResolvedValueOnce([
      { id: 10, uniqueId: 'REQ-1' },
    ])

    const response = await route.GET(
      new NextRequest('https://example.test/api/risk-levels/1'),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      riskLevel: {
        color: '#22c55e',
        iconName: 'ArrowDownLeft',
        id: 1,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
      linkedRequirements: [{ id: 10, uniqueId: 'REQ-1' }],
    })
  })

  it('PUT rejects non-allowed icon names before opening the DB', async () => {
    const response = await route.PUT(
      new NextRequest('https://example.test/api/risk-levels/1', {
        body: JSON.stringify({ iconName: 'MadeUpIcon' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
      makeParams('1'),
    )

    const body = (await response.json()) as {
      error: string
      issues: Array<{ path: string }>
    }
    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'iconName' })]),
    )
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.updateRiskLevel).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('PUT updates a system risk level', async () => {
    const payload = {
      color: '#22c55e',
      iconName: 'ArrowDownLeft',
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    }
    const updatedRiskLevel = { id: 1, ...payload }
    routeState.updateRiskLevel.mockResolvedValueOnce(updatedRiskLevel)

    const response = await route.PUT(
      new NextRequest('https://example.test/api/risk-levels/1', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(updatedRiskLevel)
    expect(routeState.updateRiskLevel).toHaveBeenCalledWith(
      expect.anything(),
      1,
      payload,
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-risk' }),
      {
        changedFields: ['color', 'iconName', 'nameEn', 'nameSv', 'sortOrder'],
        operation: 'update',
        resourceId: 1,
        resourceType: 'risk_level',
      },
    )
  })

  it('PUT preserves non-system risk level policy errors before auditing', async () => {
    routeState.updateRiskLevel.mockRejectedValueOnce(
      conflictError('Only system risk levels can be edited'),
    )

    const response = await route.PUT(
      new NextRequest('https://example.test/api/risk-levels/99', {
        body: JSON.stringify({ nameEn: 'Custom' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
      makeParams('99'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'conflict',
      error: 'Only system risk levels can be edited',
    })
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('does not expose DELETE handler', () => {
    expect((route as { DELETE?: unknown }).DELETE).toBeUndefined()
  })
})
