import {
  deleteSuggestion,
  type ImprovementSuggestionMutationTarget,
  recordResolution,
  requestReview,
  revertToDraft,
  type SqlExecutor,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  recordSensitiveMutationActionAuditEvent,
  recordSensitiveMutationSecurityEvent,
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
  const target = await db.transaction(async manager => {
    const resolved = await recordResolution(manager, suggestionId, data)
    await recordSensitiveMutationActionAuditEvent(manager, context, {
      action: 'suggestion.resolution.recorded',
      operation: data.resolution === 1 ? 'resolve' : 'dismiss',
      resolution: data.resolution,
      suggestionId,
    })
    return resolved
  })

  recordSensitiveMutationSecurityEvent(context, {
    action: 'suggestion.resolution.recorded',
    operation: data.resolution === 1 ? 'resolve' : 'dismiss',
    resolution: data.resolution,
    suggestionId,
  })
  return target
}

export async function deleteImprovementSuggestionWithAudit(
  db: SqlServerDatabase,
  suggestionId: number,
  context: RequestContext,
): Promise<ImprovementSuggestionMutationTarget> {
  const target = await db.transaction(async manager => {
    const deleted = await deleteSuggestion(manager, suggestionId)
    await recordSensitiveMutationActionAuditEvent(manager, context, {
      action: 'suggestion.deleted',
      operation: 'delete',
      suggestionId,
    })
    return deleted
  })

  recordSensitiveMutationSecurityEvent(context, {
    action: 'suggestion.deleted',
    operation: 'delete',
    suggestionId,
  })
  return target
}
