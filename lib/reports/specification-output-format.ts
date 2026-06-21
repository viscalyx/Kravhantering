import type { DeviationCounts } from '@/lib/dal/deviations'
import type { SpecificationOutputItem } from '@/lib/reports/data/specification-output'
import {
  localizeReportValue,
  type ReportLabels,
  type ReportLocale,
} from '@/lib/reports/report-labels'
import {
  IMPLEMENTED_SPECIFICATION_ITEM_STATUS_ID,
  NOT_APPLICABLE_SPECIFICATION_ITEM_STATUS_ID,
  VERIFIED_SPECIFICATION_ITEM_STATUS_ID,
} from '@/lib/specification-item-status-constants'

export function formatArea(
  item: SpecificationOutputItem,
  labels: ReportLabels,
) {
  if (item.kind === 'specificationLocal') {
    return labels.common.uniqueRequirement
  }
  return item.areaName ?? ''
}

export function formatQualityCharacteristic(
  item: SpecificationOutputItem,
  locale: ReportLocale,
): string {
  const name = localizeReportValue(
    locale,
    item.qualityCharacteristicNameSv,
    item.qualityCharacteristicNameEn,
  )
  if (!name) {
    return ''
  }
  return item.qualityCharacteristicChapterId
    ? `${name} (ISO/IEC 25010 ${item.qualityCharacteristicChapterId})`
    : name
}

export function formatNormReferences(item: SpecificationOutputItem): string {
  return item.normReferences
    .map(reference =>
      reference.name
        ? `${reference.normReferenceId} ${reference.name}`
        : reference.normReferenceId,
    )
    .join(', ')
}

export function formatNormReferenceUris(item: SpecificationOutputItem): string {
  return item.normReferences
    .map(reference => reference.uri)
    .filter((uri): uri is string => Boolean(uri))
    .join(', ')
}

export function formatDeviationSignal(
  counts: DeviationCounts,
  labels: ReportLabels,
): string {
  if (counts.pending > 0) {
    return labels.deviations.pending
  }
  if (counts.approved > 0) {
    return labels.deviations.approved
  }
  if (counts.rejected > 0) {
    return labels.deviations.rejected
  }
  return ''
}

export function isResidualFromImplementation(
  item: SpecificationOutputItem,
): boolean {
  return ![
    IMPLEMENTED_SPECIFICATION_ITEM_STATUS_ID,
    VERIFIED_SPECIFICATION_ITEM_STATUS_ID,
    NOT_APPLICABLE_SPECIFICATION_ITEM_STATUS_ID,
  ].includes(item.specificationItemStatusId ?? -1)
}
