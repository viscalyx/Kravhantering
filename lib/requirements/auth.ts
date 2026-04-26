import { getAuthConfig } from '@/lib/auth/config'
import { assertSameOriginRequest } from '@/lib/auth/csrf'
import {
  getSessionFromRequest,
  isSignedIn,
  type LoggedInSession,
} from '@/lib/auth/session'
import { forbiddenError } from '@/lib/requirements/errors'

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
   * claim was present. `null` for anonymous or MCP actors whose token did
   * not carry the claim. MCP service-account tokens carry the synthetic
   * `mcp-client:<client_id>` value here.
   */
  hsaId: string | null
  id: string | null
  isAuthenticated: boolean
  roles: string[]
  source: ActorSource
}

export interface RequestContext {
  actor: ActorContext
  requestId: string
  source: RequestSource
  toolName?: string
}

export type RequirementsAction =
  | {
      kind: 'query_catalog'
      catalog: string
    }
  | {
      kind: 'list_packages'
      nameSearch?: string
    }
  | {
      kind: 'get_package_items'
      packageId?: number
      packageSlug?: string
    }
  | {
      kind: 'add_to_package'
      packageId?: number
      packageSlug?: string
      requirementIds: number[]
    }
  | {
      kind: 'remove_from_package'
      packageId?: number
      packageSlug?: string
      requirementIds: number[]
    }
  | {
      kind: 'get_requirement'
      uniqueId?: string
      id?: number
      versionNumber?: number
    }
  | {
      kind: 'manage_requirement'
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
      packageId?: number
      packageSlug?: string
    }
  | {
      kind: 'manage_deviation'
      operation: string
      deviationId?: number
      packageItemId?: number
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
    }

export interface AuthorizationService {
  assertAuthorized(
    action: RequirementsAction,
    context: RequestContext,
  ): Promise<void>
}

export class AllowAllAuthorizationService implements AuthorizationService {
  async assertAuthorized() {}
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
        actorRoles: context.actor.roles,
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
        requiredRoles,
        actorRoles: context.actor.roles,
      })
    }
  }
}

/**
 * Default authorization service used by `createRequirementsService` when no
 * explicit service is provided. While the role catalogue / policy is being
 * defined, we intentionally return `AllowAllAuthorizationService` so
 * authenticated users can operate. Replace with a real
 * `RoleBasedAuthorizationService({ ... })` once policies are declared.
 */
export function createDefaultAuthorizationService(): AuthorizationService {
  return new AllowAllAuthorizationService()
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

export async function createRequestContext(
  request: Request,
  source: RequestSource,
  toolName?: string,
): Promise<RequestContext> {
  return {
    actor: await getActorContextFromSession(request),
    requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
    source,
    toolName,
  }
}
