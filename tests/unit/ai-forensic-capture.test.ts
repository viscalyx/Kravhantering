import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAiForensicCaptureRequest,
  listAiForensicCaptureMetadata,
  readStoppedAiForensicCaptureEvidence,
  transitionAiForensicCapture,
} from '@/lib/ai/forensic-capture'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

const auditState = vi.hoisted(() => ({ recordSecurityEvent: vi.fn() }))

vi.mock('@/lib/auth/audit', () => ({
  recordSecurityEvent: auditState.recordSecurityEvent,
}))

const context = {
  actor: {
    displayName: 'Ada Admin',
    hsaId: 'SE5560000001-admin1',
    id: 'admin-sub',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  },
  request: {
    method: 'POST',
    path: '/api/admin/ai-forensic-captures',
    requestId: 'capture-request',
  },
  requestId: 'capture-request',
  source: 'rest',
} as RequestContext

function database(rows: unknown[]) {
  const manager = { query: vi.fn().mockResolvedValue(rows) }
  const transaction = vi.fn(
    async (
      isolationOrCallback:
        | string
        | ((transactionManager: typeof manager) => unknown),
      callback?: (transactionManager: typeof manager) => unknown,
    ) =>
      typeof isolationOrCallback === 'function'
        ? isolationOrCallback(manager)
        : callback?.(manager),
  )
  return {
    db: { transaction } as unknown as SqlServerDatabase,
    manager,
    transaction,
  }
}

describe('AI forensic capture control', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates one bounded request using SQL Server time and a serializable slot', async () => {
    const { db, manager, transaction } = database([
      {
        direction: 'output',
        expiresAt: new Date('2026-08-15T14:00:00.000Z'),
        id: 47,
        operation: 'ai.generate-requirement-import',
        status: 'pending_approval',
      },
    ])

    await expect(
      createAiForensicCaptureRequest(db, context, {
        direction: 'output',
        expiresAt: '2026-08-15T14:00:00.000Z',
        operation: 'ai.generate-requirement-import',
      }),
    ).resolves.toMatchObject({ id: 47, status: 'pending_approval' })

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
      'ai.generate-requirement-import',
      'output',
      '2026-08-15T14:00:00.000Z',
      'SE5560000001-admin1',
      'Ada Admin',
    ])
    expect(auditState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ captureWindowId: 47 }),
        event: 'ai.forensic_capture.requested',
      }),
    )
  })

  it('rejects an expiry outside the SQL Server five-to-sixty-minute window', async () => {
    const { db } = database([
      {
        direction: 'output',
        expiresAt: '2026-08-15T15:30:00.000Z',
        id: -1,
        operation: 'ai.generate-requirement-import',
        status: 'pending_approval',
      },
    ])

    await expect(
      createAiForensicCaptureRequest(db, context, {
        direction: 'output',
        expiresAt: '2026-08-15T15:30:00.000Z',
        operation: 'ai.generate-requirement-import',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(auditState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('fails approval closed with a conflict when the update matches no row', async () => {
    const privacyContext = {
      ...context,
      actor: { ...context.actor, roles: ['PrivacyOfficer'] },
    } as RequestContext
    const { db, manager } = database([])

    await expect(
      transitionAiForensicCapture(db, privacyContext, {
        action: 'approve',
        captureWindowId: 47,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
      47,
      'SE5560000001-admin1',
      'Ada Admin',
    ])
    expect(auditState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('purges earlier stopped evidence in the same transaction as a new approval', async () => {
    const privacyContext = {
      ...context,
      actor: {
        ...context.actor,
        displayName: 'Disa Privacy Officer',
        hsaId: 'SE5560000001-privacy1',
        roles: ['PrivacyOfficer'],
      },
    } as RequestContext
    const { db, manager, transaction } = database([])
    manager.query
      .mockResolvedValueOnce([
        {
          direction: 'output',
          expiresAt: '2026-08-15T14:00:00.000Z',
          id: 48,
          operation: 'ai.generate-requirement-import',
          status: 'active',
        },
      ])
      .mockResolvedValueOnce([
        {
          direction: 'input',
          expiresAt: '2026-08-15T13:00:00.000Z',
          id: 47,
          operation: 'ai.repair-requirement-import-json',
          status: 'purged',
        },
      ])

    await expect(
      transitionAiForensicCapture(db, privacyContext, {
        action: 'approve',
        captureWindowId: 48,
      }),
    ).resolves.toMatchObject({ id: 48, status: 'active' })

    expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(manager.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      48,
      'SE5560000001-privacy1',
      'Disa Privacy Officer',
    ])
    expect(auditState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          action: 'activation_replacement',
          captureWindowId: 47,
        }),
        event: 'ai.forensic_evidence.purged',
      }),
    )
  })

  it('purges evidence and lifecycle metadata atomically', async () => {
    const privacyContext = {
      ...context,
      actor: {
        ...context.actor,
        displayName: 'Disa Privacy Officer',
        hsaId: 'SE5560000001-privacy1',
        roles: ['PrivacyOfficer'],
      },
    } as RequestContext
    const { db, manager, transaction } = database([])
    manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        direction: 'output',
        expiresAt: '2026-08-15T14:00:00.000Z',
        id: 47,
        operation: 'ai.generate-requirement-import',
        status: 'purged',
      },
    ])

    await expect(
      transitionAiForensicCapture(db, privacyContext, {
        action: 'purge',
        captureWindowId: 47,
      }),
    ).resolves.toMatchObject({ id: 47, status: 'purged' })

    expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(manager.query).toHaveBeenNthCalledWith(1, expect.any(String), [47])
    expect(manager.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      47,
      'SE5560000001-privacy1',
      'Disa Privacy Officer',
    ])
  })

  it('returns stopped evidence only when the actor is requester or approver', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        blockedStep: 'provider_output',
        capturedAt: '2026-08-15T13:50:00.000Z',
        direction: 'output',
        evidenceJson: '[{"excerpt":"[REDACTED_IDENTIFIER]"}]',
        eventId: '2af7d96a-1552-42dc-9ab0-52990574bcc8',
        expiresAt: '2026-08-15T14:00:00.000Z',
        id: 47,
        operation: 'ai.generate-requirement-import',
        primaryRuleId: 'instruction_override',
        ruleIdsJson: '["instruction_override"]',
        status: 'stopped',
      },
    ])
    const db = { query } as unknown as SqlServerDatabase

    await expect(
      readStoppedAiForensicCaptureEvidence(db, context, 47),
    ).resolves.toMatchObject({
      capture: { id: 47, status: 'stopped' },
      events: [
        {
          evidence: [{ excerpt: '[REDACTED_IDENTIFIER]' }],
          ruleIds: ['instruction_override'],
        },
      ],
    })
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      47,
      'SE5560000001-admin1',
    ])
    expect(auditState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.forensic_evidence.accessed' }),
    )
  })

  it('denies a capture party whose current role cannot read evidence', async () => {
    const query = vi.fn()
    const partyWithoutRoleContext = {
      ...context,
      actor: { ...context.actor, roles: [] },
    } as RequestContext

    await expect(
      readStoppedAiForensicCaptureEvidence(
        { query } as unknown as SqlServerDatabase,
        partyWithoutRoleContext,
        47,
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Forensic evidence is unavailable to this actor',
    })
    expect(query).not.toHaveBeenCalled()
    expect(auditState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('lists aggregate capture metadata for Admin and Privacy Officer roles', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        direction: 'output',
        eventCount: 3,
        expiresAt: '2026-08-15T14:00:00.000Z',
        id: 47,
        operation: 'ai.generate-requirement-import',
        requestedAt: '2026-08-15T13:45:00.000Z',
        status: 'expired',
        stoppedAt: null,
      },
    ])

    await expect(
      listAiForensicCaptureMetadata(
        { query } as unknown as SqlServerDatabase,
        context,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ eventCount: 3, id: 47, status: 'expired' }),
    ])
    expect(query).toHaveBeenCalledOnce()
  })
})
