import { eq, inArray, sql } from 'drizzle-orm'
import {
  improvementSuggestions,
  requirements,
  requirementVersions,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'
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
  requirementUniqueId: requirements.uniqueId,
  requirementDescription: requirementVersions.description,
} as const

export async function listSuggestionsForRequirement(
  db: Database,
  requirementId: number,
): Promise<ImprovementSuggestionRow[]> {
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
  db: Database,
  suggestionId: number,
): Promise<ImprovementSuggestionRow> {
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
  db: Database,
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
  db: Database,
  suggestionId: number,
  data: { content?: string },
): Promise<void> {
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
  db: Database,
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
  db: Database,
  suggestionId: number,
): Promise<void> {
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
  db: Database,
  requirementId: number,
): Promise<ImprovementSuggestionCounts> {
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
  db: Database,
  requirementIds: number[],
): Promise<Map<number, { total: number; pending: number }>> {
  if (requirementIds.length === 0) {
    return new Map()
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
  db: Database,
  suggestionId: number,
): Promise<void> {
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
  db: Database,
  suggestionId: number,
): Promise<void> {
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
