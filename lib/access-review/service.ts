import {
  ACCESS_REVIEW_EXPORT_SCHEMA_VERSION,
  type AccessReviewActor,
  type AccessReviewDecision,
  type AccessReviewExportV1,
  type AccessReviewItem,
  type AccessReviewRun,
  type AccessReviewRunDetail,
  type AccessReviewRunStatus,
  type AccessReviewRunSummary,
} from '@/lib/access-review/types'
import type { SqlServerDatabase } from '@/lib/db'
import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

type Row = Record<string, unknown>

export interface AccessReviewPrincipalSnapshot {
  permissionType: string
  principalDisplayName: string
  principalHsaId: string
  scopeKey: string
  scopeLabel: string
  scopeType: string
  sourceKey: string
  sourceTable: string
}

export interface AccessReviewAuthContext {
  displayName: string
  hsaId: string | null
  roles: string[]
}

export interface CreateAccessReviewRunInput {
  dueAt?: Date
  externalEvidenceReference?: string | null
  generatedAt?: Date
  periodEnd?: Date
  periodStart?: Date
  reviewer: AccessReviewActor
}

export interface CreateAccessReviewAuditDetail {
  itemCount: number
  runId: number
  status: AccessReviewRunStatus
}

export interface CreateAccessReviewRunOptions {
  audit?: (
    executor: QueryExecutor,
    detail: CreateAccessReviewAuditDetail,
  ) => Promise<void>
}

export interface DecideAccessReviewItemInput {
  comment?: string | null
  decision: Exclude<AccessReviewDecision, 'pending'>
}

const ADMIN_ROLE = 'Admin'
const PRIVACY_OFFICER_ROLE = 'PrivacyOfficer'
const ACCESS_REVIEW_ITEM_INSERT_BATCH_SIZE = 150
const ACCESS_REVIEW_ITEM_INSERT_PARAMETER_COUNT = 10
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

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

function isAdmin(actor: AccessReviewAuthContext): boolean {
  return actor.roles.includes(ADMIN_ROLE)
}

function canUseAccessReview(actor: AccessReviewAuthContext): boolean {
  return isAdmin(actor) || actor.roles.includes(PRIVACY_OFFICER_ROLE)
}

function requireAccessReviewRole(
  actor: AccessReviewAuthContext,
): AccessReviewActor {
  if (!canUseAccessReview(actor)) {
    throw forbiddenError(
      'Admin or PrivacyOfficer role is required for access review management',
      {
        reason: 'access_review_role_required',
      },
    )
  }
  return requireActor(actor)
}

function requireActor(actor: AccessReviewAuthContext): AccessReviewActor {
  if (!actor.hsaId) {
    throw forbiddenError('Verified actor HSA-id is required', {
      reason: 'missing_actor_hsa_id',
    })
  }
  return {
    displayName: actor.displayName.trim() || actor.hsaId,
    hsaId: actor.hsaId,
  }
}

function assertCanViewRun(actor: AccessReviewAuthContext): void {
  requireAccessReviewRole(actor)
}

function assertCanDecideRun(actor: AccessReviewAuthContext): AccessReviewActor {
  return requireAccessReviewRole(actor)
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return new Date().toISOString()
}

function nullableIsoTimestamp(value: unknown): string | null {
  if (value == null) return null
  return isoTimestamp(value)
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function nullableStringValue(value: unknown): string | null {
  if (value == null) return null
  const valueString = String(value)
  return valueString.length > 0 ? valueString : null
}

function numberValue(value: unknown): number {
  return Number(value ?? 0)
}

function dateParam(date: Date): string {
  return date.toISOString()
}

function summaryFromRows(rows: Row[]): AccessReviewRunSummary {
  return rows.reduce<AccessReviewRunSummary>(
    (summary, row) => {
      summary.itemCount += numberValue(row.itemCount)
      summary.pendingCount += numberValue(row.pendingCount)
      summary.approvedCount += numberValue(row.approvedCount)
      summary.revokeRequiredCount += numberValue(row.revokeRequiredCount)
      summary.changedCount += numberValue(row.changedCount)
      summary.notApplicableCount += numberValue(row.notApplicableCount)
      return summary
    },
    {
      approvedCount: 0,
      changedCount: 0,
      itemCount: 0,
      notApplicableCount: 0,
      pendingCount: 0,
      revokeRequiredCount: 0,
    },
  )
}

function mapRun(row: Row): AccessReviewRun {
  const completedByHsaId = nullableStringValue(row.completedByHsaId)
  const completedByDisplayName = nullableStringValue(row.completedByDisplayName)

  return {
    completedAt: nullableIsoTimestamp(row.completedAt),
    completedBy:
      completedByHsaId && completedByDisplayName
        ? {
            displayName: completedByDisplayName,
            hsaId: completedByHsaId,
          }
        : null,
    createdAt: isoTimestamp(row.createdAt),
    createdBy: {
      displayName: stringValue(row.createdByDisplayName),
      hsaId: stringValue(row.createdByHsaId),
    },
    dueAt: isoTimestamp(row.dueAt),
    externalEvidenceReference: nullableStringValue(
      row.externalEvidenceReference,
    ),
    id: numberValue(row.id),
    periodEnd: isoTimestamp(row.periodEnd),
    periodStart: isoTimestamp(row.periodStart),
    reviewer: {
      displayName: stringValue(row.reviewerDisplayName),
      hsaId: stringValue(row.reviewerHsaId),
    },
    status: stringValue(row.status) as AccessReviewRunStatus,
    summary: summaryFromRows([row]),
    updatedAt: isoTimestamp(row.updatedAt),
  }
}

function mapItem(row: Row): AccessReviewItem {
  const decidedByHsaId = nullableStringValue(row.decidedByHsaId)
  const decidedByDisplayName = nullableStringValue(row.decidedByDisplayName)

  return {
    comment: nullableStringValue(row.comment),
    createdAt: isoTimestamp(row.createdAt),
    decidedAt: nullableIsoTimestamp(row.decidedAt),
    decidedBy:
      decidedByHsaId && decidedByDisplayName
        ? {
            displayName: decidedByDisplayName,
            hsaId: decidedByHsaId,
          }
        : null,
    decision: stringValue(row.decision) as AccessReviewDecision,
    id: numberValue(row.id),
    permissionType: stringValue(row.permissionType),
    principal: {
      displayName: stringValue(row.principalDisplayName),
      hsaId: stringValue(row.principalHsaId),
    },
    scope: {
      key: stringValue(row.scopeKey),
      label: stringValue(row.scopeLabel),
      type: stringValue(row.scopeType),
    },
    sourceKey: stringValue(row.sourceKey),
    sourceTable: stringValue(row.sourceTable),
  }
}

function mapSnapshotRow(row: Row): AccessReviewPrincipalSnapshot {
  return {
    permissionType: stringValue(row.permissionType),
    principalDisplayName: stringValue(row.principalDisplayName),
    principalHsaId: stringValue(row.principalHsaId),
    scopeKey: stringValue(row.scopeKey),
    scopeLabel: stringValue(row.scopeLabel),
    scopeType: stringValue(row.scopeType),
    sourceKey: stringValue(row.sourceKey),
    sourceTable: stringValue(row.sourceTable),
  }
}

export async function collectAccessReviewAssignments(
  db: QueryExecutor,
): Promise<AccessReviewPrincipalSnapshot[]> {
  const rows = (await db.query(
    `/* access-review:collect-assignments */
      SELECT *
      FROM (
        SELECT
          N'requirement_areas.owner' AS sourceKey,
          N'requirement_areas' AS sourceTable,
          area.owner_hsa_id AS principalHsaId,
          ${requirementResponsibilityPersonNameSql('owner_person')} AS principalDisplayName,
          N'requirement_area' AS scopeType,
          CAST(area.id AS nvarchar(120)) AS scopeKey,
          CONCAT(area.prefix, N' ', area.name) AS scopeLabel,
          N'area_owner' AS permissionType
        FROM requirement_areas area
        INNER JOIN requirement_responsibility_people owner_person
          ON owner_person.hsa_id = area.owner_hsa_id
        UNION ALL
        SELECT
          N'requirement_packages.owner' AS sourceKey,
          N'requirement_packages' AS sourceTable,
          pkg.lead_hsa_id AS principalHsaId,
          ${requirementResponsibilityPersonNameSql('lead_person')} AS principalDisplayName,
          N'requirement_package' AS scopeType,
          CAST(pkg.id AS nvarchar(120)) AS scopeKey,
          pkg.name AS scopeLabel,
          N'package_owner' AS permissionType
        FROM requirement_packages pkg
        INNER JOIN requirement_responsibility_people lead_person
          ON lead_person.hsa_id = pkg.lead_hsa_id
        UNION ALL
        SELECT
          N'requirement_area_co_authors.hsa_id' AS sourceKey,
          N'requirement_area_co_authors' AS sourceTable,
          co_author.hsa_id AS principalHsaId,
          ${requirementResponsibilityPersonNameSql('co_author_person')} AS principalDisplayName,
          N'requirement_area' AS scopeType,
          CAST(area.id AS nvarchar(120)) AS scopeKey,
          CONCAT(area.prefix, N' ', area.name) AS scopeLabel,
          N'area_co_author' AS permissionType
        FROM requirement_area_co_authors co_author
        INNER JOIN requirement_areas area ON area.id = co_author.area_id
        INNER JOIN requirement_responsibility_people co_author_person
          ON co_author_person.hsa_id = co_author.hsa_id
        UNION ALL
        SELECT
          N'requirement_package_co_authors.hsa_id' AS sourceKey,
          N'requirement_package_co_authors' AS sourceTable,
          co_author.hsa_id AS principalHsaId,
          ${requirementResponsibilityPersonNameSql('co_author_person')} AS principalDisplayName,
          N'requirement_package' AS scopeType,
          CAST(pkg.id AS nvarchar(120)) AS scopeKey,
          pkg.name AS scopeLabel,
          N'package_co_author' AS permissionType
        FROM requirement_package_co_authors co_author
        INNER JOIN requirement_packages pkg
          ON pkg.id = co_author.requirement_package_id
        INNER JOIN requirement_responsibility_people co_author_person
          ON co_author_person.hsa_id = co_author.hsa_id
        UNION ALL
        SELECT
          N'requirements_specifications.responsible' AS sourceKey,
          N'requirements_specifications' AS sourceTable,
          spec.responsible_hsa_id AS principalHsaId,
          ${requirementResponsibilityPersonNameSql('responsible_person')} AS principalDisplayName,
          N'requirements_specification' AS scopeType,
          CAST(spec.id AS nvarchar(120)) AS scopeKey,
          CONCAT(spec.specification_code, N' ', spec.name) AS scopeLabel,
          N'specification_responsible' AS permissionType
        FROM requirements_specifications spec
        INNER JOIN requirement_responsibility_people responsible_person
          ON responsible_person.hsa_id = spec.responsible_hsa_id
        WHERE spec.responsible_hsa_id IS NOT NULL
        UNION ALL
        SELECT
          N'specification_co_authors.hsa_id' AS sourceKey,
          N'specification_co_authors' AS sourceTable,
          co_author.hsa_id AS principalHsaId,
          ${requirementResponsibilityPersonNameSql('co_author_person')} AS principalDisplayName,
          N'requirements_specification' AS scopeType,
          CAST(spec.id AS nvarchar(120)) AS scopeKey,
          CONCAT(spec.specification_code, N' ', spec.name) AS scopeLabel,
          N'specification_co_author' AS permissionType
        FROM specification_co_authors co_author
        INNER JOIN requirements_specifications spec
          ON spec.id = co_author.specification_id
        INNER JOIN requirement_responsibility_people co_author_person
          ON co_author_person.hsa_id = co_author.hsa_id
      ) assignments
      WHERE assignments.principalHsaId IS NOT NULL
      ORDER BY
        assignments.sourceKey ASC,
        assignments.scopeLabel ASC,
        assignments.principalHsaId ASC`,
  )) as Row[]

  return rows.map(mapSnapshotRow)
}

async function insertRun(
  db: QueryExecutor,
  input: CreateAccessReviewRunInput,
  createdBy: AccessReviewActor,
): Promise<number> {
  const now = input.generatedAt ?? new Date()
  const periodStart = input.periodStart ?? now
  const periodEnd =
    input.periodEnd ?? new Date(periodStart.getTime() + ONE_YEAR_MS)
  const dueAt = input.dueAt ?? new Date(now.getTime() + THIRTY_DAYS_MS)
  const rows = (await db.query(
    `INSERT INTO access_review_runs (
        status,
        period_start,
        period_end,
        due_at,
        created_at,
        updated_at,
        created_by_hsa_id,
        created_by_display_name,
        reviewer_hsa_id,
        reviewer_display_name,
        external_evidence_reference
      )
      OUTPUT INSERTED.id AS id
      VALUES (
        N'in_review',
        @0,
        @1,
        @2,
        @3,
        @3,
        @4,
        @5,
        @6,
        @7,
        @8
      )`,
    [
      dateParam(periodStart),
      dateParam(periodEnd),
      dateParam(dueAt),
      dateParam(now),
      createdBy.hsaId,
      createdBy.displayName,
      input.reviewer.hsaId,
      input.reviewer.displayName,
      input.externalEvidenceReference ?? null,
    ],
  )) as Row[]
  const id = numberValue(rows[0]?.id)
  if (!id) {
    throw validationError('Access review run could not be created', {
      reason: 'missing_inserted_id',
    })
  }
  return id
}

async function insertItems(
  db: QueryExecutor,
  runId: number,
  generatedAt: Date,
  items: AccessReviewPrincipalSnapshot[],
): Promise<void> {
  if (items.length === 0) return

  const createdAt = dateParam(generatedAt)
  for (
    let batchStart = 0;
    batchStart < items.length;
    batchStart += ACCESS_REVIEW_ITEM_INSERT_BATCH_SIZE
  ) {
    const batch = items.slice(
      batchStart,
      batchStart + ACCESS_REVIEW_ITEM_INSERT_BATCH_SIZE,
    )
    const parameters: unknown[] = []
    const valuesSql = batch.map((item, rowIndex) => {
      const parameterOffset =
        rowIndex * ACCESS_REVIEW_ITEM_INSERT_PARAMETER_COUNT
      parameters.push(
        runId,
        item.sourceKey,
        item.sourceTable,
        item.principalHsaId,
        item.principalDisplayName,
        item.scopeType,
        item.scopeKey,
        item.scopeLabel,
        item.permissionType,
        createdAt,
      )
      return `(@${parameterOffset}, @${parameterOffset + 1}, @${parameterOffset + 2}, @${parameterOffset + 3}, @${parameterOffset + 4}, @${parameterOffset + 5}, @${parameterOffset + 6}, @${parameterOffset + 7}, @${parameterOffset + 8}, N'pending', @${parameterOffset + 9})`
    })

    await db.query(
      `INSERT INTO access_review_items (
          run_id,
          source_key,
          source_table,
          principal_hsa_id,
          principal_display_name,
          scope_type,
          scope_key,
          scope_label,
          permission_type,
          decision,
          created_at
        )
        VALUES ${valuesSql.join(', ')}`,
      parameters,
    )
  }
}

async function findOpenAccessReviewRun(
  db: QueryExecutor,
): Promise<{ id: number; status: AccessReviewRunStatus } | null> {
  const rows = (await db.query(
    `SELECT TOP (1)
        id,
        status
      FROM access_review_runs WITH (UPDLOCK, HOLDLOCK)
      WHERE status IN (N'draft', N'in_review')
      ORDER BY created_at DESC, id DESC`,
  )) as Row[]
  if (rows.length < 1) return null
  return {
    id: numberValue(rows[0]?.id),
    status: stringValue(rows[0]?.status) as AccessReviewRunStatus,
  }
}

export async function createAccessReviewRun(
  db: SqlServerDatabase,
  input: CreateAccessReviewRunInput,
  actor: AccessReviewAuthContext,
  options: CreateAccessReviewRunOptions = {},
): Promise<AccessReviewRunDetail> {
  const createdBy = requireAccessReviewRole(actor)
  const generatedAt = input.generatedAt ?? new Date()
  let runId = 0

  await db.transaction(async manager => {
    const tx: QueryExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    const openRun = await findOpenAccessReviewRun(tx)
    if (openRun) {
      throw conflictError('An access review is already in progress', {
        reason: 'active_access_review_exists',
        reviewId: openRun.id,
        status: openRun.status,
      })
    }
    const items = await collectAccessReviewAssignments(tx)
    runId = await insertRun(tx, { ...input, generatedAt }, createdBy)
    await insertItems(tx, runId, generatedAt, items)
    await options.audit?.(tx, {
      itemCount: items.length,
      runId,
      status: 'in_review',
    })
  })

  return getAccessReviewRun(db, runId, actor)
}

function runSelectSql(whereClause: string): string {
  return `SELECT
      run.id AS id,
      run.status AS status,
      run.period_start AS periodStart,
      run.period_end AS periodEnd,
      run.due_at AS dueAt,
      run.created_at AS createdAt,
      run.updated_at AS updatedAt,
      run.created_by_hsa_id AS createdByHsaId,
      run.created_by_display_name AS createdByDisplayName,
      run.reviewer_hsa_id AS reviewerHsaId,
      run.reviewer_display_name AS reviewerDisplayName,
      run.external_evidence_reference AS externalEvidenceReference,
      run.completed_at AS completedAt,
      run.completed_by_hsa_id AS completedByHsaId,
      run.completed_by_display_name AS completedByDisplayName,
      COUNT(item.id) AS itemCount,
      SUM(CASE WHEN item.decision = N'pending' THEN 1 ELSE 0 END) AS pendingCount,
      SUM(CASE WHEN item.decision = N'approved' THEN 1 ELSE 0 END) AS approvedCount,
      SUM(CASE WHEN item.decision = N'revoke_required' THEN 1 ELSE 0 END) AS revokeRequiredCount,
      SUM(CASE WHEN item.decision = N'changed' THEN 1 ELSE 0 END) AS changedCount,
      SUM(CASE WHEN item.decision = N'not_applicable' THEN 1 ELSE 0 END) AS notApplicableCount
    FROM access_review_runs run
    LEFT JOIN access_review_items item ON item.run_id = run.id
    ${whereClause}
    GROUP BY
      run.id,
      run.status,
      run.period_start,
      run.period_end,
      run.due_at,
      run.created_at,
      run.updated_at,
      run.created_by_hsa_id,
      run.created_by_display_name,
      run.reviewer_hsa_id,
      run.reviewer_display_name,
      run.external_evidence_reference,
      run.completed_at,
      run.completed_by_hsa_id,
      run.completed_by_display_name`
}

export async function listAccessReviewRuns(
  db: QueryExecutor,
  actor: AccessReviewAuthContext,
): Promise<AccessReviewRun[]> {
  requireAccessReviewRole(actor)
  const rows = (await db.query(
    `${runSelectSql('')}
      ORDER BY run.created_at DESC, run.id DESC`,
    [],
  )) as Row[]
  return rows.map(mapRun)
}

export async function getAccessReviewRun(
  db: QueryExecutor,
  id: number,
  actor: AccessReviewAuthContext,
): Promise<AccessReviewRunDetail> {
  assertCanViewRun(actor)

  const runRows = (await db.query(`${runSelectSql('WHERE run.id = @0')}`, [
    id,
  ])) as Row[]
  if (runRows.length < 1) {
    throw notFoundError('Access review run was not found', {
      id,
      reason: 'access_review_not_found',
    })
  }

  const run = mapRun(runRows[0])

  const itemRows = (await db.query(
    `SELECT
        id,
        source_key AS sourceKey,
        source_table AS sourceTable,
        principal_hsa_id AS principalHsaId,
        principal_display_name AS principalDisplayName,
        scope_type AS scopeType,
        scope_key AS scopeKey,
        scope_label AS scopeLabel,
        permission_type AS permissionType,
        decision,
        decided_at AS decidedAt,
        decided_by_hsa_id AS decidedByHsaId,
        decided_by_display_name AS decidedByDisplayName,
        comment,
        created_at AS createdAt
      FROM access_review_items
      WHERE run_id = @0
      ORDER BY source_key ASC, scope_label ASC, principal_hsa_id ASC, id ASC`,
    [id],
  )) as Row[]

  return {
    items: itemRows.map(mapItem),
    run,
  }
}

export async function decideAccessReviewItem(
  db: SqlServerDatabase,
  runId: number,
  itemId: number,
  input: DecideAccessReviewItemInput,
  actor: AccessReviewAuthContext,
): Promise<AccessReviewRunDetail> {
  const detail = await getAccessReviewRun(db, runId, actor)
  const decidedBy = assertCanDecideRun(actor)
  if (detail.run.status === 'completed' || detail.run.status === 'cancelled') {
    throw conflictError('Access review run is no longer editable', {
      reason: 'access_review_closed',
      status: detail.run.status,
    })
  }
  if (!detail.items.some(item => item.id === itemId)) {
    throw notFoundError('Access review item was not found', {
      itemId,
      reason: 'access_review_item_not_found',
      runId,
    })
  }

  const decidedAt = new Date()
  await db.transaction(async manager => {
    const tx: QueryExecutor = {
      query: (sql, params) => manager.query(sql, params),
    }
    await tx.query(
      `UPDATE access_review_items
        SET decision = @0,
            decided_at = @1,
            decided_by_hsa_id = @2,
            decided_by_display_name = @3,
            comment = @4
        WHERE id = @5 AND run_id = @6`,
      [
        input.decision,
        dateParam(decidedAt),
        decidedBy.hsaId,
        decidedBy.displayName,
        input.comment?.trim() || null,
        itemId,
        runId,
      ],
    )
    await tx.query(
      'UPDATE access_review_runs SET updated_at = @0 WHERE id = @1',
      [dateParam(decidedAt), runId],
    )
  })
  return getAccessReviewRun(db, runId, actor)
}

export async function completeAccessReviewRun(
  db: SqlServerDatabase,
  runId: number,
  actor: AccessReviewAuthContext,
): Promise<AccessReviewRunDetail> {
  const completedBy = requireAccessReviewRole(actor)
  const detail = await getAccessReviewRun(db, runId, actor)
  if (detail.run.status === 'completed') return detail
  if (detail.run.status === 'cancelled') {
    throw conflictError('Cancelled access review cannot be completed', {
      reason: 'access_review_cancelled',
    })
  }
  if (detail.run.summary.pendingCount > 0) {
    throw conflictError('Access review still has pending items', {
      pendingCount: detail.run.summary.pendingCount,
      reason: 'access_review_pending_items',
    })
  }

  const completedAt = new Date()
  await db.query(
    `UPDATE access_review_runs
      SET status = N'completed',
          completed_at = @0,
          completed_by_hsa_id = @1,
          completed_by_display_name = @2,
          updated_at = @0
      WHERE id = @3`,
    [dateParam(completedAt), completedBy.hsaId, completedBy.displayName, runId],
  )
  return getAccessReviewRun(db, runId, actor)
}

export async function cancelAccessReviewRun(
  db: SqlServerDatabase,
  runId: number,
  actor: AccessReviewAuthContext,
): Promise<AccessReviewRunDetail> {
  requireAccessReviewRole(actor)
  const detail = await getAccessReviewRun(db, runId, actor)
  if (detail.run.status === 'cancelled') return detail
  if (detail.run.status === 'completed') {
    throw conflictError('Completed access review cannot be cancelled', {
      reason: 'access_review_completed',
    })
  }

  const cancelledAt = new Date()
  await db.query(
    `UPDATE access_review_runs
      SET status = N'cancelled',
          updated_at = @0
      WHERE id = @1`,
    [dateParam(cancelledAt), runId],
  )
  return getAccessReviewRun(db, runId, actor)
}

export async function buildAccessReviewExport(
  db: QueryExecutor,
  runId: number,
  actor: AccessReviewAuthContext,
  generatedAt = new Date(),
): Promise<AccessReviewExportV1> {
  const generatedBy = requireAccessReviewRole(actor)
  const detail = await getAccessReviewRun(db, runId, actor)

  return {
    generatedAt: generatedAt.toISOString(),
    generatedBy,
    items: detail.items,
    limitations: [
      {
        description:
          'Global IdP roles such as Admin, Reviewer, and PrivacyOfficer are reviewed in the identity-management tool where those permissions are assigned.',
        key: 'global_idp_roles_external',
      },
      {
        description:
          'Source-code repository access and external MCP client provisioning are reviewed in their respective administration tools and can be referenced through the external evidence field.',
        key: 'external_access_tools',
      },
    ],
    run: detail.run,
    schemaVersion: ACCESS_REVIEW_EXPORT_SCHEMA_VERSION,
  }
}
