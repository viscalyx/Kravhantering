import { isArchivingReviewState } from '@/lib/requirements/lifecycle'
import type { RequirementReportData } from '../data/fetch-requirement'
import { getReportLabels } from '../report-labels'
import type { ReportModel, ReportSection } from '../types'
import { buildReviewReport } from './review-template'

function isArchivingReview(req: RequirementReportData): boolean {
  return req.versions.some(version =>
    isArchivingReviewState({
      archiveInitiatedAt: version.archiveInitiatedAt,
      statusId: version.status,
    }),
  )
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
  const labels = getReportLabels(locale)

  sections.push({
    type: 'header',
    title: labels.titles.combinedReview,
    requirementId: requirements.map(r => r.uniqueId).join(', '),
    generatedAt: now,
  })

  const archivingHeading = labels.titles.archiveRequests
  const reviewHeading = labels.titles.reviewChangeReports

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
    title: labels.titles.contents,
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
