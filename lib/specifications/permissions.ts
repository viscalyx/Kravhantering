import type { ActorContext, RequestContext } from '@/lib/requirements/auth'

export interface SpecificationPermissions {
  canEditContent: boolean
  canManageAssignments: boolean
  canReviewDecisions: boolean
  canUseAi: boolean
}

export interface SpecificationPermissionTarget {
  coAuthorHsaIds?: readonly string[]
  responsibleHsaId: string
}

function hasRole(actor: ActorContext, role: string): boolean {
  return actor.roles.includes(role)
}

function actorHsaId(actor: ActorContext): string | null {
  return actor.hsaId?.trim() || null
}

export function canCreateSpecification(context: RequestContext): boolean {
  return context.actor.isAuthenticated && actorHsaId(context.actor) !== null
}

export function canReadAllSpecifications(context: RequestContext): boolean {
  return hasRole(context.actor, 'Admin') || hasRole(context.actor, 'Reviewer')
}

export function isSpecificationResponsible(
  context: RequestContext,
  target: SpecificationPermissionTarget,
): boolean {
  const hsaId = actorHsaId(context.actor)
  return hsaId !== null && target.responsibleHsaId === hsaId
}

export function isSpecificationCoAuthor(
  context: RequestContext,
  target: SpecificationPermissionTarget,
): boolean {
  const hsaId = actorHsaId(context.actor)
  return hsaId !== null && (target.coAuthorHsaIds ?? []).includes(hsaId)
}

export function canReadSpecification(
  context: RequestContext,
  target: SpecificationPermissionTarget,
): boolean {
  return (
    canReadAllSpecifications(context) ||
    isSpecificationResponsible(context, target) ||
    isSpecificationCoAuthor(context, target)
  )
}

export function specificationPermissions(
  context: RequestContext,
  target: SpecificationPermissionTarget,
): SpecificationPermissions {
  const isAdmin = hasRole(context.actor, 'Admin')
  const isReviewer = hasRole(context.actor, 'Reviewer')
  const isResponsible = isSpecificationResponsible(context, target)
  const isCoAuthor = isSpecificationCoAuthor(context, target)
  const canEditContent = isAdmin || isResponsible || isCoAuthor

  return {
    canEditContent,
    canManageAssignments: isAdmin || isResponsible,
    canReviewDecisions: isReviewer,
    canUseAi: isAdmin || canEditContent,
  }
}
