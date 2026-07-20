import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  type ActorSnapshot,
  createRfiQuestionSuggestion,
  deleteRfiQuestionSuggestion,
  type RfiQuestionSuggestionCreateData,
  type RfiQuestionSuggestionMutationTarget,
  type RfiQuestionSuggestionResolutionData,
  type RfiQuestionSuggestionRow,
  requestRfiQuestionSuggestionReview,
  resolveRfiQuestionSuggestion,
} from '@/lib/dal/rfi-questions'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

function targetDetails(target: RfiQuestionSuggestionMutationTarget) {
  return {
    areaId: target.areaId,
    rfiQuestionId: target.rfiQuestionId,
    specificationId: target.specificationId,
  }
}

export async function createRfiQuestionSuggestionWithAudit(
  db: SqlServerDatabase,
  data: RfiQuestionSuggestionCreateData,
  actor: ActorSnapshot,
  context: RequestContext,
): Promise<RfiQuestionSuggestionRow> {
  return db.transaction(async manager => {
    const suggestion = await createRfiQuestionSuggestion(manager, data, actor)
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'rfi_question_suggestion.create',
      details: {
        areaId: suggestion.areaId,
        rfiQuestionId: suggestion.rfiQuestionId,
        specificationId: suggestion.specificationId,
        toState: 'draft',
      },
      targetId: suggestion.id,
      targetKind: 'rfi_question_suggestion',
    })
    return suggestion
  })
}

export async function deleteRfiQuestionSuggestionWithAudit(
  db: SqlServerDatabase,
  suggestionId: number,
  context: RequestContext,
): Promise<void> {
  await db.transaction(async manager => {
    const deleted = await deleteRfiQuestionSuggestion(manager, suggestionId)
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'rfi_question_suggestion.delete',
      details: {
        ...targetDetails(deleted),
        fromState: 'draft',
        toState: 'deleted',
      },
      targetId: deleted.id,
      targetKind: 'rfi_question_suggestion',
    })
  })
}

export async function requestRfiQuestionSuggestionReviewWithAudit(
  db: SqlServerDatabase,
  suggestionId: number,
  context: RequestContext,
): Promise<RfiQuestionSuggestionRow> {
  return db.transaction(async manager => {
    const suggestion = await requestRfiQuestionSuggestionReview(
      manager,
      suggestionId,
    )
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'rfi_question_suggestion.request_review',
      details: {
        areaId: suggestion.areaId,
        fromState: 'draft',
        rfiQuestionId: suggestion.rfiQuestionId,
        specificationId: suggestion.specificationId,
        toState: 'review_requested',
      },
      targetId: suggestion.id,
      targetKind: 'rfi_question_suggestion',
    })
    return suggestion
  })
}

export async function resolveRfiQuestionSuggestionWithAudit(
  db: SqlServerDatabase,
  suggestionId: number,
  data: RfiQuestionSuggestionResolutionData,
  actor: ActorSnapshot,
  context: RequestContext,
): Promise<RfiQuestionSuggestionRow> {
  return db.transaction(async manager => {
    const suggestion = await resolveRfiQuestionSuggestion(
      manager,
      suggestionId,
      data,
      actor,
    )
    const resolution = data.resolution === 1 ? 'resolved' : 'dismissed'
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'rfi_question_suggestion.resolve',
      details: {
        areaId: suggestion.areaId,
        fromState: 'review_requested',
        resolution,
        rfiQuestionId: suggestion.rfiQuestionId,
        specificationId: suggestion.specificationId,
        toState: resolution,
      },
      targetId: suggestion.id,
      targetKind: 'rfi_question_suggestion',
    })
    return suggestion
  })
}
