import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordRequirementSelectionCleanupAudit } from '@/lib/audit/requirement-selection-cleanup-audit'
import { authenticatedRestContextFixture } from './helpers/authenticated-rest-context-fixture'

const mocks = vi.hoisted(() => ({
  db: { query: vi.fn() },
  recordActionAuditEvent: vi.fn(),
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordActionAuditEvent: mocks.recordActionAuditEvent,
}))

describe('recordRequirementSelectionCleanupAudit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records cleanup only when links were removed', async () => {
    await recordRequirementSelectionCleanupAudit(
      mocks.db,
      authenticatedRestContextFixture(),
      {
        cleanup: {
          affectedAnswerIds: [],
          affectedRequirementIds: [],
          removedLinkCount: 0,
        },
        originAction: 'question.archive',
        originTargetKind: 'question',
      },
    )
    expect(mocks.recordActionAuditEvent).not.toHaveBeenCalled()

    await recordRequirementSelectionCleanupAudit(
      mocks.db,
      authenticatedRestContextFixture(),
      {
        cleanup: {
          affectedAnswerIds: [2],
          affectedRequirementIds: [3],
          removedLinkCount: 1,
        },
        originAction: 'question.archive',
        originTargetId: 1,
        originTargetKind: 'question',
      },
    )
    expect(mocks.recordActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        actorKind: 'system',
        details: expect.objectContaining({ originTargetId: '1' }),
      }),
    )

    const requestless = authenticatedRestContextFixture()
    delete requestless.request
    await recordRequirementSelectionCleanupAudit(mocks.db, requestless, {
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 1,
      },
      originAction: 'question.delete',
      originTargetKind: 'question',
    })
    expect(mocks.recordActionAuditEvent).toHaveBeenLastCalledWith(
      mocks.db,
      expect.objectContaining({
        clientIp: null,
        details: expect.objectContaining({ originTargetId: undefined }),
      }),
    )
  })
})
