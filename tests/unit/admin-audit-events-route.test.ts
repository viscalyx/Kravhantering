import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createRequestContext: vi.fn(),
  db: { db: true },
  getRequestSqlServerDataSource: vi.fn(),
  listActionAuditEvents: vi.fn(),
  runBoundedCsvOutput: vi.fn(),
  traverseActionAuditEventsForCsv: vi.fn(),
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
    traverseActionAuditEventsForCsv: routeState.traverseActionAuditEventsForCsv,
  }
})

vi.mock('@/lib/generated-output/csv-runner', () => ({
  runBoundedCsvOutput: routeState.runBoundedCsvOutput,
}))

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

async function responseTextWithBom(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
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
    routeState.traverseActionAuditEventsForCsv.mockImplementation(
      async (_db, _filters, options) => {
        await options.writeRow(
          options.locale === 'sv'
            ? '2026-05-16T09:00:00.000Z;user;SE5560000001-admin1;Ada Admin;;requirement.create;Requirement;42;AUTH-42;Tillåten;;;correlation-1;203.0.113.30;'
            : '2026-05-16T09:00:00.000Z;user;SE5560000001-admin1;Ada Admin;;requirement.create;Requirement;42;AUTH-42;Allowed;;;correlation-1;203.0.113.30;',
        )
      },
    )
    routeState.runBoundedCsvOutput.mockImplementation(async options => {
      const rows: string[] = []
      await options.generateRows({
        maxItems: 1000,
        signal: new AbortController().signal,
        writeRow: async (row: string) => {
          rows.push(row)
        },
      })
      return new Response(
        `\uFEFF${options.headers.join(';')}\r\n${rows.join('\r\n')}`,
        { headers: options.responseHeaders },
      )
    })
  })

  it('lists action-log events for Admin with filters and no-store headers', async () => {
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

  it('rejects non-admin users before reading action-log rows', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(context(['Reviewer']))
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request('http://localhost/api/admin/audit-events') as never,
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.listActionAuditEvents).not.toHaveBeenCalled()
  })

  it('exports filtered action-log events as English CSV by default without emitting action-log rows', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?format=csv&action=requirement.create',
      ) as never,
    )
    const csv = await responseTextWithBom(response)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(response.headers.get('Content-Disposition')).toContain(
      'action-log.csv',
    )
    expect(csv).toContain('Occurred;Actor type')
    expect(csv).toContain('Allowed')
    expect(csv).toContain('requirement.create')
    expect(csv).toContain('203.0.113.30')
    expect(routeState.listActionAuditEvents).not.toHaveBeenCalled()
    expect(routeState.runBoundedCsvOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ requestId: 'request-1' }),
        db: routeState.db,
        operation: 'admin.action_log_csv_export',
        requestSignal: expect.any(AbortSignal),
      }),
    )
    expect(routeState.traverseActionAuditEventsForCsv).toHaveBeenCalledWith(
      routeState.db,
      expect.objectContaining({ action: 'requirement.create' }),
      expect.objectContaining({ locale: 'en', maxItems: 1000 }),
    )
  })

  it('exports filtered action-log events as Swedish CSV when locale=sv', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?format=csv&locale=sv&action=requirement.create',
      ) as never,
    )
    const csv = await responseTextWithBom(response)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(response.headers.get('Content-Disposition')).toContain(
      'atgardslogg.csv',
    )
    expect(csv).toContain('Tidpunkt;Aktörstyp')
    expect(csv).toContain('Tillåten')
    expect(csv).toContain('requirement.create')
    expect(csv).toContain('203.0.113.30')
  })

  it('accepts but ignores interactive pagination for CSV', async () => {
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?format=csv&page=9&pageSize=1',
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.listActionAuditEvents).not.toHaveBeenCalled()
    expect(routeState.traverseActionAuditEventsForCsv).toHaveBeenCalledWith(
      routeState.db,
      expect.not.objectContaining({ page: expect.anything() }),
      expect.any(Object),
    )
  })

  it('returns capacity failures without partial download headers', async () => {
    routeState.runBoundedCsvOutput.mockResolvedValueOnce(
      Response.json(
        {
          code: 'output_limit_exceeded',
          details: { limit: 2, limitKind: 'items', output: 'csv' },
          error: 'Output exceeds its configured limit.',
        },
        { status: 422 },
      ),
    )
    const { GET } = await import('@/app/api/admin/audit-events/route')
    const response = await GET(
      new Request(
        'http://localhost/api/admin/audit-events?format=csv',
      ) as never,
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(response.headers.get('Content-Type')).toContain('application/json')
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
