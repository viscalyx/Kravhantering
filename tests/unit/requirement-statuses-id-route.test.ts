import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdateStatus = vi.fn()
const mockDeleteStatus = vi.fn()
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
  deleteStatus: (...args: unknown[]) => mockDeleteStatus(...args),
}))

import { DELETE, PUT } from '@/app/api/requirement-statuses/[id]/route'
import { conflictError, notFoundError } from '@/lib/requirements/errors'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-statuses/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUT updates status', async () => {
    mockUpdateStatus.mockResolvedValue({ id: 1, nameSv: 'X', nameEn: 'X' })
    const req = new NextRequest('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ nameSv: 'X', nameEn: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      id: number
      nameSv: string
      nameEn: string
    }
    expect(json).toEqual({ id: 1, nameSv: 'X', nameEn: 'X' })
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
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

  it('DELETE deletes status', async () => {
    mockDeleteStatus.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-status-id' }),
      {
        operation: 'delete',
        resourceId: 1,
        resourceType: 'requirement_status',
      },
    )
  })

  it('DELETE returns sanitized error on unexpected failure', async () => {
    mockDeleteStatus.mockRejectedValue(new Error('Cannot delete'))
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('An internal error occurred')
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('DELETE preserves known business errors', async () => {
    mockDeleteStatus.mockRejectedValue(conflictError('Cannot delete'))
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { code: string; error: string }
    expect(json).toEqual({ code: 'conflict', error: 'Cannot delete' })
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('DELETE maps not_found business errors to 404', async () => {
    mockDeleteStatus.mockRejectedValue(notFoundError('Status not found'))
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(404)
    const json = (await res.json()) as { code: string; error: string }
    expect(json).toEqual({ code: 'not_found', error: 'Status not found' })
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('DELETE returns fallback message for non-Error rejection', async () => {
    mockDeleteStatus.mockRejectedValue('unexpected')
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('An internal error occurred')
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
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

    const res = await PUT(req, makeParams('abc'))

    expect(res.status).toBe(400)
    expect(getRequestSqlServerDataSourceMock).not.toHaveBeenCalled()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('DELETE returns 400 for invalid ids before opening the DB', async () => {
    const req = new NextRequest('http://localhost', { method: 'DELETE' })

    const res = await DELETE(req, makeParams('abc'))

    expect(res.status).toBe(400)
    expect(getRequestSqlServerDataSourceMock).not.toHaveBeenCalled()
    expect(mockDeleteStatus).not.toHaveBeenCalled()
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })
})
