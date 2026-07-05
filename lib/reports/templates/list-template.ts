import type { RequirementReportData } from '../data/fetch-requirement'
import {
  formatRequirementCount,
  getReportLabels,
  localizeReportValue,
} from '../report-labels'
import type { ReportModel, ReportSection } from '../types'

export interface SpecificationCoverInfo {
  businessNeedsReference: string | null
  governanceObjectType: string | null
  implementationType: string | null
  lifecycleStatus: string | null
  name: string
  specificationCode: string
}

export interface RequirementSelectionContextRow {
  answerText: string
  areaName: string
  changedAt: string
  isHistorical: boolean
  questionCode: string
  questionText: string
  selectedByDisplayName: string | null
}

export function buildListReport(
  requirements: RequirementReportData[],
  locale: string,
  specificationInfo?: SpecificationCoverInfo,
  requirementSelectionContext: RequirementSelectionContextRow[] = [],
): ReportModel {
  const sections: ReportSection[] = []

  if (specificationInfo) {
    sections.push({ type: 'specification-cover', locale, ...specificationInfo })
    sections.push({ type: 'page-break' })
  }
  const now = new Date().toISOString()

  const count = requirements.length
  const labels = getReportLabels(locale)
  const subtitle = formatRequirementCount(count, labels)

  sections.push({
    type: 'header',
    title: labels.titles.list,
    requirementId: subtitle,
    generatedAt: now,
  })

  if (requirementSelectionContext.length > 0) {
    sections.push({
      type: 'requirement-selection-context',
      title: labels.titles.selectionContext,
      rows: requirementSelectionContext,
    })
  }

  const getStatusName = (
    v: RequirementReportData['versions'][number],
  ): string => {
    return localizeReportValue(locale, v.statusNameSv, v.statusNameEn)
  }

  const columns = [
    {
      key: 'uniqueId',
      label: labels.columns.requirementId,
    },
    {
      key: 'description',
      label: labels.columns.requirementText,
    },
    {
      key: 'area',
      label: labels.columns.requirementArea,
    },
    { key: 'status', label: labels.columns.status },
  ]

  const rows = requirements.map(req => {
    const latestVersion = req.versions.reduce<
      RequirementReportData['versions'][number] | null
    >((latest, v) => {
      if (!latest || v.versionNumber > latest.versionNumber) return v
      return latest
    }, null)

    const description = latestVersion?.description ?? ''
    const truncated =
      description.length > 120 ? `${description.slice(0, 120)}…` : description

    return {
      cells: {
        uniqueId: req.uniqueId,
        description: truncated,
        area: req.area?.name ?? '',
        status: latestVersion ? getStatusName(latestVersion) : '',
      },
      statusColor: latestVersion?.statusColor ?? null,
      statusIconName: latestVersion?.statusIconName ?? null,
    }
  })

  sections.push({ type: 'requirement-table', columns, rows })

  return { sections }
}
