import {
  countDeviationsPerItemRef,
  type DeviationCounts,
} from '@/lib/dal/deviations'
import {
  createLibraryItemRef,
  createSpecificationLocalItemRef,
  getSpecificationById,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { ReportDataError } from '@/lib/reports/data/server'

type Row = Record<string, unknown>

export interface SpecificationOutputNormReference {
  id: number
  name: string
  normReferenceId: string
  uri: string | null
}

export interface SpecificationOutputItem {
  areaName: string | null
  categoryNameEn: string | null
  categoryNameSv: string | null
  description: string
  deviationCounts: DeviationCounts
  itemRef: string
  kind: 'library' | 'specificationLocal'
  needsReference: string | null
  normReferences: SpecificationOutputNormReference[]
  priorityLevelNameEn: string | null
  priorityLevelNameSv: string | null
  qualityCharacteristicChapterId: string | null
  qualityCharacteristicNameEn: string | null
  qualityCharacteristicNameSv: string | null
  requirementPackageNames: string[]
  requiresTesting: boolean
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  suggestionCount: number
  typeNameEn: string | null
  typeNameSv: string | null
  uniqueId: string
  versionNumber: number
}

export interface SpecificationOutputData {
  items: SpecificationOutputItem[]
  specification: NonNullable<Awaited<ReturnType<typeof getSpecificationBySlug>>>
}

const EMPTY_DEVIATION_COUNTS: DeviationCounts = {
  approved: 0,
  pending: 0,
  rejected: 0,
  total: 0,
}

function decodeSegment(value: string | number): string {
  const raw = String(value)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed !== 0 : false
}

function toNum(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toStr(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function buildInClause(startIndex: number, values: number[]): string {
  return values.map((_, index) => `@${startIndex + index}`).join(', ')
}

async function resolveSpecification(
  db: SqlServerDatabase,
  specificationIdOrSlug: string | number,
) {
  const decoded = decodeSegment(specificationIdOrSlug)
  const specification = /^\d+$/.test(decoded)
    ? await getSpecificationById(db, Number(decoded))
    : await getSpecificationBySlug(db, decoded)

  if (!specification) {
    throw new ReportDataError(
      `Specification not found: ${specificationIdOrSlug}`,
      404,
    )
  }

  return specification
}

async function listNormReferencesByItemRef(
  db: SqlServerDatabase,
  libraryItemIds: number[],
  localRequirementIds: number[],
): Promise<Map<string, SpecificationOutputNormReference[]>> {
  const referencesByItemRef = new Map<
    string,
    SpecificationOutputNormReference[]
  >()

  if (libraryItemIds.length > 0) {
    const rows = (await db.query(
      `
        SELECT
          specification_item.id AS itemId,
          norm_reference.id AS id,
          norm_reference.name AS name,
          norm_reference.norm_reference_id AS normReferenceId,
          norm_reference.uri AS uri
        FROM requirements_specification_items specification_item
        INNER JOIN requirement_version_norm_references version_norm_reference
          ON version_norm_reference.requirement_version_id = specification_item.requirement_version_id
        INNER JOIN norm_references norm_reference
          ON norm_reference.id = version_norm_reference.norm_reference_id
        WHERE specification_item.id IN (${buildInClause(0, libraryItemIds)})
        ORDER BY specification_item.id ASC, norm_reference.norm_reference_id ASC
      `,
      libraryItemIds,
    )) as Row[]

    for (const row of rows) {
      const itemRef = createLibraryItemRef(Number(row.itemId))
      const existing = referencesByItemRef.get(itemRef) ?? []
      existing.push({
        id: Number(row.id),
        name: String(row.name ?? ''),
        normReferenceId: String(row.normReferenceId ?? ''),
        uri: toStr(row.uri),
      })
      referencesByItemRef.set(itemRef, existing)
    }
  }

  if (localRequirementIds.length > 0) {
    const rows = (await db.query(
      `
        SELECT
          local_norm_reference.specification_local_requirement_id AS itemId,
          norm_reference.id AS id,
          norm_reference.name AS name,
          norm_reference.norm_reference_id AS normReferenceId,
          norm_reference.uri AS uri
        FROM specification_local_requirement_norm_references local_norm_reference
        INNER JOIN norm_references norm_reference
          ON norm_reference.id = local_norm_reference.norm_reference_id
        WHERE local_norm_reference.specification_local_requirement_id IN (${buildInClause(0, localRequirementIds)})
        ORDER BY local_norm_reference.specification_local_requirement_id ASC, norm_reference.norm_reference_id ASC
      `,
      localRequirementIds,
    )) as Row[]

    for (const row of rows) {
      const itemRef = createSpecificationLocalItemRef(Number(row.itemId))
      const existing = referencesByItemRef.get(itemRef) ?? []
      existing.push({
        id: Number(row.id),
        name: String(row.name ?? ''),
        normReferenceId: String(row.normReferenceId ?? ''),
        uri: toStr(row.uri),
      })
      referencesByItemRef.set(itemRef, existing)
    }
  }

  return referencesByItemRef
}

async function listRequirementPackagesByItemRef(
  db: SqlServerDatabase,
  libraryItemIds: number[],
  localRequirementIds: number[],
): Promise<Map<string, string[]>> {
  const packagesByItemRef = new Map<string, string[]>()

  if (libraryItemIds.length > 0) {
    const rows = (await db.query(
      `
        SELECT
          specification_item.id AS itemId,
          requirement_package.name AS name
        FROM requirements_specification_items specification_item
        INNER JOIN requirement_version_requirement_packages version_requirement_package
          ON version_requirement_package.requirement_version_id = specification_item.requirement_version_id
        INNER JOIN requirement_packages requirement_package
          ON requirement_package.id = version_requirement_package.requirement_package_id
        WHERE specification_item.id IN (${buildInClause(0, libraryItemIds)})
        ORDER BY specification_item.id ASC, requirement_package.name ASC
      `,
      libraryItemIds,
    )) as Row[]

    for (const row of rows) {
      const itemRef = createLibraryItemRef(Number(row.itemId))
      const existing = packagesByItemRef.get(itemRef) ?? []
      existing.push(String(row.name ?? ''))
      packagesByItemRef.set(itemRef, existing)
    }
  }

  if (localRequirementIds.length > 0) {
    const rows = (await db.query(
      `
        SELECT
          local_requirement_package.specification_local_requirement_id AS itemId,
          requirement_package.name AS name
        FROM specification_local_requirement_requirement_packages local_requirement_package
        INNER JOIN requirement_packages requirement_package
          ON requirement_package.id = local_requirement_package.requirement_package_id
        WHERE local_requirement_package.specification_local_requirement_id IN (${buildInClause(0, localRequirementIds)})
        ORDER BY local_requirement_package.specification_local_requirement_id ASC, requirement_package.name ASC
      `,
      localRequirementIds,
    )) as Row[]

    for (const row of rows) {
      const itemRef = createSpecificationLocalItemRef(Number(row.itemId))
      const existing = packagesByItemRef.get(itemRef) ?? []
      existing.push(String(row.name ?? ''))
      packagesByItemRef.set(itemRef, existing)
    }
  }

  return packagesByItemRef
}

async function countSuggestionsByLibraryItemRef(
  db: SqlServerDatabase,
  libraryItemIds: number[],
): Promise<Map<string, number>> {
  const suggestionsByItemRef = new Map<string, number>()
  if (libraryItemIds.length === 0) {
    return suggestionsByItemRef
  }

  const rows = (await db.query(
    `
      SELECT
        specification_item.id AS itemId,
        COUNT(suggestion.id) AS count
      FROM requirements_specification_items specification_item
      LEFT JOIN improvement_suggestions suggestion
        ON suggestion.requirement_id = specification_item.requirement_id
      WHERE specification_item.id IN (${buildInClause(0, libraryItemIds)})
      GROUP BY specification_item.id
    `,
    libraryItemIds,
  )) as Row[]

  for (const row of rows) {
    suggestionsByItemRef.set(
      createLibraryItemRef(Number(row.itemId)),
      Number(row.count) || 0,
    )
  }

  return suggestionsByItemRef
}

function mapLibraryItem(row: Row): SpecificationOutputItem {
  const itemRef = createLibraryItemRef(Number(row.itemId))
  return {
    areaName: toStr(row.areaName),
    categoryNameEn: toStr(row.categoryNameEn),
    categoryNameSv: toStr(row.categoryNameSv),
    description: String(row.description ?? ''),
    deviationCounts: EMPTY_DEVIATION_COUNTS,
    itemRef,
    kind: 'library',
    needsReference: toStr(row.needsReference),
    normReferences: [],
    qualityCharacteristicChapterId: toStr(row.qualityCharacteristicChapterId),
    qualityCharacteristicNameEn: toStr(row.qualityCharacteristicNameEn),
    qualityCharacteristicNameSv: toStr(row.qualityCharacteristicNameSv),
    requirementPackageNames: [],
    requiresTesting: toBool(row.requiresTesting),
    priorityLevelNameEn: toStr(row.priorityLevelNameEn),
    priorityLevelNameSv: toStr(row.priorityLevelNameSv),
    specificationItemStatusId: toNum(row.specificationItemStatusId),
    specificationItemStatusNameEn: toStr(row.specificationItemStatusNameEn),
    specificationItemStatusNameSv: toStr(row.specificationItemStatusNameSv),
    statusNameEn: toStr(row.statusNameEn),
    statusNameSv: toStr(row.statusNameSv),
    suggestionCount: 0,
    typeNameEn: toStr(row.typeNameEn),
    typeNameSv: toStr(row.typeNameSv),
    uniqueId: String(row.uniqueId ?? ''),
    versionNumber: Number(row.versionNumber) || 1,
  }
}

function mapLocalItem(row: Row): SpecificationOutputItem {
  const itemRef = createSpecificationLocalItemRef(Number(row.itemId))
  return {
    areaName: null,
    categoryNameEn: toStr(row.categoryNameEn),
    categoryNameSv: toStr(row.categoryNameSv),
    description: String(row.description ?? ''),
    deviationCounts: EMPTY_DEVIATION_COUNTS,
    itemRef,
    kind: 'specificationLocal',
    needsReference: toStr(row.needsReference),
    normReferences: [],
    qualityCharacteristicChapterId: toStr(row.qualityCharacteristicChapterId),
    qualityCharacteristicNameEn: toStr(row.qualityCharacteristicNameEn),
    qualityCharacteristicNameSv: toStr(row.qualityCharacteristicNameSv),
    requirementPackageNames: [],
    requiresTesting: toBool(row.requiresTesting),
    priorityLevelNameEn: toStr(row.priorityLevelNameEn),
    priorityLevelNameSv: toStr(row.priorityLevelNameSv),
    specificationItemStatusId: toNum(row.specificationItemStatusId),
    specificationItemStatusNameEn: toStr(row.specificationItemStatusNameEn),
    specificationItemStatusNameSv: toStr(row.specificationItemStatusNameSv),
    statusNameEn: null,
    statusNameSv: null,
    suggestionCount: 0,
    typeNameEn: toStr(row.typeNameEn),
    typeNameSv: toStr(row.typeNameSv),
    uniqueId: String(row.uniqueId ?? ''),
    versionNumber: 1,
  }
}

export async function collectSpecificationOutputData(
  db: SqlServerDatabase,
  specificationIdOrSlug: string | number,
): Promise<SpecificationOutputData> {
  const specification = await resolveSpecification(db, specificationIdOrSlug)
  const [libraryRows, localRows] = await Promise.all([
    db.query(
      `
        SELECT
          specification_item.id AS itemId,
          requirement.unique_id AS uniqueId,
          requirement_area.name AS areaName,
          requirement_version.version_number AS versionNumber,
          requirement_version.description AS description,
          requirement_version.is_testing_required AS requiresTesting,
          requirement_status.name_en AS statusNameEn,
          requirement_status.name_sv AS statusNameSv,
          requirement_category.name_en AS categoryNameEn,
          requirement_category.name_sv AS categoryNameSv,
          requirement_type.name_en AS typeNameEn,
          requirement_type.name_sv AS typeNameSv,
          quality_characteristic.name_en AS qualityCharacteristicNameEn,
          quality_characteristic.name_sv AS qualityCharacteristicNameSv,
          quality_characteristic.chapter_id AS qualityCharacteristicChapterId,
          priority_level.name_en AS priorityLevelNameEn,
          priority_level.name_sv AS priorityLevelNameSv,
          needs_reference.text AS needsReference,
          specification_item.specification_item_status_id AS specificationItemStatusId,
          specification_item_status.name_en AS specificationItemStatusNameEn,
          specification_item_status.name_sv AS specificationItemStatusNameSv
        FROM requirements_specification_items specification_item
        INNER JOIN requirements requirement
          ON requirement.id = specification_item.requirement_id
        INNER JOIN requirement_versions requirement_version
          ON requirement_version.id = specification_item.requirement_version_id
        LEFT JOIN requirement_areas requirement_area
          ON requirement_area.id = requirement.requirement_area_id
        LEFT JOIN requirement_statuses requirement_status
          ON requirement_status.id = requirement_version.requirement_status_id
        LEFT JOIN requirement_categories requirement_category
          ON requirement_category.id = requirement_version.requirement_category_id
        LEFT JOIN requirement_types requirement_type
          ON requirement_type.id = requirement_version.requirement_type_id
        LEFT JOIN quality_characteristics quality_characteristic
          ON quality_characteristic.id = requirement_version.quality_characteristic_id
        LEFT JOIN priority_levels priority_level
          ON priority_level.id = requirement_version.priority_level_id
        LEFT JOIN specification_needs_references needs_reference
          ON needs_reference.id = specification_item.needs_reference_id
        LEFT JOIN specification_item_statuses specification_item_status
          ON specification_item_status.id = specification_item.specification_item_status_id
        WHERE specification_item.requirements_specification_id = @0
        ORDER BY requirement.unique_id ASC
      `,
      [specification.id],
    ) as Promise<Row[]>,
    db.query(
      `
        SELECT
          local_requirement.id AS itemId,
          local_requirement.unique_id AS uniqueId,
          local_requirement.description AS description,
          local_requirement.is_testing_required AS requiresTesting,
          requirement_category.name_en AS categoryNameEn,
          requirement_category.name_sv AS categoryNameSv,
          requirement_type.name_en AS typeNameEn,
          requirement_type.name_sv AS typeNameSv,
          quality_characteristic.name_en AS qualityCharacteristicNameEn,
          quality_characteristic.name_sv AS qualityCharacteristicNameSv,
          quality_characteristic.chapter_id AS qualityCharacteristicChapterId,
          priority_level.name_en AS priorityLevelNameEn,
          priority_level.name_sv AS priorityLevelNameSv,
          needs_reference.text AS needsReference,
          local_requirement.specification_item_status_id AS specificationItemStatusId,
          specification_item_status.name_en AS specificationItemStatusNameEn,
          specification_item_status.name_sv AS specificationItemStatusNameSv
        FROM specification_local_requirements local_requirement
        LEFT JOIN requirement_categories requirement_category
          ON requirement_category.id = local_requirement.requirement_category_id
        LEFT JOIN requirement_types requirement_type
          ON requirement_type.id = local_requirement.requirement_type_id
        LEFT JOIN quality_characteristics quality_characteristic
          ON quality_characteristic.id = local_requirement.quality_characteristic_id
        LEFT JOIN priority_levels priority_level
          ON priority_level.id = local_requirement.priority_level_id
        LEFT JOIN specification_needs_references needs_reference
          ON needs_reference.id = local_requirement.needs_reference_id
        LEFT JOIN specification_item_statuses specification_item_status
          ON specification_item_status.id = local_requirement.specification_item_status_id
        WHERE local_requirement.specification_id = @0
        ORDER BY local_requirement.unique_id ASC
      `,
      [specification.id],
    ) as Promise<Row[]>,
  ])

  const libraryItems = libraryRows.map(mapLibraryItem)
  const localItems = localRows.map(mapLocalItem)
  const libraryItemIds = libraryRows.map(row => Number(row.itemId))
  const localRequirementIds = localRows.map(row => Number(row.itemId))

  const [
    normReferencesByItemRef,
    requirementPackagesByItemRef,
    suggestionsByItemRef,
    deviationCountsByItemRef,
  ] = await Promise.all([
    listNormReferencesByItemRef(db, libraryItemIds, localRequirementIds),
    listRequirementPackagesByItemRef(db, libraryItemIds, localRequirementIds),
    countSuggestionsByLibraryItemRef(db, libraryItemIds),
    countDeviationsPerItemRef(db, specification.id),
  ])

  const items = [...libraryItems, ...localItems]
    .map(item => ({
      ...item,
      deviationCounts:
        deviationCountsByItemRef.get(item.itemRef) ?? EMPTY_DEVIATION_COUNTS,
      normReferences: normReferencesByItemRef.get(item.itemRef) ?? [],
      requirementPackageNames:
        requirementPackagesByItemRef.get(item.itemRef) ?? [],
      suggestionCount: suggestionsByItemRef.get(item.itemRef) ?? 0,
    }))
    .sort((left, right) =>
      left.uniqueId.localeCompare(right.uniqueId, 'sv', { numeric: true }),
    )

  return { items, specification }
}
