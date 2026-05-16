import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  recordSecurityEvent,
  type SecurityEventActor,
  type SecurityEventDetailValue,
  type SecurityEventRequest,
} from '@/lib/auth/audit'
import { getClientIp } from '@/lib/auth/client-ip'
import { assertSameOriginRequest } from '@/lib/auth/csrf'
import {
  getSessionFromRequest,
  isSignedIn,
  type LoggedInSession,
} from '@/lib/auth/session'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { resolveRequestCorrelationIds } from '@/lib/observability/request-ids'
import type { ActorContext, RequestContext } from '@/lib/requirements/auth'

export type AdminPrivilegedActionOperation =
  | 'create'
  | 'delete'
  | 'save'
  | 'update'

export type AdminPrivilegedResourceType =
  | 'norm_reference'
  | 'owner'
  | 'quality_characteristic'
  | 'requirement_area'
  | 'requirement_columns'
  | 'requirement_package'
  | 'requirement_status'
  | 'risk_level'
  | 'specification_implementation_type'
  | 'specification_item_status'
  | 'specification_lifecycle_status'
  | 'specification_responsibility_area'
  | 'ui_terminology'

export interface AdminPrivilegedActionDetail {
  changedFields?: readonly string[]
  itemCount?: number
  operation: AdminPrivilegedActionOperation
  resourceId?: number | string
  resourceType: AdminPrivilegedResourceType
}

type AuditDetail = Record<string, SecurityEventDetailValue | null | undefined>

const PRIVILEGED_IDP_ROLES = new Set(['Admin', 'PrivacyOfficer'])

function compactDetail(
  detail: AuditDetail,
): Record<string, SecurityEventDetailValue> {
  return Object.fromEntries(
    Object.entries(detail).filter(
      (entry): entry is [string, SecurityEventDetailValue] => entry[1] != null,
    ),
  )
}

function auditActor(context: RequestContext): SecurityEventActor {
  const actor: SecurityEventActor = { source: context.actor.source }
  if (context.actor.hsaId) actor.hsaId = context.actor.hsaId
  if (context.actor.id) actor.sub = context.actor.id
  return actor
}

function privilegedRoles(context: RequestContext): readonly string[] {
  return context.actor.roles.filter(role => PRIVILEGED_IDP_ROLES.has(role))
}

function stripQueryAndFragment(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? ''
}

function requestMetadata(
  request: Request,
  requestId: string,
): SecurityEventRequest {
  let path = ''
  try {
    path = new URL(request.url).pathname
  } catch {
    path = stripQueryAndFragment(request.url)
  }

  const metadata: SecurityEventRequest = {
    method: request.method,
    path,
    requestId,
  }
  const userAgent = request.headers.get('user-agent')
  if (userAgent) metadata.userAgent = userAgent
  const ip = getClientIp(request)
  if (ip) metadata.ip = ip
  return metadata
}

function actorFromSession(session: LoggedInSession): ActorContext {
  return {
    displayName: session.name,
    hsaId: session.hsaId,
    id: session.sub,
    isAuthenticated: true,
    roles: [...session.roles],
    source: 'oidc',
  }
}

export async function createAdminPrivilegedAuditContext(
  request: Request,
): Promise<RequestContext> {
  assertSameOriginRequest(request)

  const { correlationId, requestId } = resolveRequestCorrelationIds(
    request.headers,
  )
  const session = await getSessionFromRequest(request, new Response())
  const actor: ActorContext = isSignedIn(session)
    ? actorFromSession(session)
    : {
        displayName: '',
        hsaId: null,
        id: null,
        isAuthenticated: false,
        roles: [],
        source: 'anonymous',
      }
  return {
    actor,
    correlationId,
    request: requestMetadata(request, requestId),
    requestId,
    source: 'rest',
  }
}

function adminActionName(detail: AdminPrivilegedActionDetail): string {
  return `admin.${detail.resourceType}.${detail.operation}`
}

export async function recordAdminPrivilegedActionSucceeded(
  context: RequestContext,
  detail: AdminPrivilegedActionDetail,
): Promise<void> {
  const db = await getRequestSqlServerDataSource()
  await recordAllowedActionAuditEvent(db, context, {
    action: adminActionName(detail),
    details: compactDetail({
      actionKind: 'admin.privileged_action',
      actorRoles: context.actor.roles,
      changedFields: detail.changedFields,
      itemCount: detail.itemCount,
      operation: detail.operation,
      privilegeRoles: privilegedRoles(context),
      privilegeSource: 'idp_role_claim',
      requestSource: context.source,
      resourceId: detail.resourceId,
      resourceType: detail.resourceType,
    }),
    targetId: detail.resourceId,
    targetKind: detail.resourceType,
  })
  recordSecurityEvent({
    actor: auditActor(context),
    detail: compactDetail({
      actionKind: 'admin.privileged_action',
      actorRoles: context.actor.roles,
      changedFields: detail.changedFields,
      itemCount: detail.itemCount,
      operation: detail.operation,
      privilegeRoles: privilegedRoles(context),
      privilegeSource: 'idp_role_claim',
      requestSource: context.source,
      resourceId: detail.resourceId,
      resourceType: detail.resourceType,
    }),
    event: 'admin.privileged_action.succeeded',
    outcome: 'success',
    request: context.request ?? {
      method: 'UNKNOWN',
      path: '/admin/privileged-action',
      requestId: context.requestId,
    },
  })
}
