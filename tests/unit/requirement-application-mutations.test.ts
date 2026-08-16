import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import type { RequirementsLogger } from '@/lib/requirements/logging'

const dal = vi.hoisted(() => ({
  deleteLibrarySpecificationItemsByIds: vi.fn(),
  deleteSpecificationLocalRequirementsByIds: vi.fn(),
  findSpecificationIdentity: vi.fn(),
  findSpecificationNeedsReferenceIdentity: vi.fn(),
  getSpecificationItemById: vi.fn(),
  getSpecificationLocalRequirementParentById: vi.fn(),
  unlinkRequirementsFromSpecification: vi.fn(),
  updateSpecificationItemFields: vi.fn(),
  updateSpecificationLocalRequirementFields: vi.fn(),
}))

const audit = vi.hoisted(() => ({
  recordAuthorizationDenied: vi.fn(),
  recordAuthorizationDeniedWithDatabase: vi.fn(),
  recordSensitiveMutationActionAuditEvent: vi.fn(),
  recordSensitiveMutationSecurityEvent: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deleteLibrarySpecificationItemsByIds:
    dal.deleteLibrarySpecificationItemsByIds,
  deleteSpecificationLocalRequirementsByIds:
    dal.deleteSpecificationLocalRequirementsByIds,
  findSpecificationIdentity: dal.findSpecificationIdentity,
  findSpecificationNeedsReferenceIdentity:
    dal.findSpecificationNeedsReferenceIdentity,
  getSpecificationItemById: dal.getSpecificationItemById,
  getSpecificationLocalRequirementParentById:
    dal.getSpecificationLocalRequirementParentById,
  parseSpecificationItemRef: (value: string) => {
    const match = /^(lib|local):(\d+)$/u.exec(value)
    if (!match || Number(match[2]) < 1) return null
    return {
      id: Number(match[2]),
      kind: match[1] === 'lib' ? 'library' : 'specificationLocal',
    }
  },
  unlinkRequirementsFromSpecification: dal.unlinkRequirementsFromSpecification,
  updateSpecificationItemFields: dal.updateSpecificationItemFields,
  updateSpecificationLocalRequirementFields:
    dal.updateSpecificationLocalRequirementFields,
}))

vi.mock('@/lib/requirements/security-audit', () => ({
  recordAuthorizationDenied: audit.recordAuthorizationDenied,
  recordAuthorizationDeniedWithDatabase:
    audit.recordAuthorizationDeniedWithDatabase,
  recordSensitiveMutationActionAuditEvent:
    audit.recordSensitiveMutationActionAuditEvent,
  recordSensitiveMutationSecurityEvent:
    audit.recordSensitiveMutationSecurityEvent,
}))

import {
  createRequirementApplicationMutationWorkflow,
  resolveRequirementApplicationMutationTarget,
} from '@/lib/requirements/requirement-application-mutations'

const context = {
  actor: {
    displayName: 'Kravunderlagsförfattare',
    hsaId: 'SE5560000001-author1',
    id: 'author-1',
    isAuthenticated: true,
    roles: [],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
} satisfies RequestContext

function makeWorkflow() {
  const manager = { query: vi.fn() }
  const transaction = vi.fn(
    async <T>(callback: (executor: typeof manager) => Promise<T>) =>
      callback(manager),
  )
  const authorization = {
    assertAuthorized: vi.fn(),
  } satisfies AuthorizationService
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  } satisfies RequirementsLogger
  const db = { transaction } as unknown as SqlServerDatabase
  return {
    authorization,
    manager,
    transaction,
    workflow: createRequirementApplicationMutationWorkflow({
      authorization,
      db,
      logger,
    }),
  }
}

describe('requirement application mutation workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dal.deleteLibrarySpecificationItemsByIds.mockImplementation(
      async (_db, _specificationId, ids: number[]) => ids.length,
    )
    dal.deleteSpecificationLocalRequirementsByIds.mockImplementation(
      async (_db, _specificationId, ids: number[]) => ids.length,
    )
    dal.findSpecificationIdentity.mockResolvedValue({ id: 5 })
    dal.findSpecificationNeedsReferenceIdentity.mockResolvedValue({ id: 7 })
    dal.getSpecificationItemById.mockResolvedValue({ specificationId: 5 })
    dal.getSpecificationLocalRequirementParentById.mockResolvedValue({
      specificationId: 5,
    })
    dal.unlinkRequirementsFromSpecification.mockResolvedValue(2)
    dal.updateSpecificationItemFields.mockResolvedValue(1)
    dal.updateSpecificationLocalRequirementFields.mockResolvedValue(1)
    audit.recordSensitiveMutationActionAuditEvent.mockResolvedValue(undefined)
  })

  it('performs zero mutation work when specification authorship is denied', async () => {
    const { authorization, transaction, workflow } = makeWorkflow()
    authorization.assertAuthorized.mockRejectedValue(
      forbiddenError('Specification author assignment is required', {
        reason: 'specification_author_required',
      }),
    )

    await expect(
      workflow.mutate(context, {
        fields: { note: 'Denied change' },
        itemRefs: ['lib:31'],
        operation: 'update',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'specification_author_required' },
    })

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        itemRefs: ['lib:31'],
        kind: 'manage_requirement_applications',
        operation: 'update',
        specificationId: 5,
      },
      context,
    )
    expect(transaction).not.toHaveBeenCalled()
    expect(dal.updateSpecificationItemFields).not.toHaveBeenCalled()
    expect(dal.updateSpecificationLocalRequirementFields).not.toHaveBeenCalled()
    expect(audit.recordAuthorizationDeniedWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      context,
      expect.objectContaining({
        kind: 'manage_requirement_applications',
        operation: 'update',
        specificationId: 5,
      }),
      expect.objectContaining({ code: 'forbidden' }),
    )
  })

  it('rejects a stored-parent mismatch before performing mutation work', async () => {
    const { workflow } = makeWorkflow()
    dal.getSpecificationItemById.mockResolvedValueOnce({ specificationId: 6 })

    await expect(
      workflow.mutate(context, {
        fields: { note: 'Cross-specification change' },
        itemRefs: ['lib:31'],
        operation: 'update',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: {
        reason: 'foreign_specification_child',
        specificationId: 5,
      },
    })

    expect(dal.updateSpecificationItemFields).not.toHaveBeenCalled()
    expect(dal.updateSpecificationLocalRequirementFields).not.toHaveBeenCalled()
    expect(audit.recordSensitiveMutationActionAuditEvent).not.toHaveBeenCalled()
    expect(audit.recordAuthorizationDeniedWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      context,
      expect.objectContaining({
        itemRefs: ['lib:31'],
        kind: 'manage_requirement_applications',
        specificationId: 5,
      }),
      expect.objectContaining({
        code: 'forbidden',
        details: expect.objectContaining({
          reason: 'foreign_specification_child',
        }),
      }),
    )
  })

  it('rejects malformed item references before performing mutation work', async () => {
    const { workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        itemRefs: ['library:31'],
        operation: 'remove',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { itemRef: 'library:31' },
    })

    expect(dal.deleteLibrarySpecificationItemsByIds).not.toHaveBeenCalled()
    expect(dal.deleteSpecificationLocalRequirementsByIds).not.toHaveBeenCalled()
  })

  it.each([
    { itemRefs: undefined, label: 'absent' },
    { itemRefs: [] as const, label: 'empty' },
  ])(
    'resolves a specification identity when itemRefs are $label',
    async ({ itemRefs }) => {
      const { manager } = makeWorkflow()

      await expect(
        resolveRequirementApplicationMutationTarget(manager, {
          ...(itemRefs === undefined ? {} : { itemRefs }),
          kind: 'manage_requirement_applications',
          operation: 'remove',
          specificationId: 5,
        }),
      ).resolves.toBe(5)

      expect(dal.findSpecificationIdentity).toHaveBeenCalledWith(manager, 5)
    },
  )

  it('rejects a missing specification when itemRefs are empty', async () => {
    const { manager } = makeWorkflow()
    dal.findSpecificationIdentity.mockResolvedValueOnce(null)

    await expect(
      resolveRequirementApplicationMutationTarget(manager, {
        itemRefs: [],
        kind: 'manage_requirement_applications',
        operation: 'remove',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { specificationId: 5 },
    })
  })

  it.each([
    {
      input: {
        fields: { note: 'Empty target set' },
        itemRefs: [],
        operation: 'update' as const,
        specificationId: 5,
      },
      label: 'update',
    },
    {
      input: {
        itemRefs: [],
        operation: 'remove' as const,
        specificationId: 5,
      },
      label: 'remove',
    },
  ])(
    'rejects an empty itemRef $label without success evidence',
    async testCase => {
      const { authorization, transaction, workflow } = makeWorkflow()

      await expect(
        workflow.mutate(context, testCase.input),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'At least one itemRef must be supplied',
      })

      expect(authorization.assertAuthorized).toHaveBeenCalledTimes(1)
      expect(transaction).not.toHaveBeenCalled()
      expect(
        audit.recordSensitiveMutationActionAuditEvent,
      ).not.toHaveBeenCalled()
      expect(audit.recordSensitiveMutationSecurityEvent).not.toHaveBeenCalled()
    },
  )

  it('rejects empty update fields before starting a transaction', async () => {
    const { transaction, workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        fields: {},
        itemRefs: ['lib:31'],
        operation: 'update',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({ code: 'validation' })

    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a missing specification before requirement-id removal', async () => {
    const { workflow } = makeWorkflow()
    dal.findSpecificationIdentity.mockResolvedValueOnce(null)

    await expect(
      workflow.mutate(context, {
        operation: 'remove',
        requirementIds: [7],
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { specificationId: 5 },
    })

    expect(dal.unlinkRequirementsFromSpecification).not.toHaveBeenCalled()
  })

  it('updates mixed application kinds atomically and returns one outcome', async () => {
    const { authorization, manager, transaction, workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        fields: { needsReferenceId: 7, note: 'Shared follow-up' },
        itemRefs: ['lib:31', 'local:41'],
        operation: 'update',
        specificationId: 5,
      }),
    ).resolves.toEqual({ operation: 'update', updatedCount: 2 })

    expect(authorization.assertAuthorized).toHaveBeenCalledTimes(1)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(dal.findSpecificationNeedsReferenceIdentity).toHaveBeenCalledWith(
      manager,
      5,
      7,
    )
    expect(dal.updateSpecificationItemFields).toHaveBeenCalledWith(
      manager,
      31,
      { needsReferenceId: 7, note: 'Shared follow-up' },
    )
    expect(dal.updateSpecificationLocalRequirementFields).toHaveBeenCalledWith(
      manager,
      41,
      { needsReferenceId: 7, note: 'Shared follow-up' },
    )
    expect(audit.recordSensitiveMutationActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({
        action: 'specification.requirement_applications.updated',
        operation: 'update_requirement_applications',
        requirementCount: 2,
        specificationId: 5,
      }),
    )
    expect(audit.recordSensitiveMutationSecurityEvent).toHaveBeenCalledTimes(1)
  })

  it('rolls back when an application disappears during update', async () => {
    const { workflow } = makeWorkflow()
    dal.updateSpecificationLocalRequirementFields.mockResolvedValueOnce(0)

    await expect(
      workflow.mutate(context, {
        fields: { note: 'Concurrent update' },
        itemRefs: ['lib:31', 'local:41'],
        operation: 'update',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'requirement_applications_changed' },
    })
    expect(audit.recordSensitiveMutationActionAuditEvent).not.toHaveBeenCalled()
  })

  it('updates a duplicate item reference once and reports a conflict', async () => {
    const { manager, workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        fields: { note: 'Duplicate update' },
        itemRefs: ['lib:31', 'lib:31'],
        operation: 'update',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'requirement_applications_changed' },
    })

    expect(dal.updateSpecificationItemFields).toHaveBeenCalledTimes(1)
    expect(dal.updateSpecificationItemFields).toHaveBeenCalledWith(
      manager,
      31,
      { note: 'Duplicate update' },
    )
    expect(audit.recordSensitiveMutationActionAuditEvent).not.toHaveBeenCalled()
  })

  it('keeps a mixed removal in one transaction and emits no success evidence when a branch fails', async () => {
    const { manager, transaction, workflow } = makeWorkflow()
    const failure = new Error('injected local delete failure')
    dal.deleteSpecificationLocalRequirementsByIds.mockRejectedValueOnce(failure)

    await expect(
      workflow.mutate(context, {
        itemRefs: ['lib:31', 'local:41'],
        operation: 'remove',
        specificationId: 5,
      }),
    ).rejects.toBe(failure)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(dal.deleteLibrarySpecificationItemsByIds).toHaveBeenCalledWith(
      manager,
      5,
      [31],
    )
    expect(dal.deleteSpecificationLocalRequirementsByIds).toHaveBeenCalledWith(
      manager,
      5,
      [41],
    )
    expect(audit.recordSensitiveMutationActionAuditEvent).not.toHaveBeenCalled()
    expect(audit.recordSensitiveMutationSecurityEvent).not.toHaveBeenCalled()
  })

  it('removes mixed application kinds atomically and reports branch outcomes', async () => {
    const { manager, workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        itemRefs: ['lib:31', 'local:41'],
        operation: 'remove',
        specificationId: 5,
      }),
    ).resolves.toEqual({
      operation: 'remove',
      removedCount: 2,
      removedLibraryCount: 1,
      removedSpecificationLocalCount: 1,
    })

    expect(audit.recordSensitiveMutationActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({
        action: 'specification.requirements.removed',
        removedCount: 2,
        requirementCount: 2,
      }),
    )
    expect(audit.recordSensitiveMutationSecurityEvent).toHaveBeenCalledTimes(1)
  })

  it('removes requirement identifiers through the same mutation interface', async () => {
    const { manager, workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        operation: 'remove',
        requirementIds: [7, 8],
        specificationId: 5,
      }),
    ).resolves.toEqual({
      operation: 'remove',
      removedCount: 2,
      removedLibraryCount: 2,
      removedSpecificationLocalCount: 0,
    })

    expect(dal.unlinkRequirementsFromSpecification).toHaveBeenCalledWith(
      manager,
      5,
      [7, 8],
    )
    expect(audit.recordSensitiveMutationActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({
        action: 'specification.requirements.removed',
        removedCount: 2,
        requirementCount: 2,
      }),
    )
  })

  it('rolls back a partial item-ref removal as a conflict', async () => {
    const { workflow } = makeWorkflow()
    dal.deleteSpecificationLocalRequirementsByIds.mockResolvedValueOnce(0)

    await expect(
      workflow.mutate(context, {
        itemRefs: ['lib:31', 'local:41'],
        operation: 'remove',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'requirement_applications_changed' },
    })
    expect(audit.recordSensitiveMutationActionAuditEvent).not.toHaveBeenCalled()
  })

  it('removes a duplicate item reference once and reports a conflict', async () => {
    const { manager, workflow } = makeWorkflow()

    await expect(
      workflow.mutate(context, {
        itemRefs: ['lib:31', 'lib:31'],
        operation: 'remove',
        specificationId: 5,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'requirement_applications_changed' },
    })

    expect(dal.deleteLibrarySpecificationItemsByIds).toHaveBeenCalledTimes(1)
    expect(dal.deleteLibrarySpecificationItemsByIds).toHaveBeenCalledWith(
      manager,
      5,
      [31],
    )
    expect(audit.recordSensitiveMutationActionAuditEvent).not.toHaveBeenCalled()
  })
})
