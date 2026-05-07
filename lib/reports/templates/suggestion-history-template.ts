import type {
  RequirementReportData,
  SuggestionReportRow,
} from '../data/fetch-requirement'
import type {
  ReportModel,
  ReportSection,
  SuggestionReportItem,
  VersionSummaryData,
} from '../types'

const SUGGESTION_RESOLVED = 1
const SUGGESTION_DISMISSED = 2

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3

function getStatusLabel(
  version: RequirementReportData['versions'][number],
  locale: string,
): string {
  return (
    (locale === 'sv' ? version.statusNameSv : version.statusNameEn) ?? 'Unknown'
  )
}

function toVersionSummary(
  version: RequirementReportData['versions'][number],
  locale: string,
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
    riskLevel: version.riskLevel
      ? { nameSv: version.riskLevel.nameSv, nameEn: version.riskLevel.nameEn }
      : null,
    status: {
      label: getStatusLabel(version, locale),
      color: version.statusColor,
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
    requirementPackages: version.versionRequirementPackages
      .filter(vs => vs.requirementPackage)
      .map(vs => ({
        nameSv: vs.requirementPackage.nameSv ?? '',
        nameEn: vs.requirementPackage.nameEn ?? '',
      })),
  }
}

function getSuggestionStatus(
  suggestion: SuggestionReportRow,
  locale: string,
): { label: string; color: string } {
  if (suggestion.resolution === SUGGESTION_RESOLVED) {
    return {
      label: locale === 'sv' ? 'Åtgärdad' : 'Resolved',
      color: '#22c55e',
    }
  }
  if (suggestion.resolution === SUGGESTION_DISMISSED) {
    return {
      label: locale === 'sv' ? 'Avvisad' : 'Dismissed',
      color: '#ef4444',
    }
  }
  if (suggestion.isReviewRequested === 1) {
    return {
      label: locale === 'sv' ? 'Granskning begärd' : 'Review Requested',
      color: '#eab308',
    }
  }
  return {
    label: locale === 'sv' ? 'Utkast' : 'Draft',
    color: '#3b82f6',
  }
}

function toSuggestionItem(
  suggestion: SuggestionReportRow,
  locale: string,
): SuggestionReportItem {
  return {
    content: suggestion.content,
    createdBy: suggestion.createdBy,
    createdAt: suggestion.createdAt,
    status: getSuggestionStatus(suggestion, locale),
    resolutionMotivation: suggestion.resolutionMotivation,
    resolvedBy: suggestion.resolvedBy,
    resolvedAt: suggestion.resolvedAt,
  }
}

function getVersionBorderColor(status: number): string | undefined {
  if (status === STATUS_PUBLISHED) return '#22c55e'
  if (status === STATUS_REVIEW) return '#eab308'
  return undefined
}

export function buildSuggestionHistoryReport(
  requirement: RequirementReportData,
  suggestions: SuggestionReportRow[],
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()

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
    title:
      locale === 'sv'
        ? 'Ändringsförslagshistorik'
        : 'Improvement Suggestion History',
    requirementId: requirement.uniqueId,
    generatedAt: now,
  })

  const emptyLabel =
    locale === 'sv' ? 'Inga ändringsförslag' : 'No improvement suggestions'

  for (const version of sortedVersions) {
    const isUnpublished =
      version.status === STATUS_DRAFT || version.status === STATUS_REVIEW

    sections.push({
      type: 'version-summary',
      version: toVersionSummary(version, locale),
      label: `${locale === 'sv' ? 'Version' : 'Version'} ${version.versionNumber}`,
      borderColor: getVersionBorderColor(version.status),
      isUnpublished,
    })

    const versionSuggestions = suggestionsByVersionId.get(version.id) ?? []
    sections.push({
      type: 'suggestion-list',
      items: versionSuggestions.map(s => toSuggestionItem(s, locale)),
      emptyLabel,
    })
  }

  if (unlinkedSuggestions.length > 0) {
    sections.push({
      type: 'notice',
      message:
        locale === 'sv'
          ? 'Följande ändringsförslag är inte kopplade till en specifik version'
          : 'The following improvement suggestions are not linked to a specific version',
      severity: 'info',
    })

    sections.push({
      type: 'suggestion-list',
      items: unlinkedSuggestions.map(s => toSuggestionItem(s, locale)),
      emptyLabel,
    })
  }

  return { sections }
}
