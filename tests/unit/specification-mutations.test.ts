import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

const auditState = vi.hoisted(() => ({
  recordAllowedActionAuditEvent: vi.fn(),
}))

const dalState = vi.hoisted(() => ({
  createSpecificationWithExecutor: vi.fn(),
  deleteSpecificationWithExecutor: vi.fn(),
  updateSpecificationWithExecutor: vi.fn(),
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: auditState.recordAllowedActionAuditEvent,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  createSpecificationWithExecutor: dalState.createSpecificationWithExecutor,
  deleteSpecificationWithExecutor: dalState.deleteSpecificationWithExecutor,
  updateSpecificationWithExecutor: dalState.updateSpecificationWithExecutor,
}))

import {
  createSpecificationWithAudit,
  deleteSpecificationWithAudit,
  isSpecificationCodeTakenConflict,
  updateSpecificationWithAudit,
} from '@/lib/requirements/specification-mutations'

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

const createdSpecification = {
  businessNeedsReference: null,
  createdAt: '2026-07-25T10:00:00.000Z',
  id: 17,
  name: 'Specification',
  responsibleDisplayName: 'Ada Admin',
  responsibleHsaId: 'SE5560000001-admin1',
  specificationCode: 'SPEC-017',
  specificationGovernanceObjectTypeId: null,
  specificationImplementationTypeId: null,
  specificationLifecycleStatusId: 4,
  updatedAt: '2026-07-25T10:00:00.000Z',
}

const updatedSpecification = {
  ...createdSpecification,
  governanceObjectType: null,
  implementationType: null,
  lifecycleStatus: null,
  name: 'Updated specification',
  specificationCode: 'SPEC-UPDATED',
  specificationLifecycleStatusId: 5,
}

function makeTransactionDb(
  snapshot: unknown[] = [
    {
      id: 17,
      specificationCode: 'SPEC-017',
      specificationLifecycleStatusId: 4,
    },
  ],
) {
  const manager = { query: vi.fn(async () => snapshot) }
  const transaction = vi.fn(
    async <T>(callback: (transactionManager: typeof manager) => Promise<T>) =>
      callback(manager),
  )
  const db = { transaction } as unknown as SqlServerDatabase
  return { db, manager, transaction }
}

function specificationCodeDuplicateError(
  constraint = 'uq_requirements_specifications_specification_code',
): Error {
  return Object.assign(
    new Error(
      `Cannot insert duplicate key row with unique index '${constraint}'.`,
    ),
    { number: 2601 },
  )
}

describe('requirements specification audited mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditState.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
    dalState.createSpecificationWithExecutor.mockResolvedValue(
      createdSpecification,
    )
    dalState.deleteSpecificationWithExecutor.mockResolvedValue(undefined)
    dalState.updateSpecificationWithExecutor.mockResolvedValue(
      updatedSpecification,
    )
  })

  it('creates business data before one privacy-bounded event in one transaction', async () => {
    const { db, manager, transaction } = makeTransactionDb()
    const data = {
      businessNeedsReference: 'Must not enter the Action log',
      name: 'Must not enter the Action log',
      responsibleHsaId: 'SE5560000001-admin1',
      specificationCode: 'SPEC-017',
      specificationLifecycleStatusId: 4,
    }

    await expect(
      createSpecificationWithAudit(db, data, context),
    ).resolves.toEqual(createdSpecification)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(dalState.createSpecificationWithExecutor).toHaveBeenCalledWith(
      manager,
      data,
    )
    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      {
        action: 'specification.create',
        details: { specificationLifecycleStatusId: 4 },
        targetId: 17,
        targetKind: 'RequirementsSpecification',
        targetUniqueId: 'SPEC-017',
      },
    )
    expect(
      dalState.createSpecificationWithExecutor.mock.invocationCallOrder[0],
    ).toBeLessThan(
      auditState.recordAllowedActionAuditEvent.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('updates after a locked snapshot and records sorted fields and lifecycle evidence', async () => {
    const { db, manager, transaction } = makeTransactionDb()
    const data = {
      name: 'Updated specification',
      specificationCode: 'SPEC-UPDATED',
      specificationLifecycleStatusId: 5,
    }

    await expect(
      updateSpecificationWithAudit(db, 17, data, context),
    ).resolves.toEqual({
      specification: updatedSpecification,
      status: 'updated',
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH (UPDLOCK, HOLDLOCK)'),
      [17],
    )
    expect(dalState.updateSpecificationWithExecutor).toHaveBeenCalledWith(
      manager,
      17,
      data,
    )
    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      {
        action: 'specification.update',
        details: {
          changedFields: [
            'name',
            'specificationCode',
            'specificationLifecycleStatusId',
          ],
          newSpecificationLifecycleStatusId: 5,
          previousSpecificationLifecycleStatusId: 4,
        },
        targetId: 17,
        targetKind: 'RequirementsSpecification',
        targetUniqueId: 'SPEC-UPDATED',
      },
    )
    expect(
      dalState.updateSpecificationWithExecutor.mock.invocationCallOrder[0],
    ).toBeLessThan(
      auditState.recordAllowedActionAuditEvent.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('audits an accepted empty update with an empty changed-fields list', async () => {
    const { db, manager } = makeTransactionDb()

    const result = await updateSpecificationWithAudit(db, 17, {}, context)

    expect(result.status).toBe('updated')
    expect(dalState.updateSpecificationWithExecutor).toHaveBeenCalledWith(
      manager,
      17,
      {},
    )
    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({
        details: { changedFields: [] },
      }),
    )
  })

  it('omits lifecycle before/after details when the submitted status is unchanged', async () => {
    const { db, manager } = makeTransactionDb()

    await updateSpecificationWithAudit(
      db,
      17,
      { specificationLifecycleStatusId: 4 },
      context,
    )

    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({
        details: {
          changedFields: ['specificationLifecycleStatusId'],
        },
      }),
    )
  })

  it('fails closed if a locked update unexpectedly affects no row', async () => {
    const { db } = makeTransactionDb()
    dalState.updateSpecificationWithExecutor.mockResolvedValue(null)

    await expect(
      updateSpecificationWithAudit(db, 17, { name: 'Updated' }, context),
    ).rejects.toThrow('Locked requirements specification disappeared')
    expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['update', updateSpecificationWithAudit],
    ['delete', deleteSpecificationWithAudit],
  ] as const)(
    'returns typed not_found without mutation or audit for %s',
    async (operation, mutate) => {
      const { db } = makeTransactionDb([])
      const result =
        operation === 'update'
          ? await mutate(db, 404, {}, context)
          : await mutate(db, 404, context)

      expect(result).toEqual({ status: 'not_found' })
      expect(dalState.updateSpecificationWithExecutor).not.toHaveBeenCalled()
      expect(dalState.deleteSpecificationWithExecutor).not.toHaveBeenCalled()
      expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
    },
  )

  it('deletes after a locked snapshot and preserves target lifecycle evidence', async () => {
    const { db, manager, transaction } = makeTransactionDb()

    await expect(
      deleteSpecificationWithAudit(db, 17, context),
    ).resolves.toEqual({ status: 'deleted' })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(dalState.deleteSpecificationWithExecutor).toHaveBeenCalledWith(
      manager,
      17,
    )
    expect(auditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      {
        action: 'specification.delete',
        details: { specificationLifecycleStatusId: 4 },
        targetId: 17,
        targetKind: 'RequirementsSpecification',
        targetUniqueId: 'SPEC-017',
      },
    )
    expect(
      dalState.deleteSpecificationWithExecutor.mock.invocationCallOrder[0],
    ).toBeLessThan(
      auditState.recordAllowedActionAuditEvent.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it.each(['create', 'update', 'delete'] as const)(
    'propagates %s audit failures so the transaction can roll back',
    async operation => {
      const { db } = makeTransactionDb()
      const auditError = new Error('injected Action log failure')
      auditState.recordAllowedActionAuditEvent.mockRejectedValue(auditError)

      const promise =
        operation === 'create'
          ? createSpecificationWithAudit(
              db,
              {
                name: 'Specification',
                responsibleHsaId: 'SE5560000001-admin1',
                specificationCode: 'SPEC-017',
                specificationLifecycleStatusId: 4,
              },
              context,
            )
          : operation === 'update'
            ? updateSpecificationWithAudit(db, 17, { name: 'Updated' }, context)
            : deleteSpecificationWithAudit(db, 17, context)

      await expect(promise).rejects.toBe(auditError)
    },
  )

  it.each(['create', 'update'] as const)(
    'maps only the named SQL Server specification-code collision during %s',
    async operation => {
      const { db } = makeTransactionDb()
      const duplicate = specificationCodeDuplicateError()
      if (operation === 'create') {
        dalState.createSpecificationWithExecutor.mockRejectedValue(duplicate)
      } else {
        dalState.updateSpecificationWithExecutor.mockRejectedValue(duplicate)
      }

      const promise =
        operation === 'create'
          ? createSpecificationWithAudit(
              db,
              {
                name: 'Specification',
                responsibleHsaId: 'SE5560000001-admin1',
                specificationCode: 'SPEC-017',
                specificationLifecycleStatusId: 4,
              },
              context,
            )
          : updateSpecificationWithAudit(
              db,
              17,
              { specificationCode: 'SPEC-017' },
              context,
            )

      const error = await promise.catch(reason => reason)
      expect(isSpecificationCodeTakenConflict(error)).toBe(true)
      expect(auditState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
    },
  )

  it('does not map a different duplicate constraint', async () => {
    const { db } = makeTransactionDb()
    const duplicate = specificationCodeDuplicateError(
      'uq_action_audit_events_request_id',
    )
    dalState.createSpecificationWithExecutor.mockRejectedValue(duplicate)

    await expect(
      createSpecificationWithAudit(
        db,
        {
          name: 'Specification',
          responsibleHsaId: 'SE5560000001-admin1',
          specificationCode: 'SPEC-017',
          specificationLifecycleStatusId: 4,
        },
        context,
      ),
    ).rejects.toBe(duplicate)
  })

  it('maps a nested SQL Server 2627 driver error for the named constraint', async () => {
    const { db } = makeTransactionDb()
    const driverError = Object.assign(
      new Error(
        "Violation of UNIQUE KEY constraint 'uq_requirements_specifications_specification_code'.",
      ),
      { number: 2627 },
    )
    dalState.createSpecificationWithExecutor.mockRejectedValue(
      Object.assign(new Error('Query failed'), { driverError }),
    )

    const error = await createSpecificationWithAudit(
      db,
      {
        name: 'Specification',
        responsibleHsaId: 'SE5560000001-admin1',
        specificationCode: 'SPEC-017',
        specificationLifecycleStatusId: 4,
      },
      context,
    ).catch(reason => reason)

    expect(isSpecificationCodeTakenConflict(error)).toBe(true)
  })
})
