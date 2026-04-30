import type {
  RequirementDetailResponse,
  RequirementVersionDetail,
} from '@/lib/requirements/types'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from './types'

interface GetDisplayVersionNumberOptions {
  defaultVersion?: number
  inline?: boolean
  requirement: RequirementDetailResponse | null
}

export function getDisplayVersionNumber({
  defaultVersion,
  inline,
  requirement,
}: GetDisplayVersionNumberOptions): number | null {
  if (!requirement) return null

  if (defaultVersion != null) {
    const match = requirement.versions.find(
      version => version.versionNumber === defaultVersion,
    )
    if (match) return match.versionNumber
  }

  if (!inline) {
    const published = requirement.versions.find(
      version => version.status === STATUS_PUBLISHED,
    )
    return published?.versionNumber ?? null
  }

  const displayVersion =
    requirement.versions.find(version => version.status === STATUS_PUBLISHED) ??
    requirement.versions.find(version => version.status === STATUS_ARCHIVED) ??
    requirement.versions[0]

  return displayVersion?.versionNumber ?? null
}

interface RequirementVersionState {
  archivedVersionBannerKey: string | null
  archivedVersionPreferredVersion: RequirementVersionDetail | null
  currentStatusId: number
  currentVersionNumber: number
  displayVersion: RequirementVersionDetail | undefined
  displayViewVersionNumber: number | null
  hasPendingVersion: boolean
  hasPendingWork: boolean
  hasPendingWorkAbovePublished: boolean
  isArchiving: boolean
  isLatestVersionArchived: boolean
  isViewingDisplayVersion: boolean
  isViewingHistory: boolean
  isViewingLatest: boolean
  latest: RequirementVersionDetail | undefined
  latestStatusForActions: number
  latestViewVersionNumber: number | null
  pendingStatusLabel: string
  pendingVersionNumber: number | undefined
  selectedVersion: RequirementVersionDetail | undefined
  selectedViewVersionNumber: number | null
  showsArchivedVersionAvailabilityBanner: boolean
}

export function getRequirementVersionState(
  requirement: RequirementDetailResponse,
  selectedVersionNumber: number | null,
  locale: string,
): RequirementVersionState {
  const latest = requirement.versions[0]
  const latestStatusForActions = latest?.status ?? STATUS_DRAFT
  const isLatestVersionArchived = latestStatusForActions === STATUS_ARCHIVED
  const isArchiving =
    requirement.versions.some(version => version.archiveInitiatedAt != null) ||
    latestStatusForActions === STATUS_ARCHIVED

  const pendingVersions = requirement.versions.filter(
    version =>
      version.status === STATUS_DRAFT || version.status === STATUS_REVIEW,
  )
  const hasPendingWork = pendingVersions.length > 0
  const publishedVersion = requirement.versions.find(
    version => version.status === STATUS_PUBLISHED,
  )
  const hasPendingWorkAbovePublished =
    publishedVersion != null &&
    pendingVersions.some(
      version => version.versionNumber > publishedVersion.versionNumber,
    )

  const displayVersion =
    requirement.versions.find(version => version.status === STATUS_PUBLISHED) ??
    requirement.versions.find(version => version.status === STATUS_ARCHIVED) ??
    latest

  const selectedVersion =
    requirement.versions.find(
      version => version.versionNumber === selectedVersionNumber,
    ) ?? displayVersion

  const newerVersionsThanSelected =
    selectedVersion == null
      ? []
      : requirement.versions.filter(
          version => version.versionNumber > selectedVersion.versionNumber,
        )

  const archivedVersionPreferredVersion =
    selectedVersion?.status === STATUS_ARCHIVED
      ? (newerVersionsThanSelected.find(
          version => version.status === STATUS_PUBLISHED,
        ) ??
        newerVersionsThanSelected.find(
          version => version.status === STATUS_REVIEW,
        ) ??
        newerVersionsThanSelected.find(
          version => version.status === STATUS_DRAFT,
        ) ??
        null)
      : null

  const archivedVersionBannerKey =
    archivedVersionPreferredVersion?.status === STATUS_PUBLISHED
      ? 'publishedVersionAvailableBanner'
      : archivedVersionPreferredVersion?.status === STATUS_REVIEW
        ? 'reviewVersionAvailableBanner'
        : archivedVersionPreferredVersion?.status === STATUS_DRAFT
          ? 'draftVersionAvailableBanner'
          : null

  const showsArchivedVersionAvailabilityBanner =
    archivedVersionPreferredVersion != null && archivedVersionBannerKey != null

  const hasPendingVersion =
    latest?.versionNumber != null &&
    displayVersion?.versionNumber != null &&
    latest.versionNumber !== displayVersion.versionNumber
  const pendingVersionNumber = latest?.versionNumber
  const pendingStatusLabel = hasPendingVersion
    ? ((locale === 'sv' ? latest?.statusNameSv : latest?.statusNameEn) ?? '')
    : ''

  const selectedViewVersionNumber = selectedVersion?.versionNumber ?? null
  const displayViewVersionNumber = displayVersion?.versionNumber ?? null
  const latestViewVersionNumber = latest?.versionNumber ?? null

  const isViewingLatest =
    selectedViewVersionNumber != null &&
    latestViewVersionNumber != null &&
    selectedViewVersionNumber === latestViewVersionNumber

  const isViewingDisplayVersion =
    selectedViewVersionNumber != null &&
    displayViewVersionNumber != null &&
    selectedViewVersionNumber === displayViewVersionNumber

  const isViewingHistory =
    selectedViewVersionNumber != null &&
    displayViewVersionNumber != null &&
    latestViewVersionNumber != null &&
    selectedViewVersionNumber !== displayViewVersionNumber &&
    selectedViewVersionNumber !== latestViewVersionNumber

  const currentVersionNumber = selectedViewVersionNumber ?? 1
  const currentStatusId = selectedVersion?.status ?? STATUS_DRAFT

  return {
    archivedVersionBannerKey,
    archivedVersionPreferredVersion,
    currentStatusId,
    currentVersionNumber,
    displayVersion,
    displayViewVersionNumber,
    hasPendingVersion,
    hasPendingWork,
    hasPendingWorkAbovePublished,
    isArchiving,
    isLatestVersionArchived,
    isViewingDisplayVersion,
    isViewingHistory,
    isViewingLatest,
    latest,
    latestStatusForActions,
    latestViewVersionNumber,
    pendingStatusLabel,
    pendingVersionNumber,
    selectedVersion,
    selectedViewVersionNumber,
    showsArchivedVersionAvailabilityBanner,
  }
}
