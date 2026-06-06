import { describe, expect, it, vi } from 'vitest'
import {
  type ActionAuditEventRow,
  actionAuditEventsToCsv,
  listActionAuditEvents,
  recordActionAuditEvent,
  recordAllowedActionAuditEventWithExecutor,
  recordDeniedActionAuditEvent,
} from '@/lib/audit/action-audit'
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
      { query },
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

  it('maps MCP actors without storing synthetic HSA-IDs', async () => {
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
    const csv = actionAuditEventsToCsv([exportEvent])

    expect(csv).toContain('Client IP')
    expect(csv).toContain('Allowed')
    expect(csv).toContain('203.0.113.23')
  })

  it('exports localized Swedish CSV headers and decisions', () => {
    const csv = actionAuditEventsToCsv(
      [
        exportEvent,
        {
          ...exportEvent,
          decision: 'denied',
          denialReason: 'required_role_missing',
          id: '2',
        },
      ],
      'sv',
    )

    expect(csv).toContain('Tidpunkt;Aktörstyp')
    expect(csv).toContain('Beslut')
    expect(csv).toContain('Tillåten')
    expect(csv).toContain('Nekad')
    expect(csv).toContain('requirement.create')
  })
})
