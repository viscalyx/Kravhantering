import {
  recordSecurityEvent,
  type SecurityEventActor,
  type SecurityEventDetailValue,
  type SecurityEventRequest,
} from '@/lib/auth/audit'
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
  decision?: number
  deleted?: string
  deviationId?: number
  operation?: string
  removedCount?: number
  requirementCount?: number
  requirementId?: number
  requirementUniqueId?: string
  resolution?: number
  restoredVersionNumber?: number
  specificationId?: number
  specificationSlug?: string
  suggestionId?: number
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
    case 'generate_requirements':
      return { actionKind: action.kind }
  }
}

export function recordAuthorizationDenied(
  context: RequestContext,
  action: RequirementsAction,
  error: unknown,
): void {
  if (
    !isRequirementsServiceError(error) ||
    (error.code !== 'forbidden' && error.code !== 'unauthorized')
  ) {
    return
  }

  const requiredRoles = stringArrayDetail(error.details?.requiredRoles)
  const reason =
    typeof error.details?.reason === 'string' ? error.details.reason : undefined

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

export function recordHighRiskMutationSucceeded(
  context: RequestContext,
  detail: HighRiskMutationAuditDetail,
): void {
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
