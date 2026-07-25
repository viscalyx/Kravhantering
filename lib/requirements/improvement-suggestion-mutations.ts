import {
  deleteSuggestion,
  type ImprovementSuggestionMutationTarget,
  recordResolution,
  requestReview,
  revertToDraft,
  type SqlExecutor,
  SUGGESTION_RESOLVED,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  recordSensitiveMutationActionAuditEvent,
  recordSensitiveMutationSecurityEvent,
  type SensitiveMutationAuditDetail,
} from '@/lib/requirements/security-audit'

type ImprovementSuggestionResolutionData = Parameters<
  typeof recordResolution
>[2]

function runLifecycleMutation(
  db: SqlServerDatabase,
  mutation: (
    manager: SqlExecutor,
  ) => Promise<ImprovementSuggestionMutationTarget>,
): Promise<ImprovementSuggestionMutationTarget> {
  return db.transaction(manager => mutation(manager))
}

async function runAuditedLifecycleMutation(
  db: SqlServerDatabase,
  context: RequestContext,
  mutation: (
    manager: SqlExecutor,
  ) => Promise<ImprovementSuggestionMutationTarget>,
  actionAuditDetail: SensitiveMutationAuditDetail,
  securityEventDetail: SensitiveMutationAuditDetail,
): Promise<ImprovementSuggestionMutationTarget> {
  const target = await db.transaction(async manager => {
    const mutated = await mutation(manager)
    await recordSensitiveMutationActionAuditEvent(
      manager,
      context,
      actionAuditDetail,
    )
    return mutated
  })

  recordSensitiveMutationSecurityEvent(context, securityEventDetail)
  return target
}

export function updateImprovementSuggestion(
  db: SqlServerDatabase,
  suggestionId: number,
  data: { content?: string },
): Promise<ImprovementSuggestionMutationTarget> {
  return runLifecycleMutation(db, manager =>
    updateSuggestion(manager, suggestionId, data),
  )
}

export function requestImprovementSuggestionReview(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<ImprovementSuggestionMutationTarget> {
  return runLifecycleMutation(db, manager =>
    requestReview(manager, suggestionId),
  )
}

export function revertImprovementSuggestionToDraft(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<ImprovementSuggestionMutationTarget> {
  return runLifecycleMutation(db, manager =>
    revertToDraft(manager, suggestionId),
  )
}

export async function resolveImprovementSuggestionWithAudit(
  db: SqlServerDatabase,
  suggestionId: number,
  data: ImprovementSuggestionResolutionData,
  context: RequestContext,
): Promise<ImprovementSuggestionMutationTarget> {
  const detail: SensitiveMutationAuditDetail = {
    action: 'suggestion.resolution.recorded',
    operation: data.resolution === SUGGESTION_RESOLVED ? 'resolve' : 'dismiss',
    resolution: data.resolution,
    suggestionId,
  }

  return runAuditedLifecycleMutation(
    db,
    context,
    manager => recordResolution(manager, suggestionId, data),
    detail,
    detail,
  )
}

export async function deleteImprovementSuggestionWithAudit(
  db: SqlServerDatabase,
  suggestionId: number,
  context: RequestContext,
): Promise<ImprovementSuggestionMutationTarget> {
  const detail: SensitiveMutationAuditDetail = {
    action: 'suggestion.deleted',
    operation: 'delete',
    suggestionId,
  }

  return runAuditedLifecycleMutation(
    db,
    context,
    manager => deleteSuggestion(manager, suggestionId),
    detail,
    detail,
  )
}
