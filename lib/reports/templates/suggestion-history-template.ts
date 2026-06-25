import {
  isRequirementPendingStatus,
  isRequirementPublishedStatus,
  isRequirementReviewStatus,
} from '@/lib/requirements/lifecycle'
import type {
  RequirementReportData,
  SuggestionReportRow,
} from '../data/fetch-requirement'
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
  SuggestionReportItem,
  VersionSummaryData,
} from '../types'

const SUGGESTION_RESOLVED = 1
const SUGGESTION_DISMISSED = 2

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
    requiresTesting: version.requiresTesting,
    verificationMethod: version.verificationMethod,
    category: version.category
      ? { nameSv: version.category.nameSv, nameEn: version.category.nameEn }
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
      const name = requirementPackageName(vs.requirementPackage).trim()
      return name ? [{ name }] : []
    }),
  }
}

function getSuggestionStatus(
  suggestion: SuggestionReportRow,
  labels: ReportLabels,
): { label: string; color: string } {
  if (suggestion.resolution === SUGGESTION_RESOLVED) {
    return {
      label: labels.suggestions.resolved,
      color: '#22c55e',
    }
  }
  if (suggestion.resolution === SUGGESTION_DISMISSED) {
    return {
      label: labels.suggestions.dismissed,
      color: '#ef4444',
    }
  }
  if (suggestion.isReviewRequested === 1) {
    return {
      label: labels.suggestions.reviewRequested,
      color: '#eab308',
    }
  }
  return {
    label: labels.suggestions.draft,
    color: '#3b82f6',
  }
}

function toSuggestionItem(
  suggestion: SuggestionReportRow,
  labels: ReportLabels,
): SuggestionReportItem {
  return {
    content: suggestion.content,
    createdBy: suggestion.createdBy,
    createdAt: suggestion.createdAt,
    status: getSuggestionStatus(suggestion, labels),
    resolutionMotivation: suggestion.resolutionMotivation,
    resolvedBy: suggestion.resolvedBy,
    resolvedAt: suggestion.resolvedAt,
  }
}

function getVersionBorderColor(status: number): string | undefined {
  if (isRequirementPublishedStatus(status)) return '#22c55e'
  if (isRequirementReviewStatus(status)) return '#eab308'
  return undefined
}

export function buildSuggestionHistoryReport(
  requirement: RequirementReportData,
  suggestions: SuggestionReportRow[],
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()
  const labels = getReportLabels(locale)

  const sortedVersions = [...requirement.versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )

  const suggestionsByVersionId = new Map<number, SuggestionReportRow[]>()
  const unlinkedSuggestions: SuggestionReportRow[] = []

  for (const s of suggestions) {
    if (s.requirementVersionId != null) {
      const existing = suggestionsByVersionId.get(s.requirementVersionId) ?? []
      existing.push(s)
      suggestionsByVersionId.set(s.requirementVersionId, existing)
    } else {
      unlinkedSuggestions.push(s)
    }
  }

  sections.push({
    type: 'header',
    title: labels.titles.suggestionHistory,
    requirementId: requirement.uniqueId,
    generatedAt: now,
  })

  const emptyLabel = labels.suggestions.empty

  for (const version of sortedVersions) {
    const isUnpublished = isRequirementPendingStatus(version.status)

    sections.push({
      type: 'version-summary',
      version: toVersionSummary(version, locale, labels),
      label: formatReportTemplate(labels.common.version, {
        version: version.versionNumber,
      }),
      borderColor: getVersionBorderColor(version.status),
      isUnpublished,
    })

    const versionSuggestions = suggestionsByVersionId.get(version.id) ?? []
    sections.push({
      type: 'suggestion-list',
      items: versionSuggestions.map(s => toSuggestionItem(s, labels)),
      emptyLabel,
    })
  }

  if (unlinkedSuggestions.length > 0) {
    sections.push({
      type: 'notice',
      message: labels.notices.unlinkedSuggestions,
      severity: 'info',
    })

    sections.push({
      type: 'suggestion-list',
      items: unlinkedSuggestions.map(s => toSuggestionItem(s, labels)),
      emptyLabel,
    })
  }

  return { sections }
}
