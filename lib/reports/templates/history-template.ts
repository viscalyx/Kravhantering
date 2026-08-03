import {
  isRequirementPendingStatus,
  isRequirementPublishedStatus,
} from '@/lib/requirements/lifecycle'
import type { RequirementReportData } from '../data/fetch-requirement'
import {
  formatReportTemplate,
  getReportLabels,
  localizeReportValue,
  type ReportLabels,
} from '../report-labels'
import type { ReportModel, ReportSection, TimelineEntryData } from '../types'
import { createReportVersionSummary } from '../version-summary'

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
      version: createReportVersionSummary(
        publishedVersion,
        getStatusLabel(publishedVersion, locale, labels),
      ),
      label: labels.common.currentPublishedVersion,
    })
  }

  for (const version of unpublishedVersions) {
    sections.push({
      type: 'version-summary',
      version: createReportVersionSummary(
        version,
        getStatusLabel(version, locale, labels),
      ),
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
