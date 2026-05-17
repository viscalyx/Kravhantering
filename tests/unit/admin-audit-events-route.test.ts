import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createRequestContext: vi.fn(),
  db: { db: true },
  getRequestSqlServerDataSource: vi.fn(),
  listActionAuditEvents: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/audit/action-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/audit/action-audit')>()
  return {
    ...actual,
    listActionAuditEvents: routeState.listActionAuditEvents,
  }
})

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createRequestContext: routeState.createRequestContext,
  }
})

function context(roles: string[] = ['Admin']) {
  return {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: {
      ip: '203.0.113.30',
      method: 'GET',
      path: '/api/admin/audit-events',
      requestId: 'request-1',
    },
    requestId: 'request-1',
    source: 'rest',
  }
}

const auditEvent = {
  action: 'requirement.create',
  actorClientId: null,
  actorDisplayName: 'Ada Admin',
  actorHsaId: 'SE5560000001-admin1',
  actorKind: 'user',
  clientIp: '203.0.113.30',
  correlationId: 'correlation-1',
  decision: 'allowed',
  denialReason: null,
  detailsJson: '{"operation":"create"}',
  id: '1',
  occurredAt: '2026-05-16T09:00:00.000Z',
  requestId: 'request-1',
  targetId: '42',
  targetKind: 'Requirement',
  targetUniqueId: 'AUTH-42',
}

describe('admin audit events route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(context())
    routeState.getRequestSqlServerDataSource.mockResolvedValue(routeState.db)
    routeState.listActionAuditEvents.mockResolvedValue({
      events: [auditEvent],
      pagination: { page: 1, pageSize: 50, total: 1 },
    })
  })

  it('lists audit events for Admin with filters and no-store headers', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?action=requirement.create&actor_hsa_id=SE5560000001-admin1&target_kind=Requirement&target_id=42&decision=allowed&page=2&pageSize=25',
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.listActionAuditEvents).toHaveBeenCalledWith(
      routeState.db,
      expect.objectContaining({
        action: 'requirement.create',
        actorHsaId: 'SE5560000001-admin1',
        clientIp: undefined,
        decision: 'allowed',
        page: 2,
        pageSize: 25,
        targetId: '42',
        targetKind: 'Requirement',
      }),
    )
    expect(await response.json()).toEqual({
      events: [auditEvent],
      pagination: { page: 1, pageSize: 50, total: 1 },
    })
  })

  it('passes a valid client IP filter to the audit list query', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?client_ip=203.0.113.30',
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.listActionAuditEvents).toHaveBeenCalledWith(
      routeState.db,
      expect.objectContaining({
        clientIp: '203.0.113.30',
      }),
    )
  })

  it('rejects an invalid client IP filter', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?client_ip=%3Cscript%3E',
      ) as never,
    )

    expect(response.status).toBe(400)
    expect(routeState.listActionAuditEvents).not.toHaveBeenCalled()
  })

  it('rejects non-admin users before reading audit rows', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(context(['Reviewer']))
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request('http://localhost/api/admin/audit-events') as never,
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.listActionAuditEvents).not.toHaveBeenCalled()
  })

  it('exports filtered audit events as CSV without emitting audit rows', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?format=csv&action=requirement.create',
      ) as never,
    )
    const csv = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(response.headers.get('Content-Disposition')).toContain(
      'action-audit-log.csv',
    )
    expect(csv).toContain('occurredAt;actorKind')
    expect(csv).toContain('requirement.create')
    expect(csv).toContain('203.0.113.30')
    expect(routeState.listActionAuditEvents).toHaveBeenCalledTimes(1)
  })

  it('accepts blank filter fields from the admin form', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?action=&actor_hsa_id=&client_ip=&decision=&target_kind=&target_id=',
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.listActionAuditEvents).toHaveBeenCalledWith(
      routeState.db,
      expect.objectContaining({
        action: undefined,
        actorHsaId: undefined,
        clientIp: undefined,
        decision: undefined,
        targetId: undefined,
        targetKind: undefined,
      }),
    )
  })
})
