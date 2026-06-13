import type { SecurityEventRequest } from '@/lib/auth/audit'
import { getClientIp } from '@/lib/auth/client-ip'
import { getAuthConfig } from '@/lib/auth/config'
import { assertSameOriginRequest } from '@/lib/auth/csrf'
import {
  getSessionFromRequest,
  isSignedIn,
  type LoggedInSession,
} from '@/lib/auth/session'
import type { SqlServerDatabase } from '@/lib/db'
import { resolveRequestCorrelationIds } from '@/lib/observability/request-ids'
import { AssignmentBasedAuthorizationService } from '@/lib/requirements/assignment-authorization'
import { forbiddenError, validationError } from '@/lib/requirements/errors'

// In-process attachment of verified actor identities to Request objects.
// Used by the MCP route after JWT verification and by tests.
const ATTACHED_ACTORS = new WeakMap<Request, ActorContext>()

export function attachVerifiedActor(
  request: Request,
  actor: ActorContext,
): void {
  ATTACHED_ACTORS.set(request, actor)
}

function getAttachedActor(request: Request): ActorContext | undefined {
  return ATTACHED_ACTORS.get(request)
}

export type ActorSource = 'anonymous' | 'oidc' | 'mcp'
export type RequestSource = 'rest' | 'mcp'

export interface ActorContext {
  /** Resolved display name. Empty string when not known. */
  displayName: string
  /**
   * HSA-id when the actor was authenticated and a verified `employeeHsaId`
   * claim was present. `null` for anonymous actors.
   */
  hsaId: string | null
  id: string | null
  isAuthenticated: boolean
  roles: string[]
  source: ActorSource
}

export interface RequestContext {
  actor: ActorContext
  correlationId: string
  request?: SecurityEventRequest
  requestId: string
  source: RequestSource
  toolName?: string
}

export interface ActorIdentitySnapshot {
  displayName: string
  hsaId: string
}

export function requireHumanActorSnapshot(
  context: RequestContext,
): ActorIdentitySnapshot {
  const hsaId = context.actor.hsaId
  if (!context.actor.isAuthenticated || !hsaId || hsaId.startsWith('mcp-')) {
    throw validationError(
      'Authenticated actor with a verified HSA-id is required for this write',
      {
        reason: 'missing_actor_hsa_id',
        source: context.actor.source,
      },
    )
  }

  return {
    displayName: context.actor.displayName.trim() || context.actor.id || hsaId,
    hsaId,
  }
}

export type RequirementsAction =
  | {
      kind: 'query_catalog'
      catalog: string
    }
  | {
      kind: 'list_specifications'
      nameSearch?: string
    }
  | {
      kind: 'get_specification_items'
      specificationId?: number
      specificationSlug?: string
    }
  | {
      kind: 'add_to_specification'
      specificationId?: number
      specificationSlug?: string
      requirementIds: number[]
    }
  | {
      kind: 'remove_from_specification'
      specificationId?: number
      specificationSlug?: string
      requirementIds: number[]
    }
  | {
      kind: 'list_graduation_target_areas'
      localRequirementId: number
      specificationId?: number
      specificationSlug?: string
    }
  | {
      kind: 'graduate_specification_local_requirement'
      localRequirementId: number
      requirementAreaId: number
      specificationId?: number
      specificationSlug?: string
    }
  | {
      kind: 'manage_specification_local_requirement'
      operation: string
      specificationId?: number
      specificationSlug?: string
      localRequirementId?: number
    }
  | {
      kind: 'manage_specification_needs_reference'
      operation: string
      specificationId?: number
      specificationSlug?: string
      needsReferenceId?: number
    }
  | {
      kind: 'get_requirement'
      uniqueId?: string
      id?: number
      versionNumber?: number
      view?: 'detail' | 'history' | 'version'
    }
  | {
      kind: 'manage_requirement'
      areaId?: number
      operation: string
      uniqueId?: string
      id?: number
    }
  | {
      kind: 'transition_requirement'
      toStatusId: number
      uniqueId?: string
      id?: number
    }
  | {
      kind: 'list_deviations'
      specificationId?: number
      specificationSlug?: string
    }
  | {
      kind: 'manage_deviation'
      operation: string
      deviationId?: number
      specificationItemId?: number
    }
  | {
      kind: 'list_suggestions'
      requirementId?: number
      uniqueId?: string
    }
  | {
      kind: 'manage_suggestion'
      operation: string
      suggestionId?: number
      requirementId?: number
    }
  | {
      kind: 'generate_requirements'
      scopeId?: number
      scopeType?: 'requirement_area' | 'specification'
    }

export interface AuthorizationService {
  assertAuthorized(
    action: RequirementsAction,
    context: RequestContext,
  ): Promise<void>
}

export class RoleBasedAuthorizationService implements AuthorizationService {
  constructor(
    private readonly policies: Partial<
      Record<RequirementsAction['kind'], readonly string[]>
    >,
  ) {}

  async assertAuthorized(action: RequirementsAction, context: RequestContext) {
    const requiredRoles = this.policies[action.kind]

    if (requiredRoles === undefined) {
      throw forbiddenError(`No policy defined for action ${action.kind}`, {
        actionKind: action.kind,
        actorRoles: context.actor.roles,
        reason: 'policy_missing',
      })
    }

    if (requiredRoles.length === 0) {
      return
    }

    const hasRole = requiredRoles.some(role =>
      context.actor.roles.includes(role),
    )
    if (!hasRole) {
      throw forbiddenError(`Missing required role for ${action.kind}`, {
        actorRoles: context.actor.roles,
        reason: 'required_role_missing',
        requiredRoles,
      })
    }
  }
}

/**
 * Default production authorization service for REST and MCP runtime wiring.
 * Tests that exercise business workflows in isolation should inject a local
 * test `AuthorizationService` explicitly.
 */
export function createDefaultAuthorizationService(
  db?: SqlServerDatabase,
): AuthorizationService {
  return new AssignmentBasedAuthorizationService(db)
}

async function getActorContextFromSession(
  request: Request,
): Promise<ActorContext> {
  const attached = getAttachedActor(request)
  if (attached) return attached

  // Auth is mandatory — calling getAuthConfig() ensures required env vars
  // are present and throws on misconfiguration.
  getAuthConfig()

  assertSameOriginRequest(request)

  const probe = new Response()
  const session = await getSessionFromRequest(request, probe)
  if (!isSignedIn(session)) {
    return {
      id: null,
      displayName: '',
      hsaId: null,
      roles: [],
      source: 'anonymous',
      isAuthenticated: false,
    }
  }
  const data: LoggedInSession = session
  return {
    id: data.sub,
    displayName: data.name,
    hsaId: data.hsaId,
    roles: [...data.roles],
    source: 'oidc',
    isAuthenticated: true,
  }
}

function stripQueryAndFragment(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? ''
}

function buildSecurityEventRequest(
  request: Request,
  requestId: string,
): SecurityEventRequest {
  let path = ''
  try {
    path = new URL(request.url).pathname
  } catch {
    path = stripQueryAndFragment(request.url)
  }

  const out: SecurityEventRequest = {
    method: request.method,
    path,
    requestId,
  }
  const userAgent = request.headers.get('user-agent')
  if (userAgent) out.userAgent = userAgent
  const ip = getClientIp(request)
  if (ip) out.ip = ip
  return out
}

export async function createRequestContext(
  request: Request,
  source: RequestSource,
  toolName?: string,
): Promise<RequestContext> {
  const { correlationId, requestId } = resolveRequestCorrelationIds(
    request.headers,
  )
  return {
    actor: await getActorContextFromSession(request),
    correlationId,
    request: buildSecurityEventRequest(request, requestId),
    requestId,
    source,
    toolName,
  }
}
