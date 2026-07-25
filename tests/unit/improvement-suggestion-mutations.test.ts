import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteSuggestion: vi.fn(),
  recordResolution: vi.fn(),
  recordSensitiveMutationActionAuditEvent: vi.fn(),
  recordSensitiveMutationSecurityEvent: vi.fn(),
  requestReview: vi.fn(),
  revertToDraft: vi.fn(),
  updateSuggestion: vi.fn(),
}))

vi.mock('@/lib/dal/improvement-suggestions', async importOriginal => ({
  ...(await importOriginal()),
  deleteSuggestion: mocks.deleteSuggestion,
  recordResolution: mocks.recordResolution,
  requestReview: mocks.requestReview,
  revertToDraft: mocks.revertToDraft,
  updateSuggestion: mocks.updateSuggestion,
}))

vi.mock('@/lib/requirements/security-audit', () => ({
  recordSensitiveMutationActionAuditEvent:
    mocks.recordSensitiveMutationActionAuditEvent,
  recordSensitiveMutationSecurityEvent:
    mocks.recordSensitiveMutationSecurityEvent,
}))

import {
  deleteImprovementSuggestionWithAudit,
  requestImprovementSuggestionReview,
  resolveImprovementSuggestionWithAudit,
  revertImprovementSuggestionToDraft,
  updateImprovementSuggestion,
} from '@/lib/requirements/improvement-suggestion-mutations'

const context = {
  actor: {
    displayName: 'Mutation Tester',
    hsaId: 'SE5560000001-mutation',
    id: 'mutation-tester',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc' as const,
  },
  correlationId: 'correlation-502',
  requestId: 'request-502',
  source: 'rest' as const,
}
const target = {
  id: 77,
  requirementId: 12,
  requirementVersionId: 34,
}

function transactionalDb(order: string[] = []) {
  const manager = { query: vi.fn() }
  const transaction = vi.fn(
    async (callback: (executor: typeof manager) => Promise<unknown>) => {
      order.push('transaction:start')
      const result = await callback(manager)
      order.push('transaction:commit')
      return result
    },
  )
  return { db: { transaction }, manager, transaction }
}

describe('Improvement suggestion mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteSuggestion.mockResolvedValue(target)
    mocks.recordResolution.mockResolvedValue(target)
    mocks.recordSensitiveMutationActionAuditEvent.mockResolvedValue(undefined)
    mocks.requestReview.mockResolvedValue(target)
    mocks.revertToDraft.mockResolvedValue(target)
    mocks.updateSuggestion.mockResolvedValue(target)
  })

  it('runs edit, review, and revert classification inside transactions', async () => {
    const { db, manager, transaction } = transactionalDb()

    await updateImprovementSuggestion(db as never, 77, {
      content: 'Updated',
    })
    await requestImprovementSuggestionReview(db as never, 77)
    await revertImprovementSuggestionToDraft(db as never, 77)

    expect(transaction).toHaveBeenCalledTimes(3)
    expect(mocks.updateSuggestion).toHaveBeenCalledWith(manager, 77, {
      content: 'Updated',
    })
    expect(mocks.requestReview).toHaveBeenCalledWith(manager, 77)
    expect(mocks.revertToDraft).toHaveBeenCalledWith(manager, 77)
  })

  it('commits resolution and Action log evidence before the platform event', async () => {
    const order: string[] = []
    const { db, manager } = transactionalDb(order)
    mocks.recordResolution.mockImplementation(async () => {
      order.push('suggestion:resolved')
      return target
    })
    mocks.recordSensitiveMutationActionAuditEvent.mockImplementation(
      async () => {
        order.push('action-log:inserted')
      },
    )
    mocks.recordSensitiveMutationSecurityEvent.mockImplementation(() => {
      order.push('security-event:emitted')
    })

    await expect(
      resolveImprovementSuggestionWithAudit(
        db as never,
        77,
        {
          resolution: 2,
          resolutionMotivation: 'Not applicable',
          resolvedBy: 'Mutation Tester',
          resolvedByHsaId: 'SE5560000001-mutation',
        },
        context,
      ),
    ).resolves.toBe(target)

    expect(mocks.recordResolution).toHaveBeenCalledWith(
      manager,
      77,
      expect.objectContaining({ resolution: 2 }),
    )
    expect(mocks.recordSensitiveMutationActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      {
        action: 'suggestion.resolution.recorded',
        operation: 'dismiss',
        resolution: 2,
        suggestionId: 77,
      },
    )
    expect(order).toEqual([
      'transaction:start',
      'suggestion:resolved',
      'action-log:inserted',
      'transaction:commit',
      'security-event:emitted',
    ])
  })

  it('does not emit a resolution platform event when Action log insertion rolls back', async () => {
    const { db } = transactionalDb()
    mocks.recordSensitiveMutationActionAuditEvent.mockRejectedValueOnce(
      new Error('Action log insert failed'),
    )

    await expect(
      resolveImprovementSuggestionWithAudit(
        db as never,
        77,
        {
          resolution: 1,
          resolutionMotivation: 'Implemented',
          resolvedBy: 'Mutation Tester',
          resolvedByHsaId: 'SE5560000001-mutation',
        },
        context,
      ),
    ).rejects.toThrow('Action log insert failed')

    expect(mocks.recordSensitiveMutationSecurityEvent).not.toHaveBeenCalled()
  })

  it('commits deletion and Action log evidence before the platform event', async () => {
    const order: string[] = []
    const { db, manager } = transactionalDb(order)
    mocks.deleteSuggestion.mockImplementation(async () => {
      order.push('suggestion:deleted')
      return target
    })
    mocks.recordSensitiveMutationActionAuditEvent.mockImplementation(
      async () => {
        order.push('action-log:inserted')
      },
    )
    mocks.recordSensitiveMutationSecurityEvent.mockImplementation(() => {
      order.push('security-event:emitted')
    })

    await expect(
      deleteImprovementSuggestionWithAudit(db as never, 77, context),
    ).resolves.toBe(target)

    expect(mocks.deleteSuggestion).toHaveBeenCalledWith(manager, 77)
    expect(order).toEqual([
      'transaction:start',
      'suggestion:deleted',
      'action-log:inserted',
      'transaction:commit',
      'security-event:emitted',
    ])
  })

  it('does not emit a deletion platform event when Action log insertion rolls back', async () => {
    const { db } = transactionalDb()
    mocks.recordSensitiveMutationActionAuditEvent.mockRejectedValueOnce(
      new Error('Action log insert failed'),
    )

    await expect(
      deleteImprovementSuggestionWithAudit(db as never, 77, context),
    ).rejects.toThrow('Action log insert failed')

    expect(mocks.recordSensitiveMutationSecurityEvent).not.toHaveBeenCalled()
  })
})
