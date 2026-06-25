import { listDeviationsForSpecificationItem } from '@/lib/dal/deviations'
import { listSuggestionsForRequirement } from '@/lib/dal/improvement-suggestions'
import {
  getRequirementById,
  getRequirementByUniqueId,
} from '@/lib/dal/requirements'
import { parseSpecificationItemRef } from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { mapReportItemsWithConcurrency } from '@/lib/reports/data/concurrency'
import type {
  DeviationReportData,
  DeviationReportVersion,
} from '@/lib/reports/data/fetch-deviation'
import type {
  RequirementReportData,
  RequirementReportVersion,
  SuggestionReportRow,
} from '@/lib/reports/data/fetch-requirement'
import { requirementPackageName } from '@/lib/reports/package-name'
import {
  getReportLabels,
  localizeReportValue,
} from '@/lib/reports/report-labels'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

export class ReportDataError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ReportDataError'
    this.status = status
  }
}

function decodeSegment(value: string | number): string {
  const raw = String(value)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function parseRequirementId(value: string | number): number | null {
  const raw = decodeSegment(value)
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function resolveRequirement(db: SqlServerDatabase, id: string | number) {
  const numericId = parseRequirementId(id)
  return numericId == null
    ? getRequirementByUniqueId(db, decodeSegment(id))
    : getRequirementById(db, numericId)
}

export async function collectRequirementForReport(
  db: SqlServerDatabase,
  id: string | number,
): Promise<RequirementReportData> {
  const requirement = await resolveRequirement(db, id)
  if (!requirement) {
    throw new ReportDataError(`Requirement not found: ${id}`, 404)
  }

  return {
    area: requirement.area
      ? {
          id: requirement.area.id,
          name: requirement.area.name,
          ownerHsaId: requirement.area.ownerHsaId,
          ownerName: null,
        }
      : null,
    createdAt: requirement.createdAt,
    id: requirement.id,
    isArchived: requirement.isArchived,
    uniqueId: requirement.uniqueId,
    versions: requirement.versions as RequirementReportVersion[],
  }
}

function publishedRequirementForReport(
  data: RequirementReportData,
  id: string | number,
): RequirementReportData {
  const publishedVersion = [...data.versions]
    .sort((left, right) => right.versionNumber - left.versionNumber)
    .find(version => version.status === STATUS_PUBLISHED)
  if (!publishedVersion) {
    throw new ReportDataError(`Published requirement not found: ${id}`, 404)
  }

  return {
    ...data,
    versions: [publishedVersion],
  }
}

export async function collectPublishedRequirementForReport(
  db: SqlServerDatabase,
  id: string | number,
): Promise<RequirementReportData> {
  return publishedRequirementForReport(
    await collectRequirementForReport(db, id),
    id,
  )
}

export async function collectMultipleRequirementsForReport(
  db: SqlServerDatabase,
  ids: (number | string)[],
): Promise<RequirementReportData[]> {
  return mapReportItemsWithConcurrency(ids, id =>
    collectRequirementForReport(db, id),
  )
}

export async function collectMultiplePublishedRequirementsForReport(
  db: SqlServerDatabase,
  ids: (number | string)[],
): Promise<RequirementReportData[]> {
  return mapReportItemsWithConcurrency(ids, id =>
    collectPublishedRequirementForReport(db, id),
  )
}

export async function collectSuggestionsForReport(
  db: SqlServerDatabase,
  requirementId: string | number,
): Promise<SuggestionReportRow[]> {
  const requirement = await resolveRequirement(db, requirementId)
  if (!requirement) {
    throw new ReportDataError(`Requirement not found: ${requirementId}`, 404)
  }

  const suggestions = await listSuggestionsForRequirement(db, requirement.id)
  return suggestions.map(suggestion => ({
    content: suggestion.content,
    createdAt: suggestion.createdAt,
    createdBy: suggestion.createdBy,
    id: suggestion.id,
    isReviewRequested: suggestion.isReviewRequested,
    requirementVersionId: suggestion.requirementVersionId,
    resolution: suggestion.resolution,
    resolutionMotivation: suggestion.resolutionMotivation,
    resolvedAt: suggestion.resolvedAt,
    resolvedBy: suggestion.resolvedBy,
  }))
}

function mapDeviationVersion(
  version: RequirementReportVersion,
  locale: string,
): DeviationReportVersion {
  const labels = getReportLabels(locale)
  return {
    acceptanceCriteria: version.acceptanceCriteria,
    category: version.category
      ? { nameEn: version.category.nameEn, nameSv: version.category.nameSv }
      : null,
    createdBy: version.createdBy,
    description: version.description,
    normReferences: version.versionNormReferences
      .filter(vnr => vnr.normReference)
      .map(vnr => ({
        name: vnr.normReference.name,
        reference: vnr.normReference.reference,
        uri: vnr.normReference.uri,
      })),
    qualityCharacteristic: version.qualityCharacteristic
      ? {
          nameEn: version.qualityCharacteristic.nameEn,
          nameSv: version.qualityCharacteristic.nameSv,
        }
      : null,
    requirementPackages: version.versionRequirementPackages
      .filter(vrp => vrp.requirementPackage)
      .map(vrp => ({
        name: requirementPackageName(vrp.requirementPackage),
      })),
    requiresTesting: version.requiresTesting,
    priorityLevel: version.priorityLevel
      ? {
          color: version.priorityLevel.color ?? null,
          iconName: version.priorityLevel.iconName ?? null,
          nameEn: version.priorityLevel.nameEn,
          nameSv: version.priorityLevel.nameSv,
        }
      : null,
    status: {
      color: version.statusColor,
      iconName: version.statusIconName ?? null,
      label:
        localizeReportValue(
          locale,
          version.statusNameSv,
          version.statusNameEn,
        ) || labels.common.unknown,
    },
    type: version.type
      ? { nameEn: version.type.nameEn, nameSv: version.type.nameSv }
      : null,
    verificationMethod: version.verificationMethod,
    versionNumber: version.versionNumber,
  }
}

export function parseLibrarySpecificationItemId(value: string): number {
  const decoded = decodeSegment(value)
  const parsed = parseSpecificationItemRef(decoded)
  if (parsed?.kind === 'specificationLocal') {
    throw new ReportDataError(
      'Deviation review PDF is only available for library requirement applications',
      400,
    )
  }

  const numericId =
    parsed?.kind === 'library'
      ? parsed.id
      : /^\d+$/.test(decoded)
        ? Number(decoded)
        : null

  if (!numericId || !Number.isInteger(numericId) || numericId < 1) {
    throw new ReportDataError('Invalid requirement application ID', 400)
  }

  return numericId
}

export async function collectDeviationForReport(
  db: SqlServerDatabase,
  requirementId: string | number,
  specificationItemId: string,
  locale: string,
): Promise<DeviationReportData> {
  const [requirement, deviations] = await Promise.all([
    collectRequirementForReport(db, requirementId),
    listDeviationsForSpecificationItem(
      db,
      parseLibrarySpecificationItemId(specificationItemId),
    ),
  ])

  const inReview = deviations.find(
    deviation =>
      deviation.isReviewRequested === 1 && deviation.decision === null,
  )
  if (!inReview) {
    throw new ReportDataError('No deviation in review found', 404)
  }

  const version = requirement.versions.find(
    v => v.id === inReview.requirementVersionId,
  )
  if (!version) {
    throw new ReportDataError(
      `Requirement version ${inReview.requirementVersionId} not found for requirement ${requirement.id}`,
    )
  }

  return {
    deviation: {
      createdAt: inReview.createdAt,
      createdBy: inReview.createdBy,
      motivation: inReview.motivation,
    },
    requirementUniqueId: requirement.uniqueId,
    specificationName: inReview.specificationName,
    specificationUniqueId: inReview.specificationUniqueId,
    version: mapDeviationVersion(version, locale),
  }
}
