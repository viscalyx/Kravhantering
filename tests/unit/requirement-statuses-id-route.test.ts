import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdateStatus = vi.fn()
const getRequestSqlServerDataSourceMock = vi.hoisted(() => vi.fn(() => ({})))
const auditState = vi.hoisted(() => ({
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
      path: '/api/requirement-statuses/1',
      requestId: 'request-status-id',
    },
    correlationId: 'correlation-status-id',
    requestId: 'request-status-id',
    source: 'rest',
  })),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    auditState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    auditState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: getRequestSqlServerDataSourceMock,
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
}))

import * as route from '@/app/api/requirement-statuses/[id]/route'
import { conflictError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-statuses/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUT updates a system status', async () => {
    mockUpdateStatus.mockResolvedValue({ id: 1, nameSv: 'X', nameEn: 'X' })
    const req = new NextRequest('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ nameSv: 'X', nameEn: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await route.PUT(req, makeParams('1'))
    const json = (await res.json()) as {
      id: number
      nameSv: string
      nameEn: string
    }

    expect(res.status).toBe(200)
    expect(json).toEqual({ id: 1, nameSv: 'X', nameEn: 'X' })
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 1, {
      nameSv: 'X',
      nameEn: 'X',
    })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-status-id' }),
      {
        changedFields: ['nameEn', 'nameSv'],
        operation: 'update',
        resourceId: 1,
        resourceType: 'requirement_status',
      },
    )
  })

  it('PUT preserves non-system status policy errors before auditing', async () => {
    mockUpdateStatus.mockRejectedValue(
      conflictError('Only system requirement statuses can be edited'),
    )
    const req = new NextRequest('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ nameSv: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await route.PUT(req, makeParams('99'))
    const json = (await res.json()) as { code: string; error: string }

    expect(res.status).toBe(409)
    expect(json).toEqual({
      code: 'conflict',
      error: 'Only system requirement statuses can be edited',
    })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('PUT rejects empty update payloads before updating or auditing', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await route.PUT(req, makeParams('1'))
    const json = (await res.json()) as {
      error: string
      issues: Array<{ message: string }>
    }

    expect(res.status).toBe(400)
    expect(json.error).toBe('Invalid request')
    expect(json.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'At least one field must be provided',
        }),
      ]),
    )
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('PUT returns 400 for invalid ids before opening the DB', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ nameSv: 'X', nameEn: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await route.PUT(req, makeParams('abc'))

    expect(res.status).toBe(400)
    expect(getRequestSqlServerDataSourceMock).not.toHaveBeenCalled()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('does not expose DELETE handler', () => {
    expect((route as { DELETE?: unknown }).DELETE).toBeUndefined()
  })
})
