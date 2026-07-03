import { exportToCsv } from '@/lib/export-csv'
import type { SpecificationOutputData } from '@/lib/reports/data/specification-output'
import {
  formatReportBoolean,
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'
import {
  formatArea,
  formatDeviationSignal,
  formatNormReferences,
  formatNormReferenceUris,
  formatQualityCharacteristic,
} from '@/lib/reports/specification-output-format'
import type { SpecificationCsvProfile } from '@/lib/reports/specification-profiles'

function qualityCharacteristicName(
  item: SpecificationOutputData['items'][number],
  locale: string,
) {
  return localizeReportValue(
    locale,
    item.qualityCharacteristicNameSv,
    item.qualityCharacteristicNameEn,
  )
}

function buildProcurementCsv(
  data: SpecificationOutputData,
  locale: string,
): string {
  const labels = getReportLabels(locale).columns
  const headers = [
    labels.requirementId,
    labels.requirementText,
    labels.qualityCharacteristic,
    labels.normReferences,
    labels.normReferenceUri,
  ]
  const rows = data.items.map(item => ({
    [labels.normReferences]: formatNormReferences(item),
    [labels.normReferenceUri]: formatNormReferenceUris(item),
    [labels.qualityCharacteristic]: formatQualityCharacteristic(item, locale),
    [labels.requirementId]: item.uniqueId,
    [labels.requirementText]: item.description,
  }))

  return exportToCsv(headers, rows)
}

function buildFullCsv(data: SpecificationOutputData, locale: string): string {
  const reportLabels = getReportLabels(locale)
  const labels = reportLabels.columns
  const headers = [
    labels.requirementId,
    labels.requirementText,
    labels.requirementArea,
    labels.category,
    labels.type,
    labels.qualityCharacteristic,
    labels.priorityLevel,
    labels.requirementVersionStatus,
    labels.verifiable,
    labels.version,
    labels.needsReference,
    labels.usageStatus,
    labels.normReferences,
    labels.requirementPackage,
    labels.improvementSuggestions,
    labels.isoChapter,
    labels.normReferenceUri,
    labels.deviationSignal,
  ]
  const rows = data.items.map(item => ({
    [labels.requirementArea]: formatArea(item, reportLabels),
    [labels.category]: localizeReportValue(
      locale,
      item.categoryNameSv,
      item.categoryNameEn,
    ),
    [labels.deviationSignal]: formatDeviationSignal(
      item.deviationCounts,
      reportLabels,
    ),
    [labels.improvementSuggestions]: String(item.suggestionCount),
    [labels.isoChapter]: item.qualityCharacteristicChapterId ?? '',
    [labels.needsReference]: item.needsReference ?? '',
    [labels.normReferences]: formatNormReferences(item),
    [labels.normReferenceUri]: formatNormReferenceUris(item),
    [labels.qualityCharacteristic]: qualityCharacteristicName(item, locale),
    [labels.requirementId]: item.uniqueId,
    [labels.requirementPackage]: item.requirementPackageNames.join(', '),
    [labels.requirementText]: item.description,
    [labels.requirementVersionStatus]: localizeReportValue(
      locale,
      item.statusNameSv,
      item.statusNameEn,
    ),
    [labels.priorityLevel]: localizeReportValue(
      locale,
      item.priorityLevelNameSv,
      item.priorityLevelNameEn,
    ),
    [labels.type]: localizeReportValue(
      locale,
      item.typeNameSv,
      item.typeNameEn,
    ),
    [labels.usageStatus]: localizeReportValue(
      locale,
      item.specificationItemStatusNameSv,
      item.specificationItemStatusNameEn,
    ),
    [labels.verifiable]: formatReportBoolean(item.verifiable, reportLabels),
    [labels.version]: String(item.versionNumber),
  }))

  return exportToCsv(headers, rows)
}

export function buildSpecificationCsv(
  data: SpecificationOutputData,
  profile: SpecificationCsvProfile,
  locale: string,
): string {
  return profile === 'procurement'
    ? buildProcurementCsv(data, locale)
    : buildFullCsv(data, locale)
}
