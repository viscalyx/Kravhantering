import type { DeviationReportData } from '../data/fetch-deviation'
import type { ReportModel, ReportSection, VersionSummaryData } from '../types'

export function buildDeviationReviewReport(
  data: DeviationReportData,
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()

  sections.push({
    type: 'header',
    title:
      locale === 'sv'
        ? 'Granskningsrapport för avvikelse'
        : 'Deviation Review Report',
    subtitle:
      locale === 'sv'
        ? 'Avvikelse begärd med motivering'
        : 'Deviation requested with motivation',
    requirementId: data.requirementUniqueId,
    generatedAt: now,
  })

  if (data.specificationName) {
    sections.push({
      type: 'notice',
      message:
        locale === 'sv'
          ? `Kravunderlag: ${data.specificationName} (${data.specificationUniqueId})`
          : `Requirements Specification: ${data.specificationName} (${data.specificationUniqueId})`,
      severity: 'info',
    })
  }

  // Requirement version connected to the specification — blue border
  const v = data.version
  const versionSummary: VersionSummaryData = {
    versionNumber: v.versionNumber,
    description: v.description,
    acceptanceCriteria: v.acceptanceCriteria,
    requiresTesting: v.requiresTesting,
    verificationMethod: v.verificationMethod,
    category: v.category,
    type: v.type,
    qualityCharacteristic: v.qualityCharacteristic,
    riskLevel: v.riskLevel,
    status: v.status,
    createdBy: v.createdBy,
    createdAt: '',
    editedAt: null,
    publishedAt: null,
    archivedAt: null,
    normReferences: v.normReferences,
    scenarios: v.scenarios.map(s => ({
      nameSv: s.nameSv ?? '',
      nameEn: s.nameEn ?? '',
    })),
  }

  sections.push({
    type: 'version-summary',
    version: versionSummary,
    label:
      locale === 'sv'
        ? `Krav (v${v.versionNumber})`
        : `Requirement (v${v.versionNumber})`,
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
    riskLevel: v.riskLevel,
    locale,
  })

  return { sections }
}
