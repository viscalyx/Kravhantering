import { createHash, randomUUID } from 'node:crypto'
import { isHsaId } from '@/lib/auth/hsa-id'
import type { SqlServerDatabase } from '@/lib/db'
import { DELETED_USER_INTERNAL_NAME } from '@/lib/privacy/display-name'
import { conflictError, validationError } from '@/lib/requirements/errors'

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

type GroupKind =
  | 'coAuthor'
  | 'hsaOnly'
  | 'owner'
  | 'ownerReference'
  | 'simpleDisplay'

interface GroupPolicy {
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
  kind: GroupKind
  objectKey: string
  table?: string
  warningKey: string | null
}

const GROUP_POLICIES: GroupPolicy[] = [
  {
    affectedReferencesSql: `/* privacy:affected:owners.identity */
      SELECT refs.value
      FROM (
        SELECT
          CONCAT(area.prefix, N' ', area.name) AS value,
          area.prefix AS sort_value,
          area.id AS sort_id,
          0 AS sort_group
        FROM requirement_areas area
        INNER JOIN owners owner ON owner.id = area.owner_id
        WHERE owner.hsa_id = @0
        UNION ALL
        SELECT
          pkg.name_sv AS value,
          pkg.name_sv AS sort_value,
          pkg.id AS sort_id,
          1 AS sort_group
        FROM requirement_packages pkg
        INNER JOIN owners owner ON owner.id = pkg.owner_id
        WHERE owner.hsa_id = @0
      ) refs
      ORDER BY refs.sort_group ASC, refs.sort_value ASC, refs.sort_id ASC`,
    allowedActions: ['switch', 'anonymize', 'delete', 'skip'],
    countSql: 'SELECT COUNT(*) AS count FROM owners WHERE hsa_id = @0',
    currentDisplaySql:
      "SELECT TOP (1) CONCAT(first_name, CASE WHEN last_name = '' THEN '' ELSE CONCAT(' ', last_name) END) AS value FROM owners WHERE hsa_id = @0 ORDER BY id ASC",
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'anonymize',
    fieldKey: 'identity',
    key: 'owners.identity',
    kind: 'owner',
    objectKey: 'owners',
    warningKey: 'ownerSwitch',
  },
  {
    affectedReferencesSql: `/* privacy:affected:requirement_areas.owner */
      SELECT CONCAT(area.prefix, N' ', area.name) AS value
      FROM requirement_areas area
      INNER JOIN owners owner ON owner.id = area.owner_id
      WHERE owner.hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    allowedActions: ['switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_areas area INNER JOIN owners owner ON owner.id = area.owner_id WHERE owner.hsa_id = @0',
    currentDisplaySql:
      "SELECT TOP (1) CONCAT(owner.first_name, CASE WHEN owner.last_name = '' THEN '' ELSE CONCAT(' ', owner.last_name) END) AS value FROM requirement_areas area INNER JOIN owners owner ON owner.id = area.owner_id WHERE owner.hsa_id = @0 ORDER BY area.id ASC",
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
      SELECT pkg.name_sv AS value
      FROM requirement_packages pkg
      INNER JOIN owners owner ON owner.id = pkg.owner_id
      WHERE owner.hsa_id = @0
      ORDER BY pkg.name_sv ASC, pkg.id ASC`,
    allowedActions: ['switch', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirement_packages pkg INNER JOIN owners owner ON owner.id = pkg.owner_id WHERE owner.hsa_id = @0',
    currentDisplaySql:
      "SELECT TOP (1) CONCAT(owner.first_name, CASE WHEN owner.last_name = '' THEN '' ELSE CONCAT(' ', owner.last_name) END) AS value FROM requirement_packages pkg INNER JOIN owners owner ON owner.id = pkg.owner_id WHERE owner.hsa_id = @0 ORDER BY pkg.id ASC",
    defaultWithReplacement: 'switch',
    defaultWithoutReplacement: 'skip',
    fieldKey: 'owner',
    key: 'requirement_packages.owner',
    kind: 'ownerReference',
    objectKey: 'requirementPackages',
    warningKey: 'liveAssignment',
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
        CASE WHEN spec.unique_id IS NULL THEN N'' ELSE CONCAT(N' / ', spec.unique_id) END
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
        CASE WHEN spec.unique_id IS NULL THEN N'' ELSE CONCAT(N' / ', spec.unique_id) END
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
      SELECT CONCAT(spec.unique_id, N' / ', local_requirement.unique_id) AS value
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements local_requirement
        ON local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications spec
        ON spec.id = local_requirement.specification_id
      WHERE deviation.created_by_hsa_id = @0
      ORDER BY spec.unique_id ASC, local_requirement.unique_id ASC, deviation.id ASC`,
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
      SELECT CONCAT(spec.unique_id, N' / ', local_requirement.unique_id) AS value
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements local_requirement
        ON local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications spec
        ON spec.id = local_requirement.specification_id
      WHERE deviation.decided_by_hsa_id = @0
      ORDER BY spec.unique_id ASC, local_requirement.unique_id ASC, deviation.id ASC`,
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
      SELECT CONCAT(unique_id, N' ', name) AS value
      FROM requirements_specifications
      WHERE responsible_hsa_id = @0
      ORDER BY unique_id ASC, id ASC`,
    allowedActions: ['switch', 'anonymize', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM requirements_specifications WHERE responsible_hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) responsible_display_name AS value FROM requirements_specifications WHERE responsible_hsa_id = @0 ORDER BY id ASC',
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
    currentDisplaySql:
      'SELECT TOP (1) display_name AS value FROM requirement_area_co_authors WHERE hsa_id = @0 ORDER BY area_id ASC',
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
      SELECT CONCAT(spec.unique_id, N' ', spec.name) AS value
      FROM specification_co_authors co_author
      INNER JOIN requirements_specifications spec ON spec.id = co_author.specification_id
      WHERE co_author.hsa_id = @0
      ORDER BY spec.unique_id ASC, spec.id ASC`,
    allowedActions: ['switch', 'delete', 'skip'],
    countSql:
      'SELECT COUNT(*) AS count FROM specification_co_authors WHERE hsa_id = @0',
    currentDisplaySql:
      'SELECT TOP (1) display_name AS value FROM specification_co_authors WHERE hsa_id = @0 ORDER BY specification_id ASC',
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
      SELECT CONCAT(spec.unique_id, N' ', spec.name) AS value
      FROM specification_co_authors co_author
      INNER JOIN requirements_specifications spec ON spec.id = co_author.specification_id
      WHERE co_author.created_by_hsa_id = @0
      ORDER BY spec.unique_id ASC, spec.id ASC`,
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
]

const POLICY_BY_KEY = new Map(
  GROUP_POLICIES.map(policy => [policy.key, policy]),
)

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
    throw validationError('Target HSA-ID is required and must be valid', {
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
      'Replacement requires both a valid HSA-ID and display name',
      { reason: 'invalid_replacement' },
    )
  }
  return { displayName, email, firstName, hsaId, lastName }
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

async function listOwnerRequirementAreaReferences(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<string[]> {
  const rows = (await db.query(
    `SELECT CONCAT(area.prefix, N' ', area.name) AS value
      FROM requirement_areas area
      INNER JOIN owners owner ON owner.id = area.owner_id
      WHERE owner.hsa_id = @0
      ORDER BY area.prefix ASC, area.id ASC`,
    [targetHsaId],
  )) as Array<Record<string, unknown>>
  return valuesFromRows(rows)
}

async function listOwnerRequirementPackageReferences(
  db: QueryExecutor,
  targetHsaId: string,
): Promise<string[]> {
  const rows = (await db.query(
    `SELECT pkg.name_sv AS value
      FROM requirement_packages pkg
      INNER JOIN owners owner ON owner.id = pkg.owner_id
      WHERE owner.hsa_id = @0
      ORDER BY pkg.name_sv ASC, pkg.id ASC`,
    [targetHsaId],
  )) as Array<Record<string, unknown>>
  return valuesFromRows(rows)
}

async function listAffectedReferences(
  db: QueryExecutor,
  policy: GroupPolicy,
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
    const blockingAreaReferences =
      policy.kind === 'owner'
        ? await listOwnerRequirementAreaReferences(db, target.hsaId)
        : []
    const blockingPackageReferences =
      policy.kind === 'owner'
        ? await listOwnerRequirementPackageReferences(db, target.hsaId)
        : []
    const blockingReferences: PrivacyBlockingReference[] = [
      ...(blockingAreaReferences.length > 0
        ? [
            {
              objectKey: 'requirementAreas',
              values: blockingAreaReferences,
            },
          ]
        : []),
      ...(blockingPackageReferences.length > 0
        ? [
            {
              objectKey: 'requirementPackages',
              values: blockingPackageReferences,
            },
          ]
        : []),
    ]
    const ownerHasBlockingReferences = blockingReferences.length > 0
    const ownerBlockedWithoutReplacement =
      policy.kind === 'owner' && ownerHasBlockingReferences && !replacement
    const ownerRequiresSwitch =
      policy.kind === 'owner' &&
      ownerHasBlockingReferences &&
      replacement != null
    const ownerWithoutBlockingReferences =
      policy.kind === 'owner' && !ownerHasBlockingReferences
    const ownerReferenceControlledByOwner =
      policy.key === 'requirement_areas.owner' ||
      policy.key === 'requirement_packages.owner'
    const policyAllowedActions: PrivacyErasureAction[] =
      ownerBlockedWithoutReplacement
        ? ['skip']
        : ownerRequiresSwitch
          ? ['switch', 'skip']
          : ownerWithoutBlockingReferences
            ? ['delete', 'skip']
            : policy.allowedActions
    const allowedActions = actionsAllowedForReplacement(
      policyAllowedActions,
      replacement,
    )
    const recommendedAction = ownerBlockedWithoutReplacement
      ? 'skip'
      : ownerWithoutBlockingReferences
        ? 'delete'
        : replacement
          ? policy.defaultWithReplacement
          : policy.defaultWithoutReplacement
    groups.push({
      affectedReferences,
      allowedActions,
      blockingReferences:
        blockingReferences.length > 0 ? blockingReferences : undefined,
      count,
      controlledByGroupKey: ownerReferenceControlledByOwner
        ? 'owners.identity'
        : null,
      currentDisplayValue: valueFromRows(valueRows),
      disabledReasonKey: ownerBlockedWithoutReplacement
        ? blockingAreaReferences.length > 0
          ? 'ownerAreaReplacementRequired'
          : 'ownerPackageReplacementRequired'
        : null,
      fieldKey: policy.fieldKey,
      key: policy.key,
      objectKey: policy.objectKey,
      readOnlyReasonKey: ownerReferenceControlledByOwner
        ? 'controlledByOwner'
        : null,
      recommendedAction: allowedActions.includes(recommendedAction)
        ? recommendedAction
        : (allowedActions[0] ?? 'skip'),
      warningKey: ownerRequiresSwitch
        ? 'ownerAreaSwitchOnly'
        : ownerWithoutBlockingReferences
          ? 'ownerDelete'
          : policy.warningKey,
    })
  }

  return {
    groups,
    previewToken: previewTokenFor(target.hsaId, replacement, groups),
    targetFingerprint: privacyTargetFingerprint(target.hsaId),
    totalCount: groups.reduce((sum, group) => sum + group.count, 0),
  }
}

function splitDisplayName(displayName: string): {
  firstName: string
  lastName: string
} {
  const parts = displayName.trim().split(/\s+/)
  return {
    firstName: parts.shift() ?? displayName.trim(),
    lastName: parts.join(' '),
  }
}

function replacementOwnerName(replacement: PrivacyReplacementInput): {
  firstName: string
  lastName: string
} {
  if (replacement.firstName || replacement.lastName) {
    return {
      firstName: replacement.firstName ?? replacement.displayName,
      lastName: replacement.lastName ?? '',
    }
  }
  return splitDisplayName(replacement.displayName)
}

async function ensureReplacementOwner(
  tx: QueryExecutor,
  replacement: PrivacyReplacementInput | null,
): Promise<number | null> {
  if (!replacement) return null
  const { firstName, lastName } = replacementOwnerName(replacement)
  const existing = (await tx.query(
    'SELECT TOP (1) id, email FROM owners WHERE hsa_id = @0 ORDER BY id ASC',
    [replacement.hsaId],
  )) as Array<Record<string, unknown>>
  if (existing[0]) {
    const ownerId = Number(existing[0].id)
    await tx.query(
      `UPDATE owners
        SET first_name = @1,
            last_name = @2,
            email = CASE WHEN @3 IS NULL THEN email ELSE @3 END,
            updated_at = @4
        WHERE id = @0
          AND (
            first_name <> @1
            OR last_name <> @2
            OR (@3 IS NOT NULL AND (email IS NULL OR email <> @3))
          )`,
      [ownerId, firstName, lastName, replacement.email ?? null, new Date()],
    )
    return ownerId
  }

  const now = new Date()
  const inserted = (await tx.query(
    `INSERT INTO owners (first_name, last_name, email, hsa_id, created_at, updated_at)
      OUTPUT INSERTED.id AS id
      VALUES (@0, @1, @2, @3, @4, @4)`,
    [firstName, lastName, replacement.email ?? null, replacement.hsaId, now],
  )) as Array<Record<string, unknown>>
  return Number(inserted[0]?.id)
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
  policy: GroupPolicy,
  action: PrivacyErasureAction,
  targetHsaId: string,
  replacementOwnerId: number | null,
): Promise<void> {
  if (action !== 'switch') return
  if (replacementOwnerId == null) {
    throw validationError(
      'Replacement owner is required for switching owners',
      {
        groupKey: policy.key,
        reason: 'replacement_required',
      },
    )
  }
  const table =
    policy.key === 'requirement_areas.owner'
      ? 'requirement_areas'
      : 'requirement_packages'
  await tx.query(
    `UPDATE t
      SET owner_id = @1
      FROM ${table} t
      INNER JOIN owners owner ON owner.id = t.owner_id
      WHERE owner.hsa_id = @0`,
    [targetHsaId, replacementOwnerId],
  )
}

async function countOwnerReferences(
  tx: QueryExecutor,
  ownerId: number,
): Promise<number> {
  const rows = (await tx.query(
    `SELECT
        (SELECT COUNT(*) FROM requirement_areas WHERE owner_id = @0) +
        (SELECT COUNT(*) FROM requirement_packages WHERE owner_id = @0) AS count`,
    [ownerId],
  )) as Array<Record<string, unknown>>
  return countFromRows(rows)
}

async function countOwnerRequirementAreaReferences(
  tx: QueryExecutor,
  ownerId: number,
): Promise<number> {
  const rows = (await tx.query(
    'SELECT COUNT(*) AS count FROM requirement_areas WHERE owner_id = @0',
    [ownerId],
  )) as Array<Record<string, unknown>>
  return countFromRows(rows)
}

async function applyOwners(
  tx: QueryExecutor,
  action: PrivacyErasureAction,
  targetHsaId: string,
): Promise<void> {
  if (action === 'skip') return
  const ownerRows = (await tx.query(
    'SELECT id FROM owners WHERE hsa_id = @0 ORDER BY id ASC',
    [targetHsaId],
  )) as Array<Record<string, unknown>>
  for (const row of ownerRows) {
    const ownerId = Number(row.id)
    if ((await countOwnerRequirementAreaReferences(tx, ownerId)) > 0) {
      throw validationError(
        'Requirement areas must be switched before changing the owner identity',
        {
          groupKey: 'owners.identity',
          reason: 'owner_area_references_blocking',
        },
      )
    }
    if (action !== 'delete' && action !== 'switch') {
      throw validationError('Unsupported owner privacy erasure action', {
        action,
        groupKey: 'owners.identity',
        reason: 'unsupported_owner_action',
      })
    }
    if ((await countOwnerReferences(tx, ownerId)) > 0) {
      throw validationError(
        'Owner references must be switched before deleting the owner',
        {
          groupKey: 'owners.identity',
          reason: 'owner_references_blocking',
        },
      )
    }
    await tx.query('DELETE FROM owners WHERE id = @0', [ownerId])
  }
}

function displayColumnFor(policy: GroupPolicy): string | null {
  if (policy.displayColumn) return policy.displayColumn
  if (policy.kind === 'hsaOnly') return null
  if (policy.table === 'requirements_specifications') {
    return 'responsible_display_name'
  }
  if (policy.kind === 'coAuthor') return 'display_name'
  if (policy.fieldKey === 'createdBy') return 'created_by'
  if (policy.fieldKey === 'decidedBy') return 'decided_by'
  if (policy.fieldKey === 'resolvedBy') return 'resolved_by'
  return null
}

async function applyDirectHsaGroup(
  tx: QueryExecutor,
  policy: GroupPolicy,
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
  input: PrivacyErasureExecutionInput,
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
    const switchesIdentity = Object.values(actions).includes('switch')
    const replacement =
      input.replacement && switchesIdentity
        ? normalizeReplacement(input.replacement)
        : null
    const switchesOwnerReferences = preview.groups.some(group => {
      const policy = POLICY_BY_KEY.get(group.key)
      return (
        policy?.kind === 'ownerReference' && actions[group.key] === 'switch'
      )
    })
    const replacementOwnerId =
      input.replacement && switchesOwnerReferences
        ? await ensureReplacementOwner(tx, replacement)
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
          replacementOwnerId,
        )
      }
    }

    for (const group of preview.groups) {
      const policy = POLICY_BY_KEY.get(group.key)
      if (!policy) continue
      const action = actions[group.key] ?? group.recommendedAction
      if (policy.kind === 'owner') {
        await applyOwners(tx, action, target.hsaId)
      } else if (policy.kind !== 'ownerReference') {
        await applyDirectHsaGroup(tx, policy, action, target.hsaId, replacement)
      }
    }

    result = {
      actions: summarizeActions(preview, actions),
      groups: preview.groups,
      requestId,
      targetFingerprint: preview.targetFingerprint,
      totalCount: preview.totalCount,
    }
  })
  return result
}
