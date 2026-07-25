import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import { recordAuthorizationDenied } from '@/lib/requirements/security-audit'

const mocks = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
}))

function context(): RequestContext {
  return {
    actor: {
      displayName: 'Audit Actor',
      hsaId: 'SE5560000001-audit',
      id: 'actor-audit',
      isAuthenticated: true,
      roles: ['Reviewer'],
      source: 'mcp',
    },
    correlationId: 'corr-audit',
    requestId: 'req-audit',
    source: 'mcp',
    toolName: 'requirements_manage_import',
  }
}

describe('requirements security audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue({
      transaction: vi.fn(
        async (
          callback: (manager: { query: ReturnType<typeof vi.fn> }) => unknown,
        ) => callback({ query: vi.fn() }),
      ),
    })
  })

  it('persists required Action log evidence for an authorization denial', async () => {
    const denied = forbiddenError('Blocked by policy', {
      reason: 'policy_missing',
      requiredRoles: ['Admin'],
    })
    const action: RequirementsAction = {
      kind: 'manage_import',
      operation: 'validate',
    }

    await expect(
      recordAuthorizationDenied(context(), action, denied),
    ).resolves.toBeUndefined()

    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'mcp' }),
      expect.objectContaining({
        action: 'manage_import.denied',
        denialReason: 'policy_missing',
        targetKind: 'manage_import',
      }),
    )
  })

  it('fails closed with a redacted diagnostic when denial evidence cannot persist', async () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    try {
      mocks.getRequestSqlServerDataSource.mockRejectedValueOnce(
        new Error('DATABASE_URL password=supersecret must be configured'),
      )
      const denied = forbiddenError('Blocked by policy', {
        reason: 'policy_missing',
        requiredRoles: ['Admin'],
      })
      const action: RequirementsAction = {
        kind: 'manage_import',
        operation: 'validate',
      }

      await expect(
        recordAuthorizationDenied(context(), action, denied),
      ).rejects.toMatchObject({
        code: 'internal',
        message: 'An internal error occurred',
        status: 500,
      })

      expect(mocks.recordDeniedActionAuditEvent).not.toHaveBeenCalled()
      const events = infoSpy.mock.calls.map(
        call => JSON.parse(String(call[0])) as Record<string, unknown>,
      )
      expect(events.map(event => event.event)).toEqual([
        'auth.authorization.denied',
        'auth.authorization.denied.audit_failed',
      ])

      const diagnostic = events.find(
        event => event.event === 'auth.authorization.denied.audit_failed',
      )
      if (!diagnostic) {
        throw new Error('Expected authorization audit failure diagnostic')
      }
      const detail = diagnostic.detail as Record<string, unknown>
      expect(detail).toMatchObject({
        auditFailure: 'denied_action_audit_write_failed',
        auditFailureName: 'Error',
        errorCode: 'forbidden',
        reason: 'policy_missing',
      })
      expect(String(detail.auditFailureMessage)).toContain('DATABASE_URL')
      expect(String(detail.auditFailureMessage)).not.toContain('supersecret')
    } finally {
      infoSpy.mockRestore()
    }
  })
})
