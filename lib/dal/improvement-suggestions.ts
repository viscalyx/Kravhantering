import { eq, inArray, sql } from 'drizzle-orm'
import {
  improvementSuggestions,
  requirements,
  requirementVersions,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/drizzle/schema'
import type { AppDatabaseConnection, Database } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

export interface ImprovementSuggestionRow {
  content: string
  createdAt: string
  createdBy: string | null
  id: number
  isReviewRequested: number
  requirementDescription: string | null
  requirementId: number
  requirementUniqueId: string | null
  requirementVersionId: number | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  reviewRequestedAt: string | null
  updatedAt: string | null
}

export interface ImprovementSuggestionCounts {
  dismissed: number
  pending: number
  resolved: number
  total: number
}

const suggestionSelectFields = {
  id: improvementSuggestions.id,
  requirementId: improvementSuggestions.requirementId,
  requirementVersionId: improvementSuggestions.requirementVersionId,
  content: improvementSuggestions.content,
  isReviewRequested: improvementSuggestions.isReviewRequested,
  resolution: improvementSuggestions.resolution,
  resolutionMotivation: improvementSuggestions.resolutionMotivation,
  resolvedBy: improvementSuggestions.resolvedBy,
  resolvedAt: improvementSuggestions.resolvedAt,
  createdBy: improvementSuggestions.createdBy,
  createdAt: improvementSuggestions.createdAt,
  updatedAt: improvementSuggestions.updatedAt,
  reviewRequestedAt: improvementSuggestions.reviewRequestedAt,
  requirementUniqueId: requirements.uniqueId,
  requirementDescription: requirementVersions.description,
} as const

interface SqlServerQuerySource {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

function isSqlServerQuerySource(
  db: AppDatabaseConnection,
): db is SqlServerQuerySource {
  return (
    typeof db === 'object' &&
    db !== null &&
    'query' in db &&
    typeof db.query === 'function'
  )
}

function toIsoString(value: unknown): string | null {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

function toNumericFlag(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapSqlServerSuggestionRow(
  row: Record<string, unknown>,
): ImprovementSuggestionRow {
  return {
    content: String(row.content ?? ''),
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    createdBy: row.createdBy == null ? null : String(row.createdBy),
    id: Number(row.id),
    isReviewRequested: toNumericFlag(row.isReviewRequested),
    requirementDescription:
      row.requirementDescription == null
        ? null
        : String(row.requirementDescription),
    requirementId: Number(row.requirementId),
    requirementUniqueId:
      row.requirementUniqueId == null ? null : String(row.requirementUniqueId),
    requirementVersionId: toOptionalNumber(row.requirementVersionId),
    resolution: toOptionalNumber(row.resolution),
    resolutionMotivation:
      row.resolutionMotivation == null
        ? null
        : String(row.resolutionMotivation),
    resolvedAt: toIsoString(row.resolvedAt),
    resolvedBy: row.resolvedBy == null ? null : String(row.resolvedBy),
    reviewRequestedAt: toIsoString(row.reviewRequestedAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

async function findSqlServerSuggestionState(
  db: SqlServerQuerySource,
  suggestionId: number,
): Promise<{
  id: number
  isReviewRequested: number
  resolution: number | null
} | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        suggestion.id AS id,
        suggestion.resolution AS resolution,
        CAST(suggestion.is_review_requested AS int) AS isReviewRequested
      FROM improvement_suggestions suggestion
      WHERE suggestion.id = @0
    `,
    [suggestionId],
  )) as Record<string, unknown>[]

  if (!rows[0]) {
    return null
  }

  return {
    id: Number(rows[0].id),
    isReviewRequested: toNumericFlag(rows[0].isReviewRequested),
    resolution: toOptionalNumber(rows[0].resolution),
  }
}

function buildInClause(startIndex: number, values: number[]): string {
  return values.map((_, index) => `@${startIndex + index}`).join(', ')
}

export async function listSuggestionsForRequirement(
  db: AppDatabaseConnection,
  requirementId: number,
): Promise<ImprovementSuggestionRow[]> {
  if (isSqlServerQuerySource(db)) {
    const rows = (await db.query(
      `
        SELECT
          suggestion.id AS id,
          suggestion.requirement_id AS requirementId,
          suggestion.requirement_version_id AS requirementVersionId,
          suggestion.content AS content,
          CAST(suggestion.is_review_requested AS int) AS isReviewRequested,
          suggestion.resolution AS resolution,
          suggestion.resolution_motivation AS resolutionMotivation,
          suggestion.resolved_by AS resolvedBy,
          suggestion.resolved_at AS resolvedAt,
          suggestion.created_by AS createdBy,
          suggestion.created_at AS createdAt,
          suggestion.updated_at AS updatedAt,
          suggestion.review_requested_at AS reviewRequestedAt,
          requirement.unique_id AS requirementUniqueId,
          requirement_version.description AS requirementDescription
        FROM improvement_suggestions suggestion
        INNER JOIN requirements requirement
          ON requirement.id = suggestion.requirement_id
        LEFT JOIN requirement_versions requirement_version
          ON requirement_version.id = suggestion.requirement_version_id
        WHERE suggestion.requirement_id = @0
        ORDER BY suggestion.created_at ASC, suggestion.id ASC
      `,
      [requirementId],
    )) as Record<string, unknown>[]

    return rows.map(mapSqlServerSuggestionRow)
  }

  const rows = await db
    .select(suggestionSelectFields)
    .from(improvementSuggestions)
    .innerJoin(
      requirements,
      eq(improvementSuggestions.requirementId, requirements.id),
    )
    .leftJoin(
      requirementVersions,
      eq(improvementSuggestions.requirementVersionId, requirementVersions.id),
    )
    .where(eq(improvementSuggestions.requirementId, requirementId))
    .orderBy(improvementSuggestions.createdAt)

  return rows
}

export async function getSuggestion(
  db: AppDatabaseConnection,
  suggestionId: number,
): Promise<ImprovementSuggestionRow> {
  if (isSqlServerQuerySource(db)) {
    const rows = (await db.query(
      `
        SELECT TOP (1)
          suggestion.id AS id,
          suggestion.requirement_id AS requirementId,
          suggestion.requirement_version_id AS requirementVersionId,
          suggestion.content AS content,
          CAST(suggestion.is_review_requested AS int) AS isReviewRequested,
          suggestion.resolution AS resolution,
          suggestion.resolution_motivation AS resolutionMotivation,
          suggestion.resolved_by AS resolvedBy,
          suggestion.resolved_at AS resolvedAt,
          suggestion.created_by AS createdBy,
          suggestion.created_at AS createdAt,
          suggestion.updated_at AS updatedAt,
          suggestion.review_requested_at AS reviewRequestedAt,
          requirement.unique_id AS requirementUniqueId,
          requirement_version.description AS requirementDescription
        FROM improvement_suggestions suggestion
        INNER JOIN requirements requirement
          ON requirement.id = suggestion.requirement_id
        LEFT JOIN requirement_versions requirement_version
          ON requirement_version.id = suggestion.requirement_version_id
        WHERE suggestion.id = @0
      `,
      [suggestionId],
    )) as Record<string, unknown>[]

    if (!rows[0]) {
      throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
    }

    return mapSqlServerSuggestionRow(rows[0])
  }

  const rows = await db
    .select(suggestionSelectFields)
    .from(improvementSuggestions)
    .innerJoin(
      requirements,
      eq(improvementSuggestions.requirementId, requirements.id),
    )
    .leftJoin(
      requirementVersions,
      eq(improvementSuggestions.requirementVersionId, requirementVersions.id),
    )
    .where(eq(improvementSuggestions.id, suggestionId))
    .limit(1)

  if (rows.length === 0) {
    throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
  }

  return rows[0]
}

export async function createSuggestion(
  db: AppDatabaseConnection,
  data: {
    requirementId: number
    requirementVersionId?: number | null
    content: string
    createdBy?: string | null
  },
): Promise<{ id: number }> {
  if (!data.content.trim()) {
    throw validationError('Content is required')
  }

  if (isSqlServerQuerySource(db)) {
    const requirementRows = (await db.query(
      `
        SELECT TOP (1) requirement.id AS id
        FROM requirements requirement
        WHERE requirement.id = @0
      `,
      [data.requirementId],
    )) as Array<{ id: number }>

    if (requirementRows.length === 0) {
      throw notFoundError(`Requirement ${data.requirementId} not found`)
    }

    if (data.requirementVersionId) {
      const versionRows = (await db.query(
        `
          SELECT TOP (1) requirement_version.id AS id
          FROM requirement_versions requirement_version
          WHERE requirement_version.id = @0
            AND requirement_version.requirement_id = @1
        `,
        [data.requirementVersionId, data.requirementId],
      )) as Array<{ id: number }>

      if (versionRows.length === 0) {
        throw notFoundError(
          `Requirement version ${data.requirementVersionId} not found for requirement ${data.requirementId}`,
        )
      }
    }

    const now = new Date()
    const insertedRows = (await db.query(
      `
        INSERT INTO improvement_suggestions (
          requirement_id,
          requirement_version_id,
          content,
          created_by,
          created_at,
          is_review_requested
        )
        OUTPUT INSERTED.id AS id
        VALUES (@0, @1, @2, @3, @4, @5)
      `,
      [
        data.requirementId,
        data.requirementVersionId ?? null,
        data.content.trim(),
        data.createdBy ?? null,
        now,
        0,
      ],
    )) as Array<{ id: number }>

    return { id: Number(insertedRows[0]?.id) }
  }

  // Verify requirement exists
  const req = await db
    .select({ id: requirements.id })
    .from(requirements)
    .where(eq(requirements.id, data.requirementId))
    .limit(1)

  if (req.length === 0) {
    throw notFoundError(`Requirement ${data.requirementId} not found`)
  }

  if (data.requirementVersionId) {
    const version = await db
      .select({ id: requirementVersions.id })
      .from(requirementVersions)
      .where(
        sql`${requirementVersions.id} = ${data.requirementVersionId} AND ${requirementVersions.requirementId} = ${data.requirementId}`,
      )
      .limit(1)

    if (version.length === 0) {
      throw notFoundError(
        `Requirement version ${data.requirementVersionId} not found for requirement ${data.requirementId}`,
      )
    }
  }

  const now = new Date().toISOString()
  const [inserted] = await db
    .insert(improvementSuggestions)
    .values({
      requirementId: data.requirementId,
      requirementVersionId: data.requirementVersionId ?? null,
      content: data.content.trim(),
      createdBy: data.createdBy ?? null,
      createdAt: now,
    })
    .returning({ id: improvementSuggestions.id })

  return { id: inserted.id }
}

export async function updateSuggestion(
  db: AppDatabaseConnection,
  suggestionId: number,
  data: { content?: string },
): Promise<void> {
  if (isSqlServerQuerySource(db)) {
    const existing = await findSqlServerSuggestionState(db, suggestionId)

    if (!existing) {
      throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
    }

    if (existing.resolution !== null) {
      throw conflictError(
        'Cannot edit an improvement suggestion after a resolution has been recorded',
      )
    }

    if (existing.isReviewRequested === 1) {
      throw conflictError(
        'Cannot edit an improvement suggestion that has been submitted for review',
      )
    }

    if (data.content !== undefined && !data.content.trim()) {
      throw validationError('Content is required')
    }

    const now = new Date()
    if (data.content !== undefined) {
      await db.query(
        `
          UPDATE improvement_suggestions
          SET
            content = @0,
            updated_at = @1
          WHERE id = @2
        `,
        [data.content.trim(), now, suggestionId],
      )
      return
    }

    await db.query(
      `
        UPDATE improvement_suggestions
        SET
          updated_at = @0
        WHERE id = @1
      `,
      [now, suggestionId],
    )
    return
  }

  const existing = await db
    .select({
      id: improvementSuggestions.id,
      resolution: improvementSuggestions.resolution,
      isReviewRequested: improvementSuggestions.isReviewRequested,
    })
    .from(improvementSuggestions)
    .where(eq(improvementSuggestions.id, suggestionId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
  }

  if (existing[0].resolution !== null) {
    throw conflictError(
      'Cannot edit an improvement suggestion after a resolution has been recorded',
    )
  }

  if (existing[0].isReviewRequested === 1) {
    throw conflictError(
      'Cannot edit an improvement suggestion that has been submitted for review',
    )
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }

  if (data.content !== undefined) {
    if (!data.content.trim()) {
      throw validationError('Content is required')
    }
    updates.content = data.content.trim()
  }

  await db
    .update(improvementSuggestions)
    .set(updates)
    .where(eq(improvementSuggestions.id, suggestionId))
}

export async function recordResolution(
  db: AppDatabaseConnection,
  suggestionId: number,
  data: {
    resolution: number
    resolutionMotivation: string
    resolvedBy: string
  },
): Promise<void> {
  if (
    data.resolution !== SUGGESTION_RESOLVED &&
    data.resolution !== SUGGESTION_DISMISSED
  ) {
    throw validationError('Resolution must be 1 (resolved) or 2 (dismissed)')
  }

  if (!data.resolutionMotivation.trim()) {
    throw validationError('Resolution motivation is required')
  }

  if (!data.resolvedBy.trim()) {
    throw validationError('Resolved by is required')
  }

  if (isSqlServerQuerySource(db)) {
    const existing = await findSqlServerSuggestionState(db, suggestionId)

    if (!existing) {
      throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
    }

    if (existing.resolution !== null) {
      throw conflictError(
        'A resolution has already been recorded for this improvement suggestion',
      )
    }

    if (existing.isReviewRequested !== 1) {
      throw conflictError(
        'Can only resolve or dismiss suggestions that have been submitted for review',
      )
    }

    const now = new Date()
    await db.query(
      `
        UPDATE improvement_suggestions
        SET
          resolution = @0,
          resolution_motivation = @1,
          resolved_by = @2,
          resolved_at = @3,
          updated_at = @3
        WHERE id = @4
      `,
      [
        data.resolution,
        data.resolutionMotivation.trim(),
        data.resolvedBy.trim(),
        now,
        suggestionId,
      ],
    )
    return
  }

  const existing = await db
    .select({
      id: improvementSuggestions.id,
      resolution: improvementSuggestions.resolution,
      isReviewRequested: improvementSuggestions.isReviewRequested,
    })
    .from(improvementSuggestions)
    .where(eq(improvementSuggestions.id, suggestionId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
  }

  if (existing[0].resolution !== null) {
    throw conflictError(
      'A resolution has already been recorded for this improvement suggestion',
    )
  }

  if (existing[0].isReviewRequested !== 1) {
    throw conflictError(
      'Can only resolve or dismiss suggestions that have been submitted for review',
    )
  }

  const now = new Date().toISOString()
  await db
    .update(improvementSuggestions)
    .set({
      resolution: data.resolution,
      resolutionMotivation: data.resolutionMotivation.trim(),
      resolvedBy: data.resolvedBy.trim(),
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(improvementSuggestions.id, suggestionId))
}

export async function deleteSuggestion(
  db: AppDatabaseConnection,
  suggestionId: number,
): Promise<void> {
  if (isSqlServerQuerySource(db)) {
    const existing = await findSqlServerSuggestionState(db, suggestionId)

    if (!existing) {
      throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
    }

    if (existing.resolution !== null) {
      throw conflictError(
        'Cannot delete an improvement suggestion after a resolution has been recorded',
      )
    }

    if (existing.isReviewRequested === 1) {
      throw conflictError(
        'Cannot delete an improvement suggestion that has been submitted for review',
      )
    }

    await db.query(`DELETE FROM improvement_suggestions WHERE id = @0`, [
      suggestionId,
    ])
    return
  }

  const existing = await db
    .select({
      id: improvementSuggestions.id,
      resolution: improvementSuggestions.resolution,
      isReviewRequested: improvementSuggestions.isReviewRequested,
    })
    .from(improvementSuggestions)
    .where(eq(improvementSuggestions.id, suggestionId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
  }

  if (existing[0].resolution !== null) {
    throw conflictError(
      'Cannot delete an improvement suggestion after a resolution has been recorded',
    )
  }

  if (existing[0].isReviewRequested === 1) {
    throw conflictError(
      'Cannot delete an improvement suggestion that has been submitted for review',
    )
  }

  await db
    .delete(improvementSuggestions)
    .where(eq(improvementSuggestions.id, suggestionId))
}

export async function countSuggestionsByRequirement(
  db: AppDatabaseConnection,
  requirementId: number,
): Promise<ImprovementSuggestionCounts> {
  if (isSqlServerQuerySource(db)) {
    const rows = (await db.query(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN resolution IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN resolution = @1 THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN resolution = @2 THEN 1 ELSE 0 END) AS dismissed
        FROM improvement_suggestions
        WHERE requirement_id = @0
      `,
      [requirementId, SUGGESTION_RESOLVED, SUGGESTION_DISMISSED],
    )) as Array<Record<string, unknown>>

    const row = rows[0]
    return {
      total: row ? Number(row.total) || 0 : 0,
      pending: row ? Number(row.pending) || 0 : 0,
      resolved: row ? Number(row.resolved) || 0 : 0,
      dismissed: row ? Number(row.dismissed) || 0 : 0,
    }
  }

  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`.as('total'),
      pending:
        sql<number>`SUM(CASE WHEN ${improvementSuggestions.resolution} IS NULL THEN 1 ELSE 0 END)`.as(
          'pending',
        ),
      resolved:
        sql<number>`SUM(CASE WHEN ${improvementSuggestions.resolution} = ${SUGGESTION_RESOLVED} THEN 1 ELSE 0 END)`.as(
          'resolved',
        ),
      dismissed:
        sql<number>`SUM(CASE WHEN ${improvementSuggestions.resolution} = ${SUGGESTION_DISMISSED} THEN 1 ELSE 0 END)`.as(
          'dismissed',
        ),
    })
    .from(improvementSuggestions)
    .where(eq(improvementSuggestions.requirementId, requirementId))

  if (rows.length === 0) {
    return { total: 0, pending: 0, resolved: 0, dismissed: 0 }
  }

  return {
    total: Number(rows[0].total) || 0,
    pending: Number(rows[0].pending) || 0,
    resolved: Number(rows[0].resolved) || 0,
    dismissed: Number(rows[0].dismissed) || 0,
  }
}

export async function countSuggestionsForRequirements(
  db: AppDatabaseConnection,
  requirementIds: number[],
): Promise<Map<number, { total: number; pending: number }>> {
  if (requirementIds.length === 0) {
    return new Map()
  }

  if (isSqlServerQuerySource(db)) {
    const placeholders = buildInClause(0, requirementIds)
    const rows = (await db.query(
      `
        SELECT
          requirement_id AS requirementId,
          COUNT(*) AS total,
          SUM(CASE WHEN resolution IS NULL THEN 1 ELSE 0 END) AS pending
        FROM improvement_suggestions
        WHERE requirement_id IN (${placeholders})
        GROUP BY requirement_id
      `,
      requirementIds,
    )) as Array<Record<string, unknown>>

    const map = new Map<number, { total: number; pending: number }>()
    for (const row of rows) {
      map.set(Number(row.requirementId), {
        total: Number(row.total) || 0,
        pending: Number(row.pending) || 0,
      })
    }
    return map
  }

  const rows = await db
    .select({
      requirementId: improvementSuggestions.requirementId,
      total: sql<number>`COUNT(*)`.as('total'),
      pending:
        sql<number>`SUM(CASE WHEN ${improvementSuggestions.resolution} IS NULL THEN 1 ELSE 0 END)`.as(
          'pending',
        ),
    })
    .from(improvementSuggestions)
    .where(inArray(improvementSuggestions.requirementId, requirementIds))
    .groupBy(improvementSuggestions.requirementId)

  const map = new Map<number, { total: number; pending: number }>()
  for (const row of rows) {
    map.set(row.requirementId, {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
    })
  }
  return map
}

export async function requestReview(
  db: AppDatabaseConnection,
  suggestionId: number,
): Promise<void> {
  if (isSqlServerQuerySource(db)) {
    const existing = await findSqlServerSuggestionState(db, suggestionId)

    if (!existing) {
      throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
    }

    if (existing.resolution !== null) {
      throw conflictError(
        'Cannot request review for an improvement suggestion that already has a resolution',
      )
    }

    if (existing.isReviewRequested === 1) {
      throw conflictError(
        'Review has already been requested for this improvement suggestion',
      )
    }

    const now = new Date()
    await db.query(
      `
        UPDATE improvement_suggestions
        SET
          is_review_requested = 1,
          review_requested_at = @0,
          updated_at = @0
        WHERE id = @1
      `,
      [now, suggestionId],
    )
    return
  }

  const existing = await db
    .select({
      id: improvementSuggestions.id,
      resolution: improvementSuggestions.resolution,
      isReviewRequested: improvementSuggestions.isReviewRequested,
    })
    .from(improvementSuggestions)
    .where(eq(improvementSuggestions.id, suggestionId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
  }

  if (existing[0].resolution !== null) {
    throw conflictError(
      'Cannot request review for an improvement suggestion that already has a resolution',
    )
  }

  if (existing[0].isReviewRequested === 1) {
    throw conflictError(
      'Review has already been requested for this improvement suggestion',
    )
  }

  const now = new Date().toISOString()
  await db
    .update(improvementSuggestions)
    .set({
      isReviewRequested: 1,
      reviewRequestedAt: now,
      updatedAt: now,
    })
    .where(eq(improvementSuggestions.id, suggestionId))
}

export async function revertToDraft(
  db: AppDatabaseConnection,
  suggestionId: number,
): Promise<void> {
  if (isSqlServerQuerySource(db)) {
    const existing = await findSqlServerSuggestionState(db, suggestionId)

    if (!existing) {
      throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
    }

    if (existing.resolution !== null) {
      throw conflictError(
        'Cannot revert an improvement suggestion that already has a resolution',
      )
    }

    if (existing.isReviewRequested === 0) {
      throw conflictError('Improvement suggestion is already in draft state')
    }

    await db.query(
      `
        UPDATE improvement_suggestions
        SET
          is_review_requested = 0,
          review_requested_at = NULL,
          updated_at = @0
        WHERE id = @1
      `,
      [new Date(), suggestionId],
    )
    return
  }

  const existing = await db
    .select({
      id: improvementSuggestions.id,
      resolution: improvementSuggestions.resolution,
      isReviewRequested: improvementSuggestions.isReviewRequested,
    })
    .from(improvementSuggestions)
    .where(eq(improvementSuggestions.id, suggestionId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Improvement suggestion ${suggestionId} not found`)
  }

  if (existing[0].resolution !== null) {
    throw conflictError(
      'Cannot revert an improvement suggestion that already has a resolution',
    )
  }

  if (existing[0].isReviewRequested === 0) {
    throw conflictError('Improvement suggestion is already in draft state')
  }

  await db
    .update(improvementSuggestions)
    .set({
      isReviewRequested: 0,
      reviewRequestedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(improvementSuggestions.id, suggestionId))
}
