import {
  createLibraryItemRef,
  createSpecificationLocalItemRef,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  FilterValues,
  RequirementRow,
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'
import type { SpecificationItemPageBoundary } from '@/lib/requirements/specification-item-page-cursor'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

interface SqlBuilder {
  parameters: unknown[]
  push: (value: unknown) => string
}

export interface SpecificationItemPageCandidate
  extends SpecificationItemPageBoundary {}

export interface ListSpecificationItemPageCandidatesInput {
  after?: SpecificationItemPageBoundary
  filters: FilterValues
  limit: number
  locale: 'en' | 'sv'
  sortBy: RequirementSortField
  sortDirection: RequirementSortDirection
  specificationId: number
}

interface SortDescriptor {
  libraryExpression: string
  localExpression: string
  numeric: boolean
  uniqueId: boolean
}

function createSqlBuilder(): SqlBuilder {
  const parameters: unknown[] = []
  return {
    parameters,
    push(value: unknown) {
      const placeholder = `@${parameters.length}`
      parameters.push(value)
      return placeholder
    },
  }
}

function localizedColumn(alias: string, locale: 'en' | 'sv'): string {
  return `${alias}.name_${locale}`
}

function textSort(expression: string): string {
  return `NULLIF(LTRIM(RTRIM(${expression})), '')`
}

function getSortDescriptor(
  sortBy: RequirementSortField,
  locale: 'en' | 'sv',
): SortDescriptor {
  switch (sortBy) {
    case 'description':
      return {
        libraryExpression: textSort('requirement_version.description'),
        localExpression: textSort('local_requirement.description'),
        numeric: false,
        uniqueId: false,
      }
    case 'area':
      return {
        libraryExpression: textSort('requirement_area.name'),
        localExpression: 'CAST(NULL AS nvarchar(450))',
        numeric: false,
        uniqueId: false,
      }
    case 'category':
      return {
        libraryExpression: textSort(
          localizedColumn('requirement_category', locale),
        ),
        localExpression: textSort(
          localizedColumn('local_requirement_category', locale),
        ),
        numeric: false,
        uniqueId: false,
      }
    case 'type':
      return {
        libraryExpression: textSort(
          localizedColumn('requirement_type', locale),
        ),
        localExpression: textSort(
          localizedColumn('local_requirement_type', locale),
        ),
        numeric: false,
        uniqueId: false,
      }
    case 'qualityCharacteristic':
      return {
        libraryExpression: textSort(
          localizedColumn('quality_characteristic', locale),
        ),
        localExpression: textSort(
          localizedColumn('local_quality_characteristic', locale),
        ),
        numeric: false,
        uniqueId: false,
      }
    case 'priorityLevel':
      return {
        libraryExpression: 'priority_level.sort_order',
        localExpression: 'local_priority_level.sort_order',
        numeric: true,
        uniqueId: false,
      }
    case 'status':
      return {
        libraryExpression: 'requirement_status.sort_order',
        localExpression: 'local_requirement_status.sort_order',
        numeric: true,
        uniqueId: false,
      }
    case 'version':
      return {
        libraryExpression: 'requirement_version.version_number',
        localExpression: 'CAST(1 AS int)',
        numeric: true,
        uniqueId: false,
      }
    default:
      return {
        libraryExpression: 'requirement.unique_id',
        localExpression: 'local_requirement.unique_id',
        numeric: false,
        uniqueId: true,
      }
  }
}

function addIdsCondition(
  conditions: string[],
  builder: SqlBuilder,
  values: number[] | undefined,
  expression: string,
): void {
  if (!values?.length) return
  const json = builder.push(JSON.stringify(values))
  conditions.push(
    `${expression} IN (SELECT TRY_CONVERT(int, [value]) FROM OPENJSON(${json}))`,
  )
}

function addBooleanCondition(
  conditions: string[],
  builder: SqlBuilder,
  values: string[] | undefined,
  expression: string,
): void {
  if (!values?.length) return
  const normalized = values
    .filter(value => value === 'true' || value === 'false')
    .map(value => value === 'true')
  if (!normalized.length) return
  const json = builder.push(
    JSON.stringify(normalized.map(value => (value ? 1 : 0))),
  )
  conditions.push(
    `CAST(${expression} AS int) IN (SELECT TRY_CONVERT(int, [value]) FROM OPENJSON(${json}))`,
  )
}

function escapeLike(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/[%_[\]]/gu, '\\$&')
}

function addSearchCondition(
  conditions: string[],
  builder: SqlBuilder,
  value: string | undefined,
  expression: string,
): void {
  if (!value) return
  conditions.push(
    `${expression} LIKE ${builder.push(`%${escapeLike(value)}%`)} ESCAPE '\\'`,
  )
}

function buildBranchConditions(
  builder: SqlBuilder,
  input: ListSpecificationItemPageCandidatesInput,
  kind: 'library' | 'local',
): string {
  const { filters } = input
  const library = kind === 'library'
  const conditions = [
    library
      ? `specification_item.requirements_specification_id = ${builder.push(input.specificationId)}`
      : `local_requirement.specification_id = ${builder.push(input.specificationId)}`,
  ]

  addSearchCondition(
    conditions,
    builder,
    filters.uniqueIdSearch,
    library ? 'requirement.unique_id' : 'local_requirement.unique_id',
  )
  addSearchCondition(
    conditions,
    builder,
    filters.descriptionSearch,
    library
      ? 'requirement_version.description'
      : 'local_requirement.description',
  )

  if (library) {
    addIdsCondition(
      conditions,
      builder,
      filters.areaIds,
      'requirement.requirement_area_id',
    )
  } else if (filters.areaIds?.length) {
    conditions.push('1 = 0')
  }
  addIdsCondition(
    conditions,
    builder,
    filters.categoryIds,
    library
      ? 'requirement_version.requirement_category_id'
      : 'local_requirement.requirement_category_id',
  )
  addIdsCondition(
    conditions,
    builder,
    filters.typeIds,
    library
      ? 'requirement_version.requirement_type_id'
      : 'local_requirement.requirement_type_id',
  )
  addIdsCondition(
    conditions,
    builder,
    filters.qualityCharacteristicIds,
    library
      ? 'requirement_version.quality_characteristic_id'
      : 'local_requirement.quality_characteristic_id',
  )
  addIdsCondition(
    conditions,
    builder,
    filters.priorityLevelIds,
    library
      ? 'requirement_version.priority_level_id'
      : 'local_requirement.priority_level_id',
  )
  addIdsCondition(
    conditions,
    builder,
    filters.needsReferenceIds,
    library
      ? 'specification_item.needs_reference_id'
      : 'local_requirement.needs_reference_id',
  )
  addIdsCondition(
    conditions,
    builder,
    filters.specificationItemStatusIds,
    library
      ? 'specification_item.specification_item_status_id'
      : 'local_requirement.specification_item_status_id',
  )
  addBooleanCondition(
    conditions,
    builder,
    filters.verifiable,
    library
      ? 'requirement_version.is_verifiable'
      : 'local_requirement.is_verifiable',
  )

  if (library) {
    addIdsCondition(
      conditions,
      builder,
      filters.statuses,
      'requirement_version.requirement_status_id',
    )
  } else if (
    filters.statuses?.length &&
    !filters.statuses.includes(STATUS_PUBLISHED)
  ) {
    conditions.push('1 = 0')
  }

  if (filters.normReferenceIds?.length) {
    const json = builder.push(JSON.stringify(filters.normReferenceIds))
    conditions.push(
      library
        ? `EXISTS (SELECT 1 FROM requirement_version_norm_references page_vnr WHERE page_vnr.requirement_version_id = requirement_version.id AND page_vnr.norm_reference_id IN (SELECT TRY_CONVERT(int, [value]) FROM OPENJSON(${json})))`
        : `EXISTS (SELECT 1 FROM specification_local_requirement_norm_references page_lnr WHERE page_lnr.specification_local_requirement_id = local_requirement.id AND page_lnr.norm_reference_id IN (SELECT TRY_CONVERT(int, [value]) FROM OPENJSON(${json})))`,
    )
  }
  if (filters.requirementPackageIds?.length) {
    if (!library) {
      conditions.push('1 = 0')
    } else {
      const json = builder.push(JSON.stringify(filters.requirementPackageIds))
      conditions.push(
        `EXISTS (SELECT 1 FROM requirement_version_requirement_packages page_vrp WHERE page_vrp.requirement_version_id = requirement_version.id AND page_vrp.requirement_package_id IN (SELECT TRY_CONVERT(int, [value]) FROM OPENJSON(${json})))`,
      )
    }
  }

  return conditions.join(' AND ')
}

function candidateBranch(
  builder: SqlBuilder,
  input: ListSpecificationItemPageCandidatesInput,
  descriptor: SortDescriptor,
  kind: 'library' | 'local',
): string {
  const library = kind === 'library'
  const sortExpression = library
    ? descriptor.libraryExpression
    : descriptor.localExpression
  const conditions = buildBranchConditions(builder, input, kind)
  const sourceId = library ? 'specification_item.id' : 'local_requirement.id'
  const uniqueId = library
    ? 'requirement.unique_id'
    : 'local_requirement.unique_id'

  return `
    SELECT
      ${sourceId} AS sourceId,
      CAST(${library ? 0 : 1} AS int) AS kindRank,
      ${uniqueId} AS uniqueId,
      ${sortExpression} AS sortValue,
      CAST(CASE WHEN ${sortExpression} IS NULL THEN 1 ELSE 0 END AS int) AS nullRank
    FROM ${
      library
        ? `requirements_specification_items specification_item
    INNER JOIN requirements requirement ON requirement.id = specification_item.requirement_id
    INNER JOIN requirement_versions requirement_version ON requirement_version.id = specification_item.requirement_version_id`
        : 'specification_local_requirements local_requirement'
    }
    LEFT JOIN requirement_areas requirement_area ON ${library ? 'requirement_area.id = requirement.requirement_area_id' : '1 = 0'}
    LEFT JOIN requirement_categories requirement_category ON ${library ? 'requirement_category.id = requirement_version.requirement_category_id' : '1 = 0'}
    LEFT JOIN requirement_categories local_requirement_category ON ${library ? '1 = 0' : 'local_requirement_category.id = local_requirement.requirement_category_id'}
    LEFT JOIN requirement_types requirement_type ON ${library ? 'requirement_type.id = requirement_version.requirement_type_id' : '1 = 0'}
    LEFT JOIN requirement_types local_requirement_type ON ${library ? '1 = 0' : 'local_requirement_type.id = local_requirement.requirement_type_id'}
    LEFT JOIN quality_characteristics quality_characteristic ON ${library ? 'quality_characteristic.id = requirement_version.quality_characteristic_id' : '1 = 0'}
    LEFT JOIN quality_characteristics local_quality_characteristic ON ${library ? '1 = 0' : 'local_quality_characteristic.id = local_requirement.quality_characteristic_id'}
    LEFT JOIN priority_levels priority_level ON ${library ? 'priority_level.id = requirement_version.priority_level_id' : '1 = 0'}
    LEFT JOIN priority_levels local_priority_level ON ${library ? '1 = 0' : 'local_priority_level.id = local_requirement.priority_level_id'}
    LEFT JOIN requirement_statuses requirement_status ON ${library ? 'requirement_status.id = requirement_version.requirement_status_id' : '1 = 0'}
    LEFT JOIN requirement_statuses local_requirement_status ON ${library ? '1 = 0' : `local_requirement_status.id = ${STATUS_PUBLISHED}`}
    WHERE ${conditions}`
}

function buildTieBreakerSeek(
  builder: SqlBuilder,
  boundary: SpecificationItemPageBoundary,
): string {
  const uniqueId = builder.push(boundary.uniqueId)
  const kindRank = builder.push(boundary.kindRank)
  const sourceId = builder.push(boundary.sourceId)
  return `(candidate.uniqueId > ${uniqueId}
    OR (candidate.uniqueId = ${uniqueId} AND candidate.kindRank > ${kindRank})
    OR (candidate.uniqueId = ${uniqueId} AND candidate.kindRank = ${kindRank} AND candidate.sourceId > ${sourceId}))`
}

function buildSeekCondition(
  builder: SqlBuilder,
  input: ListSpecificationItemPageCandidatesInput,
  descriptor: SortDescriptor,
): string {
  if (!input.after) return ''
  const tieBreaker = buildTieBreakerSeek(builder, input.after)
  const sortValue = builder.push(input.after.sortValue)
  if (descriptor.uniqueId) {
    const comparison = input.sortDirection === 'desc' ? '<' : '>'
    return `WHERE (candidate.sortValue ${comparison} ${sortValue}
      OR (candidate.sortValue = ${sortValue} AND ${tieBreaker}))`
  }

  const nullRank = builder.push(input.after.nullRank)
  const comparison = input.sortDirection === 'desc' ? '<' : '>'
  return `WHERE (candidate.nullRank > ${nullRank}
    OR (candidate.nullRank = ${nullRank} AND (
      candidate.sortValue ${comparison} ${sortValue}
      OR ((candidate.sortValue = ${sortValue}
        OR (candidate.sortValue IS NULL AND ${sortValue} IS NULL))
        AND ${tieBreaker})
    )))`
}

export function buildSpecificationItemPageCandidateSql(
  input: ListSpecificationItemPageCandidatesInput,
): { parameters: unknown[]; sqlText: string } {
  const builder = createSqlBuilder()
  const descriptor = getSortDescriptor(input.sortBy, input.locale)
  const library = candidateBranch(builder, input, descriptor, 'library')
  const local = candidateBranch(builder, input, descriptor, 'local')
  const seek = buildSeekCondition(builder, input, descriptor)
  const direction = input.sortDirection === 'desc' ? 'DESC' : 'ASC'
  const ordering = descriptor.uniqueId
    ? `candidate.sortValue ${direction}, candidate.kindRank ASC, candidate.sourceId ASC`
    : `candidate.nullRank ASC, candidate.sortValue ${direction}, candidate.uniqueId ASC, candidate.kindRank ASC, candidate.sourceId ASC`
  const limit = builder.push(input.limit)

  return {
    parameters: builder.parameters,
    sqlText: `
      SELECT TOP (${limit})
        candidate.sourceId,
        candidate.kindRank,
        candidate.uniqueId,
        candidate.sortValue,
        candidate.nullRank
      FROM (
        ${library}
        UNION ALL
        ${local}
      ) candidate
      ${seek}
      ORDER BY ${ordering}
    `,
  }
}

export async function listSpecificationItemPageCandidates(
  db: SqlServerDatabase,
  input: ListSpecificationItemPageCandidatesInput,
): Promise<SpecificationItemPageCandidate[]> {
  const { parameters, sqlText } = buildSpecificationItemPageCandidateSql(input)
  const rows = (await db.query(sqlText, parameters)) as Array<
    Record<string, unknown>
  >
  return rows.map(row => ({
    kindRank: Number(row.kindRank) === 1 ? 1 : 0,
    nullRank: Number(row.nullRank) === 1 ? 1 : 0,
    sortValue:
      row.sortValue == null || typeof row.sortValue === 'string'
        ? (row.sortValue ?? null)
        : Number(row.sortValue),
    sourceId: Number(row.sourceId),
    uniqueId: String(row.uniqueId ?? ''),
  }))
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return Number(value) !== 0
}

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toText(value: unknown): string | null {
  return value == null ? null : String(value)
}

function parseTextList(value: unknown): string[] {
  return value == null
    ? []
    : String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
}

function parseNumberList(value: unknown): number[] {
  return parseTextList(value)
    .map(Number)
    .filter(item => Number.isInteger(item) && item > 0)
}

function mapEnrichedRow(
  row: Record<string, unknown>,
  kind: 'library' | 'specificationLocal',
): RequirementRow {
  const local = kind === 'specificationLocal'
  const sourceId = Number(row.sourceId)
  const deviationApproved = Number(row.deviationApproved) || 0
  const deviationPending = Number(row.deviationPending) || 0
  const deviationTotal = Number(row.deviationTotal) || 0
  return {
    area: row.areaName == null ? null : { name: String(row.areaName) },
    deviationCount: deviationTotal,
    hasApprovedDeviation: deviationApproved > 0,
    hasPendingDeviation: deviationPending > 0,
    id: local ? -sourceId : Number(row.requirementId),
    isArchived: local ? false : toBool(row.isArchived),
    isSpecificationLocal: local,
    itemRef: local
      ? createSpecificationLocalItemRef(sourceId)
      : createLibraryItemRef(sourceId),
    kind,
    needsReference: toText(row.needsReferenceText),
    needsReferenceId: toNumber(row.needsReferenceId),
    normReferenceIds: parseTextList(row.normReferenceIds),
    requirementPackageIds: parseNumberList(row.requirementPackageIds),
    ...(local
      ? { specificationLocalRequirementId: sourceId }
      : { specificationItemId: sourceId }),
    specificationItemStatusColor: toText(row.specificationItemStatusColor),
    specificationItemStatusDescriptionEn: toText(
      row.specificationItemStatusDescriptionEn,
    ),
    specificationItemStatusDescriptionSv: toText(
      row.specificationItemStatusDescriptionSv,
    ),
    specificationItemStatusIconName: toText(
      row.specificationItemStatusIconName,
    ),
    specificationItemStatusId: Number(row.specificationItemStatusId),
    specificationItemStatusNameEn: toText(row.specificationItemStatusNameEn),
    specificationItemStatusNameSv: toText(row.specificationItemStatusNameSv),
    uniqueId: String(row.uniqueId ?? ''),
    version: {
      archiveInitiatedAt: null,
      categoryNameEn: toText(row.categoryNameEn),
      categoryNameSv: toText(row.categoryNameSv),
      description: toText(row.description),
      priorityLevelColor: toText(row.priorityLevelColor),
      priorityLevelIconName: toText(row.priorityLevelIconName),
      priorityLevelId: toNumber(row.priorityLevelId),
      priorityLevelNameEn: toText(row.priorityLevelNameEn),
      priorityLevelNameSv: toText(row.priorityLevelNameSv),
      priorityLevelSortOrder: toNumber(row.priorityLevelSortOrder),
      qualityCharacteristicNameEn: toText(row.qualityCharacteristicNameEn),
      qualityCharacteristicNameSv: toText(row.qualityCharacteristicNameSv),
      status: local ? STATUS_PUBLISHED : Number(row.statusId),
      statusColor: local ? '#22c55e' : toText(row.statusColor),
      statusIconName: local ? 'CheckCircle2' : toText(row.statusIconName),
      statusNameEn: local ? 'Published' : toText(row.statusNameEn),
      statusNameSv: local ? 'Publicerad' : toText(row.statusNameSv),
      typeNameEn: toText(row.typeNameEn),
      typeNameSv: toText(row.typeNameSv),
      verifiable: toBool(row.verifiable),
      versionNumber: local ? 1 : Number(row.versionNumber),
    },
  }
}

function selectedIdsSql(
  builder: SqlBuilder,
  ids: number[],
  expression: string,
): string {
  const placeholders = ids.map(id => builder.push(id)).join(', ')
  return `${expression} IN (${placeholders})`
}

async function enrichLibraryItems(
  db: SqlServerDatabase,
  specificationId: number,
  ids: number[],
): Promise<RequirementRow[]> {
  if (!ids.length) return []
  const builder = createSqlBuilder()
  const specification = builder.push(specificationId)
  const selected = selectedIdsSql(builder, ids, 'specification_item.id')
  const rows = (await db.query(
    `
      SELECT
        specification_item.id AS sourceId,
        requirement.id AS requirementId,
        requirement.unique_id AS uniqueId,
        requirement.is_archived AS isArchived,
        requirement_area.name AS areaName,
        requirement_version.description AS description,
        requirement_category.name_en AS categoryNameEn,
        requirement_category.name_sv AS categoryNameSv,
        requirement_type.name_en AS typeNameEn,
        requirement_type.name_sv AS typeNameSv,
        quality_characteristic.name_en AS qualityCharacteristicNameEn,
        quality_characteristic.name_sv AS qualityCharacteristicNameSv,
        requirement_version.is_verifiable AS verifiable,
        requirement_version.priority_level_id AS priorityLevelId,
        priority_level.name_en AS priorityLevelNameEn,
        priority_level.name_sv AS priorityLevelNameSv,
        priority_level.color AS priorityLevelColor,
        priority_level.icon_name AS priorityLevelIconName,
        priority_level.sort_order AS priorityLevelSortOrder,
        requirement_version.requirement_status_id AS statusId,
        requirement_status.name_en AS statusNameEn,
        requirement_status.name_sv AS statusNameSv,
        requirement_status.color AS statusColor,
        requirement_status.icon_name AS statusIconName,
        requirement_version.version_number AS versionNumber,
        specification_item.needs_reference_id AS needsReferenceId,
        needs_reference.text AS needsReferenceText,
        specification_item.specification_item_status_id AS specificationItemStatusId,
        specification_item_status.name_en AS specificationItemStatusNameEn,
        specification_item_status.name_sv AS specificationItemStatusNameSv,
        specification_item_status.description_en AS specificationItemStatusDescriptionEn,
        specification_item_status.description_sv AS specificationItemStatusDescriptionSv,
        specification_item_status.color AS specificationItemStatusColor,
        specification_item_status.icon_name AS specificationItemStatusIconName,
        (SELECT STRING_AGG(norm_reference.norm_reference_id, ',') WITHIN GROUP (ORDER BY norm_reference.norm_reference_id)
          FROM requirement_version_norm_references version_norm_reference
          INNER JOIN norm_references norm_reference ON norm_reference.id = version_norm_reference.norm_reference_id
          WHERE version_norm_reference.requirement_version_id = requirement_version.id) AS normReferenceIds,
        (SELECT STRING_AGG(CAST(version_package.requirement_package_id AS varchar(20)), ',')
          FROM requirement_version_requirement_packages version_package
          WHERE version_package.requirement_version_id = requirement_version.id) AS requirementPackageIds,
        (SELECT COUNT(*) FROM deviations deviation WHERE deviation.specification_item_id = specification_item.id) AS deviationTotal,
        (SELECT COUNT(*) FROM deviations deviation WHERE deviation.specification_item_id = specification_item.id AND deviation.decision IS NULL) AS deviationPending,
        (SELECT COUNT(*) FROM deviations deviation WHERE deviation.specification_item_id = specification_item.id AND deviation.decision = 1) AS deviationApproved
      FROM requirements_specification_items specification_item
      INNER JOIN requirements requirement ON requirement.id = specification_item.requirement_id
      INNER JOIN requirement_versions requirement_version ON requirement_version.id = specification_item.requirement_version_id
      LEFT JOIN requirement_areas requirement_area ON requirement_area.id = requirement.requirement_area_id
      LEFT JOIN requirement_categories requirement_category ON requirement_category.id = requirement_version.requirement_category_id
      LEFT JOIN requirement_types requirement_type ON requirement_type.id = requirement_version.requirement_type_id
      LEFT JOIN quality_characteristics quality_characteristic ON quality_characteristic.id = requirement_version.quality_characteristic_id
      LEFT JOIN priority_levels priority_level ON priority_level.id = requirement_version.priority_level_id
      LEFT JOIN requirement_statuses requirement_status ON requirement_status.id = requirement_version.requirement_status_id
      LEFT JOIN specification_needs_references needs_reference ON needs_reference.id = specification_item.needs_reference_id
      LEFT JOIN specification_item_statuses specification_item_status ON specification_item_status.id = specification_item.specification_item_status_id
      WHERE specification_item.requirements_specification_id = ${specification}
        AND ${selected}
    `,
    builder.parameters,
  )) as Array<Record<string, unknown>>
  return rows.map(row => mapEnrichedRow(row, 'library'))
}

async function enrichLocalItems(
  db: SqlServerDatabase,
  specificationId: number,
  ids: number[],
): Promise<RequirementRow[]> {
  if (!ids.length) return []
  const builder = createSqlBuilder()
  const specification = builder.push(specificationId)
  const selected = selectedIdsSql(builder, ids, 'local_requirement.id')
  const rows = (await db.query(
    `
      SELECT
        local_requirement.id AS sourceId,
        local_requirement.unique_id AS uniqueId,
        local_requirement.description AS description,
        requirement_category.name_en AS categoryNameEn,
        requirement_category.name_sv AS categoryNameSv,
        requirement_type.name_en AS typeNameEn,
        requirement_type.name_sv AS typeNameSv,
        quality_characteristic.name_en AS qualityCharacteristicNameEn,
        quality_characteristic.name_sv AS qualityCharacteristicNameSv,
        local_requirement.is_verifiable AS verifiable,
        local_requirement.priority_level_id AS priorityLevelId,
        priority_level.name_en AS priorityLevelNameEn,
        priority_level.name_sv AS priorityLevelNameSv,
        priority_level.color AS priorityLevelColor,
        priority_level.icon_name AS priorityLevelIconName,
        priority_level.sort_order AS priorityLevelSortOrder,
        local_requirement.needs_reference_id AS needsReferenceId,
        needs_reference.text AS needsReferenceText,
        local_requirement.specification_item_status_id AS specificationItemStatusId,
        specification_item_status.name_en AS specificationItemStatusNameEn,
        specification_item_status.name_sv AS specificationItemStatusNameSv,
        specification_item_status.description_en AS specificationItemStatusDescriptionEn,
        specification_item_status.description_sv AS specificationItemStatusDescriptionSv,
        specification_item_status.color AS specificationItemStatusColor,
        specification_item_status.icon_name AS specificationItemStatusIconName,
        (SELECT STRING_AGG(norm_reference.norm_reference_id, ',') WITHIN GROUP (ORDER BY norm_reference.norm_reference_id)
          FROM specification_local_requirement_norm_references local_norm_reference
          INNER JOIN norm_references norm_reference ON norm_reference.id = local_norm_reference.norm_reference_id
          WHERE local_norm_reference.specification_local_requirement_id = local_requirement.id) AS normReferenceIds,
        CAST(NULL AS varchar(1)) AS requirementPackageIds,
        (SELECT COUNT(*) FROM specification_local_requirement_deviations deviation WHERE deviation.specification_local_requirement_id = local_requirement.id) AS deviationTotal,
        (SELECT COUNT(*) FROM specification_local_requirement_deviations deviation WHERE deviation.specification_local_requirement_id = local_requirement.id AND deviation.decision IS NULL) AS deviationPending,
        (SELECT COUNT(*) FROM specification_local_requirement_deviations deviation WHERE deviation.specification_local_requirement_id = local_requirement.id AND deviation.decision = 1) AS deviationApproved
      FROM specification_local_requirements local_requirement
      LEFT JOIN requirement_categories requirement_category ON requirement_category.id = local_requirement.requirement_category_id
      LEFT JOIN requirement_types requirement_type ON requirement_type.id = local_requirement.requirement_type_id
      LEFT JOIN quality_characteristics quality_characteristic ON quality_characteristic.id = local_requirement.quality_characteristic_id
      LEFT JOIN priority_levels priority_level ON priority_level.id = local_requirement.priority_level_id
      LEFT JOIN specification_needs_references needs_reference ON needs_reference.id = local_requirement.needs_reference_id
      LEFT JOIN specification_item_statuses specification_item_status ON specification_item_status.id = local_requirement.specification_item_status_id
      WHERE local_requirement.specification_id = ${specification}
        AND ${selected}
    `,
    builder.parameters,
  )) as Array<Record<string, unknown>>
  return rows.map(row => mapEnrichedRow(row, 'specificationLocal'))
}

export async function enrichSpecificationItemPage(
  db: SqlServerDatabase,
  specificationId: number,
  candidates: SpecificationItemPageCandidate[],
): Promise<RequirementRow[]> {
  const [libraryItems, localItems] = await Promise.all([
    enrichLibraryItems(
      db,
      specificationId,
      candidates.filter(item => item.kindRank === 0).map(item => item.sourceId),
    ),
    enrichLocalItems(
      db,
      specificationId,
      candidates.filter(item => item.kindRank === 1).map(item => item.sourceId),
    ),
  ])
  const byReference = new Map(
    [...libraryItems, ...localItems].map(item => [item.itemRef, item]),
  )
  return candidates
    .map(candidate =>
      byReference.get(
        candidate.kindRank === 0
          ? createLibraryItemRef(candidate.sourceId)
          : createSpecificationLocalItemRef(candidate.sourceId),
      ),
    )
    .filter((item): item is RequirementRow => item != null)
}
