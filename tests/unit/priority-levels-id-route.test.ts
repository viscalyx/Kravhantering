import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MinimalLinkedRequirement = { id: number; uniqueId: string }

const routeState = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    request: {
      method: 'PUT',
      path: '/api/priority-levels/1',
      requestId: 'request-priority',
    },
    correlationId: 'correlation-priority',
    requestId: 'request-priority',
    source: 'rest',
  })),
  getLinkedRequirements: vi.fn(
    async (): Promise<MinimalLinkedRequirement[]> => [],
  ),
  getRequestSqlServerDataSource: vi.fn(() => ({})),
  getPriorityLevelById: vi.fn(),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
  updatePriorityLevel: vi.fn(),
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

vi.mock('@/lib/dal/priority-levels', () => ({
  getLinkedRequirements: routeState.getLinkedRequirements,
  getPriorityLevelById: routeState.getPriorityLevelById,
  updatePriorityLevel: routeState.updatePriorityLevel,
}))

import * as route from '@/app/api/priority-levels/[id]/route'
import { conflictError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('priority-levels/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns priority level detail with linked requirements', async () => {
    routeState.getPriorityLevelById.mockResolvedValueOnce({
      assessmentCriteriaEn: 'Low assessment',
      assessmentCriteriaSv: 'Låg bedömning',
      code: 'P2',
      color: '#22c55e',
      descriptionEn: 'Low priority',
      descriptionSv: 'Låg prioritet',
      iconName: 'ArrowDownLeft',
      id: 2,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    })
    routeState.getLinkedRequirements.mockResolvedValueOnce([
      { id: 10, uniqueId: 'REQ-1' },
    ])

    const response = await route.GET(
      new NextRequest('https://example.test/api/priority-levels/1'),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      priorityLevel: {
        assessmentCriteriaEn: 'Low assessment',
        assessmentCriteriaSv: 'Låg bedömning',
        code: 'P2',
        color: '#22c55e',
        descriptionEn: 'Low priority',
        descriptionSv: 'Låg prioritet',
        iconName: 'ArrowDownLeft',
        id: 2,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
      linkedRequirements: [{ id: 10, uniqueId: 'REQ-1' }],
    })
  })

  it('PUT rejects non-allowed icon names before opening the DB', async () => {
    const response = await route.PUT(
      new NextRequest('https://example.test/api/priority-levels/1', {
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
    expect(routeState.updatePriorityLevel).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('PUT updates a system priority level', async () => {
    const payload = {
      assessmentCriteriaEn: 'Low assessment',
      assessmentCriteriaSv: 'Låg bedömning',
      color: '#22c55e',
      descriptionEn: 'Low priority',
      descriptionSv: 'Låg prioritet',
      iconName: 'ArrowDownLeft',
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    }
    const updatedPriorityLevel = { id: 1, ...payload }
    routeState.updatePriorityLevel.mockResolvedValueOnce(updatedPriorityLevel)

    const response = await route.PUT(
      new NextRequest('https://example.test/api/priority-levels/1', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(updatedPriorityLevel)
    expect(routeState.updatePriorityLevel).toHaveBeenCalledWith(
      expect.anything(),
      1,
      payload,
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-priority' }),
      {
        changedFields: [
          'assessmentCriteriaEn',
          'assessmentCriteriaSv',
          'color',
          'descriptionEn',
          'descriptionSv',
          'iconName',
          'nameEn',
          'nameSv',
          'sortOrder',
        ],
        operation: 'update',
        resourceId: 1,
        resourceType: 'priority_level',
      },
    )
  })

  it('PUT preserves non-system priority level policy errors before auditing', async () => {
    routeState.updatePriorityLevel.mockRejectedValueOnce(
      conflictError('Only system priority levels can be edited'),
    )

    const response = await route.PUT(
      new NextRequest('https://example.test/api/priority-levels/99', {
        body: JSON.stringify({ nameEn: 'Custom' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
      makeParams('99'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'conflict',
      error: 'Only system priority levels can be edited',
    })
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('does not expose DELETE handler', () => {
    expect((route as { DELETE?: unknown }).DELETE).toBeUndefined()
  })
})
