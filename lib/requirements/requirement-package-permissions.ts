import { canAuthorAnyArea } from '@/lib/dal/requirement-areas'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError, unauthorizedError } from '@/lib/requirements/errors'

export type RequirementPackagePermission =
  | 'requirement_package.archive'
  | 'requirement_package.delete'
  | 'requirement_package.create'
  | 'requirement_package.update'

const REQUIREMENT_PACKAGE_PERMISSION_ROLES: Record<
  RequirementPackagePermission,
  readonly string[]
> = {
  'requirement_package.archive': ['Admin'],
  'requirement_package.create': [],
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

function isAdmin(context: RequestContext): boolean {
  return context.actor.roles.includes('Admin')
}

function requireAuthenticatedHumanHsaId(context: RequestContext): string {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError()
  }

  const hsaId = context.actor.hsaId
  if (!hsaId) {
    throw forbiddenError('Verified actor HSA-id is required', {
      reason: 'missing_actor_hsa_id',
    })
  }

  return hsaId
}

export async function requireRequirementPackageCreatePermission(
  db: SqlServerDatabase,
  context: RequestContext,
): Promise<void> {
  const actorHsaId = requireAuthenticatedHumanHsaId(context)
  const allowed = await canAuthorAnyArea(db, actorHsaId, isAdmin(context))
  if (allowed) {
    return
  }

  throw forbiddenError(
    'Requirement package creation requires requirement area author access',
    {
      reason: 'requirement_area_author_required',
      requiredPermission: 'requirement_package.create',
    },
  )
}

export async function requireRequirementPackageLeadOrAdmin(
  db: SqlServerDatabase,
  context: RequestContext,
  requirementPackageId: number,
  permission: RequirementPackagePermission,
): Promise<void> {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError()
  }

  if (isAdmin(context)) {
    return
  }

  const actorHsaId = context.actor.hsaId
  if (!actorHsaId) {
    throw forbiddenError('Verified actor HSA-id is required', {
      reason: 'missing_actor_hsa_id',
      requiredPermission: permission,
    })
  }

  const rows = (await db.query(
    `
      SELECT TOP (1) id
      FROM requirement_packages
      WHERE id = @0
        AND lead_hsa_id = @1
    `,
    [requirementPackageId, actorHsaId],
  )) as Array<{ id: number }>

  if (rows.length > 0) {
    return
  }

  throw forbiddenError(
    `Missing required package lead permission for ${permission}`,
    {
      reason: 'package_lead_required',
      requiredPermission: permission,
      requirementPackageId,
    },
  )
}
