import {
  type QueryExecutor,
  recordActionAuditEvent,
} from '@/lib/audit/action-audit'
import type { RequirementSelectionCleanupResult } from '@/lib/dal/requirement-selection-questions'
import type { RequestContext } from '@/lib/requirements/auth'

export async function recordRequirementSelectionCleanupAudit(
  executor: QueryExecutor,
  context: RequestContext,
  input: {
    cleanup: RequirementSelectionCleanupResult
    originAction: string
    originTargetId?: number | string | null
    originTargetKind: string
  },
): Promise<void> {
  if (input.cleanup.removedLinkCount < 1) return

  await recordActionAuditEvent(executor, {
    action: 'requirement_selection_answer.cleanup',
    actorKind: 'system',
    clientIp: context.request?.ip ?? null,
    correlationId: context.correlationId,
    decision: 'allowed',
    details: {
      affectedAnswerCount: input.cleanup.affectedAnswerIds.length,
      affectedAnswerIds: input.cleanup.affectedAnswerIds,
      affectedRequirementIds: input.cleanup.affectedRequirementIds,
      originAction: input.originAction,
      originTargetId:
        input.originTargetId == null ? undefined : String(input.originTargetId),
      originTargetKind: input.originTargetKind,
      removedLinkCount: input.cleanup.removedLinkCount,
      targetFamily: 'requirement_selection_answers',
    },
    requestId: context.requestId,
    targetKind: 'requirement_selection_answer',
  })
}
