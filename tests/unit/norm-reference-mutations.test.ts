import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

const auditState = vi.hoisted(() => ({
  recordAllowedActionAuditEvent: vi.fn(),
}))

const dalState = vi.hoisted(() => ({
  createNormReference: vi.fn(),
  deleteNormReference: vi.fn(),
  getNormReferenceById: vi.fn(),
  getNormReferenceUsage: vi.fn(),
  updateNormReference: vi.fn(),
}))

const maxGeneratedNormReferenceIdAttempts = vi.hoisted(() => 999)

function normReferenceDuplicateKeyError(): Error {
  return Object.assign(
    new Error(
      "Cannot insert duplicate key row in object 'dbo.norm_references' with unique index 'uq_norm_references_norm_reference_id'.",
    ),
    { number: 2601 },
  )
}

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: auditState.recordAllowedActionAuditEvent,
}))

vi.mock('@/lib/dal/norm-references', () => ({
  createNormReference: dalState.createNormReference,
  deleteNormReference: dalState.deleteNormReference,
  getNormReferenceById: dalState.getNormReferenceById,
  getNormReferenceUsage: dalState.getNormReferenceUsage,
  MAX_GENERATED_NORM_REFERENCE_ID_ATTEMPTS: maxGeneratedNormReferenceIdAttempts,
  updateNormReference: dalState.updateNormReference,
}))

import {
  createNormReferenceWithAudit,
  deleteNormReferenceWithAudit,
  updateNormReferenceWithAudit,
} from '@/lib/requirements/norm-reference-mutations'

const context = {
  actor: {
    displayName: 'Ada Admin',
    hsaId: 'SE5560000001-admin1',
    id: 'admin-sub',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
} satisfies RequestContext

function makeTransactionDb() {
  const manager = { query: vi.fn() }
  const transaction = vi.fn(
    async <T>(callback: (transactionManager: typeof manager) => Promise<T>) =>
      callback(manager),
  )
  const db = { transaction } as unknown as SqlServerDatabase
  return { db, manager, transaction }
}

describe('norm reference mutation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditState.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
  })

  it('creates and records the allowed audit event inside one transaction', async () => {
    const { db, manager, transaction } = makeTransactionDb()
    const data = {
      issuer: 'ISO',
      name: 'ISO 27001',
      reference: 'ISO/IEC 27001:2022',
      type: 'Standard',
    }
    dalState.createNormReference.mockResolvedValue({ id: 7 })

    const result = await createNormReferenceWithAudit(db, data, context)

    expect(result).toEqual({ id: 7 })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(dalState.createNormReference).toHaveBeenCalledWith(manager, data)
    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({
        action: 'norm_reference.create',
        targetId: 7,
      }),
    )
  })

  it('retries generated IDs after the named unique constraint collides', async () => {
    const { db, transaction } = makeTransactionDb()
    const data = {
      issuer: 'ISO',
      name: 'ISO 27001',
      reference: 'ISO/IEC 27001:2022',
      type: 'Standard',
    }
    dalState.createNormReference
      .mockRejectedValueOnce(normReferenceDuplicateKeyError())
      .mockResolvedValueOnce({ id: 8 })

    const result = await createNormReferenceWithAudit(db, data, context)

    expect(result).toEqual({ id: 8 })
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledTimes(1)
  })

  it('returns a stable conflict without auditing an explicit duplicate ID', async () => {
    const { db, transaction } = makeTransactionDb()
    dalState.createNormReference.mockRejectedValueOnce(
      normReferenceDuplicateKeyError(),
    )

    await expect(
      createNormReferenceWithAudit(
        db,
        {
          issuer: 'ISO',
          name: 'ISO 27001',
          normReferenceId: 'ISO-27001',
          reference: 'ISO/IEC 27001:2022',
          type: 'Standard',
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'norm_reference_id_exists' },
      status: 409,
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it('returns a stable conflict when generated-ID retries are exhausted', async () => {
    const { db, transaction } = makeTransactionDb()
    dalState.createNormReference.mockImplementation(async () => {
      throw normReferenceDuplicateKeyError()
    })

    await expect(
      createNormReferenceWithAudit(
        db,
        {
          issuer: 'ISO',
          name: 'ISO 27001',
          reference: 'ISO/IEC 27001:2022',
          type: 'Standard',
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'norm_reference_id_generation_exhausted' },
      status: 409,
    })

    expect(transaction).toHaveBeenCalledTimes(
      maxGeneratedNormReferenceIdAttempts,
    )
    expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it('does not retry a different unique constraint failure', async () => {
    const { db, transaction } = makeTransactionDb()
    const error = Object.assign(
      new Error(
        "Cannot insert duplicate key row in object 'dbo.action_audit_events' with unique index 'uq_action_audit_events_request_id'.",
      ),
      { number: 2601 },
    )
    dalState.createNormReference.mockRejectedValueOnce(error)

    await expect(
      createNormReferenceWithAudit(
        db,
        {
          issuer: 'ISO',
          name: 'ISO 27001',
          reference: 'ISO/IEC 27001:2022',
          type: 'Standard',
        },
        context,
      ),
    ).rejects.toBe(error)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it('propagates audit failures from inside the update transaction', async () => {
    const { db, manager } = makeTransactionDb()
    dalState.updateNormReference.mockResolvedValue({ id: 7 })
    auditState.recordAllowedActionAuditEvent.mockRejectedValue(
      new Error('audit failed'),
    )

    await expect(
      updateNormReferenceWithAudit(db, 7, { name: 'Updated' }, context),
    ).rejects.toThrow('audit failed')
    expect(dalState.updateNormReference).toHaveBeenCalledWith(manager, 7, {
      name: 'Updated',
    })
  })

  it('does not write an allowed audit event when delete is blocked by usage', async () => {
    const { db, manager } = makeTransactionDb()
    const usage = { libraryRequirementCount: 1, localRequirementCount: 2 }
    dalState.deleteNormReference.mockResolvedValue(0)
    dalState.getNormReferenceById.mockResolvedValue({ id: 7 })
    dalState.getNormReferenceUsage.mockResolvedValue(usage)

    const result = await deleteNormReferenceWithAudit(db, 7, context)

    expect(result).toEqual({ status: 'in_use', usage })
    expect(dalState.deleteNormReference).toHaveBeenCalledWith(manager, 7)
    expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })
})
