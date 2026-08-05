import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'

const state = vi.hoisted(() => ({
  archive: vi.fn(),
  audit: vi.fn(),
  delete: vi.fn(),
  getById: vi.fn(),
  getUsage: vi.fn(),
  reactivate: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: state.audit,
}))

vi.mock('@/lib/dal/norm-references', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/dal/norm-references')>()),
  archiveNormReference: state.archive,
  createNormReference: state.create,
  deleteNormReference: state.delete,
  getNormReferenceById: state.getById,
  getNormReferenceUsage: state.getUsage,
  reactivateNormReference: state.reactivate,
  updateNormReference: state.update,
}))

import {
  archiveNormReferenceWithAudit,
  createNormReferenceWithAudit,
  deleteNormReferenceWithAudit,
  reactivateNormReferenceWithAudit,
  updateNormReferenceWithAudit,
} from '@/lib/requirements/norm-reference-mutations'

const context = {
  actor: {
    displayName: 'Actor',
    hsaId: 'SE5560000001-actor',
    id: 'actor',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'rest',
  },
  correlationId: 'correlation',
  requestId: 'request',
  source: 'rest',
} as unknown as RequestContext

const row = { id: 7 }

function database() {
  const manager = {}
  return {
    db: {
      transaction: vi.fn(async (callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    } as unknown as Parameters<typeof updateNormReferenceWithAudit>[0],
    manager,
  }
}

describe('Issue 891 norm-reference mutation branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.audit.mockResolvedValue(undefined)
  })

  it('updates and audits present references but skips audit for missing rows', async () => {
    const { db, manager } = database()
    state.update.mockResolvedValueOnce(row).mockResolvedValueOnce(undefined)
    await expect(
      updateNormReferenceWithAudit(db, 7, { name: 'Updated' }, context),
    ).resolves.toEqual(row)
    expect(state.audit).toHaveBeenCalledWith(
      manager,
      context,
      expect.objectContaining({ action: 'norm_reference.update' }),
    )
    state.audit.mockClear()
    await expect(
      updateNormReferenceWithAudit(db, 404, { name: 'Missing' }, context),
    ).resolves.toBeUndefined()
    expect(state.audit).not.toHaveBeenCalled()
  })

  it('distinguishes deleted, missing, and in-use references', async () => {
    const { db } = database()
    state.delete.mockResolvedValueOnce(1)
    await expect(deleteNormReferenceWithAudit(db, 7, context)).resolves.toEqual(
      {
        status: 'deleted',
      },
    )

    state.delete.mockResolvedValueOnce(0)
    state.getById.mockResolvedValueOnce(null)
    await expect(
      deleteNormReferenceWithAudit(db, 404, context),
    ).resolves.toEqual({
      status: 'not_found',
    })

    state.delete.mockResolvedValueOnce(0)
    state.getById.mockResolvedValueOnce(row)
    state.getUsage.mockResolvedValueOnce({
      libraryRequirementCount: 2,
      localRequirementCount: 1,
    })
    await expect(deleteNormReferenceWithAudit(db, 7, context)).resolves.toEqual(
      {
        status: 'in_use',
        usage: { libraryRequirementCount: 2, localRequirementCount: 1 },
      },
    )
  })

  it.each([
    ['archive', archiveNormReferenceWithAudit, state.archive],
    ['reactivate', reactivateNormReferenceWithAudit, state.reactivate],
  ] as const)(
    '%s audits success and returns undefined for missing rows',
    async (_name, mutation, dal) => {
      const { db } = database()
      dal.mockResolvedValueOnce(row).mockResolvedValueOnce(undefined)
      await expect(mutation(db, 7, context)).resolves.toEqual(row)
      await expect(mutation(db, 404, context)).resolves.toBeUndefined()
    },
  )

  it('recognizes nested SQL Server duplicate codes represented as strings', async () => {
    const { db } = database()
    const duplicate = {
      driverError: {
        message: 'Violation uq_norm_references_norm_reference_id',
        number: '2601',
      },
    }
    state.create.mockRejectedValueOnce(duplicate).mockResolvedValueOnce(row)
    await expect(
      createNormReferenceWithAudit(
        db,
        {
          issuer: 'ISO',
          name: 'Security',
          reference: 'ISO 1',
          type: 'Standard',
        },
        context,
      ),
    ).resolves.toEqual(row)
  })
})
