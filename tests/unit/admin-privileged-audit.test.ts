import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionState = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  isSignedIn: vi.fn(),
}))

const auditState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  query: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionFromRequest: sessionState.getSessionFromRequest,
  isSignedIn: sessionState.isSignedIn,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: auditState.getRequestSqlServerDataSource,
}))

import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import type { RequestContext } from '@/lib/requirements/auth'

describe('admin privileged action audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditState.getRequestSqlServerDataSource.mockResolvedValue({
      query: auditState.query,
    })
    auditState.query.mockResolvedValue([])
  })

  it('builds request context from the signed-in session without query details', async () => {
    const session = {
      accessTokenExpiresAt: 1_900_000_000,
      familyName: 'Admin',
      givenName: 'Ada',
      hsaId: 'SE5560000001-admin1',
      name: 'Ada Admin',
      roles: ['Admin', 'Reviewer'],
      sub: 'admin-sub',
    }
    sessionState.getSessionFromRequest.mockResolvedValueOnce(session)
    sessionState.isSignedIn.mockReturnValueOnce(true)

    const context = await createAdminPrivilegedAuditContext(
      new Request(
        'https://example.test/api/admin/requirement-columns?debug=true',
        {
          headers: {
            origin: 'http://localhost:3000',
            'user-agent': 'vitest',
            'x-forwarded-for': '203.0.113.10',
            'x-requested-with': 'XMLHttpRequest',
            'x-request-id': 'request-123',
          },
          method: 'PUT',
        },
      ),
    )

    expect(context.actor).toEqual({
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin', 'Reviewer'],
      source: 'oidc',
    })
    expect(context.request).toEqual({
      method: 'PUT',
      path: '/api/admin/requirement-columns',
      ip: '203.0.113.10',
      requestId: 'request-123',
      userAgent: 'vitest',
    })
    expect(context.source).toBe('rest')
  })

  it('emits compact security-audit details for successful privileged actions', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const context: RequestContext = {
      actor: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        id: 'admin-sub',
        isAuthenticated: true,
        roles: ['Admin', 'Reviewer', 'PrivacyOfficer'],
        source: 'oidc',
      },
      request: {
        method: 'PUT',
        path: '/api/requirement-areas/7',
        requestId: 'request-456',
      },
      correlationId: 'correlation-456',
      requestId: 'request-456',
      source: 'rest',
    }

    try {
      await recordAdminPrivilegedActionSucceeded(context, {
        changedFields: ['ownerHsaId'],
        operation: 'update',
        resourceId: 7,
        resourceType: 'requirement_area',
      })

      const event = JSON.parse(String(infoSpy.mock.calls[0][0])) as {
        actor: Record<string, unknown>
        channel: string
        detail: Record<string, unknown>
        event: string
        outcome: string
        request: Record<string, unknown>
      }
      expect(event).toMatchObject({
        actor: {
          hsaId: 'SE5560000001-admin1',
          source: 'oidc',
          sub: 'admin-sub',
        },
        channel: 'security-audit',
        event: 'admin.privileged_action.succeeded',
        outcome: 'success',
        request: {
          method: 'PUT',
          path: '/api/requirement-areas/7',
          requestId: 'request-456',
        },
      })
      expect(event.detail).toEqual({
        actionKind: 'admin.privileged_action',
        actorRoles: ['Admin', 'Reviewer', 'PrivacyOfficer'],
        changedFields: ['ownerHsaId'],
        operation: 'update',
        privilegeRoles: ['Admin', 'PrivacyOfficer'],
        privilegeSource: 'idp_role_claim',
        requestSource: 'rest',
        resourceId: 7,
        resourceType: 'requirement_area',
      })
      expect(JSON.stringify(event.detail)).not.toContain('Ada Admin')
      expect(JSON.stringify(event.detail)).not.toContain('SE5560000001-admin1')
      expect(auditState.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO action_audit_events'),
        expect.arrayContaining([
          'SE5560000001-admin1',
          'Ada Admin',
          'user',
          null,
          'admin.requirement_area.update',
          'requirement_area',
          '7',
          null,
          'allowed',
        ]),
      )
    } finally {
      infoSpy.mockRestore()
    }
  })
})
