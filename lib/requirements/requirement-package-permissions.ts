import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError, unauthorizedError } from '@/lib/requirements/errors'

export type RequirementPackagePermission =
  | 'requirement_package.archive'
  | 'requirement_package.delete'
  | 'requirement_package.update'

const REQUIREMENT_PACKAGE_PERMISSION_ROLES: Record<
  RequirementPackagePermission,
  readonly string[]
> = {
  'requirement_package.archive': ['Admin'],
  'requirement_package.delete': ['Admin'],
  'requirement_package.update': ['Admin'],
}

export function requireRequirementPackagePermission(
  context: RequestContext,
  permission: RequirementPackagePermission,
): void {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError()
  }

  const requiredRoles = REQUIREMENT_PACKAGE_PERMISSION_ROLES[permission]
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
