import {
  DATA_SUBJECT_EXPORT_SCHEMA_VERSION,
  type DataSubjectExportActor,
  type DataSubjectExportItem,
  type DataSubjectExportRelatedObject,
  type DataSubjectExportSessionClaims,
  type DataSubjectExportSource,
  type DataSubjectExportV1,
  type DataSubjectExportValue,
} from '@/lib/privacy/data-subject-export-types'
import {
  PRIVACY_ERASURE_GROUP_POLICIES,
  type PrivacyGroupPolicy,
  privacyTargetFingerprint,
} from '@/lib/privacy/erasure'

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

type ExportRow = Record<string, unknown>

interface DataSubjectExportSourceDefinition {
  collect: (
    db: QueryExecutor,
    targetHsaId: string,
  ) => Promise<DataSubjectExportItem[]>
  policy: PrivacyGroupPolicy
  relationToSubject: string
}

export interface CollectDataSubjectExportInput {
  generatedAt?: Date
  generatedBy: DataSubjectExportActor
  selfSession?: DataSubjectExportSessionClaims | null
  target: {
    hsaId: string
  }
}

const POLICY_BY_KEY = new Map(
  PRIVACY_ERASURE_GROUP_POLICIES.map(policy => [policy.key, policy]),
)

function policyFor(key: string): PrivacyGroupPolicy {
  const policy = POLICY_BY_KEY.get(key)
  if (!policy) {
    throw new Error(`Missing privacy source policy for ${key}`)
  }
  return policy
}

function isoTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return undefined
}

function stringValue(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function relatedObject(
  row: ExportRow,
  type: string,
  keyField: string,
  labelField?: string,
): DataSubjectExportRelatedObject {
  const key = stringValue(row[keyField]) ?? ''
  const label = labelField ? stringValue(row[labelField]) : null
  return {
    key,
    ...(label ? { label } : {}),
    type,
  }
}

function item(
  policy: PrivacyGroupPolicy,
  relationToSubject: string,
  fieldName: string,
  value: DataSubjectExportValue,
  options: {
    relatedObject?: DataSubjectExportRelatedObject
    table?: string
    timestamp?: unknown
  } = {},
): DataSubjectExportItem {
  return {
    fieldName,
    relationToSubject,
    ...(options.relatedObject ? { relatedObject: options.relatedObject } : {}),
    sourceKey: policy.key,
    table: options.table ?? policy.table ?? policy.key,
    ...(isoTimestamp(options.timestamp)
      ? { timestamp: isoTimestamp(options.timestamp) }
      : {}),
    value,
  }
}

function fieldsForRow(
  policy: PrivacyGroupPolicy,
  relationToSubject: string,
  fields: Array<{
    fieldName: string
    value: DataSubjectExportValue
  }>,
  options: {
    relatedObject: DataSubjectExportRelatedObject
    table?: string
    timestamp?: unknown
  },
): DataSubjectExportItem[] {
  return fields.map(field =>
    item(policy, relationToSubject, field.fieldName, field.value, options),
  )
}

async function collectRequirementResponsibilityPerson(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_responsibility_people.identity')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_responsibility_people.identity */
      SELECT
        person.hsa_id AS hsaId,
        person.given_name AS givenName,
        person.middle_name AS middleName,
        person.surname AS surname,
        person.email AS email,
        person.has_protected_personal_data AS hasProtectedPersonalData,
        person.last_fetched_at AS lastFetchedAt,
        person.updated_at AS updatedAt
      FROM requirement_responsibility_people person
      WHERE person.hsa_id = @0`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'requirement_responsibility_person',
      [
        { fieldName: 'hsa_id', value: stringValue(row.hsaId) },
        { fieldName: 'given_name', value: stringValue(row.givenName) },
        { fieldName: 'middle_name', value: stringValue(row.middleName) },
        { fieldName: 'surname', value: stringValue(row.surname) },
        { fieldName: 'email', value: stringValue(row.email) },
        {
          fieldName: 'has_protected_personal_data',
          value: Boolean(row.hasProtectedPersonalData),
        },
        {
          fieldName: 'last_fetched_at',
          value: isoTimestamp(row.lastFetchedAt) ?? null,
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'requirement_responsibility_person',
          'hsaId',
        ),
        table: 'requirement_responsibility_people',
        timestamp: row.updatedAt,
      },
    ),
  )
}

async function collectRequirementAreaOwners(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_areas.owner')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_areas.owner */
      SELECT
        area.id AS areaId,
        CONCAT(area.prefix, N' ', area.name) AS areaLabel,
        area.owner_hsa_id AS hsaId,
        area.updated_at AS updatedAt
      FROM requirement_areas area
      WHERE area.owner_hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'live_owner_assignment',
      [{ fieldName: 'owner_hsa_id', value: stringValue(row.hsaId) }],
      {
        relatedObject: relatedObject(
          row,
          'requirement_area',
          'areaId',
          'areaLabel',
        ),
        table: 'requirement_areas',
        timestamp: row.updatedAt,
      },
    ),
  )
}

async function collectRequirementPackageOwners(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_packages.owner')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_packages.owner */
      SELECT
        pkg.id AS packageId,
        pkg.name AS packageLabel,
        pkg.lead_hsa_id AS hsaId,
        pkg.updated_at AS updatedAt
      FROM requirement_packages pkg
      WHERE pkg.lead_hsa_id = @0
      ORDER BY pkg.name ASC, pkg.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'live_owner_assignment',
      [{ fieldName: 'owner_hsa_id', value: stringValue(row.hsaId) }],
      {
        relatedObject: relatedObject(
          row,
          'requirement_package',
          'packageId',
          'packageLabel',
        ),
        table: 'requirement_packages',
        timestamp: row.updatedAt,
      },
    ),
  )
}

async function collectRequirementVersionCreators(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_versions.created_by')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_versions.created_by */
      SELECT
        rv.id AS versionId,
        CONCAT(req.unique_id, N' v', rv.version_number) AS versionLabel,
        rv.created_by_hsa_id AS hsaId,
        rv.created_by AS displayName,
        rv.created_at AS createdAt
      FROM requirement_versions rv
      INNER JOIN requirements req ON req.id = rv.requirement_id
      WHERE rv.created_by_hsa_id = @0
      ORDER BY req.unique_id ASC, rv.version_number ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'historical_creator_snapshot',
      [
        { fieldName: 'created_by_hsa_id', value: stringValue(row.hsaId) },
        { fieldName: 'created_by', value: stringValue(row.displayName) },
      ],
      {
        relatedObject: relatedObject(
          row,
          'requirement_version',
          'versionId',
          'versionLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectDeviationActor(
  db: QueryExecutor,
  targetHsaId: string,
  options: {
    displayField: 'created_by' | 'decided_by'
    hsaField: 'created_by_hsa_id' | 'decided_by_hsa_id'
    key: 'deviations.created_by' | 'deviations.decided_by'
    relationToSubject:
      | 'historical_creator_snapshot'
      | 'historical_decision_snapshot'
    timestampField: 'created_at' | 'decided_at'
  },
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor(options.key)
  const rows = (await db.query(
    `/* privacy:data-export:${options.key} */
      SELECT
        deviation.id AS deviationId,
        CONCAT(
          COALESCE(req.unique_id, CONCAT(N'Deviation ', deviation.id)),
          CASE WHEN spec.unique_id IS NULL THEN N'' ELSE CONCAT(N' / ', spec.unique_id) END
        ) AS deviationLabel,
        deviation.${options.hsaField} AS hsaId,
        deviation.${options.displayField} AS displayName,
        deviation.${options.timestampField} AS actorTimestamp
      FROM deviations deviation
      LEFT JOIN requirements_specification_items item ON item.id = deviation.specification_item_id
      LEFT JOIN requirements req ON req.id = item.requirement_id
      LEFT JOIN requirements_specifications spec ON spec.id = item.requirements_specification_id
      WHERE deviation.${options.hsaField} = @0
      ORDER BY deviation.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      options.relationToSubject,
      [
        { fieldName: options.hsaField, value: stringValue(row.hsaId) },
        {
          fieldName: options.displayField,
          value: stringValue(row.displayName),
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'deviation',
          'deviationId',
          'deviationLabel',
        ),
        timestamp: row.actorTimestamp,
      },
    ),
  )
}

async function collectLocalDeviationActor(
  db: QueryExecutor,
  targetHsaId: string,
  options: {
    displayField: 'created_by' | 'decided_by'
    hsaField: 'created_by_hsa_id' | 'decided_by_hsa_id'
    key:
      | 'specification_local_requirement_deviations.created_by'
      | 'specification_local_requirement_deviations.decided_by'
    relationToSubject:
      | 'historical_creator_snapshot'
      | 'historical_decision_snapshot'
    timestampField: 'created_at' | 'decided_at'
  },
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor(options.key)
  const rows = (await db.query(
    `/* privacy:data-export:${options.key} */
      SELECT
        deviation.id AS deviationId,
        CONCAT(spec.unique_id, N' / ', local_requirement.unique_id) AS deviationLabel,
        deviation.${options.hsaField} AS hsaId,
        deviation.${options.displayField} AS displayName,
        deviation.${options.timestampField} AS actorTimestamp
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements local_requirement
        ON local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications spec
        ON spec.id = local_requirement.specification_id
      WHERE deviation.${options.hsaField} = @0
      ORDER BY spec.unique_id ASC, local_requirement.unique_id ASC, deviation.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      options.relationToSubject,
      [
        { fieldName: options.hsaField, value: stringValue(row.hsaId) },
        {
          fieldName: options.displayField,
          value: stringValue(row.displayName),
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'specification_local_requirement_deviation',
          'deviationId',
          'deviationLabel',
        ),
        timestamp: row.actorTimestamp,
      },
    ),
  )
}

async function collectSuggestionActor(
  db: QueryExecutor,
  targetHsaId: string,
  options: {
    displayField: 'created_by' | 'resolved_by'
    hsaField: 'created_by_hsa_id' | 'resolved_by_hsa_id'
    key:
      | 'improvement_suggestions.created_by'
      | 'improvement_suggestions.resolved_by'
    relationToSubject:
      | 'historical_creator_snapshot'
      | 'historical_decision_snapshot'
    timestampField: 'created_at' | 'resolved_at'
  },
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor(options.key)
  const rows = (await db.query(
    `/* privacy:data-export:${options.key} */
      SELECT
        suggestion.id AS suggestionId,
        CONCAT(
          req.unique_id,
          CASE WHEN rv.version_number IS NULL THEN N'' ELSE CONCAT(N' v', rv.version_number) END,
          N' / suggestion ',
          suggestion.id
        ) AS suggestionLabel,
        suggestion.${options.hsaField} AS hsaId,
        suggestion.${options.displayField} AS displayName,
        suggestion.${options.timestampField} AS actorTimestamp
      FROM improvement_suggestions suggestion
      INNER JOIN requirements req ON req.id = suggestion.requirement_id
      LEFT JOIN requirement_versions rv ON rv.id = suggestion.requirement_version_id
      WHERE suggestion.${options.hsaField} = @0
      ORDER BY req.unique_id ASC, suggestion.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      options.relationToSubject,
      [
        { fieldName: options.hsaField, value: stringValue(row.hsaId) },
        {
          fieldName: options.displayField,
          value: stringValue(row.displayName),
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'improvement_suggestion',
          'suggestionId',
          'suggestionLabel',
        ),
        timestamp: row.actorTimestamp,
      },
    ),
  )
}

async function collectSpecificationResponsible(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirements_specifications.responsible')
  const rows = (await db.query(
    `/* privacy:data-export:requirements_specifications.responsible */
      SELECT
        spec.id AS specificationId,
        CONCAT(spec.unique_id, N' ', spec.name) AS specificationLabel,
        spec.responsible_hsa_id AS hsaId,
        spec.updated_at AS updatedAt
      FROM requirements_specifications spec
      WHERE spec.responsible_hsa_id = @0
      ORDER BY spec.unique_id ASC, spec.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'live_responsible_assignment',
      [{ fieldName: 'responsible_hsa_id', value: stringValue(row.hsaId) }],
      {
        relatedObject: relatedObject(
          row,
          'requirements_specification',
          'specificationId',
          'specificationLabel',
        ),
        timestamp: row.updatedAt,
      },
    ),
  )
}

async function collectAreaCoAuthors(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_area_co_authors.hsa_id')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_area_co_authors.hsa_id */
      SELECT
        co_author.area_id AS areaId,
        CONCAT(area.prefix, N' ', area.name) AS areaLabel,
        co_author.hsa_id AS hsaId,
        co_author.created_at AS createdAt
      FROM requirement_area_co_authors co_author
      INNER JOIN requirement_areas area ON area.id = co_author.area_id
      WHERE co_author.hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'live_co_author_assignment',
      [{ fieldName: 'hsa_id', value: stringValue(row.hsaId) }],
      {
        relatedObject: relatedObject(
          row,
          'requirement_area',
          'areaId',
          'areaLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectAreaCoAuthorCreators(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_area_co_authors.created_by')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_area_co_authors.created_by */
      SELECT
        co_author.area_id AS areaId,
        CONCAT(area.prefix, N' ', area.name) AS areaLabel,
        co_author.created_by_hsa_id AS hsaId,
        co_author.created_by_display_name AS displayName,
        co_author.created_at AS createdAt
      FROM requirement_area_co_authors co_author
      INNER JOIN requirement_areas area ON area.id = co_author.area_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'assignment_creator_snapshot',
      [
        { fieldName: 'created_by_hsa_id', value: stringValue(row.hsaId) },
        {
          fieldName: 'created_by_display_name',
          value: stringValue(row.displayName),
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'requirement_area',
          'areaId',
          'areaLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectPackageCoAuthors(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_package_co_authors.hsa_id')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_package_co_authors.hsa_id */
      SELECT
        co_author.requirement_package_id AS packageId,
        pkg.name AS packageLabel,
        co_author.hsa_id AS hsaId,
        co_author.created_at AS createdAt
      FROM requirement_package_co_authors co_author
      INNER JOIN requirement_packages pkg ON pkg.id = co_author.requirement_package_id
      WHERE co_author.hsa_id = @0
      ORDER BY pkg.name ASC, pkg.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'live_co_author_assignment',
      [{ fieldName: 'hsa_id', value: stringValue(row.hsaId) }],
      {
        relatedObject: relatedObject(
          row,
          'requirement_package',
          'packageId',
          'packageLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectPackageCoAuthorCreators(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('requirement_package_co_authors.created_by')
  const rows = (await db.query(
    `/* privacy:data-export:requirement_package_co_authors.created_by */
      SELECT
        co_author.requirement_package_id AS packageId,
        pkg.name AS packageLabel,
        co_author.created_by_hsa_id AS hsaId,
        co_author.created_by_display_name AS displayName,
        co_author.created_at AS createdAt
      FROM requirement_package_co_authors co_author
      INNER JOIN requirement_packages pkg ON pkg.id = co_author.requirement_package_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY pkg.name ASC, pkg.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'assignment_creator_snapshot',
      [
        { fieldName: 'created_by_hsa_id', value: stringValue(row.hsaId) },
        {
          fieldName: 'created_by_display_name',
          value: stringValue(row.displayName),
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'requirement_package',
          'packageId',
          'packageLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectSpecificationCoAuthors(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('specification_co_authors.hsa_id')
  const rows = (await db.query(
    `/* privacy:data-export:specification_co_authors.hsa_id */
      SELECT
        co_author.specification_id AS specificationId,
        CONCAT(spec.unique_id, N' ', spec.name) AS specificationLabel,
        co_author.hsa_id AS hsaId,
        co_author.created_at AS createdAt
      FROM specification_co_authors co_author
      INNER JOIN requirements_specifications spec ON spec.id = co_author.specification_id
      WHERE co_author.hsa_id = @0
      ORDER BY spec.unique_id ASC, spec.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'live_co_author_assignment',
      [{ fieldName: 'hsa_id', value: stringValue(row.hsaId) }],
      {
        relatedObject: relatedObject(
          row,
          'requirements_specification',
          'specificationId',
          'specificationLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectSpecificationCoAuthorCreators(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('specification_co_authors.created_by')
  const rows = (await db.query(
    `/* privacy:data-export:specification_co_authors.created_by */
      SELECT
        co_author.specification_id AS specificationId,
        CONCAT(spec.unique_id, N' ', spec.name) AS specificationLabel,
        co_author.created_by_hsa_id AS hsaId,
        co_author.created_by_display_name AS displayName,
        co_author.created_at AS createdAt
      FROM specification_co_authors co_author
      INNER JOIN requirements_specifications spec ON spec.id = co_author.specification_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY spec.unique_id ASC, spec.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'assignment_creator_snapshot',
      [
        { fieldName: 'created_by_hsa_id', value: stringValue(row.hsaId) },
        {
          fieldName: 'created_by_display_name',
          value: stringValue(row.displayName),
        },
      ],
      {
        relatedObject: relatedObject(
          row,
          'requirements_specification',
          'specificationId',
          'specificationLabel',
        ),
        timestamp: row.createdAt,
      },
    ),
  )
}

async function collectAccessReviewRunActor(
  db: QueryExecutor,
  targetHsaId: string,
  options: {
    displayField:
      | 'completed_by_display_name'
      | 'created_by_display_name'
      | 'reviewer_display_name'
    hsaField: 'completed_by_hsa_id' | 'created_by_hsa_id' | 'reviewer_hsa_id'
    key:
      | 'access_review_runs.completed_by'
      | 'access_review_runs.created_by'
      | 'access_review_runs.reviewer'
    relationToSubject:
      | 'access_review_completed_by_snapshot'
      | 'access_review_creator_snapshot'
      | 'access_review_reviewer_assignment'
    timestampField: 'completed_at' | 'created_at' | 'updated_at'
  },
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor(options.key)
  const rows = (await db.query(
    `/* privacy:data-export:${options.key} */
      SELECT
        id AS runId,
        ${options.hsaField} AS hsaId,
        ${options.displayField} AS displayName,
        status,
        period_start AS periodStart,
        period_end AS periodEnd,
        due_at AS dueAt,
        external_evidence_reference AS externalEvidenceReference,
        ${options.timestampField} AS actorTimestamp
      FROM access_review_runs
      WHERE ${options.hsaField} = @0
      ORDER BY id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      options.relationToSubject,
      [
        { fieldName: options.hsaField, value: stringValue(row.hsaId) },
        {
          fieldName: options.displayField,
          value: stringValue(row.displayName),
        },
        { fieldName: 'status', value: stringValue(row.status) },
        { fieldName: 'period_start', value: stringValue(row.periodStart) },
        { fieldName: 'period_end', value: stringValue(row.periodEnd) },
        { fieldName: 'due_at', value: stringValue(row.dueAt) },
        {
          fieldName: 'external_evidence_reference',
          value: stringValue(row.externalEvidenceReference),
        },
      ],
      {
        relatedObject: relatedObject(row, 'access_review_run', 'runId'),
        timestamp: row.actorTimestamp,
      },
    ),
  )
}

async function collectAccessReviewItemActor(
  db: QueryExecutor,
  targetHsaId: string,
  options: {
    displayField: 'decided_by_display_name' | 'principal_display_name'
    hsaField: 'decided_by_hsa_id' | 'principal_hsa_id'
    key: 'access_review_items.decided_by' | 'access_review_items.principal'
    relationToSubject:
      | 'access_review_decision_snapshot'
      | 'access_review_principal_snapshot'
    timestampField: 'created_at' | 'decided_at'
  },
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor(options.key)
  const rows = (await db.query(
    `/* privacy:data-export:${options.key} */
      SELECT
        item.id AS itemId,
        CONCAT(item.run_id, N':', item.id) AS itemKey,
        item.${options.hsaField} AS hsaId,
        item.${options.displayField} AS displayName,
        item.source_key AS sourceKey,
        item.scope_type AS scopeType,
        item.scope_key AS scopeKey,
        item.scope_label AS scopeLabel,
        item.permission_type AS permissionType,
        item.decision AS decision,
        item.${options.timestampField} AS actorTimestamp
      FROM access_review_items item
      WHERE item.${options.hsaField} = @0
      ORDER BY item.run_id ASC, item.id ASC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      options.relationToSubject,
      [
        { fieldName: options.hsaField, value: stringValue(row.hsaId) },
        {
          fieldName: options.displayField,
          value: stringValue(row.displayName),
        },
        { fieldName: 'source_key', value: stringValue(row.sourceKey) },
        { fieldName: 'scope_type', value: stringValue(row.scopeType) },
        { fieldName: 'scope_key', value: stringValue(row.scopeKey) },
        { fieldName: 'scope_label', value: stringValue(row.scopeLabel) },
        {
          fieldName: 'permission_type',
          value: stringValue(row.permissionType),
        },
        { fieldName: 'decision', value: stringValue(row.decision) },
      ],
      {
        relatedObject: relatedObject(row, 'access_review_item', 'itemKey'),
        timestamp: row.actorTimestamp,
      },
    ),
  )
}

async function collectActionAuditEventActors(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<DataSubjectExportItem[]> {
  const policy = policyFor('action_audit_events.actor')
  const rows = (await db.query(
    `/* privacy:data-export:action_audit_events.actor */
      SELECT
        event.id AS eventId,
        event.actor_hsa_id AS hsaId,
        event.actor_display_name AS displayName,
        event.action AS action,
        event.target_kind AS targetKind,
        event.target_id AS targetId,
        event.target_unique_id AS targetUniqueId,
        event.decision AS decision,
        event.occurred_at AS occurredAt
      FROM action_audit_events event
      WHERE event.actor_hsa_id = @0
      ORDER BY event.occurred_at DESC, event.id DESC`,
    [targetHsaId],
  )) as ExportRow[]

  return rows.flatMap(row =>
    fieldsForRow(
      policy,
      'action_audit_actor_snapshot',
      [
        { fieldName: 'actor_hsa_id', value: stringValue(row.hsaId) },
        {
          fieldName: 'actor_display_name',
          value: stringValue(row.displayName),
        },
        { fieldName: 'action', value: stringValue(row.action) },
        { fieldName: 'target_kind', value: stringValue(row.targetKind) },
        { fieldName: 'target_id', value: stringValue(row.targetId) },
        {
          fieldName: 'target_unique_id',
          value: stringValue(row.targetUniqueId),
        },
        { fieldName: 'decision', value: stringValue(row.decision) },
      ],
      {
        relatedObject: relatedObject(row, 'action_audit_event', 'eventId'),
        timestamp: row.occurredAt,
      },
    ),
  )
}

const SOURCE_DEFINITIONS: DataSubjectExportSourceDefinition[] = [
  {
    collect: collectRequirementAreaOwners,
    policy: policyFor('requirement_areas.owner'),
    relationToSubject: 'live_owner_assignment',
  },
  {
    collect: collectRequirementResponsibilityPerson,
    policy: policyFor('requirement_responsibility_people.identity'),
    relationToSubject: 'requirement_responsibility_person',
  },
  {
    collect: collectRequirementPackageOwners,
    policy: policyFor('requirement_packages.owner'),
    relationToSubject: 'live_owner_assignment',
  },
  {
    collect: collectRequirementVersionCreators,
    policy: policyFor('requirement_versions.created_by'),
    relationToSubject: 'historical_creator_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectDeviationActor(db, targetHsaId, {
        displayField: 'created_by',
        hsaField: 'created_by_hsa_id',
        key: 'deviations.created_by',
        relationToSubject: 'historical_creator_snapshot',
        timestampField: 'created_at',
      }),
    policy: policyFor('deviations.created_by'),
    relationToSubject: 'historical_creator_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectDeviationActor(db, targetHsaId, {
        displayField: 'decided_by',
        hsaField: 'decided_by_hsa_id',
        key: 'deviations.decided_by',
        relationToSubject: 'historical_decision_snapshot',
        timestampField: 'decided_at',
      }),
    policy: policyFor('deviations.decided_by'),
    relationToSubject: 'historical_decision_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectLocalDeviationActor(db, targetHsaId, {
        displayField: 'created_by',
        hsaField: 'created_by_hsa_id',
        key: 'specification_local_requirement_deviations.created_by',
        relationToSubject: 'historical_creator_snapshot',
        timestampField: 'created_at',
      }),
    policy: policyFor('specification_local_requirement_deviations.created_by'),
    relationToSubject: 'historical_creator_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectLocalDeviationActor(db, targetHsaId, {
        displayField: 'decided_by',
        hsaField: 'decided_by_hsa_id',
        key: 'specification_local_requirement_deviations.decided_by',
        relationToSubject: 'historical_decision_snapshot',
        timestampField: 'decided_at',
      }),
    policy: policyFor('specification_local_requirement_deviations.decided_by'),
    relationToSubject: 'historical_decision_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectSuggestionActor(db, targetHsaId, {
        displayField: 'created_by',
        hsaField: 'created_by_hsa_id',
        key: 'improvement_suggestions.created_by',
        relationToSubject: 'historical_creator_snapshot',
        timestampField: 'created_at',
      }),
    policy: policyFor('improvement_suggestions.created_by'),
    relationToSubject: 'historical_creator_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectSuggestionActor(db, targetHsaId, {
        displayField: 'resolved_by',
        hsaField: 'resolved_by_hsa_id',
        key: 'improvement_suggestions.resolved_by',
        relationToSubject: 'historical_decision_snapshot',
        timestampField: 'resolved_at',
      }),
    policy: policyFor('improvement_suggestions.resolved_by'),
    relationToSubject: 'historical_decision_snapshot',
  },
  {
    collect: collectSpecificationResponsible,
    policy: policyFor('requirements_specifications.responsible'),
    relationToSubject: 'live_responsible_assignment',
  },
  {
    collect: collectAreaCoAuthors,
    policy: policyFor('requirement_area_co_authors.hsa_id'),
    relationToSubject: 'live_co_author_assignment',
  },
  {
    collect: collectAreaCoAuthorCreators,
    policy: policyFor('requirement_area_co_authors.created_by'),
    relationToSubject: 'assignment_creator_snapshot',
  },
  {
    collect: collectPackageCoAuthors,
    policy: policyFor('requirement_package_co_authors.hsa_id'),
    relationToSubject: 'live_co_author_assignment',
  },
  {
    collect: collectPackageCoAuthorCreators,
    policy: policyFor('requirement_package_co_authors.created_by'),
    relationToSubject: 'assignment_creator_snapshot',
  },
  {
    collect: collectSpecificationCoAuthors,
    policy: policyFor('specification_co_authors.hsa_id'),
    relationToSubject: 'live_co_author_assignment',
  },
  {
    collect: collectSpecificationCoAuthorCreators,
    policy: policyFor('specification_co_authors.created_by'),
    relationToSubject: 'assignment_creator_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectAccessReviewRunActor(db, targetHsaId, {
        displayField: 'created_by_display_name',
        hsaField: 'created_by_hsa_id',
        key: 'access_review_runs.created_by',
        relationToSubject: 'access_review_creator_snapshot',
        timestampField: 'created_at',
      }),
    policy: policyFor('access_review_runs.created_by'),
    relationToSubject: 'access_review_creator_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectAccessReviewRunActor(db, targetHsaId, {
        displayField: 'reviewer_display_name',
        hsaField: 'reviewer_hsa_id',
        key: 'access_review_runs.reviewer',
        relationToSubject: 'access_review_reviewer_assignment',
        timestampField: 'updated_at',
      }),
    policy: policyFor('access_review_runs.reviewer'),
    relationToSubject: 'access_review_reviewer_assignment',
  },
  {
    collect: (db, targetHsaId) =>
      collectAccessReviewRunActor(db, targetHsaId, {
        displayField: 'completed_by_display_name',
        hsaField: 'completed_by_hsa_id',
        key: 'access_review_runs.completed_by',
        relationToSubject: 'access_review_completed_by_snapshot',
        timestampField: 'completed_at',
      }),
    policy: policyFor('access_review_runs.completed_by'),
    relationToSubject: 'access_review_completed_by_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectAccessReviewItemActor(db, targetHsaId, {
        displayField: 'principal_display_name',
        hsaField: 'principal_hsa_id',
        key: 'access_review_items.principal',
        relationToSubject: 'access_review_principal_snapshot',
        timestampField: 'created_at',
      }),
    policy: policyFor('access_review_items.principal'),
    relationToSubject: 'access_review_principal_snapshot',
  },
  {
    collect: (db, targetHsaId) =>
      collectAccessReviewItemActor(db, targetHsaId, {
        displayField: 'decided_by_display_name',
        hsaField: 'decided_by_hsa_id',
        key: 'access_review_items.decided_by',
        relationToSubject: 'access_review_decision_snapshot',
        timestampField: 'decided_at',
      }),
    policy: policyFor('access_review_items.decided_by'),
    relationToSubject: 'access_review_decision_snapshot',
  },
  {
    collect: collectActionAuditEventActors,
    policy: policyFor('action_audit_events.actor'),
    relationToSubject: 'action_audit_actor_snapshot',
  },
]

export const DATA_SUBJECT_EXPORT_SOURCE_KEYS = SOURCE_DEFINITIONS.map(
  source => source.policy.key,
)

function sessionSource(
  session: DataSubjectExportSessionClaims,
): DataSubjectExportSource {
  const policy: PrivacyGroupPolicy = {
    allowedActions: [],
    countSql: '',
    defaultWithoutReplacement: 'skip',
    defaultWithReplacement: 'skip',
    fieldKey: 'session',
    key: 'auth.session',
    kind: 'hsaOnly',
    objectKey: 'authSession',
    table: 'auth_session',
    warningKey: null,
  }
  const related = {
    key: session.sub,
    label: session.name,
    type: 'auth_session',
  }
  const relationToSubject = 'current_auth_session'
  const rows: Array<[string, DataSubjectExportValue]> = [
    ['sub', session.sub],
    ['hsaId', session.hsaId],
    ['name', session.name],
    ['givenName', session.givenName],
    ['familyName', session.familyName],
    ['email', session.email ?? null],
    ['roles', session.roles],
    ['expiresAt', session.expiresAt],
  ]

  return {
    fieldKey: policy.fieldKey,
    items: rows.map(([fieldName, value]) =>
      item(policy, relationToSubject, fieldName, value, {
        relatedObject: related,
        table: 'auth_session',
      }),
    ),
    key: policy.key,
    objectKey: policy.objectKey,
    relationToSubject,
    table: policy.table ?? 'auth_session',
  }
}

export function dataSubjectExportLimitations(): DataSubjectExportV1['limitations'] {
  return [
    {
      description:
        'Description and other free-text fields are not scanned because the product instructs users not to enter person-identifying data there.',
      key: 'free_text_not_scanned',
    },
    {
      description:
        'Platform security-audit logs are emitted to the operational log stream and are not exported from the application database by this function.',
      key: 'security_audit_logs_external',
    },
    {
      description:
        'Direct transfer to another controller is not implemented in this version; downloadable JSON is the authoritative portability format.',
      key: 'direct_transfer_not_implemented',
    },
    {
      description:
        'Auth session claims are included only for self-export because sessions are stored in the signed browser session cookie and are not queryable for another HSA-id.',
      key: 'session_claims_self_only',
    },
  ]
}

export async function collectDataSubjectExport(
  db: QueryExecutor,
  input: CollectDataSubjectExportInput,
): Promise<DataSubjectExportV1> {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString()
  const sources: DataSubjectExportSource[] = []

  for (const definition of SOURCE_DEFINITIONS) {
    const items = await definition.collect(db, input.target.hsaId)
    if (items.length < 1) continue
    sources.push({
      fieldKey: definition.policy.fieldKey,
      items,
      key: definition.policy.key,
      objectKey: definition.policy.objectKey,
      relationToSubject: definition.relationToSubject,
      table: definition.policy.table ?? definition.policy.key,
    })
  }

  if (input.selfSession) {
    sources.unshift(sessionSource(input.selfSession))
  }

  const limitations = dataSubjectExportLimitations()
  const itemCount = sources.reduce((count, source) => {
    return count + source.items.length
  }, 0)

  return {
    generatedAt,
    generatedBy: input.generatedBy,
    limitations,
    schemaVersion: DATA_SUBJECT_EXPORT_SCHEMA_VERSION,
    sources,
    subject: {
      hsaId: input.target.hsaId,
      targetFingerprint: privacyTargetFingerprint(input.target.hsaId),
    },
    summary: {
      itemCount,
      limitationCount: limitations.length,
      sourceCount: sources.length,
    },
  }
}
