import {
  isArchivingReviewState,
  isRequirementArchivedStatus,
  isRequirementPublishedStatus,
  isRequirementReviewStatus,
} from '@/lib/requirements/lifecycle'
import type { RequirementReportData } from '../data/fetch-requirement'
import { requirementPackageName } from '../package-name'
import {
  formatReportBoolean,
  formatReportTemplate,
  getReportLabels,
  localizeReportValue,
  type ReportLabels,
} from '../report-labels'
import { diffText } from '../text-diff'
import type {
  MetadataChange,
  ReportModel,
  ReportSection,
  VersionSummaryData,
} from '../types'

type LocalizedNameItem = {
  nameSv: string | null
  nameEn: string | null
} | null

function getStatusLabel(
  version: RequirementReportData['versions'][number],
  locale: string,
  labels: ReportLabels,
): string {
  return (
    localizeReportValue(locale, version.statusNameSv, version.statusNameEn) ||
    labels.common.unknown
  )
}

function getName(item: LocalizedNameItem, locale: string): string | null {
  if (!item) return null
  return localizeReportValue(locale, item.nameSv, item.nameEn) || null
}

function getRequirementPackageDisplayName(
  item: { name: string | null } | null,
): string | null {
  const name = requirementPackageName(item).trim()
  return name || null
}

function collectPackageNames(
  version: RequirementReportData['versions'][number],
): string {
  return version.versionRequirementPackages
    .flatMap(({ requirementPackage }) => {
      const name = getRequirementPackageDisplayName(requirementPackage)
      return name ? [name] : []
    })
    .sort()
    .join(', ')
}

function collectPackageIds(
  version: RequirementReportData['versions'][number],
): string {
  return version.versionRequirementPackages
    .map(({ requirementPackage }) => requirementPackage?.id)
    .filter((id): id is number => Number.isInteger(id))
    .sort((a, b) => a - b)
    .join(',')
}

function toVersionSummary(
  version: RequirementReportData['versions'][number],
  locale: string,
  labels: ReportLabels,
): VersionSummaryData {
  return {
    versionNumber: version.versionNumber,
    description: version.description,
    acceptanceCriteria: version.acceptanceCriteria,
    requiresTesting: version.requiresTesting,
    verificationMethod: version.verificationMethod,
    category: version.category
      ? {
          nameSv: version.category.nameSv,
          nameEn: version.category.nameEn,
        }
      : null,
    type: version.type
      ? { nameSv: version.type.nameSv, nameEn: version.type.nameEn }
      : null,
    qualityCharacteristic: version.qualityCharacteristic
      ? {
          nameSv: version.qualityCharacteristic.nameSv,
          nameEn: version.qualityCharacteristic.nameEn,
        }
      : null,
    riskLevel: version.riskLevel
      ? {
          nameSv: version.riskLevel.nameSv,
          nameEn: version.riskLevel.nameEn,
          color: version.riskLevel.color,
          iconName: version.riskLevel.iconName,
        }
      : null,
    status: {
      label: getStatusLabel(version, locale, labels),
      color: version.statusColor,
      iconName: version.statusIconName,
    },
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    editedAt: version.editedAt,
    publishedAt: version.publishedAt,
    archivedAt: version.archivedAt,
    normReferences: version.versionNormReferences
      .filter(vnr => vnr.normReference)
      .map(vnr => ({
        name: vnr.normReference.name,
        reference: vnr.normReference.reference,
        uri: vnr.normReference.uri,
      })),
    requirementPackages: version.versionRequirementPackages.flatMap(
      ({ requirementPackage }) => {
        const name = requirementPackageName(requirementPackage).trim()
        return name ? [{ name }] : []
      },
    ),
  }
}

function computeMetadataChanges(
  baseVersion: RequirementReportData['versions'][number],
  reviewVersion: RequirementReportData['versions'][number],
  locale: string,
  labels: ReportLabels,
): MetadataChange[] {
  const changes: MetadataChange[] = []

  const oldCat = getName(baseVersion.category, locale)
  const newCat = getName(reviewVersion.category, locale)
  if (oldCat !== newCat) {
    changes.push({
      field: labels.columns.category,
      oldValue: oldCat,
      newValue: newCat,
    })
  }

  const oldType = getName(baseVersion.type, locale)
  const newType = getName(reviewVersion.type, locale)
  if (oldType !== newType) {
    changes.push({
      field: labels.columns.type,
      oldValue: oldType,
      newValue: newType,
    })
  }

  const oldQc = getName(baseVersion.qualityCharacteristic, locale)
  const newQc = getName(reviewVersion.qualityCharacteristic, locale)
  if (oldQc !== newQc) {
    changes.push({
      field: labels.columns.qualityCharacteristic,
      oldValue: oldQc,
      newValue: newQc,
    })
  }

  const oldRl = getName(baseVersion.riskLevel, locale)
  const newRl = getName(reviewVersion.riskLevel, locale)
  if (oldRl !== newRl) {
    changes.push({
      field: labels.columns.riskLevel,
      oldValue: oldRl,
      newValue: newRl,
    })
  }

  if (baseVersion.requiresTesting !== reviewVersion.requiresTesting) {
    changes.push({
      field: labels.columns.requiresTesting,
      oldValue: formatReportBoolean(baseVersion.requiresTesting, labels),
      newValue: formatReportBoolean(reviewVersion.requiresTesting, labels),
    })
  }

  if (baseVersion.verificationMethod !== reviewVersion.verificationMethod) {
    changes.push({
      field: labels.columns.verificationMethod,
      oldValue: baseVersion.verificationMethod,
      newValue: reviewVersion.verificationMethod,
    })
  }

  const oldRequirementPackages = collectPackageNames(baseVersion)
  const newRequirementPackages = collectPackageNames(reviewVersion)
  const oldRequirementPackageIds = collectPackageIds(baseVersion)
  const newRequirementPackageIds = collectPackageIds(reviewVersion)
  if (oldRequirementPackageIds !== newRequirementPackageIds) {
    changes.push({
      field: labels.columns.requirementPackages,
      oldValue: oldRequirementPackages || null,
      newValue: newRequirementPackages || null,
    })
  }

  const oldRefs = baseVersion.versionNormReferences
    .map(vnr => vnr.normReference?.name ?? '')
    .sort()
    .join(', ')
  const newRefs = reviewVersion.versionNormReferences
    .map(vnr => vnr.normReference?.name ?? '')
    .sort()
    .join(', ')
  if (oldRefs !== newRefs) {
    changes.push({
      field: labels.columns.references,
      oldValue: oldRefs || null,
      newValue: newRefs || null,
    })
  }

  return changes
}

export function buildReviewReport(
  requirement: RequirementReportData,
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()
  const labels = getReportLabels(locale)

  const sortedVersions = [...requirement.versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )

  const reviewVersion = sortedVersions.find(v =>
    isRequirementReviewStatus(v.status),
  )
  const baseVersion =
    sortedVersions.find(v => isRequirementPublishedStatus(v.status)) ??
    sortedVersions.find(v => isRequirementArchivedStatus(v.status))

  const isArchivingReview =
    reviewVersion != null &&
    isArchivingReviewState({
      archiveInitiatedAt: reviewVersion.archiveInitiatedAt,
      statusId: reviewVersion.status,
    })

  sections.push({
    type: 'header',
    title: isArchivingReview
      ? labels.titles.archiveRequest
      : labels.titles.reviewChangeReport,
    subtitle: isArchivingReview
      ? labels.subtitles.requirementUnderArchivingReview
      : undefined,
    requirementId: requirement.uniqueId,
    generatedAt: now,
    status: reviewVersion
      ? {
          label: getStatusLabel(reviewVersion, locale, labels),
          color: reviewVersion.statusColor,
          iconName: reviewVersion.statusIconName,
        }
      : undefined,
  })

  if (!reviewVersion) {
    sections.push({
      type: 'notice',
      message: labels.notices.noRequirementInReviewStatus,
      severity: 'warning',
    })
    return { sections }
  }

  if (!baseVersion) {
    if (isArchivingReview) {
      sections.push({
        type: 'notice',
        message: labels.notices.archivingReviewNoBase,
        severity: 'warning',
      })
    } else {
      sections.push({
        type: 'notice',
        message: labels.notices.noPublishedOrArchivedBase,
        severity: 'info',
      })
    }
    sections.push({
      type: 'version-summary',
      version: toVersionSummary(reviewVersion, locale, labels),
      label: formatReportTemplate(labels.common.reviewVersion, {
        version: reviewVersion.versionNumber,
      }),
    })
    return { sections }
  }

  const baseLabel = isRequirementPublishedStatus(baseVersion.status)
    ? labels.common.published
    : labels.common.archived

  if (isArchivingReview) {
    sections.push({
      type: 'notice',
      message: formatReportTemplate(labels.notices.archivingComparison, {
        baseLabel,
        baseVersion: baseVersion.versionNumber,
        reviewVersion: reviewVersion.versionNumber,
      }),
      severity: 'warning',
    })
  } else {
    sections.push({
      type: 'notice',
      message: formatReportTemplate(labels.notices.reviewComparison, {
        baseLabel,
        baseVersion: baseVersion.versionNumber,
        reviewVersion: reviewVersion.versionNumber,
      }),
      severity: 'info',
    })
  }

  const descDiff = diffText(baseVersion.description, reviewVersion.description)
  if (descDiff.length > 0) {
    sections.push({
      type: 'diff',
      fieldLabel: labels.columns.requirementText,
      segments: descDiff,
    })
  }

  const criteriaDiff = diffText(
    baseVersion.acceptanceCriteria,
    reviewVersion.acceptanceCriteria,
  )
  if (criteriaDiff.length > 0) {
    sections.push({
      type: 'diff',
      fieldLabel: labels.columns.acceptanceCriteria,
      segments: criteriaDiff,
    })
  }

  const metadataChanges = computeMetadataChanges(
    baseVersion,
    reviewVersion,
    locale,
    labels,
  )
  if (metadataChanges.length > 0) {
    sections.push({
      type: 'metadata-changes',
      changes: metadataChanges,
    })
  }

  return { sections }
}
