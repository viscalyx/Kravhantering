import type { SqlServerDatabase } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import type {
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3
const STATUS_ARCHIVED = 4

export { STATUS_ARCHIVED, STATUS_DRAFT, STATUS_PUBLISHED, STATUS_REVIEW }

interface ListRequirementsOptions {
  areaIds?: number[]
  categoryIds?: number[]
  descriptionSearch?: string
  includeArchived?: boolean
  limit?: number
  locale?: 'en' | 'sv'
  normReferenceIds?: number[]
  offset?: number
  qualityCharacteristicIds?: number[]
  requiresTesting?: boolean[]
  riskLevelIds?: number[]
  sortBy?: RequirementSortField
  sortDirection?: RequirementSortDirection
  statuses?: number[]
  typeIds?: number[]
  uniqueIdSearch?: string
  usageScenarioIds?: number[]
}

function toIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const n = Number(value)
  return Number.isFinite(n) ? n !== 0 : false
}

function toNum(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

interface SqlBuilder {
  next(): string
  push(value: unknown): string
  values(): unknown[]
}

function createSqlBuilder(): SqlBuilder {
  const params: unknown[] = []
  return {
    next() {
      return `@${params.length}`
    },
    push(value) {
      const placeholder = `@${params.length}`
      params.push(value)
      return placeholder
    },
    values() {
      return params
    },
  }
}

const EFFECTIVE_STATUS_SQL = `CASE
  WHEN EXISTS (
    SELECT 1 FROM requirement_versions rv
    WHERE rv.requirement_id = requirement.id
      AND rv.requirement_status_id = ${STATUS_PUBLISHED}
  ) THEN ${STATUS_PUBLISHED}
  WHEN requirement.is_archived = 1 THEN ${STATUS_ARCHIVED}
  WHEN EXISTS (
    SELECT 1 FROM requirement_versions rv
    WHERE rv.requirement_id = requirement.id
      AND rv.requirement_status_id = ${STATUS_REVIEW}
  ) THEN ${STATUS_REVIEW}
  ELSE ${STATUS_DRAFT}
END`

const DISPLAY_VERSION_SQL = `CASE
  WHEN published_v.max_published_version IS NOT NULL
    THEN published_v.max_published_version
  WHEN requirement.is_archived = 1 AND archived_v.max_archived_version IS NOT NULL
    THEN archived_v.max_archived_version
  ELSE latest_v.max_version
END`

function buildListConditions(
  opts: ListRequirementsOptions,
  builder: SqlBuilder,
) {
  const conditions: string[] = []

  if (!opts.includeArchived) {
    conditions.push('requirement.is_archived = 0')
  }
  if (opts.areaIds && opts.areaIds.length > 0) {
    const placeholders = opts.areaIds.map(id => builder.push(id)).join(', ')
    conditions.push(`requirement.requirement_area_id IN (${placeholders})`)
  }
  if (opts.uniqueIdSearch) {
    conditions.push(
      `requirement.unique_id LIKE ${builder.push(`%${opts.uniqueIdSearch}%`)}`,
    )
  }
  if (opts.descriptionSearch) {
    const pattern = builder.push(`%${opts.descriptionSearch}%`)
    conditions.push(
      `(version.description LIKE ${pattern} OR version.acceptance_criteria LIKE ${pattern})`,
    )
  }
  if (opts.statuses && opts.statuses.length > 0) {
    const placeholders = opts.statuses.map(id => builder.push(id)).join(', ')
    conditions.push(`(${EFFECTIVE_STATUS_SQL}) IN (${placeholders})`)
  }
  if (opts.categoryIds && opts.categoryIds.length > 0) {
    const placeholders = opts.categoryIds.map(id => builder.push(id)).join(', ')
    conditions.push(`version.requirement_category_id IN (${placeholders})`)
  }
  if (opts.typeIds && opts.typeIds.length > 0) {
    const placeholders = opts.typeIds.map(id => builder.push(id)).join(', ')
    conditions.push(`version.requirement_type_id IN (${placeholders})`)
  }
  if (
    opts.qualityCharacteristicIds &&
    opts.qualityCharacteristicIds.length > 0
  ) {
    const placeholders = opts.qualityCharacteristicIds
      .map(id => builder.push(id))
      .join(', ')
    conditions.push(`version.quality_characteristic_id IN (${placeholders})`)
  }
  if (opts.riskLevelIds && opts.riskLevelIds.length > 0) {
    const placeholders = opts.riskLevelIds
      .map(id => builder.push(id))
      .join(', ')
    conditions.push(`version.risk_level_id IN (${placeholders})`)
  }
  if (opts.requiresTesting && opts.requiresTesting.length > 0) {
    const placeholders = opts.requiresTesting
      .map(value => builder.push(value ? 1 : 0))
      .join(', ')
    conditions.push(
      `CAST(version.is_testing_required AS int) IN (${placeholders})`,
    )
  }
  if (opts.normReferenceIds && opts.normReferenceIds.length > 0) {
    const placeholders = opts.normReferenceIds
      .map(id => builder.push(id))
      .join(', ')
    conditions.push(
      `EXISTS (SELECT 1 FROM requirement_version_norm_references vnr WHERE vnr.requirement_version_id = version.id AND vnr.norm_reference_id IN (${placeholders}))`,
    )
  }
  if (opts.usageScenarioIds && opts.usageScenarioIds.length > 0) {
    const placeholders = opts.usageScenarioIds
      .map(id => builder.push(id))
      .join(', ')
    conditions.push(
      `EXISTS (SELECT 1 FROM requirement_version_usage_scenarios vus WHERE vus.requirement_version_id = version.id AND vus.usage_scenario_id IN (${placeholders}))`,
    )
  }
  return conditions
}

const LIST_FROM_CLAUSE = `
  FROM requirements requirement
  INNER JOIN (
    SELECT requirement_id, MAX(version_number) AS max_version
    FROM requirement_versions
    GROUP BY requirement_id
  ) latest_v ON latest_v.requirement_id = requirement.id
  LEFT JOIN (
    SELECT requirement_id, MAX(version_number) AS max_published_version
    FROM requirement_versions
    WHERE requirement_status_id = ${STATUS_PUBLISHED}
    GROUP BY requirement_id
  ) published_v ON published_v.requirement_id = requirement.id
  LEFT JOIN (
    SELECT requirement_id, MAX(version_number) AS max_archived_version
    FROM requirement_versions
    WHERE requirement_status_id = ${STATUS_ARCHIVED}
    GROUP BY requirement_id
  ) archived_v ON archived_v.requirement_id = requirement.id
  INNER JOIN requirement_versions version
    ON version.requirement_id = requirement.id
   AND version.version_number = (${DISPLAY_VERSION_SQL})
  LEFT JOIN requirement_areas requirement_area
    ON requirement_area.id = requirement.requirement_area_id
  LEFT JOIN requirement_categories requirement_category
    ON requirement_category.id = version.requirement_category_id
  LEFT JOIN requirement_types requirement_type
    ON requirement_type.id = version.requirement_type_id
  LEFT JOIN quality_characteristics quality_characteristic
    ON quality_characteristic.id = version.quality_characteristic_id
  LEFT JOIN risk_levels risk_level
    ON risk_level.id = version.risk_level_id
`

function buildOrderByClause(opts: ListRequirementsOptions): string {
  const locale = opts.locale ?? 'en'
  const sortBy = opts.sortBy ?? 'uniqueId'
  const direction = opts.sortDirection ?? 'asc'
  const dir = direction === 'desc' ? 'DESC' : 'ASC'

  const textOrder = (col: string) =>
    `CASE WHEN ${col} IS NULL OR LTRIM(RTRIM(${col})) = '' THEN 1 ELSE 0 END ASC, LOWER(${col}) ${dir}, requirement.unique_id ASC`
  const numberOrder = (col: string) =>
    `CASE WHEN ${col} IS NULL THEN 1 ELSE 0 END ASC, ${col} ${dir}, requirement.unique_id ASC`

  switch (sortBy) {
    case 'description':
      return textOrder('version.description')
    case 'area':
      return textOrder('requirement_area.name')
    case 'category':
      return textOrder(
        locale === 'sv'
          ? 'requirement_category.name_sv'
          : 'requirement_category.name_en',
      )
    case 'type':
      return textOrder(
        locale === 'sv'
          ? 'requirement_type.name_sv'
          : 'requirement_type.name_en',
      )
    case 'qualityCharacteristic':
      return textOrder(
        locale === 'sv'
          ? 'quality_characteristic.name_sv'
          : 'quality_characteristic.name_en',
      )
    case 'riskLevel':
      return numberOrder('risk_level.sort_order')
    case 'status':
      return numberOrder(
        `(SELECT rs.sort_order FROM requirement_statuses rs WHERE rs.id = (${EFFECTIVE_STATUS_SQL}))`,
      )
    case 'version':
      return numberOrder('version.version_number')
    default:
      return `requirement.unique_id ${dir}`
  }
}

export async function listRequirements(
  db: SqlServerDatabase,
  opts: ListRequirementsOptions = {},
) {
  const builder = createSqlBuilder()
  const conditions = buildListConditions(opts, builder)
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const orderBy = buildOrderByClause(opts)

  let pagination = ''
  if (opts.offset != null || opts.limit != null) {
    const offset = opts.offset ?? 0
    pagination = ` OFFSET ${builder.push(offset)} ROWS`
    if (opts.limit != null) {
      pagination += ` FETCH NEXT ${builder.push(opts.limit)} ROWS ONLY`
    }
  }

  const sqlText = `
    SELECT
      requirement.id AS id,
      requirement.unique_id AS uniqueId,
      requirement.requirement_area_id AS requirementAreaId,
      CAST(requirement.is_archived AS int) AS isArchived,
      requirement.created_at AS createdAt,
      version.id AS versionId,
      version.revision_token AS revisionToken,
      version.version_number AS versionNumber,
      version.description AS description,
      version.acceptance_criteria AS acceptanceCriteria,
      version.requirement_category_id AS requirementCategoryId,
      version.requirement_type_id AS requirementTypeId,
      version.quality_characteristic_id AS qualityCharacteristicId,
      (${EFFECTIVE_STATUS_SQL}) AS status,
      (SELECT rs.name_sv FROM requirement_statuses rs WHERE rs.id = (${EFFECTIVE_STATUS_SQL})) AS statusNameSv,
      (SELECT rs.name_en FROM requirement_statuses rs WHERE rs.id = (${EFFECTIVE_STATUS_SQL})) AS statusNameEn,
      (SELECT rs.color FROM requirement_statuses rs WHERE rs.id = (${EFFECTIVE_STATUS_SQL})) AS statusColor,
      version.archive_initiated_at AS archiveInitiatedAt,
      CAST(version.is_testing_required AS int) AS requiresTesting,
      version.created_at AS versionCreatedAt,
      requirement_area.name AS areaName,
      requirement_category.name_sv AS categoryNameSv,
      requirement_category.name_en AS categoryNameEn,
      requirement_type.name_sv AS typeNameSv,
      requirement_type.name_en AS typeNameEn,
      quality_characteristic.name_sv AS qualityCharacteristicNameSv,
      quality_characteristic.name_en AS qualityCharacteristicNameEn,
      version.risk_level_id AS riskLevelId,
      risk_level.name_sv AS riskLevelNameSv,
      risk_level.name_en AS riskLevelNameEn,
      risk_level.color AS riskLevelColor,
      risk_level.sort_order AS riskLevelSortOrder,
      latest_v.max_version AS maxVersion,
      (
        SELECT TOP (1)
          CASE WHEN rv.requirement_status_id = ${STATUS_ARCHIVED} THEN NULL ELSE rs.color END
        FROM requirement_versions rv
        JOIN requirement_statuses rs ON rs.id = rv.requirement_status_id
        WHERE rv.requirement_id = requirement.id
        ORDER BY rv.version_number DESC
      ) AS pendingVersionStatusColor,
      (
        SELECT TOP (1)
          CASE WHEN rv.requirement_status_id = ${STATUS_ARCHIVED} THEN NULL ELSE rv.requirement_status_id END
        FROM requirement_versions rv
        WHERE rv.requirement_id = requirement.id
        ORDER BY rv.version_number DESC
      ) AS pendingVersionStatusId,
      (
        SELECT STRING_AGG(nr.norm_reference_id, ',')
        FROM requirement_version_norm_references vnr
        JOIN norm_references nr ON nr.id = vnr.norm_reference_id
        WHERE vnr.requirement_version_id = version.id
      ) AS normReferenceIds,
      (
        SELECT STRING_AGG(COALESCE(nr.uri, ''), ',')
        FROM requirement_version_norm_references vnr
        JOIN norm_references nr ON nr.id = vnr.norm_reference_id
        WHERE vnr.requirement_version_id = version.id
      ) AS normReferenceUris,
      (
        SELECT COUNT(*) FROM improvement_suggestions s
        WHERE s.requirement_id = requirement.id
      ) AS suggestionCount
    ${LIST_FROM_CLAUSE}
    ${whereClause}
    ORDER BY ${orderBy}${pagination}
  `

  const rows = (await db.query(sqlText, builder.values())) as Array<
    Record<string, unknown>
  >

  return rows.map(row => ({
    id: Number(row.id),
    uniqueId: String(row.uniqueId ?? ''),
    requirementAreaId: Number(row.requirementAreaId),
    isArchived: toBool(row.isArchived),
    createdAt: toIso(row.createdAt) ?? '',
    versionId: Number(row.versionId),
    revisionToken: String(row.revisionToken ?? '').toLowerCase(),
    versionNumber: Number(row.versionNumber),
    description: String(row.description ?? ''),
    acceptanceCriteria:
      row.acceptanceCriteria == null ? null : String(row.acceptanceCriteria),
    requirementCategoryId: toNum(row.requirementCategoryId),
    requirementTypeId: toNum(row.requirementTypeId),
    qualityCharacteristicId: toNum(row.qualityCharacteristicId),
    status: Number(row.status),
    statusNameSv: row.statusNameSv == null ? null : String(row.statusNameSv),
    statusNameEn: row.statusNameEn == null ? null : String(row.statusNameEn),
    statusColor: row.statusColor == null ? null : String(row.statusColor),
    archiveInitiatedAt: toIso(row.archiveInitiatedAt),
    requiresTesting: toBool(row.requiresTesting),
    versionCreatedAt: toIso(row.versionCreatedAt) ?? '',
    areaName: row.areaName == null ? null : String(row.areaName),
    categoryNameSv:
      row.categoryNameSv == null ? null : String(row.categoryNameSv),
    categoryNameEn:
      row.categoryNameEn == null ? null : String(row.categoryNameEn),
    typeNameSv: row.typeNameSv == null ? null : String(row.typeNameSv),
    typeNameEn: row.typeNameEn == null ? null : String(row.typeNameEn),
    qualityCharacteristicNameSv:
      row.qualityCharacteristicNameSv == null
        ? null
        : String(row.qualityCharacteristicNameSv),
    qualityCharacteristicNameEn:
      row.qualityCharacteristicNameEn == null
        ? null
        : String(row.qualityCharacteristicNameEn),
    riskLevelId: toNum(row.riskLevelId),
    riskLevelNameSv:
      row.riskLevelNameSv == null ? null : String(row.riskLevelNameSv),
    riskLevelNameEn:
      row.riskLevelNameEn == null ? null : String(row.riskLevelNameEn),
    riskLevelColor:
      row.riskLevelColor == null ? null : String(row.riskLevelColor),
    riskLevelSortOrder: toNum(row.riskLevelSortOrder),
    maxVersion: Number(row.maxVersion),
    pendingVersionStatusColor:
      row.pendingVersionStatusColor == null
        ? null
        : String(row.pendingVersionStatusColor),
    pendingVersionStatusId: toNum(row.pendingVersionStatusId),
    normReferenceIds:
      row.normReferenceIds == null ? null : String(row.normReferenceIds),
    normReferenceUris:
      row.normReferenceUris == null ? null : String(row.normReferenceUris),
    suggestionCount: Number(row.suggestionCount ?? 0),
  }))
}

export async function countRequirements(
  db: SqlServerDatabase,
  opts: ListRequirementsOptions = {},
): Promise<number> {
  const builder = createSqlBuilder()
  const conditions = buildListConditions(opts, builder)
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sqlText = `
    SELECT COUNT(DISTINCT requirement.id) AS [count]
    ${LIST_FROM_CLAUSE}
    ${whereClause}
  `

  const rows = (await db.query(sqlText, builder.values())) as Array<
    Record<string, unknown>
  >
  return Number(rows[0]?.count ?? 0)
}

interface SqlServerTxExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

async function reserveSequenceSqlServer(
  tx: SqlServerTxExecutor,
  requirementAreaId: number,
) {
  const rows = (await tx.query(
    `
      UPDATE requirement_areas
      SET next_sequence = next_sequence + 1
      OUTPUT
        INSERTED.next_sequence - 1 AS sequenceNumber,
        INSERTED.prefix AS prefix
      WHERE id = @0
    `,
    [requirementAreaId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    throw notFoundError('Requirement area not found')
  }

  const sequenceNumber = Number(rows[0].sequenceNumber)
  const prefix = String(rows[0].prefix ?? '')
  return {
    sequenceNumber,
    uniqueId: `${prefix}${String(sequenceNumber).padStart(4, '0')}`,
  }
}

async function getNextVersionNumberSqlServer(
  tx: SqlServerTxExecutor,
  requirementId: number,
) {
  const rows = (await tx.query(
    `SELECT ISNULL(MAX(version_number), 0) AS maxVersion FROM requirement_versions WHERE requirement_id = @0`,
    [requirementId],
  )) as Array<Record<string, unknown>>
  return Number(rows[0]?.maxVersion ?? 0) + 1
}

interface RequirementMutationData {
  acceptanceCriteria?: string
  baseRevisionToken?: string | null
  baseVersionId?: number | null
  createdBy?: string
  description: string
  normReferenceIds?: number[]
  qualityCharacteristicId?: number
  requirementAreaId: number
  requirementCategoryId?: number
  requirementTypeId?: number
  requiresTesting?: boolean
  riskLevelId?: number
  scenarioIds?: number[]
  verificationMethod?: string | null
}

async function insertVersionJoinsSqlServer(
  tx: SqlServerTxExecutor,
  versionId: number,
  scenarioIds: number[],
  normRefIds: number[],
) {
  for (const usageScenarioId of scenarioIds) {
    await tx.query(
      `INSERT INTO requirement_version_usage_scenarios (requirement_version_id, usage_scenario_id) VALUES (@0, @1)`,
      [versionId, usageScenarioId],
    )
  }
  for (const normReferenceId of normRefIds) {
    await tx.query(
      `INSERT INTO requirement_version_norm_references (requirement_version_id, norm_reference_id) VALUES (@0, @1)`,
      [versionId, normReferenceId],
    )
  }
}

function uniqueIds(values: number[] | undefined): number[] {
  return values?.length ? Array.from(new Set(values)) : []
}

interface RequirementInsertedRow {
  createdAt: string
  id: number
  isArchived: boolean
  requirementAreaId: number
  sequenceNumber: number
  uniqueId: string
}

interface VersionInsertedRow {
  acceptanceCriteria: string | null
  archivedAt: string | null
  archiveInitiatedAt: string | null
  createdAt: string
  createdBy: string | null
  description: string
  editedAt: string | null
  id: number
  publishedAt: string | null
  qualityCharacteristicId: number | null
  requirementCategoryId: number | null
  requirementId: number
  requirementTypeId: number | null
  requiresTesting: boolean
  revisionToken: string
  riskLevelId: number | null
  statusId: number
  verificationMethod: string | null
  versionNumber: number
}

function mapRequirement(row: Record<string, unknown>): RequirementInsertedRow {
  return {
    id: Number(row.id),
    uniqueId: String(row.uniqueId ?? ''),
    requirementAreaId: Number(row.requirementAreaId),
    sequenceNumber: Number(row.sequenceNumber),
    isArchived: toBool(row.isArchived),
    createdAt: toIso(row.createdAt) ?? '',
  }
}

function mapVersion(row: Record<string, unknown>): VersionInsertedRow {
  return {
    id: Number(row.id),
    requirementId: Number(row.requirementId),
    versionNumber: Number(row.versionNumber),
    description: String(row.description ?? ''),
    acceptanceCriteria:
      row.acceptanceCriteria == null ? null : String(row.acceptanceCriteria),
    requirementCategoryId: toNum(row.requirementCategoryId),
    requirementTypeId: toNum(row.requirementTypeId),
    qualityCharacteristicId: toNum(row.qualityCharacteristicId),
    riskLevelId: toNum(row.riskLevelId),
    statusId: Number(row.statusId),
    requiresTesting: toBool(row.requiresTesting),
    verificationMethod:
      row.verificationMethod == null ? null : String(row.verificationMethod),
    createdAt: toIso(row.createdAt) ?? '',
    editedAt: toIso(row.editedAt),
    revisionToken: String(row.revisionToken ?? '').toLowerCase(),
    publishedAt: toIso(row.publishedAt),
    archivedAt: toIso(row.archivedAt),
    archiveInitiatedAt: toIso(row.archiveInitiatedAt),
    createdBy: row.createdBy == null ? null : String(row.createdBy),
  }
}

const REQUIREMENT_OUTPUT = `
  OUTPUT
    INSERTED.id AS id,
    INSERTED.unique_id AS uniqueId,
    INSERTED.requirement_area_id AS requirementAreaId,
    INSERTED.sequence_number AS sequenceNumber,
    CAST(INSERTED.is_archived AS int) AS isArchived,
    INSERTED.created_at AS createdAt
`

const VERSION_OUTPUT = `
  OUTPUT
    INSERTED.id AS id,
    INSERTED.revision_token AS revisionToken,
    INSERTED.requirement_id AS requirementId,
    INSERTED.version_number AS versionNumber,
    INSERTED.description AS description,
    INSERTED.acceptance_criteria AS acceptanceCriteria,
    INSERTED.requirement_category_id AS requirementCategoryId,
    INSERTED.requirement_type_id AS requirementTypeId,
    INSERTED.quality_characteristic_id AS qualityCharacteristicId,
    INSERTED.risk_level_id AS riskLevelId,
    INSERTED.requirement_status_id AS statusId,
    CAST(INSERTED.is_testing_required AS int) AS requiresTesting,
    INSERTED.verification_method AS verificationMethod,
    INSERTED.created_at AS createdAt,
    INSERTED.edited_at AS editedAt,
    INSERTED.published_at AS publishedAt,
    INSERTED.archived_at AS archivedAt,
    INSERTED.archive_initiated_at AS archiveInitiatedAt,
    INSERTED.created_by AS createdBy
`

export async function createRequirement(
  db: SqlServerDatabase,
  data: RequirementMutationData,
): Promise<{
  requirement: RequirementInsertedRow
  version: VersionInsertedRow
}> {
  const scenarioIds = uniqueIds(data.scenarioIds)
  const normRefIds = uniqueIds(data.normReferenceIds)
  const now = new Date()
  const verificationMethod = data.requiresTesting
    ? (data.verificationMethod ?? null)
    : null

  let requirement!: RequirementInsertedRow
  let version!: VersionInsertedRow

  await db.transaction(async manager => {
    const tx: SqlServerTxExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const { sequenceNumber, uniqueId } = await reserveSequenceSqlServer(
      tx,
      data.requirementAreaId,
    )
    const reqRows = (await tx.query(
      `INSERT INTO requirements (unique_id, requirement_area_id, sequence_number, is_archived, created_at)
        ${REQUIREMENT_OUTPUT}
        VALUES (@0, @1, @2, 0, @3)`,
      [uniqueId, data.requirementAreaId, sequenceNumber, now],
    )) as Array<Record<string, unknown>>
    requirement = mapRequirement(reqRows[0] ?? {})

    const verRows = (await tx.query(
      `INSERT INTO requirement_versions (
        requirement_id, version_number, description, acceptance_criteria,
        requirement_category_id, requirement_type_id, quality_characteristic_id,
        risk_level_id, requirement_status_id, is_testing_required,
        verification_method, created_at, edited_at, published_at,
        archived_at, archive_initiated_at, created_by
      )
        ${VERSION_OUTPUT}
        VALUES (@0, 1, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, NULL, NULL, NULL, @12)`,
      [
        requirement.id,
        data.description,
        data.acceptanceCriteria ?? null,
        data.requirementCategoryId ?? null,
        data.requirementTypeId ?? null,
        data.qualityCharacteristicId ?? null,
        data.riskLevelId ?? null,
        STATUS_DRAFT,
        data.requiresTesting ? 1 : 0,
        verificationMethod,
        now,
        now,
        data.createdBy ?? null,
      ],
    )) as Array<Record<string, unknown>>
    version = mapVersion(verRows[0] ?? {})

    await insertVersionJoinsSqlServer(tx, version.id, scenarioIds, normRefIds)
  })

  return { requirement, version }
}

interface VersionLite {
  acceptanceCriteria: string | null
  archiveInitiatedAt: string | null
  createdBy: string | null
  description: string
  id: number
  qualityCharacteristicId: number | null
  requirementCategoryId: number | null
  requirementTypeId: number | null
  requiresTesting: boolean
  revisionToken: string
  riskLevelId: number | null
  statusId: number
  verificationMethod: string | null
}

async function getLatestVersionLite(
  tx: SqlServerTxExecutor,
  requirementId: number,
  options: { lockForUpdate?: boolean } = {},
): Promise<VersionLite | null> {
  const lockHint = options.lockForUpdate ? ' WITH (UPDLOCK, HOLDLOCK)' : ''
  const rows = (await tx.query(
    `SELECT TOP (1)
        id,
        revision_token AS revisionToken,
        requirement_status_id AS statusId,
        archive_initiated_at AS archiveInitiatedAt,
        description,
        acceptance_criteria AS acceptanceCriteria,
        requirement_category_id AS requirementCategoryId,
        requirement_type_id AS requirementTypeId,
        quality_characteristic_id AS qualityCharacteristicId,
        risk_level_id AS riskLevelId,
        CAST(is_testing_required AS int) AS requiresTesting,
        verification_method AS verificationMethod,
        created_by AS createdBy
      FROM requirement_versions${lockHint}
      WHERE requirement_id = @0
      ORDER BY version_number DESC`,
    [requirementId],
  )) as Array<Record<string, unknown>>
  if (!rows[0]) return null
  const row = rows[0]
  return {
    id: Number(row.id),
    revisionToken: String(row.revisionToken ?? '').toLowerCase(),
    statusId: Number(row.statusId),
    archiveInitiatedAt: toIso(row.archiveInitiatedAt),
    description: String(row.description ?? ''),
    acceptanceCriteria:
      row.acceptanceCriteria == null ? null : String(row.acceptanceCriteria),
    requirementCategoryId: toNum(row.requirementCategoryId),
    requirementTypeId: toNum(row.requirementTypeId),
    qualityCharacteristicId: toNum(row.qualityCharacteristicId),
    riskLevelId: toNum(row.riskLevelId),
    requiresTesting: toBool(row.requiresTesting),
    verificationMethod:
      row.verificationMethod == null ? null : String(row.verificationMethod),
    createdBy: row.createdBy == null ? null : String(row.createdBy),
  }
}

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeBaseVersionId(value: number | null | undefined): number {
  if (value == null || !Number.isInteger(value) || value <= 0) {
    throw validationError('Edit operation requires requirement.baseVersionId', {
      reason: 'missing_edit_precondition',
    })
  }
  return value
}

function normalizeBaseRevisionToken(value: string | null | undefined): string {
  if (value == null || value.trim() === '') {
    throw validationError(
      'Edit operation requires requirement.baseRevisionToken',
      { reason: 'missing_edit_precondition' },
    )
  }
  const normalized = value.trim().toLowerCase()
  if (!GUID_PATTERN.test(normalized)) {
    throw validationError(
      'Edit operation requires a valid requirement.baseRevisionToken GUID',
      { reason: 'invalid_edit_precondition' },
    )
  }
  return normalized
}

function staleRequirementEditError(
  requirementId: number,
  baseVersionId: number,
  latestVersionId: number,
): ReturnType<typeof conflictError> {
  return conflictError(
    'This requirement was updated after you started editing. Refresh to review the latest version before saving.',
    {
      baseVersionId,
      latestVersionId,
      reason: 'stale_requirement_edit',
      requirementId,
    },
  )
}

export async function editRequirement(
  db: SqlServerDatabase,
  requirementId: number,
  data: Omit<RequirementMutationData, 'requirementAreaId'> & {
    requirementAreaId?: number
  },
): Promise<VersionInsertedRow> {
  const scenarioIds = uniqueIds(data.scenarioIds)
  const normRefIds = uniqueIds(data.normReferenceIds)
  const baseVersionId = normalizeBaseVersionId(data.baseVersionId)
  const baseRevisionToken = normalizeBaseRevisionToken(data.baseRevisionToken)
  const now = new Date()
  const verificationMethod = data.requiresTesting
    ? (data.verificationMethod ?? null)
    : null

  let result!: VersionInsertedRow

  await db.transaction('SERIALIZABLE', async manager => {
    const tx: SqlServerTxExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const updateRequirementArea = async (): Promise<void> => {
      if (data.requirementAreaId == null) return
      await tx.query(
        `UPDATE requirements SET requirement_area_id = @0 WHERE id = @1`,
        [data.requirementAreaId, requirementId],
      )
    }

    const current = await getLatestVersionLite(tx, requirementId, {
      lockForUpdate: true,
    })
    if (!current) {
      throw notFoundError('No version found for requirement')
    }
    if (
      current.id !== baseVersionId ||
      current.revisionToken !== baseRevisionToken
    ) {
      throw staleRequirementEditError(requirementId, baseVersionId, current.id)
    }
    if (current.statusId === STATUS_REVIEW) {
      throw conflictError('Cannot edit a requirement in Review status')
    }
    if (current.statusId === STATUS_ARCHIVED) {
      throw conflictError(
        'Cannot edit an archived requirement — restore it first',
      )
    }

    if (current.statusId === STATUS_DRAFT) {
      const updateRows = (await tx.query(
        `UPDATE requirement_versions
          SET description = @0,
              acceptance_criteria = @1,
              requirement_category_id = @2,
              requirement_type_id = @3,
              quality_characteristic_id = @4,
              risk_level_id = @5,
              is_testing_required = @6,
              verification_method = @7,
              edited_at = @8,
              revision_token = NEWID()
          ${VERSION_OUTPUT}
          WHERE id = @9
            AND revision_token = CONVERT(uniqueidentifier, @10)`,
        [
          data.description,
          data.acceptanceCriteria ?? null,
          data.requirementCategoryId ?? null,
          data.requirementTypeId ?? null,
          data.qualityCharacteristicId ?? null,
          data.riskLevelId ?? null,
          data.requiresTesting ? 1 : 0,
          verificationMethod,
          now,
          baseVersionId,
          baseRevisionToken,
        ],
      )) as Array<Record<string, unknown>>
      if (!updateRows[0]) {
        throw staleRequirementEditError(
          requirementId,
          baseVersionId,
          current.id,
        )
      }
      result = mapVersion(updateRows[0] ?? {})

      await updateRequirementArea()
      await tx.query(
        `DELETE FROM requirement_version_usage_scenarios WHERE requirement_version_id = @0`,
        [current.id],
      )
      await tx.query(
        `DELETE FROM requirement_version_norm_references WHERE requirement_version_id = @0`,
        [current.id],
      )
      await insertVersionJoinsSqlServer(tx, current.id, scenarioIds, normRefIds)
      return
    }

    // Published → create new Draft version
    const nextVersionNumber = await getNextVersionNumberSqlServer(
      tx,
      requirementId,
    )
    await updateRequirementArea()
    const insertRows = (await tx.query(
      `INSERT INTO requirement_versions (
          requirement_id, version_number, description, acceptance_criteria,
          requirement_category_id, requirement_type_id, quality_characteristic_id,
          risk_level_id, requirement_status_id, is_testing_required,
          verification_method, created_at, edited_at, published_at,
          archived_at, archive_initiated_at, created_by
        )
        ${VERSION_OUTPUT}
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, NULL, NULL, NULL, @13)`,
      [
        requirementId,
        nextVersionNumber,
        data.description,
        data.acceptanceCriteria ?? null,
        data.requirementCategoryId ?? null,
        data.requirementTypeId ?? null,
        data.qualityCharacteristicId ?? null,
        data.riskLevelId ?? null,
        STATUS_DRAFT,
        data.requiresTesting ? 1 : 0,
        verificationMethod,
        now,
        now,
        data.createdBy ?? null,
      ],
    )) as Array<Record<string, unknown>>
    result = mapVersion(insertRows[0] ?? {})
    await insertVersionJoinsSqlServer(tx, result.id, scenarioIds, normRefIds)
  })

  return result
}

export async function initiateArchiving(
  db: SqlServerDatabase,
  requirementId: number,
): Promise<void> {
  await db.transaction('SERIALIZABLE', async manager => {
    const tx: SqlServerTxExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }

    const publishedRows = (await tx.query(
      `SELECT TOP (1) id, version_number AS versionNumber
        FROM requirement_versions WITH (UPDLOCK, HOLDLOCK)
        WHERE requirement_id = @0 AND requirement_status_id = ${STATUS_PUBLISHED}`,
      [requirementId],
    )) as Array<Record<string, unknown>>
    if (!publishedRows[0]) {
      throw conflictError('No published version found to archive')
    }
    const publishedId = Number(publishedRows[0].id)
    const publishedVersionNumber = Number(publishedRows[0].versionNumber)

    const newerRows = (await tx.query(
      `SELECT TOP (1) id FROM requirement_versions WITH (UPDLOCK, HOLDLOCK)
        WHERE requirement_id = @0
          AND requirement_status_id IN (${STATUS_DRAFT}, ${STATUS_REVIEW})
          AND version_number > @1`,
      [requirementId, publishedVersionNumber],
    )) as Array<Record<string, unknown>>
    if (newerRows[0]) {
      throw conflictError(
        'Cannot initiate archiving while there is a pending draft or review version',
      )
    }

    const now = new Date()
    const updatedRows = (await tx.query(
      `UPDATE requirement_versions
        SET requirement_status_id = ${STATUS_REVIEW},
            archive_initiated_at = @0,
            revision_token = NEWID()
        OUTPUT INSERTED.id AS id
        WHERE id = @1
          AND requirement_status_id = ${STATUS_PUBLISHED}
          AND archive_initiated_at IS NULL`,
      [now, publishedId],
    )) as Array<Record<string, unknown>>
    if (!updatedRows[0]) {
      throw conflictError('No published version found to archive')
    }
  })
}

export async function approveArchiving(
  db: SqlServerDatabase,
  requirementId: number,
): Promise<void> {
  // Strict-target rule: operate only on the single version with
  // archive_initiated_at set (the formerly-published version). A newer
  // Draft/Review version may exist for the same requirement; it must never
  // be the target of approve/cancel.
  await db.transaction('SERIALIZABLE', async manager => {
    const rows = (await manager.query(
      `SELECT TOP (1) id, requirement_status_id AS statusId
        FROM requirement_versions WITH (UPDLOCK, HOLDLOCK)
        WHERE requirement_id = @0 AND archive_initiated_at IS NOT NULL`,
      [requirementId],
    )) as Array<Record<string, unknown>>
    if (!rows[0]) {
      throw conflictError('No version with archiving initiated found')
    }
    if (Number(rows[0].statusId) !== STATUS_REVIEW) {
      throw conflictError(
        'Can only approve archiving from Review status with archiving initiated',
      )
    }
    const versionId = Number(rows[0].id)
    const now = new Date()

    const updatedRows = (await manager.query(
      `UPDATE requirement_versions
        SET requirement_status_id = ${STATUS_ARCHIVED},
            archived_at = @0,
            archive_initiated_at = NULL,
            revision_token = NEWID()
        OUTPUT INSERTED.id AS id
        WHERE id = @1
          AND requirement_status_id = ${STATUS_REVIEW}
          AND archive_initiated_at IS NOT NULL`,
      [now, versionId],
    )) as Array<Record<string, unknown>>
    if (!updatedRows[0]) {
      throw conflictError('No version with archiving initiated found')
    }
    await manager.query(
      `UPDATE requirements SET is_archived = 1 WHERE id = @0`,
      [requirementId],
    )
  })
}

export async function cancelArchiving(
  db: SqlServerDatabase,
  requirementId: number,
): Promise<void> {
  // Strict-target rule: operate only on the single version with
  // archive_initiated_at set (the formerly-published version). A newer
  // Draft/Review version may exist for the same requirement; it must never
  // be the target of approve/cancel.
  await db.transaction('SERIALIZABLE', async manager => {
    const rows = (await manager.query(
      `SELECT TOP (1) id, requirement_status_id AS statusId
        FROM requirement_versions WITH (UPDLOCK, HOLDLOCK)
        WHERE requirement_id = @0 AND archive_initiated_at IS NOT NULL`,
      [requirementId],
    )) as Array<Record<string, unknown>>
    if (!rows[0]) {
      throw conflictError('No version with archiving initiated found')
    }
    if (Number(rows[0].statusId) !== STATUS_REVIEW) {
      throw conflictError(
        'Can only cancel archiving from Review status with archiving initiated',
      )
    }
    const updatedRows = (await manager.query(
      `UPDATE requirement_versions
        SET requirement_status_id = ${STATUS_PUBLISHED},
            archive_initiated_at = NULL,
            revision_token = NEWID()
        OUTPUT INSERTED.id AS id
        WHERE id = @0
          AND requirement_status_id = ${STATUS_REVIEW}
          AND archive_initiated_at IS NOT NULL`,
      [Number(rows[0].id)],
    )) as Array<Record<string, unknown>>
    if (!updatedRows[0]) {
      throw conflictError('No version with archiving initiated found')
    }
  })
}

export async function deleteDraftVersion(
  db: SqlServerDatabase,
  requirementId: number,
): Promise<{ deleted: 'requirement' | 'version' }> {
  let result: { deleted: 'requirement' | 'version' } = { deleted: 'version' }

  await db.transaction(async manager => {
    const tx: SqlServerTxExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const latest = await getLatestVersionLite(tx, requirementId)
    if (!latest || latest.statusId !== STATUS_DRAFT) {
      throw conflictError('Only draft versions can be deleted')
    }

    await tx.query(
      `DELETE FROM requirement_version_usage_scenarios WHERE requirement_version_id = @0`,
      [latest.id],
    )
    await tx.query(
      `DELETE FROM requirement_version_norm_references WHERE requirement_version_id = @0`,
      [latest.id],
    )
    await tx.query(`DELETE FROM requirement_versions WHERE id = @0`, [
      latest.id,
    ])

    const remainingRows = (await tx.query(
      `SELECT COUNT(*) AS [count] FROM requirement_versions WHERE requirement_id = @0`,
      [requirementId],
    )) as Array<Record<string, unknown>>
    if (Number(remainingRows[0]?.count ?? 0) === 0) {
      await tx.query(`DELETE FROM requirements WHERE id = @0`, [requirementId])
      result = { deleted: 'requirement' }
    }
  })

  return result
}

export async function transitionStatus(
  db: SqlServerDatabase,
  requirementId: number,
  newStatusId: number,
): Promise<VersionInsertedRow> {
  const statusRows = (await db.query(
    `SELECT TOP (1) id FROM requirement_statuses WHERE id = @0`,
    [newStatusId],
  )) as Array<Record<string, unknown>>
  if (!statusRows[0]) {
    throw validationError(`Invalid status ID: ${newStatusId}`)
  }

  let result!: VersionInsertedRow

  await db.transaction(async manager => {
    const tx: SqlServerTxExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const current = await getLatestVersionLite(tx, requirementId)
    if (!current) {
      throw notFoundError('No version found for requirement')
    }
    const reqRows = (await tx.query(
      `SELECT TOP (1) CAST(is_archived AS int) AS isArchived FROM requirements WHERE id = @0`,
      [requirementId],
    )) as Array<Record<string, unknown>>
    if (!reqRows[0]) {
      throw notFoundError('Requirement not found')
    }
    const isArchived = toBool(reqRows[0].isArchived)

    const transitionRows = (await tx.query(
      `SELECT TOP (1) id FROM requirement_status_transitions
        WHERE from_requirement_status_id = @0 AND to_requirement_status_id = @1`,
      [current.statusId, newStatusId],
    )) as Array<Record<string, unknown>>
    if (!transitionRows[0]) {
      throw conflictError(
        `Invalid transition from status ${current.statusId} to ${newStatusId}`,
      )
    }

    if (current.statusId === STATUS_REVIEW) {
      if (current.archiveInitiatedAt) {
        if (
          newStatusId !== STATUS_ARCHIVED &&
          newStatusId !== STATUS_PUBLISHED
        ) {
          throw conflictError(
            'Archiving review can only transition to Archived or back to Published',
          )
        }
      } else if (newStatusId === STATUS_ARCHIVED) {
        throw conflictError(
          'Cannot archive from publishing review; initiate archiving from Published state first',
        )
      }
    }

    const now = new Date()
    const sets: string[] = ['requirement_status_id = @P_status']
    const params: Record<string, unknown> = { P_status: newStatusId }

    if (
      current.statusId === STATUS_PUBLISHED &&
      newStatusId === STATUS_REVIEW
    ) {
      sets.push('archive_initiated_at = @P_archInit')
      params.P_archInit = now
    }
    const isCancellingArchiving =
      current.statusId === STATUS_REVIEW &&
      newStatusId === STATUS_PUBLISHED &&
      !!current.archiveInitiatedAt
    if (isCancellingArchiving) {
      sets.push('archive_initiated_at = NULL')
    }
    if (newStatusId === STATUS_PUBLISHED && !isCancellingArchiving) {
      sets.push('published_at = @P_published')
      params.P_published = now
      await tx.query(
        `UPDATE requirement_versions
          SET requirement_status_id = ${STATUS_ARCHIVED},
              archived_at = @0,
              revision_token = NEWID()
          WHERE requirement_id = @1 AND requirement_status_id = ${STATUS_PUBLISHED}`,
        [now, requirementId],
      )
    }
    if (newStatusId === STATUS_ARCHIVED) {
      sets.push('archived_at = @P_archived')
      sets.push('archive_initiated_at = NULL')
      params.P_archived = now
    }

    const nextIsArchived =
      newStatusId === STATUS_ARCHIVED
        ? 1
        : newStatusId === STATUS_PUBLISHED
          ? 0
          : isArchived
            ? 1
            : 0
    await tx.query(`UPDATE requirements SET is_archived = @0 WHERE id = @1`, [
      nextIsArchived,
      requirementId,
    ])

    // Convert named placeholders to positional for the version update
    const positionalValues: unknown[] = []
    const resolvedSets = sets
      .map(part =>
        part.replace(/@P_(\w+)/g, (_match, key) => {
          positionalValues.push(params[`P_${key}`])
          return `@${positionalValues.length - 1}`
        }),
      )
      .join(', ')
    positionalValues.push(current.id)
    const idParamIndex = positionalValues.length - 1

    const updateRows = (await tx.query(
      `UPDATE requirement_versions SET ${resolvedSets}, revision_token = NEWID() ${VERSION_OUTPUT} WHERE id = @${idParamIndex}`,
      positionalValues,
    )) as Array<Record<string, unknown>>
    if (!updateRows[0]) {
      throw notFoundError('Failed to retrieve updated version')
    }
    result = mapVersion(updateRows[0])
  })

  return result
}

export async function restoreVersion(
  db: SqlServerDatabase,
  requirementId: number,
  versionId: number,
  createdBy?: string,
): Promise<VersionInsertedRow> {
  let result!: VersionInsertedRow

  await db.transaction(async manager => {
    const tx: SqlServerTxExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const oldRows = (await tx.query(
      `SELECT TOP (1)
          id, requirement_id AS requirementId,
          description, acceptance_criteria AS acceptanceCriteria,
          requirement_category_id AS requirementCategoryId,
          requirement_type_id AS requirementTypeId,
          quality_characteristic_id AS qualityCharacteristicId,
          risk_level_id AS riskLevelId,
          CAST(is_testing_required AS int) AS requiresTesting,
          verification_method AS verificationMethod,
          created_by AS createdBy
        FROM requirement_versions WHERE id = @0`,
      [versionId],
    )) as Array<Record<string, unknown>>
    if (!oldRows[0] || Number(oldRows[0].requirementId) !== requirementId) {
      throw notFoundError('Version not found or does not belong to requirement')
    }
    const old = oldRows[0]

    const scenarioRows = (await tx.query(
      `SELECT usage_scenario_id AS usageScenarioId FROM requirement_version_usage_scenarios WHERE requirement_version_id = @0`,
      [versionId],
    )) as Array<Record<string, unknown>>
    const normRefRows = (await tx.query(
      `SELECT norm_reference_id AS normReferenceId FROM requirement_version_norm_references WHERE requirement_version_id = @0`,
      [versionId],
    )) as Array<Record<string, unknown>>

    const nextVersionNumber = await getNextVersionNumberSqlServer(
      tx,
      requirementId,
    )
    const now = new Date()

    const insertRows = (await tx.query(
      `INSERT INTO requirement_versions (
          requirement_id, version_number, description, acceptance_criteria,
          requirement_category_id, requirement_type_id, quality_characteristic_id,
          risk_level_id, requirement_status_id, is_testing_required,
          verification_method, created_at, edited_at, published_at,
          archived_at, archive_initiated_at, created_by
        )
        ${VERSION_OUTPUT}
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, NULL, NULL, NULL, @13)`,
      [
        requirementId,
        nextVersionNumber,
        String(old.description ?? ''),
        old.acceptanceCriteria,
        toNum(old.requirementCategoryId),
        toNum(old.requirementTypeId),
        toNum(old.qualityCharacteristicId),
        toNum(old.riskLevelId),
        STATUS_DRAFT,
        toBool(old.requiresTesting) ? 1 : 0,
        old.verificationMethod,
        now,
        now,
        createdBy ?? old.createdBy ?? null,
      ],
    )) as Array<Record<string, unknown>>
    result = mapVersion(insertRows[0] ?? {})

    await insertVersionJoinsSqlServer(
      tx,
      result.id,
      scenarioRows.map(r => Number(r.usageScenarioId)),
      normRefRows.map(r => Number(r.normReferenceId)),
    )
  })

  return result
}

export async function reactivateRequirement(
  db: SqlServerDatabase,
  requirementId: number,
  createdBy?: string,
): Promise<VersionInsertedRow> {
  const rows = (await db.query(
    `SELECT TOP (1) id, requirement_status_id AS statusId
      FROM requirement_versions
      WHERE requirement_id = @0
      ORDER BY version_number DESC`,
    [requirementId],
  )) as Array<Record<string, unknown>>
  if (!rows[0]) {
    throw notFoundError('No version found for requirement')
  }
  if (Number(rows[0].statusId) !== STATUS_ARCHIVED) {
    throw conflictError('Only fully archived requirements can be reactivated')
  }
  return restoreVersion(db, requirementId, Number(rows[0].id), createdBy)
}

export async function getVersionHistory(
  db: SqlServerDatabase,
  requirementId: number,
) {
  const rows = (await db.query(
    `SELECT
        version.id AS id,
        version.revision_token AS revisionToken,
        version.requirement_id AS requirementId,
        version.version_number AS versionNumber,
        version.description AS description,
        version.acceptance_criteria AS acceptanceCriteria,
        version.requirement_category_id AS requirementCategoryId,
        version.requirement_type_id AS requirementTypeId,
        version.quality_characteristic_id AS qualityCharacteristicId,
        version.risk_level_id AS riskLevelId,
        version.requirement_status_id AS statusId,
        CAST(version.is_testing_required AS int) AS requiresTesting,
        version.verification_method AS verificationMethod,
        version.created_at AS createdAt,
        version.edited_at AS editedAt,
        version.published_at AS publishedAt,
        version.archived_at AS archivedAt,
        version.archive_initiated_at AS archiveInitiatedAt,
        version.created_by AS createdBy,
        requirement_category.id AS categoryId,
        requirement_category.name_en AS categoryNameEn,
        requirement_category.name_sv AS categoryNameSv,
        requirement_type.id AS typeId,
        requirement_type.name_en AS typeNameEn,
        requirement_type.name_sv AS typeNameSv,
        quality_characteristic.id AS qcId,
        quality_characteristic.name_en AS qcNameEn,
        quality_characteristic.name_sv AS qcNameSv,
        requirement_status.id AS statusRowId,
        requirement_status.name_en AS statusNameEn,
        requirement_status.name_sv AS statusNameSv,
        requirement_status.color AS statusColor
      FROM requirement_versions version
      LEFT JOIN requirement_categories requirement_category
        ON requirement_category.id = version.requirement_category_id
      LEFT JOIN requirement_types requirement_type
        ON requirement_type.id = version.requirement_type_id
      LEFT JOIN quality_characteristics quality_characteristic
        ON quality_characteristic.id = version.quality_characteristic_id
      LEFT JOIN requirement_statuses requirement_status
        ON requirement_status.id = version.requirement_status_id
      WHERE version.requirement_id = @0
      ORDER BY version.version_number DESC`,
    [requirementId],
  )) as Array<Record<string, unknown>>

  const ids = rows.map(r => Number(r.id))
  const scenarioRows = ids.length
    ? ((await db.query(
        `SELECT
            link.requirement_version_id AS requirementVersionId,
            link.usage_scenario_id AS usageScenarioId,
            scenario.id AS scId,
            scenario.name_en AS scNameEn,
            scenario.name_sv AS scNameSv
          FROM requirement_version_usage_scenarios link
          INNER JOIN usage_scenarios scenario ON scenario.id = link.usage_scenario_id
          WHERE link.requirement_version_id IN (${ids.map((_, i) => `@${i}`).join(', ')})`,
        ids,
      )) as Array<Record<string, unknown>>)
    : []

  const scenarioByVersion = new Map<number, Array<Record<string, unknown>>>()
  for (const link of scenarioRows) {
    const v = Number(link.requirementVersionId)
    const list = scenarioByVersion.get(v) ?? []
    list.push(link)
    scenarioByVersion.set(v, list)
  }

  return rows.map(row => {
    const versionId = Number(row.id)
    const categoryId = toNum(row.categoryId)
    const typeId = toNum(row.typeId)
    const qcId = toNum(row.qcId)
    const statusRowId = toNum(row.statusRowId)
    return {
      id: versionId,
      revisionToken: String(row.revisionToken ?? '').toLowerCase(),
      requirementId: Number(row.requirementId),
      versionNumber: Number(row.versionNumber),
      description: String(row.description ?? ''),
      acceptanceCriteria:
        row.acceptanceCriteria == null ? null : String(row.acceptanceCriteria),
      requirementCategoryId: categoryId,
      requirementTypeId: typeId,
      qualityCharacteristicId: qcId,
      riskLevelId: toNum(row.riskLevelId),
      statusId: Number(row.statusId),
      requiresTesting: toBool(row.requiresTesting),
      verificationMethod:
        row.verificationMethod == null ? null : String(row.verificationMethod),
      createdAt: toIso(row.createdAt) ?? '',
      editedAt: toIso(row.editedAt),
      publishedAt: toIso(row.publishedAt),
      archivedAt: toIso(row.archivedAt),
      archiveInitiatedAt: toIso(row.archiveInitiatedAt),
      createdBy: row.createdBy == null ? null : String(row.createdBy),
      category:
        categoryId == null
          ? null
          : {
              id: categoryId,
              nameEn: String(row.categoryNameEn ?? ''),
              nameSv: String(row.categoryNameSv ?? ''),
            },
      type:
        typeId == null
          ? null
          : {
              id: typeId,
              nameEn: String(row.typeNameEn ?? ''),
              nameSv: String(row.typeNameSv ?? ''),
            },
      qualityCharacteristic:
        qcId == null
          ? null
          : {
              id: qcId,
              nameEn: String(row.qcNameEn ?? ''),
              nameSv: String(row.qcNameSv ?? ''),
            },
      versionScenarios: (scenarioByVersion.get(versionId) ?? []).map(link => ({
        requirementVersionId: versionId,
        usageScenarioId: Number(link.usageScenarioId),
        scenario: {
          id: Number(link.scId),
          nameEn: link.scNameEn == null ? null : String(link.scNameEn),
          nameSv: link.scNameSv == null ? null : String(link.scNameSv),
        },
      })),
      status: Number(row.statusId),
      statusNameSv: row.statusNameSv == null ? null : String(row.statusNameSv),
      statusNameEn: row.statusNameEn == null ? null : String(row.statusNameEn),
      statusColor: row.statusColor == null ? null : String(row.statusColor),
      _statusRowId: statusRowId,
    }
  })
}

export async function getRequirementById(db: SqlServerDatabase, id: number) {
  const reqRows = (await db.query(
    `SELECT TOP (1)
        requirement.id AS id,
        requirement.unique_id AS uniqueId,
        requirement.requirement_area_id AS requirementAreaId,
        requirement.sequence_number AS sequenceNumber,
        CAST(requirement.is_archived AS int) AS isArchived,
        requirement.created_at AS createdAt,
        requirement_area.id AS areaId,
        requirement_area.prefix AS areaPrefix,
        requirement_area.name AS areaName,
        requirement_area.description AS areaDescription,
        requirement_area.owner_id AS areaOwnerId,
        requirement_area.next_sequence AS areaNextSequence,
        requirement_area.created_at AS areaCreatedAt,
        requirement_area.updated_at AS areaUpdatedAt
      FROM requirements requirement
      LEFT JOIN requirement_areas requirement_area
        ON requirement_area.id = requirement.requirement_area_id
      WHERE requirement.id = @0`,
    [id],
  )) as Array<Record<string, unknown>>

  if (!reqRows[0]) return null
  const req = reqRows[0]

  const versionRows = (await db.query(
    `SELECT
        version.id AS id,
        version.revision_token AS revisionToken,
        version.requirement_id AS requirementId,
        version.version_number AS versionNumber,
        version.description AS description,
        version.acceptance_criteria AS acceptanceCriteria,
        version.requirement_category_id AS requirementCategoryId,
        version.requirement_type_id AS requirementTypeId,
        version.quality_characteristic_id AS qualityCharacteristicId,
        version.risk_level_id AS riskLevelId,
        version.requirement_status_id AS statusId,
        CAST(version.is_testing_required AS int) AS requiresTesting,
        version.verification_method AS verificationMethod,
        version.created_at AS createdAt,
        version.edited_at AS editedAt,
        version.published_at AS publishedAt,
        version.archived_at AS archivedAt,
        version.archive_initiated_at AS archiveInitiatedAt,
        version.created_by AS createdBy,
        requirement_category.id AS categoryId,
        requirement_category.name_en AS categoryNameEn,
        requirement_category.name_sv AS categoryNameSv,
        requirement_type.id AS typeId,
        requirement_type.name_en AS typeNameEn,
        requirement_type.name_sv AS typeNameSv,
        quality_characteristic.id AS qcId,
        quality_characteristic.name_en AS qcNameEn,
        quality_characteristic.name_sv AS qcNameSv,
        quality_characteristic.requirement_type_id AS qcRequirementTypeId,
        quality_characteristic.parent_id AS qcParentId,
        risk_level.id AS rlId,
        risk_level.name_en AS rlNameEn,
        risk_level.name_sv AS rlNameSv,
        risk_level.color AS rlColor,
        risk_level.sort_order AS rlSortOrder,
        requirement_status.id AS statusRowId,
        requirement_status.name_en AS statusNameEn,
        requirement_status.name_sv AS statusNameSv,
        requirement_status.color AS statusColor,
        requirement_status.sort_order AS statusSortOrder,
        CAST(requirement_status.is_system AS int) AS statusIsSystem
      FROM requirement_versions version
      LEFT JOIN requirement_categories requirement_category
        ON requirement_category.id = version.requirement_category_id
      LEFT JOIN requirement_types requirement_type
        ON requirement_type.id = version.requirement_type_id
      LEFT JOIN quality_characteristics quality_characteristic
        ON quality_characteristic.id = version.quality_characteristic_id
      LEFT JOIN risk_levels risk_level
        ON risk_level.id = version.risk_level_id
      LEFT JOIN requirement_statuses requirement_status
        ON requirement_status.id = version.requirement_status_id
      WHERE version.requirement_id = @0
      ORDER BY version.version_number DESC`,
    [id],
  )) as Array<Record<string, unknown>>

  const versionIds = versionRows.map(r => Number(r.id))
  const placeholders = versionIds.map((_, i) => `@${i}`).join(', ')

  const normRefRows = versionIds.length
    ? ((await db.query(
        `SELECT
            link.requirement_version_id AS requirementVersionId,
            link.norm_reference_id AS normReferenceId,
            nr.id AS nrId,
            nr.norm_reference_id AS nrNormReferenceId,
            nr.name AS nrName,
            nr.type AS nrType,
            nr.reference AS nrReference,
            nr.version AS nrVersion,
            nr.issuer AS nrIssuer,
            nr.uri AS nrUri,
            nr.created_at AS nrCreatedAt,
            nr.updated_at AS nrUpdatedAt
          FROM requirement_version_norm_references link
          INNER JOIN norm_references nr ON nr.id = link.norm_reference_id
          WHERE link.requirement_version_id IN (${placeholders})`,
        versionIds,
      )) as Array<Record<string, unknown>>)
    : []

  const scenarioRows = versionIds.length
    ? ((await db.query(
        `SELECT
            link.requirement_version_id AS requirementVersionId,
            link.usage_scenario_id AS usageScenarioId,
            scenario.id AS scId,
            scenario.name_en AS scNameEn,
            scenario.name_sv AS scNameSv,
            scenario.description_en AS scDescriptionEn,
            scenario.description_sv AS scDescriptionSv,
            scenario.owner_id AS scOwnerId,
            scenario.created_at AS scCreatedAt,
            scenario.updated_at AS scUpdatedAt
          FROM requirement_version_usage_scenarios link
          INNER JOIN usage_scenarios scenario ON scenario.id = link.usage_scenario_id
          WHERE link.requirement_version_id IN (${placeholders})`,
        versionIds,
      )) as Array<Record<string, unknown>>)
    : []

  const packageRows = (await db.query(
    `SELECT COUNT(DISTINCT requirements_specification_id) AS specificationCount
      FROM requirements_specification_items
      WHERE requirement_id = @0`,
    [id],
  )) as Array<Record<string, unknown>>

  const normRefByVersion = new Map<number, Array<Record<string, unknown>>>()
  for (const link of normRefRows) {
    const v = Number(link.requirementVersionId)
    const list = normRefByVersion.get(v) ?? []
    list.push(link)
    normRefByVersion.set(v, list)
  }
  const scenarioByVersion = new Map<number, Array<Record<string, unknown>>>()
  for (const link of scenarioRows) {
    const v = Number(link.requirementVersionId)
    const list = scenarioByVersion.get(v) ?? []
    list.push(link)
    scenarioByVersion.set(v, list)
  }

  const versions = versionRows.map(row => {
    const vId = Number(row.id)
    const categoryId = toNum(row.categoryId)
    const typeId = toNum(row.typeId)
    const qcId = toNum(row.qcId)
    const rlId = toNum(row.rlId)
    const statusRowId = toNum(row.statusRowId)
    return {
      id: vId,
      revisionToken: String(row.revisionToken ?? '').toLowerCase(),
      requirementId: Number(row.requirementId),
      versionNumber: Number(row.versionNumber),
      description: String(row.description ?? ''),
      acceptanceCriteria:
        row.acceptanceCriteria == null ? null : String(row.acceptanceCriteria),
      requirementCategoryId: categoryId,
      requirementTypeId: typeId,
      qualityCharacteristicId: qcId,
      riskLevelId: rlId,
      statusId: Number(row.statusId),
      requiresTesting: toBool(row.requiresTesting),
      verificationMethod:
        row.verificationMethod == null ? null : String(row.verificationMethod),
      createdAt: toIso(row.createdAt) ?? '',
      editedAt: toIso(row.editedAt),
      publishedAt: toIso(row.publishedAt),
      archivedAt: toIso(row.archivedAt),
      archiveInitiatedAt: toIso(row.archiveInitiatedAt),
      createdBy: row.createdBy == null ? null : String(row.createdBy),
      category:
        categoryId == null
          ? null
          : {
              id: categoryId,
              nameEn: String(row.categoryNameEn ?? ''),
              nameSv: String(row.categoryNameSv ?? ''),
            },
      type:
        typeId == null
          ? null
          : {
              id: typeId,
              nameEn: String(row.typeNameEn ?? ''),
              nameSv: String(row.typeNameSv ?? ''),
            },
      qualityCharacteristic:
        qcId == null
          ? null
          : {
              id: qcId,
              nameEn: String(row.qcNameEn ?? ''),
              nameSv: String(row.qcNameSv ?? ''),
              requirementTypeId: toNum(row.qcRequirementTypeId),
              parentId: toNum(row.qcParentId),
            },
      riskLevel:
        rlId == null
          ? null
          : {
              id: rlId,
              nameEn: String(row.rlNameEn ?? ''),
              nameSv: String(row.rlNameSv ?? ''),
              color: String(row.rlColor ?? ''),
              sortOrder: Number(row.rlSortOrder ?? 0),
            },
      status: statusRowId == null ? Number(row.statusId) : Number(row.statusId),
      statusNameEn: row.statusNameEn == null ? null : String(row.statusNameEn),
      statusNameSv: row.statusNameSv == null ? null : String(row.statusNameSv),
      statusColor: row.statusColor == null ? null : String(row.statusColor),
      versionNormReferences: (normRefByVersion.get(vId) ?? []).map(link => ({
        normReferenceId: Number(link.normReferenceId),
        requirementVersionId: vId,
        normReference: {
          id: Number(link.nrId),
          normReferenceId: String(link.nrNormReferenceId ?? ''),
          name: String(link.nrName ?? ''),
          type: String(link.nrType ?? ''),
          reference: String(link.nrReference ?? ''),
          version: link.nrVersion == null ? null : String(link.nrVersion),
          issuer: link.nrIssuer == null ? null : String(link.nrIssuer),
          uri: link.nrUri == null ? null : String(link.nrUri),
          createdAt: toIso(link.nrCreatedAt) ?? '',
          updatedAt: toIso(link.nrUpdatedAt) ?? '',
        },
      })),
      versionScenarios: (scenarioByVersion.get(vId) ?? []).map(link => ({
        requirementVersionId: vId,
        usageScenarioId: Number(link.usageScenarioId),
        scenario: {
          id: Number(link.scId),
          nameEn: link.scNameEn == null ? null : String(link.scNameEn),
          nameSv: link.scNameSv == null ? null : String(link.scNameSv),
          descriptionEn:
            link.scDescriptionEn == null ? null : String(link.scDescriptionEn),
          descriptionSv:
            link.scDescriptionSv == null ? null : String(link.scDescriptionSv),
          ownerId: toNum(link.scOwnerId),
          createdAt: toIso(link.scCreatedAt) ?? '',
          updatedAt: toIso(link.scUpdatedAt) ?? '',
        },
      })),
    }
  })

  const areaId = toNum(req.areaId)

  return {
    id: Number(req.id),
    uniqueId: String(req.uniqueId ?? ''),
    requirementAreaId: Number(req.requirementAreaId),
    sequenceNumber: Number(req.sequenceNumber),
    isArchived: toBool(req.isArchived),
    createdAt: toIso(req.createdAt) ?? '',
    area:
      areaId == null
        ? null
        : {
            id: areaId,
            prefix: String(req.areaPrefix ?? ''),
            name: String(req.areaName ?? ''),
            description:
              req.areaDescription == null ? null : String(req.areaDescription),
            ownerId: toNum(req.areaOwnerId),
            nextSequence: Number(req.areaNextSequence ?? 0),
            createdAt: toIso(req.areaCreatedAt) ?? '',
            updatedAt: toIso(req.areaUpdatedAt) ?? '',
          },
    versions,
    specificationCount: Number(packageRows[0]?.specificationCount ?? 0),
  }
}

export async function getRequirementByUniqueId(
  db: SqlServerDatabase,
  uniqueId: string,
) {
  const rows = (await db.query(
    `SELECT TOP (1) id FROM requirements WHERE unique_id = @0`,
    [uniqueId],
  )) as Array<Record<string, unknown>>
  if (!rows[0]) return null
  return getRequirementById(db, Number(rows[0].id))
}
