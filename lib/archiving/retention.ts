// cspell:ignore SYSUTCDATETIME
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SqlServerDatabase } from '@/lib/db'
import { isDeletedUserInternalName } from '@/lib/privacy/display-name'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

export type ArchivingRetentionAction = 'delete'

export interface ArchivingRetentionActor {
  displayName: string
  hsaId: string | null
}

export interface ArchivingRetentionPolicy {
  action: ArchivingRetentionAction
  ageDays: number
  createdAt: string
  decisionReference: string | null
  id: number
  informationSet: string
  isEnabled: boolean
  lastRunAt: string | null
  latestRun: ArchivingRetentionRunSummary | null
  policyKey: string
  statusCondition: string
  updatedAt: string
}

export interface ArchivingRetentionRunSummary {
  archivedCount: number
  candidateCount: number
  completedAt: string
  deletedCount: number
  exceptionCount: number
  id: number
  skippedCount: number
}

export interface ArchivingRetentionCandidate {
  action: ArchivingRetentionAction
  ageBasis: string
  blockedReasonKey: string | null
  currentDisplayValue: string | null
  fieldKey: string
  key: string
  objectKey: string
  reference: string
  requiresExport: boolean
  sourceKey: string
  subjectId: string
  subjectTable: string
}

export interface ArchivingRetentionSummary {
  archiveCount: number
  candidateCount: number
  deleteCount: number
  exceptionCount: number
  skippedCount: number
}

export interface ArchivingRetentionPreview {
  candidates: ArchivingRetentionCandidate[]
  cutoff: string
  policy: ArchivingRetentionPolicy
  previewToken: string
  summary: ArchivingRetentionSummary
}

export interface ArchivingRetentionExecutionInput {
  exportToken?: string | null
  policyId: number
  previewToken: string
}

export interface ArchivingRetentionRunResult extends ArchivingRetentionPreview {
  runId: number
  runRequestId: string
}

export interface ArchivingRetentionExportInput {
  policyId: number
  previewToken: string
}

export interface ArchivingRetentionArchiveExport {
  archive: Record<string, unknown>
  exportToken: string
}

export interface ArchivingRetentionExceptionInput {
  expiresAt?: Date | null
  policyId: number
  reason: string
  sourceKey: string
  subjectId: string
  subjectTable: string
}

export interface ArchivingRetentionException {
  createdAt: string
  createdByDisplayName: string
  expiresAt: string | null
  id: number
  policyId: number
  reason: string
  sourceKey: string
  subjectId: string
  subjectTable: string
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

type Row = Record<string, unknown>

interface RetentionSourceDefinition {
  action: ArchivingRetentionAction
  executeSql?: string
  fieldKey: string
  objectKey: string
  policyKey: string
  requiresExport?: boolean
  selectSql: string
  sourceKey: string
  subjectTable: string
}

const ORPHANED_OWNER_POLICY_KEY = 'orphaned_owner_delete'
const UNUSED_TAXONOMY_POLICY_KEY = 'unused_taxonomy_delete'
const OLD_REQUIREMENT_VERSIONS_POLICY_KEY = 'old_requirement_versions_delete'
const OBSOLETE_SPECIFICATIONS_POLICY_KEY = 'obsolete_specifications_delete'
const SPECIFICATION_MANAGEMENT_STATUS_ID = 4
const EXPORT_CONFIRMATION_TTL_MS = 15 * 60 * 1000

interface ExportConfirmation {
  candidateKeys: string[]
  expiresAt: number
  policyId: number
  previewToken: string
}

const exportConfirmations = new Map<string, ExportConfirmation>()

const ACTIVE_EXCEPTION_SQL = `NOT EXISTS (
      SELECT 1
      FROM archiving_retention_exceptions exception
      WHERE exception.policy_id = @1
        AND exception.source_key = source.source_key
        AND exception.subject_table = source.subject_table
        AND exception.subject_id = source.subject_id
        AND (exception.expires_at IS NULL OR exception.expires_at > SYSUTCDATETIME())
    )`

const DELETE_REQUIREMENT_VERSION_SQL = `DECLARE @requirement_id int;
      SELECT @requirement_id = version.requirement_id
      FROM requirement_versions version
      WHERE version.id = @0
        AND NOT EXISTS (
          SELECT 1
          FROM requirements_specification_items item
          WHERE item.requirement_version_id = version.id
        );
      IF @requirement_id IS NOT NULL
      BEGIN
        DELETE FROM requirement_version_requirement_packages WHERE requirement_version_id = @0;
        DELETE FROM requirement_version_norm_references WHERE requirement_version_id = @0;
        DELETE FROM requirement_versions WHERE id = @0;
        IF NOT EXISTS (
          SELECT 1 FROM requirement_versions WHERE requirement_id = @requirement_id
        )
        BEGIN
          DELETE FROM requirements WHERE id = @requirement_id;
        END
      END`

const SOURCE_DEFINITIONS: readonly RetentionSourceDefinition[] = [
  {
    action: 'delete',
    executeSql: `DELETE owner
      FROM owners owner
      WHERE owner.id = @0
        AND NOT EXISTS (
          SELECT 1 FROM requirement_areas area WHERE area.owner_id = owner.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM requirement_packages pkg WHERE pkg.owner_id = owner.id
        )`,
    fieldKey: 'identity',
    objectKey: 'owners',
    policyKey: ORPHANED_OWNER_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'owners.identity' AS source_key,
          N'owners' AS subject_table,
          CAST(owner.id AS nvarchar(120)) AS subject_id,
          CONCAT(owner.first_name, N' ', owner.last_name) AS reference,
          owner.hsa_id AS current_display_value,
          owner.updated_at AS age_basis
        FROM owners owner
        WHERE owner.updated_at <= @0
          AND NOT EXISTS (
            SELECT 1 FROM requirement_areas area WHERE area.owner_id = owner.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM requirement_packages pkg WHERE pkg.owner_id = owner.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'owners.identity',
    subjectTable: 'owners',
  },
  {
    action: 'delete',
    executeSql: `DELETE area
      FROM requirement_areas area
      WHERE area.id = @0
        AND NOT EXISTS (
          SELECT 1 FROM requirements requirement WHERE requirement.requirement_area_id = area.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM specification_local_requirements local_requirement WHERE local_requirement.requirement_area_id = area.id
        )`,
    fieldKey: 'taxonomy',
    objectKey: 'requirementAreas',
    policyKey: UNUSED_TAXONOMY_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'requirement_areas.unused' AS source_key,
          N'requirement_areas' AS subject_table,
          CAST(area.id AS nvarchar(120)) AS subject_id,
          CONCAT(area.prefix, N' ', area.name) AS reference,
          area.name AS current_display_value,
          area.updated_at AS age_basis
        FROM requirement_areas area
        WHERE area.updated_at <= @0
          AND NOT EXISTS (
            SELECT 1 FROM requirements requirement WHERE requirement.requirement_area_id = area.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM specification_local_requirements local_requirement WHERE local_requirement.requirement_area_id = area.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'requirement_areas.unused',
    subjectTable: 'requirement_areas',
  },
  {
    action: 'delete',
    executeSql: `DELETE pkg
      FROM requirement_packages pkg
      WHERE pkg.id = @0
        AND NOT EXISTS (
          SELECT 1 FROM requirement_version_requirement_packages link WHERE link.requirement_package_id = pkg.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM specification_local_requirement_requirement_packages link WHERE link.requirement_package_id = pkg.id
        )`,
    fieldKey: 'taxonomy',
    objectKey: 'requirementPackages',
    policyKey: UNUSED_TAXONOMY_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'requirement_packages.unused' AS source_key,
          N'requirement_packages' AS subject_table,
          CAST(pkg.id AS nvarchar(120)) AS subject_id,
          pkg.name_sv AS reference,
          pkg.name_sv AS current_display_value,
          pkg.updated_at AS age_basis
        FROM requirement_packages pkg
        WHERE pkg.updated_at <= @0
          AND NOT EXISTS (
            SELECT 1 FROM requirement_version_requirement_packages link WHERE link.requirement_package_id = pkg.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM specification_local_requirement_requirement_packages link WHERE link.requirement_package_id = pkg.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'requirement_packages.unused',
    subjectTable: 'requirement_packages',
  },
  {
    action: 'delete',
    executeSql: `DELETE norm_reference
      FROM norm_references norm_reference
      WHERE norm_reference.id = @0
        AND NOT EXISTS (
          SELECT 1 FROM requirement_version_norm_references link WHERE link.norm_reference_id = norm_reference.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM specification_local_requirement_norm_references link WHERE link.norm_reference_id = norm_reference.id
        )`,
    fieldKey: 'taxonomy',
    objectKey: 'normReferences',
    policyKey: UNUSED_TAXONOMY_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'norm_references.unused' AS source_key,
          N'norm_references' AS subject_table,
          CAST(norm_reference.id AS nvarchar(120)) AS subject_id,
          norm_reference.norm_reference_id AS reference,
          norm_reference.name AS current_display_value,
          norm_reference.updated_at AS age_basis
        FROM norm_references norm_reference
        WHERE norm_reference.updated_at <= @0
          AND NOT EXISTS (
            SELECT 1 FROM requirement_version_norm_references link WHERE link.norm_reference_id = norm_reference.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM specification_local_requirement_norm_references link WHERE link.norm_reference_id = norm_reference.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'norm_references.unused',
    subjectTable: 'norm_references',
  },
  {
    action: 'delete',
    executeSql: DELETE_REQUIREMENT_VERSION_SQL,
    fieldKey: 'requirementVersion',
    objectKey: 'requirementVersions',
    policyKey: OLD_REQUIREMENT_VERSIONS_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'requirement_versions.archived_unused' AS source_key,
          N'requirement_versions' AS subject_table,
          CAST(version.id AS nvarchar(120)) AS subject_id,
          CONCAT(requirement.unique_id, N' v', version.version_number) AS reference,
          NULL AS current_display_value,
          COALESCE(version.status_updated_at, version.archived_at, version.created_at) AS age_basis
        FROM requirement_versions version
        INNER JOIN requirements requirement ON requirement.id = version.requirement_id
        WHERE version.requirement_status_id = ${STATUS_ARCHIVED}
          AND COALESCE(version.status_updated_at, version.archived_at, version.created_at) <= @0
          AND CAST(version.has_specification_item_history AS int) = 0
          AND NOT EXISTS (
            SELECT 1 FROM requirements_specification_items item WHERE item.requirement_version_id = version.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'requirement_versions.archived_unused',
    subjectTable: 'requirement_versions',
  },
  {
    action: 'delete',
    executeSql: DELETE_REQUIREMENT_VERSION_SQL,
    fieldKey: 'requirementVersion',
    objectKey: 'requirementVersions',
    policyKey: OLD_REQUIREMENT_VERSIONS_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'requirement_versions.review_stale' AS source_key,
          N'requirement_versions' AS subject_table,
          CAST(version.id AS nvarchar(120)) AS subject_id,
          CONCAT(requirement.unique_id, N' v', version.version_number) AS reference,
          NULL AS current_display_value,
          COALESCE(version.status_updated_at, version.created_at) AS age_basis
        FROM requirement_versions version
        INNER JOIN requirements requirement ON requirement.id = version.requirement_id
        WHERE version.requirement_status_id = ${STATUS_REVIEW}
          AND version.archive_initiated_at IS NULL
          AND COALESCE(version.status_updated_at, version.created_at) <= @0
          AND CAST(version.has_specification_item_history AS int) = 0
          AND NOT EXISTS (
            SELECT 1 FROM requirements_specification_items item WHERE item.requirement_version_id = version.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'requirement_versions.review_stale',
    subjectTable: 'requirement_versions',
  },
  {
    action: 'delete',
    executeSql: DELETE_REQUIREMENT_VERSION_SQL,
    fieldKey: 'requirementVersion',
    objectKey: 'requirementVersions',
    policyKey: OLD_REQUIREMENT_VERSIONS_POLICY_KEY,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'requirement_versions.draft_stale' AS source_key,
          N'requirement_versions' AS subject_table,
          CAST(version.id AS nvarchar(120)) AS subject_id,
          CONCAT(requirement.unique_id, N' v', version.version_number) AS reference,
          NULL AS current_display_value,
          COALESCE(version.edited_at, version.status_updated_at, version.created_at) AS age_basis
        FROM requirement_versions version
        INNER JOIN requirements requirement ON requirement.id = version.requirement_id
        WHERE version.requirement_status_id = ${STATUS_DRAFT}
          AND COALESCE(version.status_updated_at, version.created_at) <= @0
          AND COALESCE(version.edited_at, version.created_at) <= @0
          AND CAST(version.has_specification_item_history AS int) = 0
          AND NOT EXISTS (
            SELECT 1 FROM requirements_specification_items item WHERE item.requirement_version_id = version.id
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'requirement_versions.draft_stale',
    subjectTable: 'requirement_versions',
  },
  {
    action: 'delete',
    executeSql: `DELETE FROM specification_local_requirements WHERE specification_id = @0;
      DELETE FROM requirements_specification_items WHERE requirements_specification_id = @0;
      DELETE FROM specification_needs_references WHERE specification_id = @0;
      DELETE FROM requirements_specifications WHERE id = @0;`,
    fieldKey: 'specificationArchive',
    objectKey: 'specifications',
    policyKey: OBSOLETE_SPECIFICATIONS_POLICY_KEY,
    requiresExport: true,
    selectSql: `SELECT *
      FROM (
        SELECT
          N'requirements_specifications.obsolete' AS source_key,
          N'requirements_specifications' AS subject_table,
          CAST(specification.id AS nvarchar(120)) AS subject_id,
          CONCAT(specification.unique_id, N' ', specification.name) AS reference,
          specification.name AS current_display_value,
          specification.updated_at AS age_basis
        FROM requirements_specifications specification
        WHERE specification.updated_at <= @0
          AND (
            specification.specification_lifecycle_status_id IS NULL
            OR specification.specification_lifecycle_status_id <> ${SPECIFICATION_MANAGEMENT_STATUS_ID}
          )
      ) source
      WHERE ${ACTIVE_EXCEPTION_SQL}
      ORDER BY source.reference ASC`,
    sourceKey: 'requirements_specifications.obsolete',
    subjectTable: 'requirements_specifications',
  },
]

function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function nullableStringValue(value: unknown): string | null {
  if (value == null) return null
  const text = String(value)
  return text.length > 0 ? text : null
}

function numberValue(value: unknown): number {
  return Number(value ?? 0)
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value === 'true'
  return Boolean(value)
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return new Date(0).toISOString()
}

function nullableIsoTimestamp(value: unknown): string | null {
  return value == null ? null : isoTimestamp(value)
}

function cutoffDate(ageDays: number, now: Date): Date {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  cutoff.setUTCDate(cutoff.getUTCDate() - ageDays)
  return cutoff
}

function sourceKey(
  candidate: Pick<ArchivingRetentionCandidate, 'sourceKey' | 'subjectId'>,
): string {
  return `${candidate.sourceKey}:${candidate.subjectId}`
}

function mapPolicy(row: Row): ArchivingRetentionPolicy {
  const latestRunId =
    row.latestRunId == null ? null : numberValue(row.latestRunId)
  return {
    action: stringValue(row.action) as ArchivingRetentionAction,
    ageDays: numberValue(row.ageDays),
    createdAt: isoTimestamp(row.createdAt),
    decisionReference: nullableStringValue(row.decisionReference),
    id: numberValue(row.id),
    informationSet: stringValue(row.informationSet),
    isEnabled: booleanValue(row.isEnabled),
    lastRunAt: nullableIsoTimestamp(row.lastRunAt),
    latestRun: latestRunId
      ? {
          archivedCount: numberValue(row.latestArchivedCount),
          candidateCount: numberValue(row.latestCandidateCount),
          completedAt: isoTimestamp(row.latestCompletedAt),
          deletedCount: numberValue(row.latestDeletedCount),
          exceptionCount: numberValue(row.latestExceptionCount),
          id: latestRunId,
          skippedCount: numberValue(row.latestSkippedCount),
        }
      : null,
    policyKey: stringValue(row.policyKey),
    statusCondition: stringValue(row.statusCondition),
    updatedAt: isoTimestamp(row.updatedAt),
  }
}

function hasRetentionSource(policy: ArchivingRetentionPolicy): boolean {
  return SOURCE_DEFINITIONS.some(
    source => source.policyKey === policy.policyKey,
  )
}

function mapCandidate(
  row: Row,
  source: RetentionSourceDefinition,
): ArchivingRetentionCandidate {
  const candidate = {
    action: source.action,
    ageBasis: isoTimestamp(row.age_basis),
    blockedReasonKey: nullableStringValue(row.blocked_reason_key),
    currentDisplayValue: nullableStringValue(row.current_display_value),
    fieldKey: source.fieldKey,
    key: '',
    objectKey: source.objectKey,
    reference: stringValue(row.reference),
    requiresExport: source.requiresExport ?? false,
    sourceKey: source.sourceKey,
    subjectId: stringValue(row.subject_id),
    subjectTable: source.subjectTable,
  }
  return { ...candidate, key: sourceKey(candidate) }
}

function summarize(
  candidates: ArchivingRetentionCandidate[],
  exceptionCount: number,
): ArchivingRetentionSummary {
  return candidates.reduce<ArchivingRetentionSummary>(
    (summary, candidate) => {
      summary.candidateCount += 1
      if (candidate.requiresExport) {
        summary.archiveCount += 1
      }
      if (candidate.action === 'delete') {
        summary.deleteCount += 1
      }
      return summary
    },
    {
      archiveCount: 0,
      candidateCount: 0,
      deleteCount: 0,
      exceptionCount,
      skippedCount: 0,
    },
  )
}

function previewTokenFor(args: {
  candidates: ArchivingRetentionCandidate[]
  cutoff: string
  policy: ArchivingRetentionPolicy
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        candidateKeys: args.candidates.map(candidate => candidate.key).sort(),
        cutoff: args.cutoff,
        policyId: args.policy.id,
        policyUpdatedAt: args.policy.updatedAt,
      }),
      'utf8',
    )
    .digest('hex')
}

function exportCandidateKeys(preview: ArchivingRetentionPreview): string[] {
  return preview.candidates
    .filter(candidate => candidate.requiresExport)
    .map(candidate => candidate.key)
    .sort()
}

function cleanupExportConfirmations(now = Date.now()): void {
  for (const [token, confirmation] of exportConfirmations) {
    if (confirmation.expiresAt <= now) {
      exportConfirmations.delete(token)
    }
  }
}

function mintExportToken(preview: ArchivingRetentionPreview): string {
  const now = Date.now()
  cleanupExportConfirmations(now)
  const token = randomBytes(32).toString('hex')
  exportConfirmations.set(token, {
    candidateKeys: exportCandidateKeys(preview),
    expiresAt: now + EXPORT_CONFIRMATION_TTL_MS,
    policyId: preview.policy.id,
    previewToken: preview.previewToken,
  })
  return token
}

function sameCandidateKeys(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((candidateKey, index) => candidateKey === right[index])
  )
}

function consumeExportToken(
  preview: ArchivingRetentionPreview,
  token: string | null | undefined,
): boolean {
  if (!token) return false
  const now = Date.now()
  cleanupExportConfirmations(now)
  const confirmation = exportConfirmations.get(token)
  if (!confirmation || confirmation.expiresAt <= now) return false
  if (
    confirmation.policyId !== preview.policy.id ||
    confirmation.previewToken !== preview.previewToken ||
    !sameCandidateKeys(confirmation.candidateKeys, exportCandidateKeys(preview))
  ) {
    return false
  }
  exportConfirmations.delete(token)
  return true
}

async function countActiveExceptions(
  db: QueryExecutor,
  policyId: number,
): Promise<number> {
  const rows = (await db.query(
    `SELECT COUNT(*) AS count
      FROM archiving_retention_exceptions
      WHERE policy_id = @0
        AND (expires_at IS NULL OR expires_at > SYSUTCDATETIME())`,
    [policyId],
  )) as Row[]
  return numberValue(rows[0]?.count)
}

async function getPolicy(
  db: QueryExecutor,
  policyId: number,
): Promise<ArchivingRetentionPolicy> {
  const rows = (await db.query(
    `SELECT
        policy.id,
        policy.policy_key AS policyKey,
        policy.information_set AS informationSet,
        policy.action,
        policy.age_days AS ageDays,
        policy.status_condition AS statusCondition,
        CAST(policy.is_enabled AS int) AS isEnabled,
        policy.decision_reference AS decisionReference,
        policy.last_run_at AS lastRunAt,
        policy.created_at AS createdAt,
        policy.updated_at AS updatedAt,
        latest.id AS latestRunId,
        latest.completed_at AS latestCompletedAt,
        latest.candidate_count AS latestCandidateCount,
        latest.archived_count AS latestArchivedCount,
        latest.deleted_count AS latestDeletedCount,
        latest.skipped_count AS latestSkippedCount,
        latest.exception_count AS latestExceptionCount
      FROM archiving_retention_policies policy
      OUTER APPLY (
        SELECT TOP (1)
          run.id,
          run.completed_at,
          run.candidate_count,
          run.archived_count,
          run.deleted_count,
          run.skipped_count,
          run.exception_count
        FROM archiving_retention_runs run
        WHERE run.policy_id = policy.id
        ORDER BY run.completed_at DESC, run.id DESC
      ) latest
      WHERE policy.id = @0`,
    [policyId],
  )) as Row[]
  if (rows.length < 1) {
    throw notFoundError('Archiving retention policy not found', {
      policyId,
      reason: 'retention_policy_not_found',
    })
  }
  const policy = mapPolicy(rows[0])
  if (!hasRetentionSource(policy)) {
    throw notFoundError('Archiving retention policy not found', {
      policyId,
      policyKey: policy.policyKey,
      reason: 'retention_policy_not_found',
    })
  }
  return policy
}

export async function listArchivingRetentionPolicies(
  db: QueryExecutor,
): Promise<ArchivingRetentionPolicy[]> {
  const rows = (await db.query(
    `SELECT
        policy.id,
        policy.policy_key AS policyKey,
        policy.information_set AS informationSet,
        policy.action,
        policy.age_days AS ageDays,
        policy.status_condition AS statusCondition,
        CAST(policy.is_enabled AS int) AS isEnabled,
        policy.decision_reference AS decisionReference,
        policy.last_run_at AS lastRunAt,
        policy.created_at AS createdAt,
        policy.updated_at AS updatedAt,
        latest.id AS latestRunId,
        latest.completed_at AS latestCompletedAt,
        latest.candidate_count AS latestCandidateCount,
        latest.archived_count AS latestArchivedCount,
        latest.deleted_count AS latestDeletedCount,
        latest.skipped_count AS latestSkippedCount,
        latest.exception_count AS latestExceptionCount
      FROM archiving_retention_policies policy
      OUTER APPLY (
        SELECT TOP (1)
          run.id,
          run.completed_at,
          run.candidate_count,
          run.archived_count,
          run.deleted_count,
          run.skipped_count,
          run.exception_count
        FROM archiving_retention_runs run
        WHERE run.policy_id = policy.id
        ORDER BY run.completed_at DESC, run.id DESC
      ) latest
      ORDER BY policy.id ASC`,
  )) as Row[]
  return rows.map(mapPolicy).filter(hasRetentionSource)
}

export async function previewArchivingRetention(
  db: QueryExecutor,
  input: { now?: Date; policyId: number },
): Promise<ArchivingRetentionPreview> {
  const now = input.now ?? new Date()
  const policy = await getPolicy(db, input.policyId)
  if (!policy.isEnabled) {
    throw validationError('Archiving retention policy is inactive', {
      policyId: policy.id,
      reason: 'inactive_retention_policy',
    })
  }

  const cutoff = cutoffDate(policy.ageDays, now).toISOString()
  const candidates: ArchivingRetentionCandidate[] = []
  for (const source of SOURCE_DEFINITIONS.filter(
    definition => definition.policyKey === policy.policyKey,
  )) {
    const rows = (await db.query(source.selectSql, [
      cutoff,
      policy.id,
    ])) as Row[]
    candidates.push(...rows.map(row => mapCandidate(row, source)))
  }
  const exceptionCount = await countActiveExceptions(db, policy.id)
  const summary = summarize(candidates, exceptionCount)
  return {
    candidates,
    cutoff,
    policy,
    previewToken: previewTokenFor({ candidates, cutoff, policy }),
    summary,
  }
}

function numericSubjectId(candidate: ArchivingRetentionCandidate): number {
  const id = Number(candidate.subjectId)
  if (!Number.isInteger(id) || id < 1) {
    throw validationError('Unsupported retention subject id', {
      reason: 'unsupported_retention_subject_id',
      subjectId: candidate.subjectId,
    })
  }
  return id
}

async function executeCandidate(
  tx: QueryExecutor,
  candidate: ArchivingRetentionCandidate,
): Promise<boolean> {
  const source = SOURCE_DEFINITIONS.find(
    definition => definition.sourceKey === candidate.sourceKey,
  )
  if (!source) {
    throw validationError('Unsupported retention source', {
      reason: 'unsupported_retention_source',
      sourceKey: candidate.sourceKey,
    })
  }
  if (!source.executeSql) {
    throw validationError('Unsupported retention execution source', {
      reason: 'unsupported_retention_execution_source',
      sourceKey: candidate.sourceKey,
    })
  }
  const result = (await tx.query(source.executeSql, [
    numericSubjectId(candidate),
  ])) as { affected?: number } | undefined
  return result?.affected == null || result.affected > 0
}

async function insertRun(
  tx: QueryExecutor,
  args: {
    actor: ArchivingRetentionActor
    completedAt: Date
    preview: ArchivingRetentionPreview
  },
): Promise<number> {
  const rows = (await tx.query(
    `INSERT INTO archiving_retention_runs (
        policy_id,
        status,
        started_at,
        completed_at,
        executed_by_hsa_id,
        executed_by_display_name,
        preview_token,
        candidate_count,
        archived_count,
        deleted_count,
        skipped_count,
        exception_count
      )
      OUTPUT INSERTED.id AS id
      VALUES (
        @0,
        N'completed',
        @1,
        @1,
        @2,
        @3,
        @4,
        @5,
        @6,
        @7,
        @8,
        @9
      )`,
    [
      args.preview.policy.id,
      args.completedAt.toISOString(),
      args.actor.hsaId,
      args.actor.displayName,
      args.preview.previewToken,
      args.preview.summary.candidateCount,
      args.preview.summary.archiveCount,
      args.preview.summary.deleteCount,
      args.preview.summary.skippedCount,
      args.preview.summary.exceptionCount,
    ],
  )) as Row[]
  return numberValue(rows[0]?.id)
}

export async function executeArchivingRetention(
  db: SqlServerDatabase,
  input: ArchivingRetentionExecutionInput & {
    audit?: (
      executor: QueryExecutor,
      result: ArchivingRetentionRunResult,
    ) => Promise<void>
  },
  actor: ArchivingRetentionActor,
): Promise<ArchivingRetentionRunResult> {
  const runRequestId = randomUUID()
  let result!: ArchivingRetentionRunResult
  await db.transaction('SERIALIZABLE', async manager => {
    const tx: QueryExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const preview = await previewArchivingRetention(tx, {
      policyId: input.policyId,
    })
    if (preview.previewToken !== input.previewToken) {
      throw conflictError(
        'Archiving retention preview is stale. Run preview again before executing.',
        { reason: 'stale_archiving_retention_preview' },
      )
    }
    if (
      preview.candidates.some(candidate => candidate.requiresExport) &&
      !consumeExportToken(preview, input.exportToken)
    ) {
      throw conflictError(
        'Archive export confirmation is required before executing retention.',
        { reason: 'missing_archiving_export_confirmation' },
      )
    }
    let archiveCount = 0
    let deleteCount = 0
    let skippedCount = 0
    for (const candidate of preview.candidates) {
      const changed = await executeCandidate(tx, candidate)
      if (!changed) {
        skippedCount += 1
        continue
      }
      if (candidate.requiresExport) archiveCount += 1
      if (candidate.action === 'delete') deleteCount += 1
    }
    const completedAt = new Date()
    const finalSummary = {
      ...preview.summary,
      archiveCount,
      deleteCount,
      skippedCount,
    }
    const runId = await insertRun(tx, {
      actor,
      completedAt,
      preview: {
        ...preview,
        summary: finalSummary,
      },
    })
    await tx.query(
      `UPDATE archiving_retention_policies
        SET last_run_at = @0,
          updated_at = @0
        WHERE id = @1`,
      [completedAt.toISOString(), preview.policy.id],
    )
    result = {
      ...preview,
      runId,
      runRequestId,
      summary: finalSummary,
    }
    await input.audit?.(tx, result)
  })
  return result
}

function archiveCandidate(candidate: ArchivingRetentionCandidate) {
  return {
    action: candidate.action,
    ageBasis: candidate.ageBasis,
    currentDisplayValue: null,
    deIdentified: true,
    fieldKey: candidate.fieldKey,
    objectKey: candidate.objectKey,
    reference:
      candidate.action === 'delete'
        ? `${candidate.subjectTable}:${candidate.subjectId}`
        : candidate.reference,
    requiresExport: candidate.requiresExport,
    sourceKey: candidate.sourceKey,
    subjectId: candidate.subjectId,
    subjectTable: candidate.subjectTable,
  }
}

async function exportSpecification(
  db: QueryExecutor,
  specificationId: number,
): Promise<Record<string, unknown>> {
  const specificationRows = (await db.query(
    `SELECT TOP (1)
        specification.id,
        specification.unique_id AS uniqueId,
        specification.name,
        specification.business_needs_reference AS businessNeedsReference,
        specification.created_at AS createdAt,
        specification.updated_at AS updatedAt,
        CASE WHEN specification.responsible_display_name IS NULL THEN NULL ELSE N'no-user' END AS responsibleDisplayName,
        CAST(NULL AS nvarchar(64)) AS responsibleHsaId,
        CAST(specification.can_responsible_generate_ai AS int) AS canResponsibleGenerateAi,
        responsibility_area.id AS responsibilityAreaId,
        responsibility_area.name_sv AS responsibilityAreaNameSv,
        responsibility_area.name_en AS responsibilityAreaNameEn,
        implementation_type.id AS implementationTypeId,
        implementation_type.name_sv AS implementationTypeNameSv,
        implementation_type.name_en AS implementationTypeNameEn,
        lifecycle_status.id AS lifecycleStatusId,
        lifecycle_status.name_sv AS lifecycleStatusNameSv,
        lifecycle_status.name_en AS lifecycleStatusNameEn
      FROM requirements_specifications specification
      LEFT JOIN specification_responsibility_areas responsibility_area
        ON responsibility_area.id = specification.specification_responsibility_area_id
      LEFT JOIN specification_implementation_types implementation_type
        ON implementation_type.id = specification.specification_implementation_type_id
      LEFT JOIN specification_lifecycle_statuses lifecycle_status
        ON lifecycle_status.id = specification.specification_lifecycle_status_id
      WHERE specification.id = @0`,
    [specificationId],
  )) as Row[]
  const specification = specificationRows[0]
  if (!specification) {
    throw notFoundError('Requirements specification not found', {
      reason: 'requirements_specification_not_found',
      specificationId,
    })
  }

  const [
    needsReferences,
    coAuthors,
    libraryRequirements,
    libraryNormReferences,
    libraryRequirementPackages,
    libraryDeviations,
    localRequirements,
    localNormReferences,
    localRequirementPackages,
    localDeviations,
  ] = await Promise.all([
    db.query(
      `SELECT id, text, created_at AS createdAt
        FROM specification_needs_references
        WHERE specification_id = @0
        ORDER BY id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          N'no-user' AS displayName,
          CAST(NULL AS nvarchar(64)) AS hsaId,
          CAST(can_generate_ai AS int) AS canGenerateAi,
          created_at AS createdAt,
          CASE WHEN created_by_display_name IS NULL THEN NULL ELSE N'no-user' END AS createdByDisplayName,
          CAST(NULL AS nvarchar(64)) AS createdByHsaId
        FROM specification_co_authors
        WHERE specification_id = @0
        ORDER BY display_name ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          specification_item.id AS specificationItemId,
          specification_item.created_at AS specificationItemCreatedAt,
          specification_item.note AS specificationItemNote,
          specification_item.status_updated_at AS specificationItemStatusUpdatedAt,
          needs_reference.id AS needsReferenceId,
          needs_reference.text AS needsReferenceText,
          specification_item_status.id AS specificationItemStatusId,
          specification_item_status.name_sv AS specificationItemStatusNameSv,
          specification_item_status.name_en AS specificationItemStatusNameEn,
          specification_item_status.color AS specificationItemStatusColor,
          requirement.id AS requirementId,
          requirement.unique_id AS requirementUniqueId,
          requirement.sequence_number AS requirementSequenceNumber,
          CAST(requirement.is_archived AS int) AS requirementIsArchived,
          requirement.created_at AS requirementCreatedAt,
          requirement_area.id AS requirementAreaId,
          requirement_area.prefix AS requirementAreaPrefix,
          requirement_area.name AS requirementAreaName,
          version.id AS versionId,
          version.version_number AS versionNumber,
          version.description,
          version.acceptance_criteria AS acceptanceCriteria,
          CAST(version.is_testing_required AS int) AS isTestingRequired,
          version.verification_method AS verificationMethod,
          version.created_at AS versionCreatedAt,
          version.edited_at AS editedAt,
          version.published_at AS publishedAt,
          version.archived_at AS archivedAt,
          version.archive_initiated_at AS archiveInitiatedAt,
          version.status_updated_at AS statusUpdatedAt,
          CASE WHEN version.created_by IS NULL THEN NULL ELSE N'no-user' END AS createdBy,
          CAST(NULL AS nvarchar(64)) AS createdByHsaId,
          status.id AS requirementStatusId,
          status.name_sv AS requirementStatusNameSv,
          status.name_en AS requirementStatusNameEn,
          category.id AS categoryId,
          category.name_sv AS categoryNameSv,
          category.name_en AS categoryNameEn,
          requirement_type.id AS requirementTypeId,
          requirement_type.name_sv AS requirementTypeNameSv,
          requirement_type.name_en AS requirementTypeNameEn,
          quality_characteristic.id AS qualityCharacteristicId,
          quality_characteristic.name_sv AS qualityCharacteristicNameSv,
          quality_characteristic.name_en AS qualityCharacteristicNameEn,
          risk_level.id AS riskLevelId,
          risk_level.name_sv AS riskLevelNameSv,
          risk_level.name_en AS riskLevelNameEn,
          risk_level.color AS riskLevelColor
        FROM requirements_specification_items specification_item
        INNER JOIN requirements requirement ON requirement.id = specification_item.requirement_id
        INNER JOIN requirement_versions version ON version.id = specification_item.requirement_version_id
        LEFT JOIN specification_needs_references needs_reference ON needs_reference.id = specification_item.needs_reference_id
        LEFT JOIN specification_item_statuses specification_item_status ON specification_item_status.id = specification_item.specification_item_status_id
        LEFT JOIN requirement_areas requirement_area ON requirement_area.id = requirement.requirement_area_id
        LEFT JOIN requirement_statuses status ON status.id = version.requirement_status_id
        LEFT JOIN requirement_categories category ON category.id = version.requirement_category_id
        LEFT JOIN requirement_types requirement_type ON requirement_type.id = version.requirement_type_id
        LEFT JOIN quality_characteristics quality_characteristic ON quality_characteristic.id = version.quality_characteristic_id
        LEFT JOIN risk_levels risk_level ON risk_level.id = version.risk_level_id
        WHERE specification_item.requirements_specification_id = @0
        ORDER BY requirement.unique_id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          specification_item.id AS specificationItemId,
          norm_reference.id,
          norm_reference.norm_reference_id AS normReferenceId,
          norm_reference.name,
          norm_reference.type,
          norm_reference.reference,
          norm_reference.version,
          norm_reference.issuer,
          norm_reference.uri
        FROM requirements_specification_items specification_item
        INNER JOIN requirement_version_norm_references link
          ON link.requirement_version_id = specification_item.requirement_version_id
        INNER JOIN norm_references norm_reference ON norm_reference.id = link.norm_reference_id
        WHERE specification_item.requirements_specification_id = @0
        ORDER BY specification_item.id ASC, norm_reference.norm_reference_id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          specification_item.id AS specificationItemId,
          pkg.id,
          pkg.name_sv AS nameSv,
          pkg.name_en AS nameEn,
          pkg.description_sv AS descriptionSv,
          pkg.description_en AS descriptionEn
        FROM requirements_specification_items specification_item
        INNER JOIN requirement_version_requirement_packages link
          ON link.requirement_version_id = specification_item.requirement_version_id
        INNER JOIN requirement_packages pkg ON pkg.id = link.requirement_package_id
        WHERE specification_item.requirements_specification_id = @0
        ORDER BY specification_item.id ASC, pkg.name_sv ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          deviation.id,
          deviation.specification_item_id AS specificationItemId,
          deviation.motivation,
          CAST(deviation.is_review_requested AS int) AS isReviewRequested,
          deviation.decision,
          deviation.decision_motivation AS decisionMotivation,
          CASE WHEN deviation.created_by IS NULL THEN NULL ELSE N'no-user' END AS createdBy,
          CASE WHEN deviation.decided_by IS NULL THEN NULL ELSE N'no-user' END AS decidedBy,
          deviation.created_at AS createdAt,
          deviation.updated_at AS updatedAt,
          deviation.decided_at AS decidedAt
        FROM deviations deviation
        INNER JOIN requirements_specification_items specification_item
          ON specification_item.id = deviation.specification_item_id
        WHERE specification_item.requirements_specification_id = @0
        ORDER BY deviation.id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          local_requirement.id,
          local_requirement.unique_id AS uniqueId,
          local_requirement.sequence_number AS sequenceNumber,
          local_requirement.description,
          local_requirement.acceptance_criteria AS acceptanceCriteria,
          CAST(local_requirement.is_testing_required AS int) AS isTestingRequired,
          local_requirement.verification_method AS verificationMethod,
          local_requirement.note,
          local_requirement.created_at AS createdAt,
          local_requirement.updated_at AS updatedAt,
          local_requirement.status_updated_at AS statusUpdatedAt,
          needs_reference.id AS needsReferenceId,
          needs_reference.text AS needsReferenceText,
          specification_item_status.id AS specificationItemStatusId,
          specification_item_status.name_sv AS specificationItemStatusNameSv,
          specification_item_status.name_en AS specificationItemStatusNameEn,
          specification_item_status.color AS specificationItemStatusColor,
          requirement_area.id AS requirementAreaId,
          requirement_area.prefix AS requirementAreaPrefix,
          requirement_area.name AS requirementAreaName,
          category.id AS categoryId,
          category.name_sv AS categoryNameSv,
          category.name_en AS categoryNameEn,
          requirement_type.id AS requirementTypeId,
          requirement_type.name_sv AS requirementTypeNameSv,
          requirement_type.name_en AS requirementTypeNameEn,
          quality_characteristic.id AS qualityCharacteristicId,
          quality_characteristic.name_sv AS qualityCharacteristicNameSv,
          quality_characteristic.name_en AS qualityCharacteristicNameEn,
          risk_level.id AS riskLevelId,
          risk_level.name_sv AS riskLevelNameSv,
          risk_level.name_en AS riskLevelNameEn,
          risk_level.color AS riskLevelColor
        FROM specification_local_requirements local_requirement
        LEFT JOIN specification_needs_references needs_reference ON needs_reference.id = local_requirement.needs_reference_id
        LEFT JOIN specification_item_statuses specification_item_status ON specification_item_status.id = local_requirement.specification_item_status_id
        LEFT JOIN requirement_areas requirement_area ON requirement_area.id = local_requirement.requirement_area_id
        LEFT JOIN requirement_categories category ON category.id = local_requirement.requirement_category_id
        LEFT JOIN requirement_types requirement_type ON requirement_type.id = local_requirement.requirement_type_id
        LEFT JOIN quality_characteristics quality_characteristic ON quality_characteristic.id = local_requirement.quality_characteristic_id
        LEFT JOIN risk_levels risk_level ON risk_level.id = local_requirement.risk_level_id
        WHERE local_requirement.specification_id = @0
        ORDER BY local_requirement.unique_id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          local_requirement.id AS localRequirementId,
          norm_reference.id,
          norm_reference.norm_reference_id AS normReferenceId,
          norm_reference.name,
          norm_reference.type,
          norm_reference.reference,
          norm_reference.version,
          norm_reference.issuer,
          norm_reference.uri
        FROM specification_local_requirements local_requirement
        INNER JOIN specification_local_requirement_norm_references link
          ON link.specification_local_requirement_id = local_requirement.id
        INNER JOIN norm_references norm_reference ON norm_reference.id = link.norm_reference_id
        WHERE local_requirement.specification_id = @0
        ORDER BY local_requirement.id ASC, norm_reference.norm_reference_id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          local_requirement.id AS localRequirementId,
          pkg.id,
          pkg.name_sv AS nameSv,
          pkg.name_en AS nameEn,
          pkg.description_sv AS descriptionSv,
          pkg.description_en AS descriptionEn
        FROM specification_local_requirements local_requirement
        INNER JOIN specification_local_requirement_requirement_packages link
          ON link.specification_local_requirement_id = local_requirement.id
        INNER JOIN requirement_packages pkg ON pkg.id = link.requirement_package_id
        WHERE local_requirement.specification_id = @0
        ORDER BY local_requirement.id ASC, pkg.name_sv ASC`,
      [specificationId],
    ) as Promise<Row[]>,
    db.query(
      `SELECT
          deviation.id,
          deviation.specification_local_requirement_id AS localRequirementId,
          deviation.motivation,
          CAST(deviation.is_review_requested AS int) AS isReviewRequested,
          deviation.decision,
          deviation.decision_motivation AS decisionMotivation,
          CASE WHEN deviation.created_by IS NULL THEN NULL ELSE N'no-user' END AS createdBy,
          CASE WHEN deviation.decided_by IS NULL THEN NULL ELSE N'no-user' END AS decidedBy,
          deviation.created_at AS createdAt,
          deviation.updated_at AS updatedAt,
          deviation.decided_at AS decidedAt
        FROM specification_local_requirement_deviations deviation
        INNER JOIN specification_local_requirements local_requirement
          ON local_requirement.id = deviation.specification_local_requirement_id
        WHERE local_requirement.specification_id = @0
        ORDER BY deviation.id ASC`,
      [specificationId],
    ) as Promise<Row[]>,
  ])

  return {
    coAuthors,
    libraryDeviations,
    libraryNormReferences,
    libraryRequirementPackages,
    libraryRequirements,
    localDeviations,
    localNormReferences,
    localRequirementPackages,
    localRequirements,
    needsReferences,
    specification,
  }
}

async function buildArchiveExport(
  db: QueryExecutor,
  preview: ArchivingRetentionPreview,
): Promise<Record<string, unknown>> {
  const specificationCandidates = preview.candidates.filter(
    candidate =>
      candidate.requiresExport &&
      candidate.subjectTable === 'requirements_specifications',
  )
  return publicArchiveValue({
    candidates: preview.candidates.map(archiveCandidate),
    cutoff: preview.cutoff,
    generatedAt: new Date().toISOString(),
    policy: {
      action: preview.policy.action,
      ageDays: preview.policy.ageDays,
      decisionReference: preview.policy.decisionReference,
      id: preview.policy.id,
      informationSet: preview.policy.informationSet,
      policyKey: preview.policy.policyKey,
      statusCondition: preview.policy.statusCondition,
    },
    schemaVersion: 'archiving-retention-export.v2',
    specifications: await Promise.all(
      specificationCandidates.map(candidate =>
        exportSpecification(db, numericSubjectId(candidate)),
      ),
    ),
    summary: preview.summary,
  }) as Record<string, unknown>
}

function publicArchiveValue(value: unknown): unknown {
  if (typeof value === 'string' && isDeletedUserInternalName(value)) return null
  if (Array.isArray(value)) return value.map(publicArchiveValue)
  if (value === null || value instanceof Date || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      publicArchiveValue(nested),
    ]),
  )
}

export async function exportArchivingRetentionArchive(
  db: QueryExecutor,
  input: ArchivingRetentionExportInput,
): Promise<ArchivingRetentionArchiveExport> {
  const preview = await previewArchivingRetention(db, {
    policyId: input.policyId,
  })
  if (preview.previewToken !== input.previewToken) {
    throw conflictError(
      'Archiving retention preview is stale. Run preview again before exporting.',
      { reason: 'stale_archiving_retention_preview' },
    )
  }
  const exportToken = mintExportToken(preview)
  return {
    archive: {
      ...(await buildArchiveExport(db, preview)),
      exportToken,
    },
    exportToken,
  }
}

function mapException(row: Row): ArchivingRetentionException {
  return {
    createdAt: isoTimestamp(row.createdAt),
    createdByDisplayName: stringValue(row.createdByDisplayName),
    expiresAt: nullableIsoTimestamp(row.expiresAt),
    id: numberValue(row.id),
    policyId: numberValue(row.policyId),
    reason: stringValue(row.reason),
    sourceKey: stringValue(row.sourceKey),
    subjectId: stringValue(row.subjectId),
    subjectTable: stringValue(row.subjectTable),
  }
}

export async function createArchivingRetentionException(
  db: QueryExecutor,
  input: ArchivingRetentionExceptionInput,
  actor: ArchivingRetentionActor,
): Promise<ArchivingRetentionException> {
  await getPolicy(db, input.policyId)
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = input.expiresAt?.toISOString() ?? null
  const existing = (await db.query(
    `SELECT TOP (1)
        id,
        policy_id AS policyId,
        source_key AS sourceKey,
        subject_table AS subjectTable,
        subject_id AS subjectId,
        reason,
        created_by_display_name AS createdByDisplayName,
        created_at AS createdAt,
        expires_at AS expiresAt
      FROM archiving_retention_exceptions
      WHERE policy_id = @0
        AND source_key = @1
        AND subject_table = @2
        AND subject_id = @3`,
    [input.policyId, input.sourceKey, input.subjectTable, input.subjectId],
  )) as Row[]
  if (existing[0]) {
    const existingExpiresAt = nullableIsoTimestamp(existing[0].expiresAt)
    if (existingExpiresAt === null || new Date(existingExpiresAt) > now) {
      return mapException(existing[0])
    }
    const updated = (await db.query(
      `UPDATE archiving_retention_exceptions
        SET reason = @1,
          created_by_hsa_id = @2,
          created_by_display_name = @3,
          created_at = @4,
          expires_at = @5
        OUTPUT
          INSERTED.id AS id,
          INSERTED.policy_id AS policyId,
          INSERTED.source_key AS sourceKey,
          INSERTED.subject_table AS subjectTable,
          INSERTED.subject_id AS subjectId,
          INSERTED.reason AS reason,
          INSERTED.created_by_display_name AS createdByDisplayName,
          INSERTED.created_at AS createdAt,
          INSERTED.expires_at AS expiresAt
        WHERE id = @0`,
      [
        numberValue(existing[0].id),
        input.reason,
        actor.hsaId,
        actor.displayName,
        nowIso,
        expiresAt,
      ],
    )) as Row[]
    return mapException(updated[0])
  }

  const inserted = (await db.query(
    `INSERT INTO archiving_retention_exceptions (
        policy_id,
        source_key,
        subject_table,
        subject_id,
        reason,
        created_by_hsa_id,
        created_by_display_name,
        created_at,
        expires_at
      )
      OUTPUT
        INSERTED.id AS id,
        INSERTED.policy_id AS policyId,
        INSERTED.source_key AS sourceKey,
        INSERTED.subject_table AS subjectTable,
        INSERTED.subject_id AS subjectId,
        INSERTED.reason AS reason,
        INSERTED.created_by_display_name AS createdByDisplayName,
        INSERTED.created_at AS createdAt,
        INSERTED.expires_at AS expiresAt
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8)`,
    [
      input.policyId,
      input.sourceKey,
      input.subjectTable,
      input.subjectId,
      input.reason,
      actor.hsaId,
      actor.displayName,
      nowIso,
      expiresAt,
    ],
  )) as Row[]
  return mapException(inserted[0])
}

export async function deleteArchivingRetentionException(
  db: QueryExecutor,
  id: number,
): Promise<boolean> {
  const result = (await db.query(
    'DELETE FROM archiving_retention_exceptions WHERE id = @0',
    [id],
  )) as { affected?: number } | undefined
  return result?.affected == null ? true : result.affected > 0
}
