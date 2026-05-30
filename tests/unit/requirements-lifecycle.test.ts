import { describe, expect, it } from 'vitest'
import {
  canArchivingReviewTransitionTo,
  hasArchiveInitiated,
  isArchivingCancellationTransition,
  isArchivingInitiationTransition,
  isArchivingReviewState,
  isRequirementArchivedStatus,
  isRequirementDraftStatus,
  isRequirementPendingStatus,
  isRequirementPublishedStatus,
  isRequirementReviewStatus,
  resolveRequirementArchivedFlag,
  shouldAutoArchivePublishedPredecessor,
} from '@/lib/requirements/lifecycle'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

describe('requirement lifecycle helpers', () => {
  it('preserves the seeded requirement version status IDs', () => {
    expect(STATUS_DRAFT).toBe(1)
    expect(STATUS_REVIEW).toBe(2)
    expect(STATUS_PUBLISHED).toBe(3)
    expect(STATUS_ARCHIVED).toBe(4)
  })

  it('recognizes individual requirement version statuses only for their canonical IDs', () => {
    expect(isRequirementDraftStatus(STATUS_DRAFT)).toBe(true)
    expect(isRequirementDraftStatus(STATUS_REVIEW)).toBe(false)
    expect(isRequirementDraftStatus(null)).toBe(false)

    expect(isRequirementReviewStatus(STATUS_REVIEW)).toBe(true)
    expect(isRequirementReviewStatus(99)).toBe(false)
    expect(isRequirementReviewStatus(undefined)).toBe(false)

    expect(isRequirementPublishedStatus(STATUS_PUBLISHED)).toBe(true)
    expect(isRequirementPublishedStatus(STATUS_ARCHIVED)).toBe(false)

    expect(isRequirementArchivedStatus(STATUS_ARCHIVED)).toBe(true)
    expect(isRequirementArchivedStatus(0)).toBe(false)
  })

  it('treats draft and review as pending statuses', () => {
    expect(isRequirementPendingStatus(STATUS_DRAFT)).toBe(true)
    expect(isRequirementPendingStatus(STATUS_REVIEW)).toBe(true)
    expect(isRequirementPendingStatus(STATUS_PUBLISHED)).toBe(false)
    expect(isRequirementPendingStatus(STATUS_ARCHIVED)).toBe(false)
    expect(isRequirementPendingStatus(null)).toBe(false)
  })

  it('detects archiving review only when Review has archive initiation', () => {
    expect(
      isArchivingReviewState({
        archiveInitiatedAt: '2026-05-10T12:00:00.000Z',
        statusId: STATUS_REVIEW,
      }),
    ).toBe(true)
    expect(
      isArchivingReviewState({
        archiveInitiatedAt: null,
        statusId: STATUS_REVIEW,
      }),
    ).toBe(false)
    expect(
      isArchivingReviewState({
        archiveInitiatedAt: new Date('2026-05-10T12:00:00.000Z'),
        statusId: STATUS_PUBLISHED,
      }),
    ).toBe(false)
  })

  it('checks archive initiation independently from status', () => {
    expect(hasArchiveInitiated({ archiveInitiatedAt: '2026-05-10' })).toBe(true)
    expect(hasArchiveInitiated({ archiveInitiatedAt: new Date() })).toBe(true)
    expect(hasArchiveInitiated({ archiveInitiatedAt: null })).toBe(false)
    expect(hasArchiveInitiated({})).toBe(false)
  })

  it('restricts archiving review transitions to Archived or Published', () => {
    expect(canArchivingReviewTransitionTo(STATUS_ARCHIVED)).toBe(true)
    expect(canArchivingReviewTransitionTo(STATUS_PUBLISHED)).toBe(true)
    expect(canArchivingReviewTransitionTo(STATUS_DRAFT)).toBe(false)
    expect(canArchivingReviewTransitionTo(99)).toBe(false)
    expect(canArchivingReviewTransitionTo(null)).toBe(false)
  })

  it('identifies archiving initiation and cancellation transitions', () => {
    expect(
      isArchivingInitiationTransition(STATUS_PUBLISHED, STATUS_REVIEW),
    ).toBe(true)
    expect(isArchivingInitiationTransition(STATUS_REVIEW, STATUS_DRAFT)).toBe(
      false,
    )

    const archivingReview = {
      archiveInitiatedAt: '2026-05-10T12:00:00.000Z',
      statusId: STATUS_REVIEW,
    }
    expect(
      isArchivingCancellationTransition(archivingReview, STATUS_PUBLISHED),
    ).toBe(true)
    expect(
      isArchivingCancellationTransition(archivingReview, STATUS_ARCHIVED),
    ).toBe(false)
    expect(
      isArchivingCancellationTransition(
        { archiveInitiatedAt: null, statusId: STATUS_REVIEW },
        STATUS_PUBLISHED,
      ),
    ).toBe(false)
  })

  it('auto-archives published predecessors except when cancelling archiving', () => {
    expect(
      shouldAutoArchivePublishedPredecessor(
        { archiveInitiatedAt: null, statusId: STATUS_REVIEW },
        STATUS_PUBLISHED,
      ),
    ).toBe(true)
    expect(
      shouldAutoArchivePublishedPredecessor(
        {
          archiveInitiatedAt: '2026-05-10T12:00:00.000Z',
          statusId: STATUS_REVIEW,
        },
        STATUS_PUBLISHED,
      ),
    ).toBe(false)
    expect(
      shouldAutoArchivePublishedPredecessor(
        { archiveInitiatedAt: null, statusId: STATUS_DRAFT },
        STATUS_REVIEW,
      ),
    ).toBe(false)
  })

  it('resolves the requirement archived flag from terminal status changes', () => {
    expect(resolveRequirementArchivedFlag(false, STATUS_ARCHIVED)).toBe(true)
    expect(resolveRequirementArchivedFlag(true, STATUS_PUBLISHED)).toBe(false)
    expect(resolveRequirementArchivedFlag(true, STATUS_REVIEW)).toBe(true)
    expect(resolveRequirementArchivedFlag(false, STATUS_REVIEW)).toBe(false)
    expect(resolveRequirementArchivedFlag(true, 99)).toBe(true)
    expect(resolveRequirementArchivedFlag(false, null)).toBe(false)
  })
})
