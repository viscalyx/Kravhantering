import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '../requirements/status-constants.mjs'

function createSqlBuilder() {
  const params = []
  return {
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

export function escapeLike(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/[%_[]/g, '\\$&')
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

function buildListConditions(opts, builder) {
  const conditions = []

  if (!opts.includeArchived) {
    conditions.push('requirement.is_archived = 0')
  }
  if (opts.areaIds && opts.areaIds.length > 0) {
    const placeholders = opts.areaIds.map(id => builder.push(id)).join(', ')
    conditions.push(`requirement.requirement_area_id IN (${placeholders})`)
  }
  if (opts.uniqueIdSearch) {
    conditions.push(
      `requirement.unique_id LIKE ${builder.push(`%${escapeLike(opts.uniqueIdSearch)}%`)} ESCAPE '\\'`,
    )
  }
  if (opts.descriptionSearch) {
    const pattern = builder.push(`%${escapeLike(opts.descriptionSearch)}%`)
    conditions.push(
      `(version.description LIKE ${pattern} ESCAPE '\\' OR version.acceptance_criteria LIKE ${pattern} ESCAPE '\\')`,
    )
  }
  if (opts.statuses && opts.statuses.length > 0) {
    const placeholders = opts.statuses.map(id => builder.push(id)).join(', ')
    conditions.push(`effective_status.effective_status_id IN (${placeholders})`)
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
  if (opts.requirementPackageIds && opts.requirementPackageIds.length > 0) {
    const placeholders = opts.requirementPackageIds
      .map(id => builder.push(id))
      .join(', ')
    conditions.push(
      `EXISTS (SELECT 1 FROM requirement_version_requirement_packages vus WHERE vus.requirement_version_id = version.id AND vus.requirement_package_id IN (${placeholders}))`,
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
  CROSS APPLY (
    SELECT (${EFFECTIVE_STATUS_SQL}) AS effective_status_id
  ) effective_status
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
  LEFT JOIN requirement_statuses requirement_status
    ON requirement_status.id = effective_status.effective_status_id
`

const LIST_COUNT_FROM_CLAUSE = `
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
  CROSS APPLY (
    SELECT (${EFFECTIVE_STATUS_SQL}) AS effective_status_id
  ) effective_status
`

function buildOrderByClause(opts) {
  const locale = opts.locale ?? 'en'
  const sortBy = opts.sortBy ?? 'uniqueId'
  const direction = opts.sortDirection ?? 'asc'
  const dir = direction === 'desc' ? 'DESC' : 'ASC'

  const textOrder = col =>
    `CASE WHEN ${col} IS NULL OR LTRIM(RTRIM(${col})) = '' THEN 1 ELSE 0 END ASC, LOWER(${col}) ${dir}, requirement.unique_id ASC`
  const numberOrder = col =>
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
      return numberOrder('requirement_status.sort_order')
    case 'version':
      return numberOrder('version.version_number')
    default:
      return `requirement.unique_id ${dir}`
  }
}

export function buildRequirementListSql(opts = {}) {
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

  return {
    parameters: builder.values(),
    sqlText: `
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
      effective_status.effective_status_id AS status,
      requirement_status.name_sv AS statusNameSv,
      requirement_status.name_en AS statusNameEn,
      requirement_status.color AS statusColor,
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
  `,
  }
}

export function buildRequirementCountSql(opts = {}) {
  const builder = createSqlBuilder()
  const conditions = buildListConditions(opts, builder)
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return {
    parameters: builder.values(),
    sqlText: `
    SELECT COUNT(DISTINCT requirement.id) AS [count]
    ${LIST_COUNT_FROM_CLAUSE}
    ${whereClause}
  `,
  }
}
