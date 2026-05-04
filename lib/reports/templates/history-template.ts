import type { RequirementReportData } from '../data/fetch-requirement'
import type {
  ReportModel,
  ReportSection,
  TimelineEntryData,
  VersionSummaryData,
} from '../types'

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3

function getStatusLabel(
  version: RequirementReportData['versions'][number],
  locale: string,
): string {
  return (
    (locale === 'sv' ? version.statusNameSv : version.statusNameEn) ?? 'Unknown'
  )
}

function toVersionSummary(
  version: RequirementReportData['versions'][number],
  locale: string,
): VersionSummaryData {
  return {
    versionNumber: version.versionNumber,
    description: version.description,
    acceptanceCriteria: version.acceptanceCriteria,
    requiresTesting: version.requiresTesting,
    verificationMethod: version.verificationMethod,
    category: version.category
      ? {
          nameSv: version.category.nameSv,
          nameEn: version.category.nameEn,
        }
      : null,
    type: version.type
      ? { nameSv: version.type.nameSv, nameEn: version.type.nameEn }
      : null,
    qualityCharacteristic: version.qualityCharacteristic
      ? {
          nameSv: version.qualityCharacteristic.nameSv,
          nameEn: version.qualityCharacteristic.nameEn,
        }
      : null,
    riskLevel: version.riskLevel
      ? {
          nameSv: version.riskLevel.nameSv,
          nameEn: version.riskLevel.nameEn,
        }
      : null,
    status: {
      label: getStatusLabel(version, locale),
      color: version.statusColor,
    },
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    editedAt: version.editedAt,
    publishedAt: version.publishedAt,
    archivedAt: version.archivedAt,
    normReferences: version.versionNormReferences
      .filter(vnr => vnr.normReference)
      .map(vnr => ({
        name: vnr.normReference.name,
        reference: vnr.normReference.reference,
        uri: vnr.normReference.uri,
      })),
    requirementPackages: version.versionRequirementPackages.flatMap(vs => {
      const requirementPackage = vs.requirementPackage
      const nameSv = requirementPackage?.nameSv?.trim()
      const nameEn = requirementPackage?.nameEn?.trim()
      if (!nameSv && !nameEn) return []
      return [
        {
          nameSv: nameSv || nameEn || '',
          nameEn: nameEn || nameSv || '',
        },
      ]
    }),
  }
}

function toTimelineEntry(
  version: RequirementReportData['versions'][number],
  locale: string,
): TimelineEntryData {
  const desc = version.description
  return {
    versionNumber: version.versionNumber,
    status: {
      label: getStatusLabel(version, locale),
      color: version.statusColor,
    },
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    editedAt: version.editedAt,
    publishedAt: version.publishedAt,
    archivedAt: version.archivedAt,
    descriptionExcerpt:
      desc && desc.length > 200 ? `${desc.slice(0, 200)}...` : desc,
  }
}

export function buildHistoryReport(
  requirement: RequirementReportData,
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()

  const sortedVersions = [...requirement.versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )

  const publishedVersion = sortedVersions.find(
    v => v.status === STATUS_PUBLISHED,
  )

  const unpublishedVersions = sortedVersions.filter(
    v => v.status === STATUS_DRAFT || v.status === STATUS_REVIEW,
  )

  sections.push({
    type: 'header',
    title: locale === 'sv' ? 'Historikrapport' : 'History Report',
    requirementId: requirement.uniqueId,
    generatedAt: now,
  })

  if (publishedVersion) {
    sections.push({
      type: 'version-summary',
      version: toVersionSummary(publishedVersion, locale),
      label:
        locale === 'sv'
          ? 'Nuvarande publicerad version'
          : 'Current Published Version',
    })
  }

  for (const version of unpublishedVersions) {
    sections.push({
      type: 'version-summary',
      version: toVersionSummary(version, locale),
      label:
        locale === 'sv'
          ? `Opublicerad version (v${version.versionNumber})`
          : `Unpublished Version (v${version.versionNumber})`,
      isUnpublished: true,
    })
  }

  for (const version of sortedVersions) {
    sections.push({
      type: 'timeline-entry',
      entry: toTimelineEntry(version, locale),
    })
  }

  return { sections }
}
