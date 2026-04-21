import type { SqlServerDatabase } from '@/lib/db'
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
  db: SqlServerDatabase,
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
  db: SqlServerDatabase,
  requirementId: number,
): Promise<ImprovementSuggestionRow[]> {
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

export async function getSuggestion(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<ImprovementSuggestionRow> {
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

export async function createSuggestion(
  db: SqlServerDatabase,
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

export async function updateSuggestion(
  db: SqlServerDatabase,
  suggestionId: number,
  data: { content?: string },
): Promise<void> {
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

export async function recordResolution(
  db: SqlServerDatabase,
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

export async function deleteSuggestion(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<void> {
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

export async function countSuggestionsByRequirement(
  db: SqlServerDatabase,
  requirementId: number,
): Promise<ImprovementSuggestionCounts> {
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

export async function countSuggestionsForRequirements(
  db: SqlServerDatabase,
  requirementIds: number[],
): Promise<Map<number, { total: number; pending: number }>> {
  if (requirementIds.length === 0) {
    return new Map()
  }

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

export async function requestReview(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<void> {
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

export async function revertToDraft(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<void> {
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

export const SUGGESTION_RESOLVED = 1
export const SUGGESTION_DISMISSED = 2
