import {
  type QueryExecutor,
  recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent,
} from '@/lib/audit/action-audit'
import {
  recordSecurityEvent,
  type SecurityEventActor,
  type SecurityEventDetailValue,
  type SecurityEventRequest,
} from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import type {
  ActorContext,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type SecurityAuditDetailInput = Record<
  string,
  SecurityEventDetailValue | null | undefined
>

export interface HighRiskMutationAuditDetail {
  action: string
  addedCount?: number
  decision?: number
  deletedTypes?: readonly string[]
  deletedVersionNumber?: number
  deviationId?: number
  locale?: string
  localRequirementId?: number
  newRequirementId?: number
  newRequirementUniqueId?: string
  operation?: string
  removedCount?: number
  requirementCount?: number
  requirementId?: number
  requirementIds?: readonly number[]
  requirementUniqueId?: string
  resolution?: number
  restoredVersionNumber?: number
  specificationId?: number
  specificationSlug?: string
  suggestionId?: number
  targetRequirementAreaId?: number
  toStatusId?: number
  versionNumber?: number
}

function compactDetail(
  detail: SecurityAuditDetailInput,
): Record<string, SecurityEventDetailValue> {
  return Object.fromEntries(
    Object.entries(detail).filter(
      (entry): entry is [string, SecurityEventDetailValue] => entry[1] != null,
    ),
  )
}

function securityActorFromContext(actor: ActorContext): SecurityEventActor {
  const out: SecurityEventActor = { source: actor.source }
  if (actor.id) out.sub = actor.id
  if (actor.hsaId) out.hsaId = actor.hsaId
  return out
}

function securityRequestFromContext(
  context: RequestContext,
  fallbackPath: string,
): SecurityEventRequest {
  if (context.request) return context.request
  return {
    method: context.source === 'mcp' ? 'MCP' : 'UNKNOWN',
    path: fallbackPath,
    requestId: context.requestId,
  }
}

function stringArrayDetail(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.every(item => typeof item === 'string') ? value : undefined
}

function actionAuditDetail(
  action: RequirementsAction,
): SecurityAuditDetailInput {
  switch (action.kind) {
    case 'query_catalog':
      return { actionKind: action.kind, catalog: action.catalog }
    case 'list_specifications':
      return { actionKind: action.kind }
    case 'get_specification_items':
    case 'list_deviations':
      return {
        actionKind: action.kind,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
      }
    case 'add_to_specification':
    case 'remove_from_specification':
      return {
        actionKind: action.kind,
        requirementCount: action.requirementIds.length,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
      }
    case 'list_graduation_target_areas':
      return {
        actionKind: action.kind,
        localRequirementId: action.localRequirementId,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
      }
    case 'graduate_specification_local_requirement':
      return {
        actionKind: action.kind,
        localRequirementId: action.localRequirementId,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
        targetRequirementAreaId: action.requirementAreaId,
      }
    case 'manage_specification_local_requirement':
      return {
        actionKind: action.kind,
        localRequirementId: action.localRequirementId,
        operation: action.operation,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
      }
    case 'manage_specification_needs_reference':
      return {
        actionKind: action.kind,
        needsReferenceId: action.needsReferenceId,
        operation: action.operation,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
      }
    case 'get_requirement':
      return {
        actionKind: action.kind,
        requirementId: action.id,
        requirementUniqueId: action.uniqueId,
        versionNumber: action.versionNumber,
      }
    case 'manage_requirement':
      return {
        actionKind: action.kind,
        operation: action.operation,
        requirementId: action.id,
        requirementUniqueId: action.uniqueId,
      }
    case 'transition_requirement':
      return {
        actionKind: action.kind,
        requirementId: action.id,
        requirementUniqueId: action.uniqueId,
        toStatusId: action.toStatusId,
      }
    case 'manage_deviation':
      return {
        actionKind: action.kind,
        deviationId: action.deviationId,
        operation: action.operation,
        specificationItemId: action.specificationItemId,
      }
    case 'list_suggestions':
      return {
        actionKind: action.kind,
        requirementId: action.requirementId,
        requirementUniqueId: action.uniqueId,
      }
    case 'manage_suggestion':
      return {
        actionKind: action.kind,
        operation: action.operation,
        requirementId: action.requirementId,
        suggestionId: action.suggestionId,
      }
    case 'manage_rfi_question':
      return {
        actionKind: action.kind,
        areaId: action.areaId,
        operation: action.operation,
        questionId: action.questionId,
      }
    case 'manage_specification_rfi':
      return {
        actionKind: action.kind,
        operation: action.operation,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
      }
    case 'manage_rfi_question_suggestion':
      return {
        actionKind: action.kind,
        areaId: action.areaId,
        operation: action.operation,
        specificationId: action.specificationId,
        specificationSlug: action.specificationSlug,
        suggestionId: action.suggestionId,
      }
    case 'generate_requirements':
      return {
        actionKind: action.kind,
        scopeId: action.scopeId,
        scopeType: action.scopeType,
      }
  }
}

function actionNameForAuthorizationDenied(action: RequirementsAction): string {
  switch (action.kind) {
    case 'add_to_specification':
      return 'specification.requirement.add.denied'
    case 'remove_from_specification':
      return 'specification.requirement.remove.denied'
    case 'graduate_specification_local_requirement':
      return 'specification_local_requirement.graduate.denied'
    case 'manage_specification_local_requirement':
      return `specification_local_requirement.${action.operation}.denied`
    case 'manage_specification_needs_reference':
      return `specification_needs_reference.${action.operation}.denied`
    case 'manage_requirement':
      return `requirement.${action.operation}.denied`
    case 'transition_requirement':
      return 'requirement.transition.denied'
    case 'manage_deviation':
      return `deviation.${action.operation}.denied`
    case 'manage_suggestion':
      return `improvement_suggestion.${action.operation}.denied`
    case 'manage_rfi_question':
      return `rfi_question.${action.operation}.denied`
    case 'manage_specification_rfi':
      return `specification_rfi_list.${action.operation}.denied`
    case 'manage_rfi_question_suggestion':
      return `rfi_question_suggestion.${action.operation}.denied`
    case 'generate_requirements':
      return 'ai_requirement.insert.denied'
    default:
      return `${action.kind}.denied`
  }
}

function targetForAuthorizationDenied(action: RequirementsAction): {
  targetId?: number | string | null
  targetKind: string
  targetUniqueId?: string | null
} {
  switch (action.kind) {
    case 'add_to_specification':
    case 'remove_from_specification':
    case 'get_specification_items':
    case 'list_deviations':
      return {
        targetId: action.specificationId ?? action.specificationSlug,
        targetKind: 'RequirementsSpecification',
      }
    case 'graduate_specification_local_requirement':
    case 'manage_specification_local_requirement':
    case 'list_graduation_target_areas':
      return {
        targetId: action.localRequirementId,
        targetKind: 'SpecificationLocalRequirement',
      }
    case 'manage_specification_needs_reference':
      return {
        targetId:
          action.needsReferenceId ??
          action.specificationId ??
          action.specificationSlug,
        targetKind: 'SpecificationNeedsReference',
      }
    case 'get_requirement':
    case 'manage_requirement':
      return {
        targetId: action.id ?? action.uniqueId,
        targetKind: 'Requirement',
        targetUniqueId: action.uniqueId,
      }
    case 'transition_requirement':
      return {
        targetId: action.id ?? action.uniqueId,
        targetKind: 'Requirement',
        targetUniqueId: action.uniqueId,
      }
    case 'manage_deviation':
      return {
        targetId: action.deviationId ?? action.specificationItemId,
        targetKind: 'Deviation',
      }
    case 'manage_suggestion':
      return {
        targetId: action.suggestionId ?? action.requirementId,
        targetKind: 'ImprovementSuggestion',
      }
    case 'list_suggestions':
      return {
        targetId: action.requirementId,
        targetKind: 'ImprovementSuggestion',
      }
    case 'manage_rfi_question':
      return {
        targetId: action.questionId ?? action.areaId,
        targetKind: 'RfiQuestion',
      }
    case 'manage_specification_rfi':
      return {
        targetId: action.specificationId ?? action.specificationSlug,
        targetKind: 'SpecificationRfiList',
      }
    case 'manage_rfi_question_suggestion':
      return {
        targetId:
          action.suggestionId ??
          action.specificationId ??
          action.specificationSlug ??
          action.areaId,
        targetKind: 'RfiQuestionSuggestion',
      }
    case 'generate_requirements':
      return { targetKind: 'AIRequirementGeneration' }
    default:
      return { targetKind: action.kind }
  }
}

function normalizeHighRiskAction(detail: HighRiskMutationAuditDetail): string {
  const { action } = detail
  if (action === 'deviation.decision.recorded') return 'deviation.decision'
  if (action === 'suggestion.resolution.recorded') {
    return detail.operation === 'dismiss'
      ? 'improvement_suggestion.dismiss'
      : 'improvement_suggestion.resolve'
  }
  if (action.startsWith('suggestion.')) {
    return action.replace(/^suggestion\./, 'improvement_suggestion.')
  }
  return action
}

function targetForHighRiskMutation(detail: HighRiskMutationAuditDetail): {
  targetId?: number | string | null
  targetKind: string
  targetUniqueId?: string | null
} {
  if (detail.newRequirementId != null || detail.newRequirementUniqueId) {
    return {
      targetId: detail.newRequirementId ?? detail.newRequirementUniqueId,
      targetKind: 'Requirement',
      targetUniqueId: detail.newRequirementUniqueId,
    }
  }
  if (detail.requirementId != null || detail.requirementUniqueId) {
    return {
      targetId: detail.requirementId ?? detail.requirementUniqueId,
      targetKind: 'Requirement',
      targetUniqueId: detail.requirementUniqueId,
    }
  }
  if (detail.deviationId != null) {
    return { targetId: detail.deviationId, targetKind: 'Deviation' }
  }
  if (detail.suggestionId != null) {
    return {
      targetId: detail.suggestionId,
      targetKind: 'ImprovementSuggestion',
    }
  }
  if (detail.localRequirementId != null) {
    return {
      targetId: detail.localRequirementId,
      targetKind: 'SpecificationLocalRequirement',
    }
  }
  if (detail.specificationId != null || detail.specificationSlug) {
    return {
      targetId: detail.specificationId ?? detail.specificationSlug,
      targetKind: 'RequirementsSpecification',
    }
  }
  return { targetKind: 'RequirementMutation' }
}

export async function recordAuthorizationDenied(
  context: RequestContext,
  action: RequirementsAction,
  error: unknown,
): Promise<void> {
  if (
    !isRequirementsServiceError(error) ||
    (error.code !== 'forbidden' && error.code !== 'unauthorized')
  ) {
    return
  }

  const requiredRoles = stringArrayDetail(error.details?.requiredRoles)
  const reason =
    typeof error.details?.reason === 'string' ? error.details.reason : undefined
  const db = await getRequestSqlServerDataSource()
  await recordDeniedActionAuditEvent(db, context, {
    action: actionNameForAuthorizationDenied(action),
    denialReason: reason ?? error.code,
    details: compactDetail({
      ...actionAuditDetail(action),
      errorCode: error.code,
      reason,
      requestSource: context.source,
      requiredRoles,
      toolName: context.toolName,
    }),
    ...targetForAuthorizationDenied(action),
  })

  recordSecurityEvent({
    actor: securityActorFromContext(context.actor),
    detail: compactDetail({
      ...actionAuditDetail(action),
      errorCode: error.code,
      reason,
      requestSource: context.source,
      requiredRoles,
      toolName: context.toolName,
    }),
    event: 'auth.authorization.denied',
    outcome: 'failure',
    request: securityRequestFromContext(context, '/requirements/authorization'),
  })
}

export async function recordHighRiskMutationSucceeded(
  context: RequestContext,
  detail: HighRiskMutationAuditDetail,
): Promise<void> {
  const db = await getRequestSqlServerDataSource()
  await recordHighRiskMutationSucceededWithExecutor(db, context, detail)
}

export async function recordHighRiskMutationSucceededWithExecutor(
  executor: QueryExecutor,
  context: RequestContext,
  detail: HighRiskMutationAuditDetail,
): Promise<void> {
  await recordAllowedActionAuditEvent(executor, context, {
    action: normalizeHighRiskAction(detail),
    details: compactDetail({
      ...detail,
      requestSource: context.source,
      toolName: context.toolName,
    }),
    ...targetForHighRiskMutation(detail),
  })
  recordSecurityEvent({
    actor: securityActorFromContext(context.actor),
    detail: compactDetail({
      ...detail,
      requestSource: context.source,
      toolName: context.toolName,
    }),
    event: 'requirements.high_risk_mutation.succeeded',
    outcome: 'success',
    request: securityRequestFromContext(
      context,
      '/requirements/high-risk-mutation',
    ),
  })
}
