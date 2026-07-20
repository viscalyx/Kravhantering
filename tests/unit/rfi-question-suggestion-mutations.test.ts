import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createRfiQuestionSuggestion: vi.fn(),
  deleteRfiQuestionSuggestion: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  requestRfiQuestionSuggestionReview: vi.fn(),
  resolveRfiQuestionSuggestion: vi.fn(),
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
}))

vi.mock('@/lib/dal/rfi-questions', () => ({
  createRfiQuestionSuggestion: mocks.createRfiQuestionSuggestion,
  deleteRfiQuestionSuggestion: mocks.deleteRfiQuestionSuggestion,
  requestRfiQuestionSuggestionReview: mocks.requestRfiQuestionSuggestionReview,
  resolveRfiQuestionSuggestion: mocks.resolveRfiQuestionSuggestion,
}))

import {
  createRfiQuestionSuggestionWithAudit,
  deleteRfiQuestionSuggestionWithAudit,
  requestRfiQuestionSuggestionReviewWithAudit,
  resolveRfiQuestionSuggestionWithAudit,
} from '@/lib/requirements/rfi-question-suggestion-mutations'

const actor = {
  displayName: 'Mutation Tester',
  hsaId: 'SE5560000001-mutation',
}
const context = {
  actor: {
    ...actor,
    id: actor.hsaId,
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc' as const,
  },
  correlationId: 'correlation-515',
  requestId: 'request-515',
  source: 'rest' as const,
}
const suggestion = {
  areaId: 2,
  content: 'Sensitive suggestion content.',
  id: 77,
  resolutionMotivation: 'Sensitive motivation.',
  rfiQuestionId: 12,
  specificationId: 4,
}

function transactionalDb() {
  const manager = { query: vi.fn() }
  const transaction = vi.fn(
    async (callback: (executor: typeof manager) => Promise<unknown>) =>
      callback(manager),
  )
  return { db: { transaction }, manager, transaction }
}

describe('RFI question suggestion audited mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRfiQuestionSuggestion.mockResolvedValue(suggestion)
    mocks.deleteRfiQuestionSuggestion.mockResolvedValue(suggestion)
    mocks.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
    mocks.requestRfiQuestionSuggestionReview.mockResolvedValue(suggestion)
    mocks.resolveRfiQuestionSuggestion.mockResolvedValue(suggestion)
  })

  it('creates the draft and one safe action-log row in one transaction', async () => {
    const { db, manager, transaction } = transactionalDb()

    await expect(
      createRfiQuestionSuggestionWithAudit(
        db as never,
        {
          areaId: 2,
          content: suggestion.content,
          rfiQuestionId: 12,
          specificationId: 4,
        },
        actor,
        context,
      ),
    ).resolves.toBe(suggestion)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(mocks.createRfiQuestionSuggestion).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ content: suggestion.content }),
      actor,
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledTimes(1)
    const auditInput = mocks.recordAllowedActionAuditEvent.mock.calls[0]?.[2]
    expect(auditInput).toMatchObject({
      action: 'rfi_question_suggestion.create',
      details: {
        areaId: 2,
        rfiQuestionId: 12,
        specificationId: 4,
        toState: 'draft',
      },
      targetId: 77,
    })
    expect(JSON.stringify(auditInput)).not.toContain(suggestion.content)
  })

  it('audits review, resolution, and deletion transitions without motivation', async () => {
    const { db, manager } = transactionalDb()

    await requestRfiQuestionSuggestionReviewWithAudit(db as never, 77, context)
    await resolveRfiQuestionSuggestionWithAudit(
      db as never,
      77,
      { resolution: 2, resolutionMotivation: suggestion.resolutionMotivation },
      actor,
      context,
    )
    await deleteRfiQuestionSuggestionWithAudit(db as never, 77, context)

    expect(mocks.requestRfiQuestionSuggestionReview).toHaveBeenCalledWith(
      manager,
      77,
    )
    expect(mocks.resolveRfiQuestionSuggestion).toHaveBeenCalledWith(
      manager,
      77,
      expect.objectContaining({ resolution: 2 }),
      actor,
    )
    expect(mocks.deleteRfiQuestionSuggestion).toHaveBeenCalledWith(manager, 77)
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledTimes(3)
    const auditJson = JSON.stringify(
      mocks.recordAllowedActionAuditEvent.mock.calls.map(call => call[2]),
    )
    expect(auditJson).toContain('"resolution":"dismissed"')
    expect(auditJson).not.toContain(suggestion.resolutionMotivation)
    expect(auditJson).not.toContain(suggestion.content)
  })

  it('propagates an action-log failure from the transaction', async () => {
    const { db } = transactionalDb()
    mocks.recordAllowedActionAuditEvent.mockRejectedValueOnce(
      new Error('audit insert failed'),
    )

    await expect(
      requestRfiQuestionSuggestionReviewWithAudit(db as never, 77, context),
    ).rejects.toThrow('audit insert failed')
  })
})
