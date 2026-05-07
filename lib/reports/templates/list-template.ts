import type { RequirementReportData } from '../data/fetch-requirement'
import type { ReportModel, ReportSection } from '../types'

export interface SpecificationCoverInfo {
  businessNeedsReference: string | null
  implementationType: string | null
  lifecycleStatus: string | null
  name: string
  responsibilityArea: string | null
  uniqueId: string
}

export function buildListReport(
  requirements: RequirementReportData[],
  locale: string,
  specificationInfo?: SpecificationCoverInfo,
): ReportModel {
  const sections: ReportSection[] = []

  if (specificationInfo) {
    sections.push({ type: 'specification-cover', locale, ...specificationInfo })
    sections.push({ type: 'page-break' })
  }
  const now = new Date().toISOString()

  const count = requirements.length
  const subtitle =
    locale === 'sv'
      ? `${count} krav`
      : `${count} requirement${count !== 1 ? 's' : ''}`

  sections.push({
    type: 'header',
    title: locale === 'sv' ? 'Kravlista' : 'Requirements List',
    requirementId: subtitle,
    generatedAt: now,
  })

  const getStatusName = (
    v: RequirementReportData['versions'][number],
  ): string => {
    return (locale === 'sv' ? v.statusNameSv : v.statusNameEn) ?? ''
  }

  const columns = [
    {
      key: 'uniqueId',
      label: locale === 'sv' ? 'Krav-ID' : 'Requirement ID',
    },
    {
      key: 'description',
      label: locale === 'sv' ? 'Kravtext' : 'Description',
    },
    { key: 'area', label: locale === 'sv' ? 'Område' : 'Area' },
    { key: 'status', label: 'Status' },
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
    }
  })

  sections.push({ type: 'requirement-table', columns, rows })

  return { sections }
}
