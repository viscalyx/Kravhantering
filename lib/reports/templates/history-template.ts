import {
  isRequirementPendingStatus,
  isRequirementPublishedStatus,
} from '@/lib/requirements/lifecycle'
import type { RequirementReportData } from '../data/fetch-requirement'
import { requirementPackageName } from '../package-name'
import {
  formatReportTemplate,
  getReportLabels,
  localizeReportValue,
  type ReportLabels,
} from '../report-labels'
import type {
  ReportModel,
  ReportSection,
  TimelineEntryData,
  VersionSummaryData,
} from '../types'

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

function toVersionSummary(
  version: RequirementReportData['versions'][number],
  locale: string,
  labels: ReportLabels,
): VersionSummaryData {
  return {
    versionNumber: version.versionNumber,
    description: version.description,
    acceptanceCriteria: version.acceptanceCriteria,
    verifiable: version.verifiable,
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
    priorityLevel: version.priorityLevel
      ? {
          nameSv: version.priorityLevel.nameSv,
          nameEn: version.priorityLevel.nameEn,
          color: version.priorityLevel.color,
          iconName: version.priorityLevel.iconName,
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
    requirementPackages: version.versionRequirementPackages.flatMap(vs => {
      const requirementPackage = vs.requirementPackage
      const name = requirementPackageName(requirementPackage).trim()
      if (!name) return []
      return [
        {
          name,
        },
      ]
    }),
  }
}

function toTimelineEntry(
  version: RequirementReportData['versions'][number],
  locale: string,
  labels: ReportLabels,
): TimelineEntryData {
  const desc = version.description
  return {
    versionNumber: version.versionNumber,
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
    descriptionExcerpt:
      desc && desc.length > 200 ? `${desc.slice(0, 200)}...` : desc,
  }
}

export function buildHistoryReport(
  requirement: RequirementReportData,
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()
  const labels = getReportLabels(locale)

  const sortedVersions = [...requirement.versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )

  const publishedVersion = sortedVersions.find(v =>
    isRequirementPublishedStatus(v.status),
  )

  const unpublishedVersions = sortedVersions.filter(v =>
    isRequirementPendingStatus(v.status),
  )

  sections.push({
    type: 'header',
    title: labels.titles.history,
    requirementId: requirement.uniqueId,
    generatedAt: now,
  })

  if (publishedVersion) {
    sections.push({
      type: 'version-summary',
      version: toVersionSummary(publishedVersion, locale, labels),
      label: labels.common.currentPublishedVersion,
    })
  }

  for (const version of unpublishedVersions) {
    sections.push({
      type: 'version-summary',
      version: toVersionSummary(version, locale, labels),
      label: formatReportTemplate(labels.common.unpublishedVersion, {
        version: version.versionNumber,
      }),
      isUnpublished: true,
    })
  }

  for (const version of sortedVersions) {
    sections.push({
      type: 'timeline-entry',
      entry: toTimelineEntry(version, locale, labels),
    })
  }

  return { sections }
}
