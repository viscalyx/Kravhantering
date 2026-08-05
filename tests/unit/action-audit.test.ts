import { describe, expect, it, vi } from 'vitest'
import {
  type ActionAuditEventRow,
  actionAuditActorFromContext,
  actionAuditCsvHeaders,
  actionAuditEventToCsvRow,
  assertAdminForActionAudit,
  listActionAuditEvents,
  recordActionAuditEvent,
  recordAllowedActionAuditEventWithExecutor,
  recordDeniedActionAuditEvent,
  traverseActionAuditEventsForCsv,
} from '@/lib/audit/action-audit'
import { createCsvItemLimitError } from '@/lib/generated-output/csv-runner'
import type { RequestContext } from '@/lib/requirements/auth'

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: {
      ip: '203.0.113.20',
      method: 'POST',
      path: '/api/test',
      requestId: 'request-1',
    },
    requestId: 'request-1',
    source: 'rest',
    ...overrides,
  }
}

describe('action audit helper', () => {
  it('records bounded allowed rows and strips unsafe details', async () => {
    const query = vi.fn().mockResolvedValue([])

    await recordActionAuditEvent(
      { query } as unknown as Parameters<typeof recordActionAuditEvent>[0],
      {
        action: 'requirement.create',
        actorDisplayName: 'Ada Admin',
        actorHsaId: 'SE5560000001-admin1',
        actorKind: 'user',
        clientIp: '203.0.113.21',
        decision: 'allowed',
        details: {
          assignee: 'ada@example.test',
          count: 2,
          description: 'must not be stored',
          externalReference: '1234567890',
          operation: 'create',
          prompt: 'must not be stored',
          route: '/api/requirements',
          reviewers: ['ok', 'SE5560000001-reviewer1'],
          targetHsaId: 'SE5560000001-target1',
          opaque: 'token=abcdef1234567890abcdef1234567890',
        },
        occurredAt: new Date('2026-05-16T09:00:00Z'),
        requestId: 'request-1',
        targetId: 42,
        targetKind: 'Requirement',
        targetUniqueId: 'AUTH-42',
      },
    )

    const [, params] = query.mock.calls[0]
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO action_audit_events'),
      expect.any(Array),
    )
    expect(params).toEqual(
      expect.arrayContaining([
        'SE5560000001-admin1',
        'Ada Admin',
        'user',
        'requirement.create',
        'Requirement',
        '42',
        'AUTH-42',
        'allowed',
        'request-1',
        '203.0.113.21',
      ]),
    )
    const details = JSON.parse(String(params[14])) as Record<string, unknown>
    expect(details).toEqual({
      count: 2,
      assignee: '[REDACTED]',
      externalReference: '[REDACTED]',
      operation: 'create',
      route: '/api/requirements',
      reviewers: ['ok', '[REDACTED]'],
      opaque: '[REDACTED]',
    })
    expect(JSON.stringify(details)).not.toContain('target1')
    expect(JSON.stringify(details)).not.toContain('must not be stored')
  })

  it('maps MCP actors without storing synthetic HSA-id values', async () => {
    const query = vi.fn().mockResolvedValue([])

    await recordAllowedActionAuditEventWithExecutor(
      { query },
      context({
        actor: {
          displayName: 'Requirements MCP',
          hsaId: 'mcp-requirements',
          id: 'requirements-mcp',
          isAuthenticated: true,
          roles: [],
          source: 'mcp',
        },
        source: 'mcp',
        toolName: 'kravhantering',
      }),
      {
        action: 'requirement.transition',
        targetId: 7,
        targetKind: 'Requirement',
      },
    )

    const [, params] = query.mock.calls[0]
    expect(params).toEqual(
      expect.arrayContaining([
        null,
        'Requirements MCP',
        'mcp_client',
        'requirements-mcp',
        'requirement.transition',
        'allowed',
        '203.0.113.20',
      ]),
    )
  })

  it('records denials in a short transaction and fails closed on audit errors', async () => {
    const query = vi.fn().mockRejectedValue(new Error('audit write failed'))
    const transaction = vi.fn(
      async (
        callback: (manager: { query: typeof query }) => Promise<unknown>,
      ) => callback({ query }),
    )
    const db = { transaction } as never

    await expect(
      recordDeniedActionAuditEvent(db, context(), {
        action: 'admin.authorization.denied',
        denialReason: 'required_role_missing',
        targetKind: 'admin',
      }),
    ).rejects.toThrow('audit write failed')

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO action_audit_events'),
      expect.arrayContaining([
        'admin.authorization.denied',
        'admin',
        'denied',
        'required_role_missing',
        '203.0.113.20',
      ]),
    )
  })

  it('filters rows by client IP', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            action: 'requirement.create',
            actorClientId: null,
            actorDisplayName: 'Ada Admin',
            actorHsaId: 'SE5560000001-admin1',
            actorKind: 'user',
            clientIp: '203.0.113.22',
            correlationId: 'correlation-1',
            decision: 'allowed',
            denialReason: null,
            detailsJson: null,
            id: '1',
            occurredAt: new Date('2026-05-16T09:00:00Z'),
            requestId: 'request-1',
            targetId: '42',
            targetKind: 'Requirement',
            targetUniqueId: 'AUTH-42',
          },
        ]),
    }

    const result = await listActionAuditEvents(db as never, {
      clientIp: '203.0.113.22',
    })

    expect(db.query.mock.calls[0]?.[0]).toContain('client_ip = @0')
    expect(result.events[0]?.clientIp).toBe('203.0.113.22')
  })

  const exportEvent: ActionAuditEventRow = {
    action: 'requirement.create',
    actorClientId: null,
    actorDisplayName: 'Ada Admin',
    actorHsaId: 'SE5560000001-admin1',
    actorKind: 'user',
    clientIp: '203.0.113.23',
    correlationId: 'correlation-1',
    decision: 'allowed' as const,
    denialReason: null,
    detailsJson: null,
    id: '1',
    occurredAt: '2026-05-16T09:00:00.000Z',
    requestId: 'request-1',
    targetId: '42',
    targetKind: 'Requirement',
    targetUniqueId: 'AUTH-42',
  }

  it('exports client IP and localized decisions to default English CSV', () => {
    const headers = actionAuditCsvHeaders()
    const row = actionAuditEventToCsvRow(exportEvent)

    expect(headers).toContain('Client IP')
    expect(row).toContain('Allowed')
    expect(row).toContain('203.0.113.23')
  })

  it('exports localized Swedish CSV headers and decisions', () => {
    const headers = actionAuditCsvHeaders('sv').join(';')
    const rows = [
      actionAuditEventToCsvRow(exportEvent, 'sv'),
      actionAuditEventToCsvRow(
        {
          ...exportEvent,
          decision: 'denied',
          denialReason: 'required_role_missing',
          id: '2',
        },
        'sv',
      ),
    ].join('\r\n')

    expect(headers).toContain('Tidpunkt;Aktörstyp')
    expect(headers).toContain('Beslut')
    expect(rows).toContain('Tillåten')
    expect(rows).toContain('Nekad')
    expect(rows).toContain('requirement.create')
  })

  it('traverses more than 200 filtered rows in stable equal-time ID order', async () => {
    const occurredAt = new Date('2026-05-16T09:00:00Z')
    const rows = Array.from({ length: 301 }, (_, index) => ({
      ...exportEvent,
      action: 'requirement.create',
      actorHsaId: 'SE5560000001-admin1',
      clientIp: '203.0.113.23',
      decision: 'allowed',
      id: String(301 - index),
      occurredAt,
      targetId: '42',
      targetKind: 'Requirement',
    }))
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ anchorId: '301' }])
      .mockResolvedValueOnce(rows.slice(0, 200))
      .mockResolvedValueOnce(rows.slice(200))
    const serializedRows: string[] = []

    await traverseActionAuditEventsForCsv(
      { query } as never,
      {
        action: 'requirement.create',
        actorHsaId: 'SE5560000001-admin1',
        clientIp: '203.0.113.23',
        decision: 'allowed',
        from: new Date('2026-05-01T00:00:00Z'),
        targetId: '42',
        targetKind: 'Requirement',
        to: new Date('2026-05-31T23:59:59Z'),
      },
      {
        locale: 'sv',
        maxItems: 500,
        signal: new AbortController().signal,
        writeRow: async row => {
          serializedRows.push(row)
        },
      },
    )

    expect(serializedRows).toHaveLength(301)
    expect(serializedRows[0]).toContain('Tillåten')
    expect(query).toHaveBeenCalledTimes(3)
    expect(query.mock.calls[1]?.[0]).toContain('TOP (@9)')
    expect(query.mock.calls[1]?.[0]).toContain('id <= @8')
    expect(query.mock.calls[1]?.[0]).toContain(
      'ORDER BY occurred_at DESC, id DESC',
    )
    expect(query.mock.calls[2]?.[0]).toContain('occurred_at < @9')
    expect(query.mock.calls[2]?.[0]).toContain('id < @10')
    expect(query.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        'SE5560000001-admin1',
        '203.0.113.23',
        'requirement.create',
        'Requirement',
        '42',
        'allowed',
        expect.any(Date),
        expect.any(Date),
        '301',
        200,
      ]),
    )
  })

  it('allows the exact row limit and probes only one extra row', async () => {
    const rows = ['2', '1'].map(id => ({
      ...exportEvent,
      id,
      occurredAt: new Date('2026-05-16T09:00:00Z'),
    }))
    const exactQuery = vi
      .fn()
      .mockResolvedValueOnce([{ anchorId: '2' }])
      .mockResolvedValueOnce(rows)
    const exactRows: string[] = []

    await traverseActionAuditEventsForCsv(
      { query: exactQuery } as never,
      {},
      {
        maxItems: 2,
        signal: new AbortController().signal,
        writeRow: async row => {
          exactRows.push(row)
        },
      },
    )

    expect(exactRows).toHaveLength(2)
    expect(exactQuery.mock.calls[1]?.[1]).toContain(3)

    const tooManyQuery = vi
      .fn()
      .mockResolvedValueOnce([{ anchorId: '3' }])
      .mockResolvedValueOnce([
        { ...rows[0], id: '3' },
        { ...rows[0], id: '2' },
        { ...rows[0], id: '1' },
      ])
    let count = 0
    await expect(
      traverseActionAuditEventsForCsv(
        { query: tooManyQuery } as never,
        {},
        {
          maxItems: 2,
          signal: new AbortController().signal,
          writeRow: async () => {
            if (count >= 2) throw createCsvItemLimitError(2)
            count += 1
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 2, limitKind: 'items', output: 'csv' },
    })
  })

  it('stops on cancellation and rejects duplicate or non-progressing pages', async () => {
    const cancelled = new AbortController()
    cancelled.abort()
    const cancelledQuery = vi.fn()
    await expect(
      traverseActionAuditEventsForCsv(
        { query: cancelledQuery } as never,
        {},
        {
          maxItems: 10,
          signal: cancelled.signal,
          writeRow: vi.fn(),
        },
      ),
    ).rejects.toThrow()
    expect(cancelledQuery).not.toHaveBeenCalled()

    const duplicateQuery = vi
      .fn()
      .mockResolvedValueOnce([{ anchorId: '3' }])
      .mockResolvedValueOnce([
        {
          ...exportEvent,
          id: '2',
          occurredAt: new Date('2026-05-16T09:00:00Z'),
        },
        {
          ...exportEvent,
          id: '2',
          occurredAt: new Date('2026-05-16T08:00:00Z'),
        },
      ])
    await expect(
      traverseActionAuditEventsForCsv(
        { query: duplicateQuery } as never,
        {},
        {
          maxItems: 10,
          signal: new AbortController().signal,
          writeRow: vi.fn(),
        },
      ),
    ).rejects.toThrow('duplicate ID')

    const stalledQuery = vi
      .fn()
      .mockResolvedValueOnce([{ anchorId: '3' }])
      .mockResolvedValueOnce([
        {
          ...exportEvent,
          id: '2',
          occurredAt: new Date('2026-05-16T09:00:00Z'),
        },
        {
          ...exportEvent,
          id: '3',
          occurredAt: new Date('2026-05-16T09:00:00Z'),
        },
      ])
    await expect(
      traverseActionAuditEventsForCsv(
        { query: stalledQuery } as never,
        {},
        {
          maxItems: 10,
          signal: new AbortController().signal,
          writeRow: vi.fn(),
        },
      ),
    ).rejects.toThrow('did not make progress')
  })

  it('covers actor fallbacks, admin gates, and bounded empty values', async () => {
    expect(
      actionAuditActorFromContext(
        context({
          actor: {
            displayName: '',
            hsaId: '',
            id: null,
            isAuthenticated: false,
            roles: [],
            source: 'oidc',
          },
        }),
      ),
    ).toEqual({
      actorClientId: null,
      actorDisplayName: null,
      actorHsaId: '',
      actorKind: 'system',
    })
    expect(
      actionAuditActorFromContext(
        context({
          actor: {
            displayName: '',
            hsaId: null,
            id: null,
            isAuthenticated: true,
            roles: [],
            source: 'mcp',
          },
          source: 'mcp',
          toolName: 'tool-name',
        }),
      ),
    ).toMatchObject({ actorClientId: 'tool-name', actorHsaId: null })

    expect(() => assertAdminForActionAudit(context())).not.toThrow()
    expect(() =>
      assertAdminForActionAudit(
        context({ actor: { ...context().actor, isAuthenticated: false } }),
      ),
    ).toThrow()
    expect(() =>
      assertAdminForActionAudit(
        context({ actor: { ...context().actor, roles: [] } }),
      ),
    ).toThrow()

    const query = vi.fn(async () => [])
    await recordActionAuditEvent(
      { query } as unknown as Parameters<typeof recordActionAuditEvent>[0],
      {
        action: ' edge.action ',
        actorKind: 'system',
        decision: 'allowed',
        denialReason: ' ',
        details: Object.fromEntries(
          Array.from({ length: 35 }, (_, index) => [
            `safe${index}`,
            index === 0 ? ['ok', 1, true] : `value-${index}`,
          ]),
        ) as never,
        targetId: ' ',
        targetKind: ' edge ',
      },
    )
    expect(query).toHaveBeenCalled()
  })

  it('applies every list filter, bounds pagination, and maps sparse rows', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 1,
            occurredAt: '2026-08-04T12:00:00.000Z',
          },
        ]),
    }
    const result = await listActionAuditEvents(db as never, {
      action: 'requirement.create',
      actorHsaId: 'SE5560000001-admin1',
      clientIp: '203.0.113.1',
      decision: 'denied',
      from: new Date('2026-01-01T00:00:00.000Z'),
      page: Number.NaN,
      pageSize: 999,
      targetId: '1',
      targetKind: 'Requirement',
      to: new Date('2026-12-31T00:00:00.000Z'),
    })
    expect(String(db.query.mock.calls[0]?.[0])).toContain('actor_hsa_id')
    expect(result.pagination).toEqual({ page: 1, pageSize: 200, total: 0 })
    expect(result.events[0]).toMatchObject({
      action: '',
      actorKind: 'system',
      decision: 'allowed',
      targetKind: '',
    })
  })
})
