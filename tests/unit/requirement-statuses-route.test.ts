import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListStatuses = vi.fn()
const mockListTransitions = vi.fn()
const mockCreateStatus = vi.fn()
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
      method: 'POST',
      path: '/api/requirement-statuses',
      requestId: 'request-status',
    },
    requestId: 'request-status',
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
  getRequestSqlServerDataSource: () => ({}),
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  listStatuses: (...args: unknown[]) => mockListStatuses(...args),
  listTransitions: (...args: unknown[]) => mockListTransitions(...args),
  createStatus: (...args: unknown[]) => mockCreateStatus(...args),
}))

import { GET, POST } from '@/app/api/requirement-statuses/route'

describe('requirement-statuses route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns statuses and transitions', async () => {
    mockListStatuses.mockResolvedValue([{ id: 1 }])
    mockListTransitions.mockResolvedValue([])
    const res = await GET()
    const json = (await res.json()) as {
      statuses: { id: number }[]
      transitions: unknown[]
    }
    expect(json.statuses).toHaveLength(1)
    expect(json.transitions).toEqual([])
  })

  it('POST creates status with 201', async () => {
    mockCreateStatus.mockResolvedValue({
      id: 2,
      nameSv: 'Ny',
      nameEn: 'New',
    })
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        color: '#22c55e',
        nameEn: 'New',
        nameSv: 'Ny',
        sortOrder: 1,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = (await res.json()) as {
      id: number
      nameSv: string
      nameEn: string
    }
    expect(json).toEqual({ id: 2, nameSv: 'Ny', nameEn: 'New' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-status' }),
      {
        changedFields: ['color', 'nameEn', 'nameSv', 'sortOrder'],
        operation: 'create',
        resourceId: 2,
        resourceType: 'requirement_status',
      },
    )
  })
})
