import type { RequirementReportData } from '../data/fetch-requirement'
import type { ReportModel, ReportSection } from '../types'
import { buildReviewReport } from './review-template'

const STATUS_REVIEW = 2

function isArchivingReview(req: RequirementReportData): boolean {
  const reviewVersion = req.versions.find(v => v.status === STATUS_REVIEW)
  return !!reviewVersion?.archiveInitiatedAt
}

export function buildCombinedReviewReport(
  requirements: RequirementReportData[],
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()

  const archiving = requirements.filter(r => isArchivingReview(r))
  const reviewing = requirements.filter(r => !isArchivingReview(r))
  const ordered = [...archiving, ...reviewing]

  sections.push({
    type: 'header',
    title:
      locale === 'sv'
        ? 'Kombinerad granskningsrapport'
        : 'Combined Review Report',
    requirementId: requirements.map(r => r.uniqueId).join(', '),
    generatedAt: now,
  })

  const archivingHeading =
    locale === 'sv' ? 'Arkiveringsförfrågningar' : 'Archive Requests'
  const reviewHeading =
    locale === 'sv' ? 'Granskningsändringsrapporter' : 'Review Change Reports'

  const groups: {
    heading: string
    items: { id: string; label: string; page: number }[]
  }[] = []

  // Page 1 = header + TOC, then each requirement starts on a new page
  let page = 2

  if (archiving.length > 0) {
    const items = archiving.map(r => {
      const item = { id: r.uniqueId, label: r.uniqueId, page }
      page++
      return item
    })
    groups.push({ heading: archivingHeading, items })
  }

  if (reviewing.length > 0) {
    const items = reviewing.map(r => {
      const item = { id: r.uniqueId, label: r.uniqueId, page }
      page++
      return item
    })
    groups.push({ heading: reviewHeading, items })
  }

  sections.push({
    type: 'toc',
    title: locale === 'sv' ? 'Innehållsförteckning' : 'Contents',
    groups,
  })

  for (const requirement of ordered) {
    sections.push({ type: 'page-break' })

    const individualReport = buildReviewReport(requirement, locale)
    for (const section of individualReport.sections) {
      sections.push(section)
    }
  }

  return { sections }
}
