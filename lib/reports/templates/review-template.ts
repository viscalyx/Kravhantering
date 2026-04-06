import type { RequirementReportData } from '../data/fetch-requirement'
import { diffText } from '../text-diff'
import type {
  MetadataChange,
  ReportModel,
  ReportSection,
  VersionSummaryData,
} from '../types'

const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3
const STATUS_ARCHIVED = 4

function getStatusLabel(
  version: RequirementReportData['versions'][number],
  locale: string,
): string {
  return (
    (locale === 'sv' ? version.statusNameSv : version.statusNameEn) ?? 'Unknown'
  )
}

function getName(
  item: { nameSv: string | null; nameEn: string | null } | null,
  locale: string,
): string | null {
  if (!item) return null
  return (locale === 'sv' ? item.nameSv : item.nameEn) ?? null
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
    scenarios: version.versionScenarios
      .filter(vs => vs.scenario)
      .map(vs => ({
        nameSv: vs.scenario.nameSv ?? '',
        nameEn: vs.scenario.nameEn ?? '',
      })),
  }
}

function computeMetadataChanges(
  baseVersion: RequirementReportData['versions'][number],
  reviewVersion: RequirementReportData['versions'][number],
  locale: string,
): MetadataChange[] {
  const changes: MetadataChange[] = []

  const oldCat = getName(baseVersion.category, locale)
  const newCat = getName(reviewVersion.category, locale)
  if (oldCat !== newCat) {
    changes.push({
      field: locale === 'sv' ? 'Kategori' : 'Category',
      oldValue: oldCat,
      newValue: newCat,
    })
  }

  const oldType = getName(baseVersion.type, locale)
  const newType = getName(reviewVersion.type, locale)
  if (oldType !== newType) {
    changes.push({
      field: locale === 'sv' ? 'Typ' : 'Type',
      oldValue: oldType,
      newValue: newType,
    })
  }

  const oldQc = getName(baseVersion.qualityCharacteristic, locale)
  const newQc = getName(reviewVersion.qualityCharacteristic, locale)
  if (oldQc !== newQc) {
    changes.push({
      field: locale === 'sv' ? 'Kvalitetsegenskap' : 'Quality Characteristic',
      oldValue: oldQc,
      newValue: newQc,
    })
  }

  if (baseVersion.requiresTesting !== reviewVersion.requiresTesting) {
    const yes = locale === 'sv' ? 'Ja' : 'Yes'
    const no = locale === 'sv' ? 'Nej' : 'No'
    changes.push({
      field: locale === 'sv' ? 'Kräver testning' : 'Requires Testing',
      oldValue: baseVersion.requiresTesting ? yes : no,
      newValue: reviewVersion.requiresTesting ? yes : no,
    })
  }

  if (baseVersion.verificationMethod !== reviewVersion.verificationMethod) {
    changes.push({
      field: locale === 'sv' ? 'Verifieringsmetod' : 'Verification Method',
      oldValue: baseVersion.verificationMethod,
      newValue: reviewVersion.verificationMethod,
    })
  }

  const oldScenarios = baseVersion.versionScenarios
    .map(vs => getName(vs.scenario, locale) ?? '')
    .sort()
    .join(', ')
  const newScenarios = reviewVersion.versionScenarios
    .map(vs => getName(vs.scenario, locale) ?? '')
    .sort()
    .join(', ')
  if (oldScenarios !== newScenarios) {
    changes.push({
      field: locale === 'sv' ? 'Användningsscenarier' : 'Usage Scenarios',
      oldValue: oldScenarios || null,
      newValue: newScenarios || null,
    })
  }

  const oldRefs = baseVersion.versionNormReferences
    .map(vnr => vnr.normReference?.name ?? '')
    .sort()
    .join(', ')
  const newRefs = reviewVersion.versionNormReferences
    .map(vnr => vnr.normReference?.name ?? '')
    .sort()
    .join(', ')
  if (oldRefs !== newRefs) {
    changes.push({
      field: locale === 'sv' ? 'Referenser' : 'References',
      oldValue: oldRefs || null,
      newValue: newRefs || null,
    })
  }

  return changes
}

export function buildReviewReport(
  requirement: RequirementReportData,
  locale: string,
): ReportModel {
  const sections: ReportSection[] = []
  const now = new Date().toISOString()

  const sortedVersions = [...requirement.versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  )

  const reviewVersion = sortedVersions.find(v => v.status === STATUS_REVIEW)
  const baseVersion =
    sortedVersions.find(v => v.status === STATUS_PUBLISHED) ??
    sortedVersions.find(v => v.status === STATUS_ARCHIVED)

  const isArchivingReview = !!reviewVersion?.archiveInitiatedAt

  sections.push({
    type: 'header',
    title: isArchivingReview
      ? locale === 'sv'
        ? 'Arkiveringsförfrågan'
        : 'Archive Request'
      : locale === 'sv'
        ? 'Granskningsändringsrapport'
        : 'Review Change Report',
    subtitle: isArchivingReview
      ? locale === 'sv'
        ? 'Kravet granskas för arkivering'
        : 'Requirement is under review for archiving'
      : undefined,
    requirementId: requirement.uniqueId,
    generatedAt: now,
    status: reviewVersion
      ? {
          label: getStatusLabel(reviewVersion, locale),
          color: reviewVersion.statusColor,
        }
      : undefined,
  })

  if (!reviewVersion) {
    sections.push({
      type: 'notice',
      message:
        locale === 'sv'
          ? 'Inget krav i granskningsstatus hittades.'
          : 'No requirement in review status found.',
      severity: 'warning',
    })
    return { sections }
  }

  if (!baseVersion) {
    if (isArchivingReview) {
      sections.push({
        type: 'notice',
        message:
          locale === 'sv'
            ? 'Detta krav granskas för arkivering. Innehållet är oförändrat jämfört med den publicerade versionen.'
            : 'This requirement is under review for archiving. Content is unchanged from the published version.',
        severity: 'warning',
      })
    } else {
      sections.push({
        type: 'notice',
        message:
          locale === 'sv'
            ? 'Ingen publicerad eller arkiverad version finns att jämföra med.'
            : 'No published or archived version exists for comparison.',
        severity: 'info',
      })
    }
    sections.push({
      type: 'version-summary',
      version: toVersionSummary(reviewVersion, locale),
      label:
        locale === 'sv'
          ? `Granskningsversion (v${reviewVersion.versionNumber})`
          : `Review Version (v${reviewVersion.versionNumber})`,
    })
    return { sections }
  }

  const baseLabel =
    baseVersion.status === STATUS_PUBLISHED
      ? locale === 'sv'
        ? 'Publicerad'
        : 'Published'
      : locale === 'sv'
        ? 'Arkiverad'
        : 'Archived'

  if (isArchivingReview) {
    sections.push({
      type: 'notice',
      message:
        locale === 'sv'
          ? `Detta krav granskas för arkivering. Jämförelse: v${reviewVersion.versionNumber} mot ${baseLabel} v${baseVersion.versionNumber}.`
          : `This requirement is under review for archiving. Comparison: v${reviewVersion.versionNumber} vs ${baseLabel} v${baseVersion.versionNumber}.`,
      severity: 'warning',
    })
  } else {
    sections.push({
      type: 'notice',
      message:
        locale === 'sv'
          ? `Granskning v${reviewVersion.versionNumber} jämfört med ${baseLabel} v${baseVersion.versionNumber}`
          : `Review v${reviewVersion.versionNumber} vs ${baseLabel} v${baseVersion.versionNumber}`,
      severity: 'info',
    })
  }

  const descDiff = diffText(baseVersion.description, reviewVersion.description)
  if (descDiff.length > 0) {
    sections.push({
      type: 'diff',
      fieldLabel: locale === 'sv' ? 'Beskrivning' : 'Description',
      segments: descDiff,
    })
  }

  const criteriaDiff = diffText(
    baseVersion.acceptanceCriteria,
    reviewVersion.acceptanceCriteria,
  )
  if (criteriaDiff.length > 0) {
    sections.push({
      type: 'diff',
      fieldLabel:
        locale === 'sv' ? 'Acceptanskriterier' : 'Acceptance Criteria',
      segments: criteriaDiff,
    })
  }

  const metadataChanges = computeMetadataChanges(
    baseVersion,
    reviewVersion,
    locale,
  )
  if (metadataChanges.length > 0) {
    sections.push({
      type: 'metadata-changes',
      changes: metadataChanges,
    })
  }

  return { sections }
}
