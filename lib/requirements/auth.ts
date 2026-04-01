import { forbiddenError } from '@/lib/requirements/errors'

export type ActorSource = 'anonymous' | 'headers' | 'session' | 'token' | 'mcp'
export type RequestSource = 'rest' | 'mcp'

export interface ActorContext {
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

    if (!requiredRoles || requiredRoles.length === 0) {
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

export function getActorContextFromRequest(request: Request): ActorContext {
  const actorId = request.headers.get('x-user-id')
  const rawRoles = request.headers.get('x-user-roles')

  return {
    id: actorId,
    roles: rawRoles
      ? rawRoles
          .split(',')
          .map(role => role.trim())
          .filter(Boolean)
      : [],
    source: actorId ? 'headers' : 'anonymous',
    isAuthenticated: Boolean(actorId),
  }
}

export function createRequestContext(
  request: Request,
  source: RequestSource,
  toolName?: string,
): RequestContext {
  return {
    actor: getActorContextFromRequest(request),
    requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
    source,
    toolName,
  }
}
