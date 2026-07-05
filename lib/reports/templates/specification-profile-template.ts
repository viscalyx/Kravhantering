import type { SpecificationOutputData } from '@/lib/reports/data/specification-output'
import {
  formatReportBoolean,
  formatRequirementCount,
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'
import {
  formatArea,
  formatDeviationSignal,
  formatNormReferences,
  formatQualityCharacteristic,
  isResidualFromImplementation,
} from '@/lib/reports/specification-output-format'
import type { SpecificationReportProfile } from '@/lib/reports/specification-profiles'
import type { ReportModel, ReportSection } from '@/lib/reports/types'

type RequirementTableColumn = Extract<
  ReportSection,
  { type: 'requirement-table' }
>['columns'][number]

type RequirementTableRow = Extract<
  ReportSection,
  { type: 'requirement-table' }
>['rows'][number]

function reportTitle(profile: SpecificationReportProfile, locale: string) {
  const labels = getReportLabels(locale).columns
  if (profile === 'procurement') return labels.procurementReportTitle
  if (profile === 'management') return labels.managementReportTitle
  return labels.progressReportTitle
}

function buildCoverSection(
  data: SpecificationOutputData,
  locale: string,
  profile: SpecificationReportProfile,
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
    specificationCode: specification.specificationCode,
    variant: profile === 'procurement' ? 'minimal' : 'default',
  }
}

function procurementColumns(locale: string): RequirementTableColumn[] {
  const labels = getReportLabels(locale).columns
  return [
    { key: 'uniqueId', label: labels.requirementId, width: '12%' },
    { key: 'description', label: labels.requirementText, width: '48%' },
    {
      key: 'qualityCharacteristic',
      label: labels.qualityCharacteristic,
      width: '20%',
    },
    { key: 'normReferences', label: labels.normReferences, width: '20%' },
  ]
}

function progressColumns(locale: string): RequirementTableColumn[] {
  const labels = getReportLabels(locale).columns
  return [
    { key: 'uniqueId', label: labels.requirementId, width: '7%' },
    { key: 'version', label: labels.version, width: '4%' },
    { key: 'description', label: labels.requirementText, width: '21%' },
    { key: 'area', label: labels.requirementArea, width: '8%' },
    { key: 'category', label: labels.category, width: '7%' },
    { key: 'type', label: labels.type, width: '6%' },
    {
      key: 'qualityCharacteristic',
      label: labels.qualityCharacteristic,
      width: '10%',
    },
    { key: 'priorityLevel', label: labels.priorityLevel, width: '6%' },
    {
      key: 'requirementVersionStatus',
      label: labels.requirementVersionStatus,
      width: '7%',
    },
    { key: 'verifiable', label: labels.verifiable, width: '5%' },
    { key: 'needsReference', label: labels.needsReference, width: '7%' },
    { key: 'usageStatus', label: labels.usageStatus, width: '7%' },
    { key: 'normReferences', label: labels.normReferences, width: '5%' },
  ]
}

function managementColumns(locale: string): RequirementTableColumn[] {
  const labels = getReportLabels(locale).columns
  return [
    { key: 'uniqueId', label: labels.requirementId, width: '6%' },
    { key: 'version', label: labels.version, width: '4%' },
    { key: 'description', label: labels.requirementText, width: '18%' },
    { key: 'area', label: labels.requirementArea, width: '7%' },
    { key: 'category', label: labels.category, width: '6%' },
    { key: 'type', label: labels.type, width: '5%' },
    {
      key: 'qualityCharacteristic',
      label: labels.qualityCharacteristic,
      width: '9%',
    },
    { key: 'priorityLevel', label: labels.priorityLevel, width: '5%' },
    {
      key: 'requirementVersionStatus',
      label: labels.requirementVersionStatus,
      width: '6%',
    },
    { key: 'verifiable', label: labels.verifiable, width: '5%' },
    { key: 'needsReference', label: labels.needsReference, width: '6%' },
    { key: 'usageStatus', label: labels.usageStatus, width: '6%' },
    { key: 'normReferences', label: labels.normReferences, width: '5%' },
    {
      key: 'deviationSignal',
      label: labels.deviationSignal,
      width: '6%',
    },
    {
      key: 'residualFromImplementation',
      label: labels.residualFromImplementation,
      width: '6%',
    },
  ]
}

function buildProcurementRows(
  data: SpecificationOutputData,
  locale: string,
): RequirementTableRow[] {
  return data.items.map(item => ({
    cells: {
      description: item.description,
      normReferences: formatNormReferences(item),
      qualityCharacteristic: formatQualityCharacteristic(item, locale),
      uniqueId: item.uniqueId,
    },
  }))
}

function buildProgressRow(
  item: SpecificationOutputData['items'][number],
  locale: string,
): RequirementTableRow {
  const labels = getReportLabels(locale)
  return {
    cells: {
      area: formatArea(item, labels),
      category: localizeReportValue(
        locale,
        item.categoryNameSv,
        item.categoryNameEn,
      ),
      description: item.description,
      needsReference: item.needsReference ?? '',
      normReferences: formatNormReferences(item),
      qualityCharacteristic: formatQualityCharacteristic(item, locale),
      requirementVersionStatus: localizeReportValue(
        locale,
        item.statusNameSv,
        item.statusNameEn,
      ),
      priorityLevel: localizeReportValue(
        locale,
        item.priorityLevelNameSv,
        item.priorityLevelNameEn,
      ),
      type: localizeReportValue(locale, item.typeNameSv, item.typeNameEn),
      uniqueId: item.uniqueId,
      usageStatus: localizeReportValue(
        locale,
        item.specificationItemStatusNameSv,
        item.specificationItemStatusNameEn,
      ),
      verifiable: formatReportBoolean(item.verifiable, labels),
      version: String(item.versionNumber),
    },
  }
}

function buildProgressRows(
  data: SpecificationOutputData,
  locale: string,
): RequirementTableRow[] {
  return data.items.map(item => buildProgressRow(item, locale))
}

function buildManagementRows(
  data: SpecificationOutputData,
  locale: string,
): RequirementTableRow[] {
  const labels = getReportLabels(locale)
  return data.items.map(item => {
    const row = buildProgressRow(item, locale)
    return {
      ...row,
      cells: {
        ...row.cells,
        deviationSignal: formatDeviationSignal(item.deviationCounts, labels),
        residualFromImplementation: formatReportBoolean(
          isResidualFromImplementation(item),
          labels,
        ),
      },
    }
  })
}

export function buildSpecificationProfileReport(
  data: SpecificationOutputData,
  profile: SpecificationReportProfile,
  locale: string,
): ReportModel {
  const title = reportTitle(profile, locale)
  const columns =
    profile === 'procurement'
      ? procurementColumns(locale)
      : profile === 'management'
        ? managementColumns(locale)
        : progressColumns(locale)
  const rows =
    profile === 'procurement'
      ? buildProcurementRows(data, locale)
      : profile === 'management'
        ? buildManagementRows(data, locale)
        : buildProgressRows(data, locale)
  const count = data.items.length
  const labels = getReportLabels(locale)
  const subtitle = formatRequirementCount(count, labels)

  return {
    orientation: profile === 'procurement' ? 'portrait' : 'landscape',
    sections: [
      buildCoverSection(data, locale, profile),
      { type: 'page-break' },
      {
        type: 'header',
        generatedAt: new Date().toISOString(),
        requirementId: data.specification.specificationCode,
        subtitle,
        title,
      },
      { type: 'requirement-table', columns, rows },
    ],
  }
}
