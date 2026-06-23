import type { TraceabilityReportItem } from '@/lib/dal/requirements-specifications'
import type { SpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'
import {
  formatReportBoolean,
  formatReportTemplate,
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'
import type { ReportModel, ReportSection } from '@/lib/reports/types'

function buildCoverSection(
  data: SpecificationTraceabilityData,
  locale: string,
): ReportSection {
  const specification = data.specification
  return {
    type: 'specification-cover',
    businessNeedsReference: specification.businessNeedsReference,
    governanceObjectType: localizeReportValue(
      locale,
      specification.governanceObjectType?.nameSv ?? null,
      specification.governanceObjectType?.nameEn ?? null,
    ),
    implementationType: localizeReportValue(
      locale,
      specification.implementationType?.nameSv ?? null,
      specification.implementationType?.nameEn ?? null,
    ),
    lifecycleStatus: localizeReportValue(
      locale,
      specification.lifecycleStatus?.nameSv ?? null,
      specification.lifecycleStatus?.nameEn ?? null,
    ),
    locale,
    name: specification.name,
    uniqueId: specification.uniqueId,
  }
}

function formatDate(value: string | null, locale: string): string {
  return value ? new Date(value).toLocaleDateString(locale) : ''
}

function formatOrigin(item: TraceabilityReportItem, locale: string): string {
  const labels = getReportLabels(locale)
  return item.kind === 'library'
    ? labels.common.libraryRequirement
    : labels.common.specificationLocalRequirement
}

function formatArea(item: TraceabilityReportItem, locale: string): string {
  const labels = getReportLabels(locale)
  return item.kind === 'specificationLocal'
    ? labels.common.uniqueRequirement
    : (item.areaName ?? '')
}

function formatUsageStatus(
  item: TraceabilityReportItem,
  locale: string,
): string {
  return localizeReportValue(
    locale,
    item.specificationItemStatusNameSv,
    item.specificationItemStatusNameEn,
  )
}

function formatRiskLevel(item: TraceabilityReportItem, locale: string): string {
  return localizeReportValue(locale, item.riskLevelNameSv, item.riskLevelNameEn)
}

function formatVerification(
  item: TraceabilityReportItem,
  locale: string,
): string {
  const labels = getReportLabels(locale)
  if (!item.requiresTesting) {
    return formatReportBoolean(false, labels)
  }

  if (!item.verificationMethod) {
    return formatReportBoolean(true, labels)
  }

  return `${formatReportBoolean(true, labels)}: ${item.verificationMethod}`
}

function formatDeviationCounts(
  item: TraceabilityReportItem,
  locale: string,
): string {
  const labels = getReportLabels(locale)
  if (item.deviationCounts.total === 0) {
    return labels.traceability.noDeviation
  }

  const counts: Array<[string, number]> = [
    [labels.deviations.pending, item.deviationCounts.pending],
    [labels.deviations.approved, item.deviationCounts.approved],
    [labels.deviations.rejected, item.deviationCounts.rejected],
  ]
  return counts
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}: ${count}`)
    .join(', ')
}

function countByLabel(
  labels: string[],
  emptyLabel: string,
  locale: string,
): { label: string; value: string }[] {
  const counts = new Map<string, number>()
  for (const label of labels) {
    const resolved = label || emptyLabel
    counts.set(resolved, (counts.get(resolved) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => left[0].localeCompare(right[0], locale))
    .map(([label, count]) => ({ label, value: String(count) }))
}

function buildSummarySection(
  data: SpecificationTraceabilityData,
  locale: string,
): ReportSection {
  const labels = getReportLabels(locale)
  const libraryCount = data.items.filter(item => item.kind === 'library').length
  const localCount = data.items.length - libraryCount
  const missingNeedsReferences = data.items.filter(
    item => !item.needsReference,
  ).length
  const deviationTotals = data.items.reduce(
    (totals, item) => ({
      approved: totals.approved + item.deviationCounts.approved,
      pending: totals.pending + item.deviationCounts.pending,
      rejected: totals.rejected + item.deviationCounts.rejected,
    }),
    { approved: 0, pending: 0, rejected: 0 },
  )

  return {
    type: 'traceability-summary',
    title: labels.traceability.summaryTitle,
    metrics: [
      {
        label: labels.traceability.totalApplications,
        value: String(data.items.length),
      },
      {
        label: labels.traceability.libraryRequirements,
        value: String(libraryCount),
      },
      {
        label: labels.traceability.localRequirements,
        value: String(localCount),
      },
      {
        label: labels.traceability.missingNeedsReferences,
        value: String(missingNeedsReferences),
      },
    ],
    groups: [
      {
        heading: labels.traceability.statusDistribution,
        items: countByLabel(
          data.items.map(item => formatUsageStatus(item, locale)),
          labels.common.unknown,
          locale,
        ),
      },
      {
        heading: labels.traceability.deviationsByDecision,
        items: [
          {
            label: labels.deviations.pending,
            value: String(deviationTotals.pending),
          },
          {
            label: labels.deviations.approved,
            value: String(deviationTotals.approved),
          },
          {
            label: labels.deviations.rejected,
            value: String(deviationTotals.rejected),
          },
        ],
      },
    ],
  }
}

function buildTableSection(
  data: SpecificationTraceabilityData,
  locale: string,
): ReportSection {
  const labels = getReportLabels(locale)
  return {
    type: 'traceability-table',
    labels: {
      area: labels.columns.requirementArea,
      deviation: labels.columns.deviationSignal,
      needsReference: labels.columns.needsReference,
      note: labels.columns.note,
      origin: labels.columns.origin,
      riskLevel: labels.columns.riskLevel,
      statusChangedAt: labels.columns.statusChangedAt,
      usageStatus: labels.columns.usageStatus,
      verification: labels.traceability.verification,
      version: labels.columns.version,
    },
    rows: data.items.map(item => ({
      area: formatArea(item, locale),
      deviation: formatDeviationCounts(item, locale),
      needsReference: item.needsReference ?? '',
      note: item.note ?? '',
      origin: formatOrigin(item, locale),
      requirementId: item.uniqueId,
      riskLevel: formatRiskLevel(item, locale),
      statusChangedAt: formatDate(item.statusUpdatedAt, locale),
      usageStatus: formatUsageStatus(item, locale),
      verification: formatVerification(item, locale),
      version: item.versionNumber == null ? '' : String(item.versionNumber),
    })),
  }
}

export function buildSpecificationTraceabilityReport(
  data: SpecificationTraceabilityData,
  locale: string,
): ReportModel {
  const labels = getReportLabels(locale)
  const title = labels.columns.traceabilityReportTitle
  const subtitle = formatReportTemplate(labels.traceability.subtitle, {
    count: data.items.length,
  })

  return {
    orientation: 'portrait',
    sections: [
      buildCoverSection(data, locale),
      { type: 'page-break' },
      {
        type: 'header',
        generatedAt: new Date().toISOString(),
        requirementId: data.specification.uniqueId,
        subtitle,
        title,
      },
      buildSummarySection(data, locale),
      buildTableSection(data, locale),
    ],
  }
}
