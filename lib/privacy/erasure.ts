import { createHash, randomUUID } from 'node:crypto'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  cleanupUnassignedRequirementResponsibilityPeople,
  upsertRequirementResponsibilityPerson,
} from '@/lib/dal/requirement-responsibility-people'
import type { SqlServerDatabase } from '@/lib/db'
import { DELETED_USER_INTERNAL_NAME } from '@/lib/privacy/display-name'
import { conflictError, validationError } from '@/lib/requirements/errors'
import {
  REQUIREMENT_RESPONSIBILITY_PERSON_MISSING_NAME,
  type RequirementResponsibilityPersonRecord,
} from '@/lib/requirements/responsibility-person'

export { DELETED_USER_INTERNAL_NAME }

export type PrivacyErasureAction = 'anonymize' | 'delete' | 'skip' | 'switch'

export interface PrivacyReplacementInput {
  displayName: string
  email?: string | null
  firstName?: string | null
  hsaId: string
  lastName?: string | null
}

export interface PrivacyErasureTargetInput {
  hsaId: string
}

export interface PrivacyErasurePreviewInput {
  replacement?: PrivacyReplacementInput | null
  target: PrivacyErasureTargetInput
}

export interface PrivacyErasureExecutionInput
  extends PrivacyErasurePreviewInput {
  actions?: Record<string, PrivacyErasureAction>
  previewToken: string
}

export interface PrivacyBlockingReference {
  objectKey: string
  values: string[]
}

export interface PrivacyOccurrenceGroup {
  affectedReferences?: string[]
  allowedActions: PrivacyErasureAction[]
  blockingReferences?: PrivacyBlockingReference[]
  controlledByGroupKey?: string | null
  count: number
  currentDisplayValue: string | null
  disabledReasonKey?: string | null
  fieldKey: string
  key: string
  objectKey: string
  readOnlyReasonKey?: string | null
  recommendedAction: PrivacyErasureAction
  warningKey: string | null
}

export interface PrivacyErasurePreview {
  groups: PrivacyOccurrenceGroup[]
  previewToken: string
  targetFingerprint: string
  totalCount: number
}

export interface PrivacyErasureResult {
  actions: Record<PrivacyErasureAction, number>
  groups: PrivacyOccurrenceGroup[]
  requestId: string
  targetFingerprint: string
  totalCount: number
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

export type PrivacyGroupKind =
  | 'coAuthor'
  | 'hsaOnly'
  | 'ownerReference'
  | 'simpleDisplay'

export interface PrivacyGroupPolicy {
  affectedReferencesSql?: string
  allowedActions: PrivacyErasureAction[]
  countSql: string
  currentDisplaySql?: string
  defaultWithoutReplacement: PrivacyErasureAction
  defaultWithReplacement: PrivacyErasureAction
  displayColumn?: string
  fieldKey: string
  hsaColumn?: string
  key: string
  kind: PrivacyGroupKind
  objectKey: string
  table?: string
  warningKey: string | null
}

function requirementResponsibilityPersonNameSql(alias: string): string {
  return `NULLIF(LTRIM(RTRIM(CONCAT(
    ${alias}.given_name,
    CASE
      WHEN ${alias}.middle_name IS NULL OR LTRIM(RTRIM(${alias}.middle_name)) = N'' THEN N''
      ELSE CONCAT(N' ', ${alias}.middle_name)
    END,
    CASE
      WHEN ${alias}.surname IS NULL OR LTRIM(RTRIM(${alias}.surname)) = N'' THEN N''
      ELSE CONCAT(N' ', ${alias}.surname)
    END
  ))), N'')`
}

const GROUP_POLICIES: PrivacyGroupPolicy[] = [
  {
    allowedActions: ['skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_responsibility_people WHERE hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM requirement_responsibility_people person
      WHERE person.hsa_id = @0`,
    defaultWithReplacement: 'skip',
    defaultWithoutReplacement: 'skip',
    fieldKey: 'identity',
    key: 'requirement_responsibility_people.identity',
    kind: 'hsaOnly',
    objectKey: 'requirementResponsibilityPeople',
    table: 'requirement_responsibility_people',
    warningKey: null,
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_areas.owner */
      SELECT CONCAT(area.prefix, N' ', area.name) AS value
      FROM requirement_areas area
      WHERE area.owner_hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    allowedActions: ['switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_areas WHERE owner_hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM requirement_areas area
      INNER JOIN requirement_responsibility_people person ON person.hsa_id = area.owner_hsa_id
      WHERE area.owner_hsa_id = @0
      ORDER BY area.id ASC`,
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'skip',
    fieldKey: 'owner',
    key: 'requirement_areas.owner',
    kind: 'ownerReference',
    objectKey: 'requirementAreas',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_packages.owner */
      SELECT pkg.name AS value
      FROM requirement_packages pkg
      WHERE pkg.lead_hsa_id = @0
      ORDER BY pkg.name ASC, pkg.id ASC`,
    allowedActions: ['switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_packages pkg WHERE pkg.lead_hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM requirement_packages pkg
      INNER JOIN requirement_responsibility_people person ON person.hsa_id = pkg.lead_hsa_id
      WHERE pkg.lead_hsa_id = @0
      ORDER BY pkg.id ASC`,
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'skip',
    fieldKey: 'owner',
    key: 'requirement_packages.owner',
    kind: 'ownerReference',
    objectKey: 'requirementPackages',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_package_co_authors.hsa_id */
      SELECT pkg.name AS value
      FROM requirement_package_co_authors co_author
      INNER JOIN requirement_packages pkg ON pkg.id = co_author.requirement_package_id
      WHERE co_author.hsa_id = @0
      ORDER BY pkg.name ASC, pkg.id ASC`,
    allowedActions: ['switch', 'delete', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_package_co_authors WHERE hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM requirement_package_co_authors co_author
      INNER JOIN requirement_responsibility_people person ON person.hsa_id = co_author.hsa_id
      WHERE co_author.hsa_id = @0
      ORDER BY co_author.requirement_package_id ASC`,
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'delete',
    fieldKey: 'coAuthor',
    hsaColumn: 'hsa_id',
    key: 'requirement_package_co_authors.hsa_id',
    kind: 'coAuthor',
    objectKey: 'packageCoAuthors',
    table: 'requirement_package_co_authors',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_package_co_authors.created_by */
      SELECT pkg.name AS value
      FROM requirement_package_co_authors co_author
      INNER JOIN requirement_packages pkg ON pkg.id = co_author.requirement_package_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY pkg.name ASC, pkg.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_package_co_authors WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by_display_name AS value FROM requirement_package_co_authors WHERE created_by_hsa_id = @0 ORDER BY requirement_package_id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'created_by_display_name',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'requirement_package_co_authors.created_by',
    kind: 'hsaOnly',
    objectKey: 'packageCoAuthors',
    table: 'requirement_package_co_authors',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_versions.created_by */
      SELECT CONCAT(req.unique_id, N' v', rv.version_number) AS value
      FROM requirement_versions rv
      INNER JOIN requirements req ON req.id = rv.requirement_id
      WHERE rv.created_by_hsa_id = @0
      ORDER BY req.unique_id ASC, rv.version_number ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_versions WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by AS value FROM requirement_versions WHERE created_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'requirement_versions.created_by',
    kind: 'simpleDisplay',
    objectKey: 'requirementVersions',
    table: 'requirement_versions',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:deviations.created_by */
      SELECT CONCAT(
        COALESCE(req.unique_id, CONCAT(N'Deviation ', deviation.id)),
        CASE WHEN spec.specification_code IS NULL THEN N'' ELSE CONCAT(N' / ', spec.specification_code) END
      ) AS value
      FROM deviations deviation
      LEFT JOIN requirements_specification_items item ON item.id = deviation.specification_item_id
      LEFT JOIN requirements req ON req.id = item.requirement_id
      LEFT JOIN requirements_specifications spec ON spec.id = item.requirements_specification_id
      WHERE deviation.created_by_hsa_id = @0
      ORDER BY deviation.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM deviations WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by AS value FROM deviations WHERE created_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'deviations.created_by',
    kind: 'simpleDisplay',
    objectKey: 'deviations',
    table: 'deviations',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:deviations.decided_by */
      SELECT CONCAT(
        COALESCE(req.unique_id, CONCAT(N'Deviation ', deviation.id)),
        CASE WHEN spec.specification_code IS NULL THEN N'' ELSE CONCAT(N' / ', spec.specification_code) END
      ) AS value
      FROM deviations deviation
      LEFT JOIN requirements_specification_items item ON item.id = deviation.specification_item_id
      LEFT JOIN requirements req ON req.id = item.requirement_id
      LEFT JOIN requirements_specifications spec ON spec.id = item.requirements_specification_id
      WHERE deviation.decided_by_hsa_id = @0
      ORDER BY deviation.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM deviations WHERE decided_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) decided_by AS value FROM deviations WHERE decided_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'decidedBy',
    hsaColumn: 'decided_by_hsa_id',
    key: 'deviations.decided_by',
    kind: 'simpleDisplay',
    objectKey: 'deviations',
    table: 'deviations',
    warningKey: 'decisionSwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:specification_local_requirement_deviations.created_by */
      SELECT CONCAT(spec.specification_code, N' / ', local_requirement.unique_id) AS value
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements local_requirement
        ON local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications spec
        ON spec.id = local_requirement.specification_id
      WHERE deviation.created_by_hsa_id = @0
      ORDER BY spec.specification_code ASC, local_requirement.unique_id ASC, deviation.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM specification_local_requirement_deviations WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by AS value FROM specification_local_requirement_deviations WHERE created_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'specification_local_requirement_deviations.created_by',
    kind: 'simpleDisplay',
    objectKey: 'specificationLocalDeviations',
    table: 'specification_local_requirement_deviations',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:specification_local_requirement_deviations.decided_by */
      SELECT CONCAT(spec.specification_code, N' / ', local_requirement.unique_id) AS value
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements local_requirement
        ON local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications spec
        ON spec.id = local_requirement.specification_id
      WHERE deviation.decided_by_hsa_id = @0
      ORDER BY spec.specification_code ASC, local_requirement.unique_id ASC, deviation.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM specification_local_requirement_deviations WHERE decided_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) decided_by AS value FROM specification_local_requirement_deviations WHERE decided_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'decidedBy',
    hsaColumn: 'decided_by_hsa_id',
    key: 'specification_local_requirement_deviations.decided_by',
    kind: 'simpleDisplay',
    objectKey: 'specificationLocalDeviations',
    table: 'specification_local_requirement_deviations',
    warningKey: 'decisionSwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:improvement_suggestions.created_by */
      SELECT CONCAT(
        req.unique_id,
        CASE WHEN rv.version_number IS NULL THEN N'' ELSE CONCAT(N' v', rv.version_number) END,
        N' / suggestion ',
        suggestion.id
      ) AS value
      FROM improvement_suggestions suggestion
      INNER JOIN requirements req ON req.id = suggestion.requirement_id
      LEFT JOIN requirement_versions rv ON rv.id = suggestion.requirement_version_id
      WHERE suggestion.created_by_hsa_id = @0
      ORDER BY req.unique_id ASC, suggestion.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM improvement_suggestions WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by AS value FROM improvement_suggestions WHERE created_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'improvement_suggestions.created_by',
    kind: 'simpleDisplay',
    objectKey: 'improvementSuggestions',
    table: 'improvement_suggestions',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:improvement_suggestions.resolved_by */
      SELECT CONCAT(
        req.unique_id,
        CASE WHEN rv.version_number IS NULL THEN N'' ELSE CONCAT(N' v', rv.version_number) END,
        N' / suggestion ',
        suggestion.id
      ) AS value
      FROM improvement_suggestions suggestion
      INNER JOIN requirements req ON req.id = suggestion.requirement_id
      LEFT JOIN requirement_versions rv ON rv.id = suggestion.requirement_version_id
      WHERE suggestion.resolved_by_hsa_id = @0
      ORDER BY req.unique_id ASC, suggestion.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM improvement_suggestions WHERE resolved_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) resolved_by AS value FROM improvement_suggestions WHERE resolved_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'resolvedBy',
    hsaColumn: 'resolved_by_hsa_id',
    key: 'improvement_suggestions.resolved_by',
    kind: 'simpleDisplay',
    objectKey: 'improvementSuggestions',
    table: 'improvement_suggestions',
    warningKey: 'decisionSwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirements_specifications.responsible */
      SELECT CONCAT(spec.specification_code, N' ', spec.name) AS value
      FROM requirements_specifications spec
      WHERE spec.responsible_hsa_id = @0
      ORDER BY spec.specification_code ASC, spec.id ASC`,
    allowedActions: ['switch', 'anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirements_specifications WHERE responsible_hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM requirements_specifications spec
      INNER JOIN requirement_responsibility_people person ON person.hsa_id = spec.responsible_hsa_id
      WHERE spec.responsible_hsa_id = @0
      ORDER BY spec.id ASC`,
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'responsible',
    hsaColumn: 'responsible_hsa_id',
    key: 'requirements_specifications.responsible',
    kind: 'simpleDisplay',
    objectKey: 'specifications',
    table: 'requirements_specifications',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_area_co_authors.hsa_id */
      SELECT CONCAT(area.prefix, N' ', area.name) AS value
      FROM requirement_area_co_authors co_author
      INNER JOIN requirement_areas area ON area.id = co_author.area_id
      WHERE co_author.hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    allowedActions: ['switch', 'delete', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_area_co_authors WHERE hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM requirement_area_co_authors co_author
      INNER JOIN requirement_responsibility_people person ON person.hsa_id = co_author.hsa_id
      WHERE co_author.hsa_id = @0
      ORDER BY co_author.area_id ASC`,
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'delete',
    fieldKey: 'coAuthor',
    hsaColumn: 'hsa_id',
    key: 'requirement_area_co_authors.hsa_id',
    kind: 'coAuthor',
    objectKey: 'areaCoAuthors',
    table: 'requirement_area_co_authors',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_area_co_authors.created_by */
      SELECT CONCAT(area.prefix, N' ', area.name) AS value
      FROM requirement_area_co_authors co_author
      INNER JOIN requirement_areas area ON area.id = co_author.area_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_area_co_authors WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by_display_name AS value FROM requirement_area_co_authors WHERE created_by_hsa_id = @0 ORDER BY area_id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'created_by_display_name',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'requirement_area_co_authors.created_by',
    kind: 'hsaOnly',
    objectKey: 'areaCoAuthors',
    table: 'requirement_area_co_authors',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:specification_co_authors.hsa_id */
      SELECT CONCAT(spec.specification_code, N' ', spec.name) AS value
      FROM specification_co_authors co_author
      INNER JOIN requirements_specifications spec ON spec.id = co_author.specification_id
      WHERE co_author.hsa_id = @0
      ORDER BY spec.specification_code ASC, spec.id ASC`,
    allowedActions: ['switch', 'delete', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM specification_co_authors WHERE hsa_id = @0',
    currentDisplaySql: `SELECT TOP (1) ${requirementResponsibilityPersonNameSql('person')} AS value
      FROM specification_co_authors co_author
      INNER JOIN requirement_responsibility_people person ON person.hsa_id = co_author.hsa_id
      WHERE co_author.hsa_id = @0
      ORDER BY co_author.specification_id ASC`,
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'delete',
    fieldKey: 'coAuthor',
    hsaColumn: 'hsa_id',
    key: 'specification_co_authors.hsa_id',
    kind: 'coAuthor',
    objectKey: 'specificationCoAuthors',
    table: 'specification_co_authors',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:specification_co_authors.created_by */
      SELECT CONCAT(spec.specification_code, N' ', spec.name) AS value
      FROM specification_co_authors co_author
      INNER JOIN requirements_specifications spec ON spec.id = co_author.specification_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY spec.specification_code ASC, spec.id ASC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM specification_co_authors WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by_display_name AS value FROM specification_co_authors WHERE created_by_hsa_id = @0 ORDER BY specification_id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'created_by_display_name',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'specification_co_authors.created_by',
    kind: 'hsaOnly',
    objectKey: 'specificationCoAuthors',
    table: 'specification_co_authors',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:access_review_runs.created_by */
      SELECT CONCAT(N'access_review:', id) AS value
      FROM access_review_runs
      WHERE created_by_hsa_id = @0
      ORDER BY id ASC`,
    allowedActions: ['anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM access_review_runs WHERE created_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) created_by_display_name AS value FROM access_review_runs WHERE created_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'created_by_display_name',
    fieldKey: 'createdBy',
    hsaColumn: 'created_by_hsa_id',
    key: 'access_review_runs.created_by',
    kind: 'hsaOnly',
    objectKey: 'accessReviewRuns',
    table: 'access_review_runs',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:access_review_runs.reviewer */
      SELECT CONCAT(N'access_review:', id) AS value
      FROM access_review_runs
      WHERE reviewer_hsa_id = @0
      ORDER BY id ASC`,
    allowedActions: ['switch', 'anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM access_review_runs WHERE reviewer_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) reviewer_display_name AS value FROM access_review_runs WHERE reviewer_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'reviewer_display_name',
    fieldKey: 'reviewer',
    hsaColumn: 'reviewer_hsa_id',
    key: 'access_review_runs.reviewer',
    kind: 'hsaOnly',
    objectKey: 'accessReviewRuns',
    table: 'access_review_runs',
    warningKey: 'liveAssignment',
  },
  {
    affectedReferencesSql: `/* privacy:affected:access_review_runs.completed_by */
      SELECT CONCAT(N'access_review:', id) AS value
      FROM access_review_runs
      WHERE completed_by_hsa_id = @0
      ORDER BY id ASC`,
    allowedActions: ['anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM access_review_runs WHERE completed_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) completed_by_display_name AS value FROM access_review_runs WHERE completed_by_hsa_id = @0 ORDER BY id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'completed_by_display_name',
    fieldKey: 'completedBy',
    hsaColumn: 'completed_by_hsa_id',
    key: 'access_review_runs.completed_by',
    kind: 'hsaOnly',
    objectKey: 'accessReviewRuns',
    table: 'access_review_runs',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:access_review_items.principal */
      SELECT CONCAT(N'access_review_item:', run_id, N':', id) AS value
      FROM access_review_items
      WHERE principal_hsa_id = @0
      ORDER BY run_id ASC, id ASC`,
    allowedActions: ['anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM access_review_items WHERE principal_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) principal_display_name AS value FROM access_review_items WHERE principal_hsa_id = @0 ORDER BY run_id ASC, id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'principal_display_name',
    fieldKey: 'accessReviewPrincipal',
    hsaColumn: 'principal_hsa_id',
    key: 'access_review_items.principal',
    kind: 'hsaOnly',
    objectKey: 'accessReviewItems',
    table: 'access_review_items',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:access_review_items.decided_by */
      SELECT CONCAT(N'access_review_item:', run_id, N':', id) AS value
      FROM access_review_items
      WHERE decided_by_hsa_id = @0
      ORDER BY run_id ASC, id ASC`,
    allowedActions: ['anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM access_review_items WHERE decided_by_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) decided_by_display_name AS value FROM access_review_items WHERE decided_by_hsa_id = @0 ORDER BY run_id ASC, id ASC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'decided_by_display_name',
    fieldKey: 'decidedBy',
    hsaColumn: 'decided_by_hsa_id',
    key: 'access_review_items.decided_by',
    kind: 'hsaOnly',
    objectKey: 'accessReviewItems',
    table: 'access_review_items',
    warningKey: 'historySwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:action_audit_events.actor */
      SELECT CONCAT(action, N' #', id) AS value
      FROM action_audit_events
      WHERE actor_hsa_id = @0
      ORDER BY occurred_at DESC, id DESC`,
    allowedActions: ['anonymize', 'switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM action_audit_events WHERE actor_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) actor_display_name AS value FROM action_audit_events WHERE actor_hsa_id = @0 ORDER BY occurred_at DESC, id DESC',
    defaultWithReplacement: 'anonymize',
    defaultWithoutReplacement: 'anonymize',
    displayColumn: 'actor_display_name',
    fieldKey: 'actor',
    hsaColumn: 'actor_hsa_id',
    key: 'action_audit_events.actor',
    kind: 'simpleDisplay',
    objectKey: 'actionAuditEvents',
    table: 'action_audit_events',
    warningKey: 'historySwitch',
  },
]

const POLICY_BY_KEY = new Map(
  GROUP_POLICIES.map(policy => [policy.key, policy]),
)

export const PRIVACY_ERASURE_GROUP_POLICIES: readonly PrivacyGroupPolicy[] =
  Object.freeze([...GROUP_POLICIES])

function countFromRows(rows: Array<Record<string, unknown>>): number {
  return Number(rows[0]?.count ?? 0)
}

function valueFromRows(rows: Array<Record<string, unknown>>): string | null {
  const value = rows[0]?.value
  return value == null ? null : String(value)
}

function valuesFromRows(rows: Array<Record<string, unknown>>): string[] {
  return rows
    .map(row => row.value)
    .filter((value): value is number | string => value != null)
    .map(String)
}

function actionsAllowedForReplacement(
  actions: PrivacyErasureAction[],
  replacement: PrivacyReplacementInput | null,
): PrivacyErasureAction[] {
  return replacement ? actions : actions.filter(action => action !== 'switch')
}

function normalizeTarget(
  input: PrivacyErasureTargetInput,
): PrivacyErasureTargetInput {
  const hsaId = input.hsaId.trim()
  if (!isHsaId(hsaId)) {
    throw validationError('Target HSA-id is required and must be valid', {
      reason: 'invalid_target_hsa_id',
    })
  }
  return { hsaId }
}

function normalizeReplacement(
  input: PrivacyReplacementInput | null | undefined,
): PrivacyReplacementInput | null {
  if (!input) return null
  const hsaId = input.hsaId.trim()
  const displayName = input.displayName.trim()
  const email = input.email?.trim() || null
  const firstName = input.firstName?.trim() || null
  const lastName = input.lastName?.trim() || null
  if (!isHsaId(hsaId) || !displayName) {
    throw validationError(
      'Replacement requires both a valid HSA-id and display name',
      { reason: 'invalid_replacement' },
    )
  }
  return { displayName, email, firstName, hsaId, lastName }
}

function personFromReplacement(
  replacement: PrivacyReplacementInput,
): RequirementResponsibilityPersonRecord {
  return {
    email: replacement.email ?? null,
    givenName:
      replacement.firstName ??
      replacement.displayName ??
      REQUIREMENT_RESPONSIBILITY_PERSON_MISSING_NAME,
    hsaId: replacement.hsaId,
    middleName: null,
    surname: replacement.lastName ?? null,
  }
}

async function upsertReplacementResponsibilityPerson(
  tx: QueryExecutor,
  replacement: PrivacyReplacementInput,
): Promise<void> {
  await upsertRequirementResponsibilityPerson(
    tx,
    personFromReplacement(replacement),
  )
}

export function privacyTargetFingerprint(hsaId: string): string {
  return createHash('sha256')
    .update(`privacy-erasure:${hsaId}`, 'utf8')
    .digest('hex')
}

function previewTokenFor(
  targetHsaId: string,
  replacement: PrivacyReplacementInput | null,
  groups: PrivacyOccurrenceGroup[],
): string {
  const stablePayload = JSON.stringify({
    groups: groups.map(group => ({
      affectedReferences: group.affectedReferences ?? [],
      allowedActions: group.allowedActions,
      blockingReferences: group.blockingReferences ?? [],
      count: group.count,
      controlledByGroupKey: group.controlledByGroupKey ?? null,
      disabledReasonKey: group.disabledReasonKey ?? null,
      key: group.key,
      readOnlyReasonKey: group.readOnlyReasonKey ?? null,
      recommendedAction: group.recommendedAction,
    })),
    replacement: replacement
      ? {
          displayName: replacement.displayName,
          email: replacement.email,
          firstName: replacement.firstName,
          hsaId: replacement.hsaId,
          lastName: replacement.lastName,
        }
      : null,
    targetHsaId,
  })
  return createHash('sha256').update(stablePayload, 'utf8').digest('hex')
}

async function listAffectedReferences(
  db: QueryExecutor,
  policy: PrivacyGroupPolicy,
  targetHsaId: string,
): Promise<string[]> {
  if (!policy.affectedReferencesSql) return []
  const rows = (await db.query(policy.affectedReferencesSql, [
    targetHsaId,
  ])) as Array<Record<string, unknown>>
  return valuesFromRows(rows)
}

export async function previewPrivacyErasure(
  db: QueryExecutor,
  input: PrivacyErasurePreviewInput,
): Promise<PrivacyErasurePreview> {
  const target = normalizeTarget(input.target)
  const replacement = normalizeReplacement(input.replacement)
  const groups: PrivacyOccurrenceGroup[] = []

  for (const policy of GROUP_POLICIES) {
    const countRows = (await db.query(policy.countSql, [
      target.hsaId,
    ])) as Array<Record<string, unknown>>
    const count = countFromRows(countRows)
    if (count < 1) continue
    const valueRows = policy.currentDisplaySql
      ? ((await db.query(policy.currentDisplaySql, [target.hsaId])) as Array<
          Record<string, unknown>
        >)
      : []
    const affectedReferences = await listAffectedReferences(
      db,
      policy,
      target.hsaId,
    )
    const allowedActions = actionsAllowedForReplacement(
      policy.allowedActions,
      replacement,
    )
    const recommendedAction = replacement
      ? policy.defaultWithReplacement
      : policy.defaultWithoutReplacement
    groups.push({
      affectedReferences,
      allowedActions,
      count,
      controlledByGroupKey: null,
      currentDisplayValue: valueFromRows(valueRows),
      disabledReasonKey: null,
      fieldKey: policy.fieldKey,
      key: policy.key,
      objectKey: policy.objectKey,
      readOnlyReasonKey: null,
      recommendedAction: allowedActions.includes(recommendedAction)
        ? recommendedAction
        : (allowedActions[0] ?? 'skip'),
      warningKey: policy.warningKey,
    })
  }

  return {
    groups,
    previewToken: previewTokenFor(target.hsaId, replacement, groups),
    targetFingerprint: privacyTargetFingerprint(target.hsaId),
    totalCount: groups.reduce((sum, group) => sum + group.count, 0),
  }
}

function resolveActions(
  preview: PrivacyErasurePreview,
  inputActions: Record<string, PrivacyErasureAction> | undefined,
): Record<string, PrivacyErasureAction> {
  const actions: Record<string, PrivacyErasureAction> = {}

  for (const group of preview.groups) {
    if (group.controlledByGroupKey) continue

    const requested = inputActions?.[group.key] ?? group.recommendedAction
    if (!group.allowedActions.includes(requested)) {
      throw validationError('Unsupported privacy erasure action', {
        action: requested,
        groupKey: group.key,
        reason: 'unsupported_privacy_action',
      })
    }
    actions[group.key] = requested
  }

  for (const group of preview.groups) {
    if (!group.controlledByGroupKey) continue

    const controllerAction =
      actions[group.controlledByGroupKey] ?? group.recommendedAction
    const requested =
      controllerAction === 'switch' && group.allowedActions.includes('switch')
        ? 'switch'
        : 'skip'
    if (!group.allowedActions.includes(requested)) {
      throw validationError('Unsupported privacy erasure action', {
        action: requested,
        groupKey: group.key,
        reason: 'unsupported_privacy_action',
      })
    }
    actions[group.key] = requested
  }

  return actions
}

async function applyOwnerReferences(
  tx: QueryExecutor,
  policy: PrivacyGroupPolicy,
  action: PrivacyErasureAction,
  targetHsaId: string,
  replacement: PrivacyReplacementInput | null,
): Promise<void> {
  if (action !== 'switch') return
  const table =
    policy.key === 'requirement_areas.owner'
      ? 'requirement_areas'
      : 'requirement_packages'
  if (table === 'requirement_packages') {
    if (!replacement) {
      throw validationError(
        'Replacement owner is required for switching package leads',
        {
          groupKey: policy.key,
          reason: 'replacement_required',
        },
      )
    }
    await upsertReplacementResponsibilityPerson(tx, replacement)
    await tx.query(
      `UPDATE requirement_packages
        SET lead_hsa_id = @1,
            updated_at = @2
        WHERE lead_hsa_id = @0`,
      [targetHsaId, replacement.hsaId, new Date()],
    )
    return
  }
  if (!replacement) {
    throw validationError(
      'Replacement HSA-id is required for switching requirement area owners',
      {
        groupKey: policy.key,
        reason: 'replacement_required',
      },
    )
  }
  await upsertReplacementResponsibilityPerson(tx, replacement)
  await tx.query(
    `UPDATE requirement_areas
      SET owner_hsa_id = @1,
          updated_at = @2
      WHERE owner_hsa_id = @0`,
    [targetHsaId, replacement.hsaId, new Date()],
  )
}

function displayColumnFor(policy: PrivacyGroupPolicy): string | null {
  if (policy.displayColumn) return policy.displayColumn
  if (policy.kind === 'hsaOnly') return null
  if (policy.table === 'requirements_specifications') return null
  if (policy.kind === 'coAuthor') return null
  if (policy.fieldKey === 'createdBy') return 'created_by'
  if (policy.fieldKey === 'decidedBy') return 'decided_by'
  if (policy.fieldKey === 'resolvedBy') return 'resolved_by'
  return null
}

async function applyDirectHsaGroup(
  tx: QueryExecutor,
  policy: PrivacyGroupPolicy,
  action: PrivacyErasureAction,
  targetHsaId: string,
  replacement: PrivacyReplacementInput | null,
): Promise<void> {
  if (!policy.table || !policy.hsaColumn || action === 'skip') return
  const displayColumn = displayColumnFor(policy)
  if (action === 'delete') {
    await tx.query(
      `DELETE FROM ${policy.table} WHERE ${policy.hsaColumn} = @0`,
      [targetHsaId],
    )
    return
  }
  if (action === 'switch') {
    if (!replacement) {
      throw validationError('Replacement is required for switching identity', {
        groupKey: policy.key,
        reason: 'replacement_required',
      })
    }
    if (
      policy.kind === 'coAuthor' ||
      policy.table === 'requirements_specifications'
    ) {
      await upsertReplacementResponsibilityPerson(tx, replacement)
    }
    if (displayColumn) {
      await tx.query(
        `UPDATE ${policy.table}
          SET ${policy.hsaColumn} = @1,
              ${displayColumn} = @2
          WHERE ${policy.hsaColumn} = @0`,
        [targetHsaId, replacement.hsaId, replacement.displayName],
      )
      return
    }
    await tx.query(
      `UPDATE ${policy.table} SET ${policy.hsaColumn} = @1 WHERE ${policy.hsaColumn} = @0`,
      [targetHsaId, replacement.hsaId],
    )
    return
  }
  if (displayColumn) {
    await tx.query(
      `UPDATE ${policy.table}
        SET ${policy.hsaColumn} = NULL,
            ${displayColumn} = @1
        WHERE ${policy.hsaColumn} = @0`,
      [targetHsaId, DELETED_USER_INTERNAL_NAME],
    )
    return
  }
  await tx.query(
    `UPDATE ${policy.table} SET ${policy.hsaColumn} = NULL WHERE ${policy.hsaColumn} = @0`,
    [targetHsaId],
  )
}

function usesRequirementResponsibilityPerson(
  policy: PrivacyGroupPolicy,
): boolean {
  return (
    policy.key === 'requirement_areas.owner' ||
    policy.key === 'requirement_packages.owner' ||
    policy.key === 'requirements_specifications.responsible' ||
    policy.key === 'requirement_area_co_authors.hsa_id' ||
    policy.key === 'requirement_package_co_authors.hsa_id' ||
    policy.key === 'specification_co_authors.hsa_id'
  )
}

function summarizeActions(
  preview: PrivacyErasurePreview,
  actions: Record<string, PrivacyErasureAction>,
): Record<PrivacyErasureAction, number> {
  return preview.groups.reduce(
    (summary, group) => {
      summary[actions[group.key] ?? group.recommendedAction] += group.count
      return summary
    },
    { anonymize: 0, delete: 0, skip: 0, switch: 0 },
  )
}

export async function executePrivacyErasure(
  db: SqlServerDatabase,
  input: PrivacyErasureExecutionInput & {
    audit?: (
      executor: QueryExecutor,
      result: PrivacyErasureResult,
    ) => Promise<void>
  },
): Promise<PrivacyErasureResult> {
  const target = normalizeTarget(input.target)
  const requestId = randomUUID()
  let result!: PrivacyErasureResult
  await db.transaction('SERIALIZABLE', async manager => {
    const tx: QueryExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const preview = await previewPrivacyErasure(tx, { ...input, target })
    if (preview.previewToken !== input.previewToken) {
      throw conflictError(
        'Privacy erasure preview is stale. Run preview again before executing.',
        { reason: 'stale_privacy_preview' },
      )
    }
    const actions = resolveActions(preview, input.actions)
    const responsibilityPersonCleanupHsaIds = new Set<string>()
    const switchesIdentity = Object.values(actions).includes('switch')
    const replacement =
      input.replacement && switchesIdentity
        ? normalizeReplacement(input.replacement)
        : null
    for (const group of preview.groups) {
      const policy = POLICY_BY_KEY.get(group.key)
      if (!policy) continue
      const action = actions[group.key] ?? group.recommendedAction
      if (policy.kind === 'ownerReference') {
        await applyOwnerReferences(
          tx,
          policy,
          action,
          target.hsaId,
          replacement,
        )
        if (usesRequirementResponsibilityPerson(policy)) {
          responsibilityPersonCleanupHsaIds.add(target.hsaId)
        }
      }
    }

    for (const group of preview.groups) {
      const policy = POLICY_BY_KEY.get(group.key)
      if (!policy) continue
      const action = actions[group.key] ?? group.recommendedAction
      if (policy.kind !== 'ownerReference') {
        await applyDirectHsaGroup(tx, policy, action, target.hsaId, replacement)
        if (usesRequirementResponsibilityPerson(policy)) {
          responsibilityPersonCleanupHsaIds.add(target.hsaId)
        }
      }
    }

    await cleanupUnassignedRequirementResponsibilityPeople(tx, [
      ...responsibilityPersonCleanupHsaIds,
    ])

    result = {
      actions: summarizeActions(preview, actions),
      groups: preview.groups,
      requestId,
      targetFingerprint: preview.targetFingerprint,
      totalCount: preview.totalCount,
    }
    await input.audit?.(tx, result)
  })
  return result
}
