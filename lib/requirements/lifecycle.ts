import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

export interface RequirementLifecycleState {
  archiveInitiatedAt?: Date | string | null
  statusId: number | null | undefined
}

export function isRequirementDraftStatus(
  statusId: number | null | undefined,
): boolean {
  return statusId === STATUS_DRAFT
}

export function isRequirementReviewStatus(
  statusId: number | null | undefined,
): boolean {
  return statusId === STATUS_REVIEW
}

export function isRequirementPublishedStatus(
  statusId: number | null | undefined,
): boolean {
  return statusId === STATUS_PUBLISHED
}

export function isRequirementArchivedStatus(
  statusId: number | null | undefined,
): boolean {
  return statusId === STATUS_ARCHIVED
}

export function isRequirementPendingStatus(
  statusId: number | null | undefined,
): boolean {
  return (
    isRequirementDraftStatus(statusId) || isRequirementReviewStatus(statusId)
  )
}

export function hasArchiveInitiated(
  state: Pick<RequirementLifecycleState, 'archiveInitiatedAt'>,
): boolean {
  return state.archiveInitiatedAt != null
}

export function isArchivingReviewState(
  state: RequirementLifecycleState,
): boolean {
  return isRequirementReviewStatus(state.statusId) && hasArchiveInitiated(state)
}

export function canArchivingReviewTransitionTo(
  toStatusId: number | null | undefined,
): boolean {
  return (
    isRequirementArchivedStatus(toStatusId) ||
    isRequirementPublishedStatus(toStatusId)
  )
}

export function isArchivingInitiationTransition(
  fromStatusId: number | null | undefined,
  toStatusId: number | null | undefined,
): boolean {
  return (
    isRequirementPublishedStatus(fromStatusId) &&
    isRequirementReviewStatus(toStatusId)
  )
}

export function isArchivingCancellationTransition(
  fromState: RequirementLifecycleState,
  toStatusId: number | null | undefined,
): boolean {
  return (
    isArchivingReviewState(fromState) &&
    isRequirementPublishedStatus(toStatusId)
  )
}

export function shouldAutoArchivePublishedPredecessor(
  fromState: RequirementLifecycleState,
  toStatusId: number | null | undefined,
): boolean {
  return (
    isRequirementPublishedStatus(toStatusId) &&
    !isArchivingCancellationTransition(fromState, toStatusId)
  )
}

export function resolveRequirementArchivedFlag(
  currentIsArchived: boolean,
  toStatusId: number | null | undefined,
): boolean {
  if (isRequirementArchivedStatus(toStatusId)) return true
  if (isRequirementPublishedStatus(toStatusId)) return false
  return currentIsArchived
}
