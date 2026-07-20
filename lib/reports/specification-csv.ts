import { escapeCsvField } from '@/lib/export-csv'
import type { SpecificationOutputItem } from '@/lib/reports/data/specification-output'
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

type ReportLabels = ReturnType<typeof getReportLabels>
type SpecificationCsvHeaderKey = keyof ReportLabels['columns']

interface SpecificationCsvColumnDefinition {
  headerKey: SpecificationCsvHeaderKey
  value: (
    item: SpecificationOutputItem,
    locale: string,
    labels: ReportLabels,
  ) => string
}

export interface SpecificationCsvFormatter {
  headers: readonly string[]
  serializeRow: (item: SpecificationOutputItem) => string
}

const PROCUREMENT_COLUMNS = Object.freeze([
  column('requirementId', item => item.uniqueId),
  column('requirementText', item => item.description),
  column('qualityCharacteristic', (item, locale) =>
    formatQualityCharacteristic(item, locale),
  ),
  column('normReferences', item => formatNormReferences(item)),
  column('normReferenceUri', item => formatNormReferenceUris(item)),
])

const FULL_COLUMNS = Object.freeze([
  column('requirementId', item => item.uniqueId),
  column('requirementText', item => item.description),
  column('requirementArea', (item, _locale, labels) =>
    formatArea(item, labels),
  ),
  column('category', (item, locale) =>
    localizeReportValue(locale, item.categoryNameSv, item.categoryNameEn),
  ),
  column('type', (item, locale) =>
    localizeReportValue(locale, item.typeNameSv, item.typeNameEn),
  ),
  column('qualityCharacteristic', (item, locale) =>
    localizeReportValue(
      locale,
      item.qualityCharacteristicNameSv,
      item.qualityCharacteristicNameEn,
    ),
  ),
  column('priorityLevel', (item, locale) =>
    localizeReportValue(
      locale,
      item.priorityLevelNameSv,
      item.priorityLevelNameEn,
    ),
  ),
  column('requirementVersionStatus', (item, locale) =>
    localizeReportValue(locale, item.statusNameSv, item.statusNameEn),
  ),
  column('verifiable', (item, _locale, labels) =>
    formatReportBoolean(item.verifiable, labels),
  ),
  column('version', item => String(item.versionNumber)),
  column('needsReference', item => item.needsReference ?? ''),
  column('usageStatus', (item, locale) =>
    localizeReportValue(
      locale,
      item.specificationItemStatusNameSv,
      item.specificationItemStatusNameEn,
    ),
  ),
  column('normReferences', item => formatNormReferences(item)),
  column('requirementPackage', item => item.requirementPackageNames.join(', ')),
  column('improvementSuggestions', item => String(item.suggestionCount)),
  column('isoChapter', item => item.qualityCharacteristicChapterId ?? ''),
  column('normReferenceUri', item => formatNormReferenceUris(item)),
  column('deviationSignal', (item, _locale, labels) =>
    formatDeviationSignal(item.deviationCounts, labels),
  ),
])

export function createSpecificationCsvFormatter(
  profile: SpecificationCsvProfile,
  locale: string,
): SpecificationCsvFormatter {
  const labels = getReportLabels(locale)
  const columns = profile === 'procurement' ? PROCUREMENT_COLUMNS : FULL_COLUMNS

  return {
    headers: Object.freeze(
      columns.map(
        columnDefinition => labels.columns[columnDefinition.headerKey],
      ),
    ),
    serializeRow: item =>
      columns
        .map(columnDefinition =>
          escapeCsvField(columnDefinition.value(item, locale, labels)),
        )
        .join(';'),
  }
}

function column(
  headerKey: SpecificationCsvHeaderKey,
  value: SpecificationCsvColumnDefinition['value'],
): SpecificationCsvColumnDefinition {
  return Object.freeze({ headerKey, value })
}
