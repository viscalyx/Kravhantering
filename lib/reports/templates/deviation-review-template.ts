import type { DeviationReportData } from '../data/fetch-deviation'
import { formatReportTemplate, getReportLabels } from '../report-labels'
import type { ReportModel, ReportSection, VersionSummaryData } from '../types'

export function buildDeviationReviewReport(
  data: DeviationReportData,
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()
  const labels = getReportLabels(locale)

  sections.push({
    type: 'header',
    title: labels.titles.deviationReview,
    subtitle: labels.subtitles.deviationRequestedWithMotivation,
    requirementId: data.requirementUniqueId,
    generatedAt: now,
  })

  if (data.specificationName) {
    sections.push({
      type: 'notice',
      message: formatReportTemplate(labels.notices.specificationPrefix, {
        name: data.specificationName,
        uniqueId: data.specificationUniqueId ?? '',
      }),
      severity: 'info',
    })
  }

  // Requirement version connected to the specification — blue border
  const v = data.version
  const versionSummary: VersionSummaryData = {
    versionNumber: v.versionNumber,
    description: v.description,
    acceptanceCriteria: v.acceptanceCriteria,
    verifiable: v.verifiable,
    verificationMethod: v.verificationMethod,
    category: v.category,
    type: v.type,
    qualityCharacteristic: v.qualityCharacteristic,
    priorityLevel: v.priorityLevel,
    status: v.status,
    createdBy: v.createdBy,
    createdAt: '',
    editedAt: null,
    publishedAt: null,
    archivedAt: null,
    normReferences: v.normReferences,
    requirementPackages: v.requirementPackages.map(s => ({
      name: s.name,
    })),
  }

  sections.push({
    type: 'version-summary',
    version: versionSummary,
    label: formatReportTemplate(labels.common.requirementVersion, {
      version: v.versionNumber,
    }),
    borderColor: '#3b82f6',
  })

  // Deviation details — amber card
  sections.push({
    type: 'deviation-summary',
    motivation: data.deviation.motivation,
    createdBy: data.deviation.createdBy,
    createdAt: data.deviation.createdAt,
    specificationName: data.specificationName,
    specificationUniqueId: data.specificationUniqueId,
    priorityLevel: v.priorityLevel,
    locale,
  })

  return { sections }
}
