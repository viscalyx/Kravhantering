import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionState = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  isSignedIn: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionFromRequest: sessionState.getSessionFromRequest,
  isSignedIn: sessionState.isSignedIn,
}))

import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import type { RequestContext } from '@/lib/requirements/auth'

describe('admin privileged action audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds request context from the signed-in session without query details', async () => {
    const session = {
      accessTokenExpiresAt: 1_900_000_000,
      familyName: 'Admin',
      givenName: 'Ada',
      hsaId: 'SE2321000032-admin1',
      name: 'Ada Admin',
      roles: ['Admin', 'Reviewer'],
      sub: 'admin-sub',
    }
    sessionState.getSessionFromRequest.mockResolvedValueOnce(session)
    sessionState.isSignedIn.mockReturnValueOnce(true)

    const context = await createAdminPrivilegedAuditContext(
      new Request('https://example.test/api/admin/terminology?debug=true', {
        headers: {
          'user-agent': 'vitest',
          'x-request-id': 'request-123',
        },
        method: 'PUT',
      }),
    )

    expect(context.actor).toEqual({
      displayName: 'Ada Admin',
      hsaId: 'SE2321000032-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin', 'Reviewer'],
      source: 'oidc',
    })
    expect(context.request).toEqual({
      method: 'PUT',
      path: '/api/admin/terminology',
      requestId: 'request-123',
      userAgent: 'vitest',
    })
    expect(context.source).toBe('rest')
  })

  it('emits compact security-audit details for successful privileged actions', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const context: RequestContext = {
      actor: {
        displayName: 'Ada Admin',
        hsaId: 'SE2321000032-admin1',
        id: 'admin-sub',
        isAuthenticated: true,
        roles: ['Admin', 'Reviewer', 'PrivacyOfficer'],
        source: 'oidc',
      },
      request: {
        method: 'PUT',
        path: '/api/owners/7',
        requestId: 'request-456',
      },
      correlationId: 'correlation-456',
      requestId: 'request-456',
      source: 'rest',
    }

    try {
      recordAdminPrivilegedActionSucceeded(context, {
        changedFields: ['email', 'hsaId'],
        operation: 'update',
        resourceId: 7,
        resourceType: 'owner',
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
          hsaId: 'SE2321000032-admin1',
          source: 'oidc',
          sub: 'admin-sub',
        },
        channel: 'security-audit',
        event: 'admin.privileged_action.succeeded',
        outcome: 'success',
        request: {
          method: 'PUT',
          path: '/api/owners/7',
          requestId: 'request-456',
        },
      })
      expect(event.detail).toEqual({
        actionKind: 'admin.privileged_action',
        actorRoles: ['Admin', 'Reviewer', 'PrivacyOfficer'],
        changedFields: ['email', 'hsaId'],
        operation: 'update',
        privilegeRoles: ['Admin', 'PrivacyOfficer'],
        privilegeSource: 'idp_role_claim',
        requestSource: 'rest',
        resourceId: 7,
        resourceType: 'owner',
      })
      expect(JSON.stringify(event.detail)).not.toContain('Ada Admin')
      expect(JSON.stringify(event.detail)).not.toContain('SE2321000032-admin1')
    } finally {
      infoSpy.mockRestore()
    }
  })
})
