import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError, unauthorizedError } from '@/lib/requirements/errors'

export type NormReferencePermission =
  | 'norm_reference.archive'
  | 'norm_reference.delete'
  | 'norm_reference.update'

const NORM_REFERENCE_PERMISSION_ROLES: Record<
  NormReferencePermission,
  readonly string[]
> = {
  'norm_reference.archive': ['Admin'],
  'norm_reference.delete': ['Admin'],
  'norm_reference.update': ['Admin'],
}

export function requireNormReferencePermission(
  context: RequestContext,
  permission: NormReferencePermission,
): void {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError()
  }

  const requiredRoles = NORM_REFERENCE_PERMISSION_ROLES[permission]
  const hasPermission = requiredRoles.some(role =>
    context.actor.roles.includes(role),
  )
  if (!hasPermission) {
    throw forbiddenError(`Missing required permission for ${permission}`, {
      actorRoles: context.actor.roles,
      reason: 'required_permission_missing',
      requiredPermission: permission,
      requiredRoles,
    })
  }
}
