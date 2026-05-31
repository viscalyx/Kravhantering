import { listDeviationsForSpecificationItem } from '@/lib/dal/deviations'
import { listSuggestionsForRequirement } from '@/lib/dal/improvement-suggestions'
import { getOwnerById } from '@/lib/dal/owners'
import {
  getRequirementById,
  getRequirementByUniqueId,
} from '@/lib/dal/requirements'
import {
  getSpecificationById,
  getSpecificationBySlug,
  getSpecificationItemById,
  getSpecificationLocalRequirementDetail,
  parseSpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  DeviationReportData,
  DeviationReportVersion,
} from '@/lib/reports/data/fetch-deviation'
import type {
  RequirementReportData,
  RequirementReportVersion,
  SuggestionReportRow,
} from '@/lib/reports/data/fetch-requirement'
import { assertReportItemCount } from '@/lib/reports/limits'
import { requirementPackageName } from '@/lib/reports/package-name'
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

  let ownerName: string | null = null
  if (requirement.area?.ownerId) {
    const owner = await getOwnerById(db, requirement.area.ownerId)
    ownerName = owner ? `${owner.firstName} ${owner.lastName}` : null
  }

  return {
    area: requirement.area
      ? {
          id: requirement.area.id,
          name: requirement.area.name,
          ownerName,
        }
      : null,
    createdAt: requirement.createdAt,
    id: requirement.id,
    isArchived: requirement.isArchived,
    uniqueId: requirement.uniqueId,
    versions: requirement.versions as RequirementReportVersion[],
  }
}

export async function collectMultipleRequirementsForReport(
  db: SqlServerDatabase,
  ids: (number | string)[],
): Promise<RequirementReportData[]> {
  assertReportItemCount(ids.length)
  return Promise.all(ids.map(id => collectRequirementForReport(db, id)))
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
        nameEn: requirementPackageName(vrp.requirementPackage),
        nameSv: requirementPackageName(vrp.requirementPackage),
      })),
    requiresTesting: version.requiresTesting,
    riskLevel: version.riskLevel
      ? {
          color: version.riskLevel.color ?? null,
          iconName: version.riskLevel.iconName ?? null,
          nameEn: version.riskLevel.nameEn,
          nameSv: version.riskLevel.nameSv,
        }
      : null,
    status: {
      color: version.statusColor,
      iconName: version.statusIconName ?? null,
      label:
        (locale === 'sv' ? version.statusNameSv : version.statusNameEn) ??
        'Unknown',
    },
    type: version.type
      ? { nameEn: version.type.nameEn, nameSv: version.type.nameSv }
      : null,
    verificationMethod: version.verificationMethod,
    versionNumber: version.versionNumber,
  }
}

function parseDeviationItemId(value: string): number {
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
      parseDeviationItemId(specificationItemId),
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

function mapSpecificationLocalRequirementToReportData(
  requirement: NonNullable<
    Awaited<ReturnType<typeof getSpecificationLocalRequirementDetail>>
  >,
): RequirementReportData {
  return {
    area: null,
    createdAt: requirement.createdAt,
    id: requirement.id,
    isArchived: false,
    uniqueId: requirement.uniqueId,
    versions: [
      {
        acceptanceCriteria: requirement.acceptanceCriteria,
        archivedAt: null,
        archiveInitiatedAt: null,
        category: requirement.requirementCategory
          ? {
              id: requirement.requirementCategory.id,
              nameEn: requirement.requirementCategory.nameEn,
              nameSv: requirement.requirementCategory.nameSv,
            }
          : null,
        createdAt: requirement.createdAt,
        createdBy: null,
        description: requirement.description,
        editedAt:
          requirement.updatedAt !== requirement.createdAt
            ? requirement.updatedAt
            : null,
        id: requirement.id,
        publishedAt: requirement.createdAt,
        qualityCharacteristic: requirement.qualityCharacteristic
          ? {
              id: requirement.qualityCharacteristic.id,
              nameEn: requirement.qualityCharacteristic.nameEn,
              nameSv: requirement.qualityCharacteristic.nameSv,
            }
          : null,
        requiresTesting: requirement.requiresTesting,
        riskLevel: requirement.riskLevel
          ? {
              id: requirement.riskLevel.id,
              color: requirement.riskLevel.color,
              iconName: requirement.riskLevel.iconName,
              nameEn: requirement.riskLevel.nameEn,
              nameSv: requirement.riskLevel.nameSv,
            }
          : null,
        status: STATUS_PUBLISHED,
        statusColor: '#22c55e',
        statusIconName: 'CheckCircle2',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        type: requirement.requirementType
          ? {
              id: requirement.requirementType.id,
              nameEn: requirement.requirementType.nameEn,
              nameSv: requirement.requirementType.nameSv,
            }
          : null,
        verificationMethod: requirement.verificationMethod,
        versionNormReferences: requirement.normReferences.map(reference => ({
          normReference: {
            id: reference.id,
            name: reference.name,
            normReferenceId: reference.normReferenceId,
            reference: reference.normReferenceId,
            uri: reference.uri,
          },
        })),
        versionNumber: 1,
        versionRequirementPackages: requirement.requirementPackages.map(
          requirementPackage => ({
            requirementPackage: {
              id: requirementPackage.id,
              nameEn: requirementPackageName(requirementPackage),
              nameSv: requirementPackageName(requirementPackage),
            },
          }),
        ),
      },
    ],
  }
}

export async function collectSpecificationItemsForReport(
  db: SqlServerDatabase,
  specificationIdOrSlug: string | number,
  itemRefs: string[],
): Promise<{
  requirements: RequirementReportData[]
  specification: NonNullable<Awaited<ReturnType<typeof getSpecificationBySlug>>>
}> {
  assertReportItemCount(itemRefs.length)
  const decodedSpecificationId = decodeSegment(specificationIdOrSlug)
  const specification = /^\d+$/.test(decodedSpecificationId)
    ? await getSpecificationById(db, Number(decodedSpecificationId))
    : await getSpecificationBySlug(db, decodedSpecificationId)

  if (!specification) {
    throw new ReportDataError(
      `Specification not found: ${specificationIdOrSlug}`,
      404,
    )
  }

  const requirements: RequirementReportData[] = []
  for (const itemRef of itemRefs) {
    const parsed = parseSpecificationItemRef(decodeSegment(itemRef))
    if (!parsed) {
      throw new ReportDataError(`Invalid item ref: ${itemRef}`, 400)
    }

    if (parsed.kind === 'library') {
      const item = await getSpecificationItemById(db, parsed.id)
      if (!item || item.specificationId !== specification.id) {
        throw new ReportDataError(
          `Item not found in specification: ${itemRef}`,
          404,
        )
      }

      requirements.push(
        await collectRequirementForReport(db, item.requirementId),
      )
      continue
    }

    const localRequirement = await getSpecificationLocalRequirementDetail(
      db,
      specification.id,
      parsed.id,
    )
    if (!localRequirement) {
      throw new ReportDataError(
        `Item not found in specification: ${itemRef}`,
        404,
      )
    }

    requirements.push(
      mapSpecificationLocalRequirementToReportData(localRequirement),
    )
  }

  return { requirements, specification }
}
