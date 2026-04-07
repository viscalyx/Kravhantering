import { eq, sql } from 'drizzle-orm'
import {
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  deviations,
  requirementPackageItems,
  requirementPackages,
  requirements,
  requirementVersions,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

export interface DeviationRow {
  createdAt: string
  createdBy: string | null
  decidedAt: string | null
  decidedBy: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  motivation: string
  packageItemId: number
  packageName: string | null
  packageUniqueId: string | null
  requirementDescription: string | null
  requirementUniqueId: string | null
  requirementVersionId: number
  updatedAt: string | null
}

export interface DeviationCounts {
  approved: number
  pending: number
  rejected: number
  total: number
}

export async function listDeviationsForPackageItem(
  db: Database,
  packageItemId: number,
): Promise<DeviationRow[]> {
  const rows = await db
    .select({
      id: deviations.id,
      packageItemId: deviations.packageItemId,
      motivation: deviations.motivation,
      isReviewRequested: deviations.isReviewRequested,
      decision: deviations.decision,
      decisionMotivation: deviations.decisionMotivation,
      decidedBy: deviations.decidedBy,
      decidedAt: deviations.decidedAt,
      createdBy: deviations.createdBy,
      createdAt: deviations.createdAt,
      updatedAt: deviations.updatedAt,
      requirementUniqueId: requirements.uniqueId,
      requirementDescription: requirementVersions.description,
      requirementVersionId: requirementPackageItems.requirementVersionId,
      packageName: requirementPackages.name,
      packageUniqueId: requirementPackages.uniqueId,
    })
    .from(deviations)
    .innerJoin(
      requirementPackageItems,
      eq(deviations.packageItemId, requirementPackageItems.id),
    )
    .innerJoin(
      requirements,
      eq(requirementPackageItems.requirementId, requirements.id),
    )
    .innerJoin(
      requirementVersions,
      eq(requirementPackageItems.requirementVersionId, requirementVersions.id),
    )
    .innerJoin(
      requirementPackages,
      eq(requirementPackageItems.packageId, requirementPackages.id),
    )
    .where(eq(deviations.packageItemId, packageItemId))
    .orderBy(deviations.createdAt)

  return rows
}

export async function listDeviationsForPackage(
  db: Database,
  packageId: number,
): Promise<DeviationRow[]> {
  const rows = await db
    .select({
      id: deviations.id,
      packageItemId: deviations.packageItemId,
      motivation: deviations.motivation,
      isReviewRequested: deviations.isReviewRequested,
      decision: deviations.decision,
      decisionMotivation: deviations.decisionMotivation,
      decidedBy: deviations.decidedBy,
      decidedAt: deviations.decidedAt,
      createdBy: deviations.createdBy,
      createdAt: deviations.createdAt,
      updatedAt: deviations.updatedAt,
      requirementUniqueId: requirements.uniqueId,
      requirementDescription: requirementVersions.description,
      requirementVersionId: requirementPackageItems.requirementVersionId,
      packageName: requirementPackages.name,
      packageUniqueId: requirementPackages.uniqueId,
    })
    .from(deviations)
    .innerJoin(
      requirementPackageItems,
      eq(deviations.packageItemId, requirementPackageItems.id),
    )
    .innerJoin(
      requirements,
      eq(requirementPackageItems.requirementId, requirements.id),
    )
    .innerJoin(
      requirementVersions,
      eq(requirementPackageItems.requirementVersionId, requirementVersions.id),
    )
    .innerJoin(
      requirementPackages,
      eq(requirementPackageItems.packageId, requirementPackages.id),
    )
    .where(eq(requirementPackageItems.packageId, packageId))
    .orderBy(requirements.uniqueId, deviations.createdAt)

  return rows
}

export async function getDeviation(
  db: Database,
  deviationId: number,
): Promise<DeviationRow> {
  const rows = await db
    .select({
      id: deviations.id,
      packageItemId: deviations.packageItemId,
      motivation: deviations.motivation,
      isReviewRequested: deviations.isReviewRequested,
      decision: deviations.decision,
      decisionMotivation: deviations.decisionMotivation,
      decidedBy: deviations.decidedBy,
      decidedAt: deviations.decidedAt,
      createdBy: deviations.createdBy,
      createdAt: deviations.createdAt,
      updatedAt: deviations.updatedAt,
      requirementUniqueId: requirements.uniqueId,
      requirementDescription: requirementVersions.description,
      requirementVersionId: requirementPackageItems.requirementVersionId,
      packageName: requirementPackages.name,
      packageUniqueId: requirementPackages.uniqueId,
    })
    .from(deviations)
    .innerJoin(
      requirementPackageItems,
      eq(deviations.packageItemId, requirementPackageItems.id),
    )
    .innerJoin(
      requirements,
      eq(requirementPackageItems.requirementId, requirements.id),
    )
    .innerJoin(
      requirementVersions,
      eq(requirementPackageItems.requirementVersionId, requirementVersions.id),
    )
    .innerJoin(
      requirementPackages,
      eq(requirementPackageItems.packageId, requirementPackages.id),
    )
    .where(eq(deviations.id, deviationId))
    .limit(1)

  if (rows.length === 0) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  return rows[0]
}

export async function createDeviation(
  db: Database,
  data: {
    packageItemId: number
    motivation: string
    createdBy?: string | null
  },
): Promise<{ id: number }> {
  if (!data.motivation.trim()) {
    throw validationError('Motivation is required')
  }

  // Verify package item exists
  const item = await db
    .select({ id: requirementPackageItems.id })
    .from(requirementPackageItems)
    .where(eq(requirementPackageItems.id, data.packageItemId))
    .limit(1)

  if (item.length === 0) {
    throw notFoundError(`Package item ${data.packageItemId} not found`)
  }

  const now = new Date().toISOString()
  const [inserted] = await db
    .insert(deviations)
    .values({
      packageItemId: data.packageItemId,
      motivation: data.motivation.trim(),
      createdBy: data.createdBy ?? null,
      createdAt: now,
    })
    .returning({ id: deviations.id })

  return { id: inserted.id }
}

export async function updateDeviation(
  db: Database,
  deviationId: number,
  data: { motivation?: string },
): Promise<void> {
  // Verify exists and has no decision yet
  const existing = await db
    .select({
      id: deviations.id,
      decision: deviations.decision,
    })
    .from(deviations)
    .where(eq(deviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError(
      'Cannot edit a deviation after a decision has been recorded',
    )
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }

  if (data.motivation !== undefined) {
    if (!data.motivation.trim()) {
      throw validationError('Motivation is required')
    }
    updates.motivation = data.motivation.trim()
  }

  await db.update(deviations).set(updates).where(eq(deviations.id, deviationId))
}

export async function recordDecision(
  db: Database,
  deviationId: number,
  data: {
    decision: number
    decisionMotivation: string
    decidedBy: string
  },
): Promise<void> {
  if (
    data.decision !== DEVIATION_APPROVED &&
    data.decision !== DEVIATION_REJECTED
  ) {
    throw validationError('Decision must be 1 (approved) or 2 (rejected)')
  }

  if (!data.decisionMotivation.trim()) {
    throw validationError('Decision motivation is required')
  }

  if (!data.decidedBy.trim()) {
    throw validationError('Decided by is required')
  }

  const existing = await db
    .select({
      id: deviations.id,
      decision: deviations.decision,
    })
    .from(deviations)
    .where(eq(deviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError(
      'A decision has already been recorded for this deviation',
    )
  }

  const now = new Date().toISOString()
  await db
    .update(deviations)
    .set({
      decision: data.decision,
      decisionMotivation: data.decisionMotivation.trim(),
      decidedBy: data.decidedBy.trim(),
      decidedAt: now,
      updatedAt: now,
    })
    .where(eq(deviations.id, deviationId))
}

export async function deleteDeviation(
  db: Database,
  deviationId: number,
): Promise<void> {
  const existing = await db
    .select({
      id: deviations.id,
      decision: deviations.decision,
    })
    .from(deviations)
    .where(eq(deviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError(
      'Cannot delete a deviation after a decision has been recorded',
    )
  }

  await db.delete(deviations).where(eq(deviations.id, deviationId))
}

export async function countDeviationsByPackage(
  db: Database,
  packageId: number,
): Promise<DeviationCounts> {
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`.as('total'),
      pending:
        sql<number>`SUM(CASE WHEN ${deviations.decision} IS NULL THEN 1 ELSE 0 END)`.as(
          'pending',
        ),
      approved:
        sql<number>`SUM(CASE WHEN ${deviations.decision} = ${DEVIATION_APPROVED} THEN 1 ELSE 0 END)`.as(
          'approved',
        ),
      rejected:
        sql<number>`SUM(CASE WHEN ${deviations.decision} = ${DEVIATION_REJECTED} THEN 1 ELSE 0 END)`.as(
          'rejected',
        ),
    })
    .from(deviations)
    .innerJoin(
      requirementPackageItems,
      eq(deviations.packageItemId, requirementPackageItems.id),
    )
    .where(eq(requirementPackageItems.packageId, packageId))

  if (rows.length === 0) {
    return { total: 0, pending: 0, approved: 0, rejected: 0 }
  }

  return {
    total: Number(rows[0].total) || 0,
    pending: Number(rows[0].pending) || 0,
    approved: Number(rows[0].approved) || 0,
    rejected: Number(rows[0].rejected) || 0,
  }
}

export async function countDeviationsPerItem(
  db: Database,
  packageId: number,
): Promise<Map<number, { total: number; pending: number; approved: number }>> {
  const rows = await db
    .select({
      packageItemId: deviations.packageItemId,
      total: sql<number>`COUNT(*)`.as('total'),
      pending:
        sql<number>`SUM(CASE WHEN ${deviations.decision} IS NULL THEN 1 ELSE 0 END)`.as(
          'pending',
        ),
      approved:
        sql<number>`SUM(CASE WHEN ${deviations.decision} = ${DEVIATION_APPROVED} THEN 1 ELSE 0 END)`.as(
          'approved',
        ),
    })
    .from(deviations)
    .innerJoin(
      requirementPackageItems,
      eq(deviations.packageItemId, requirementPackageItems.id),
    )
    .where(eq(requirementPackageItems.packageId, packageId))
    .groupBy(deviations.packageItemId)

  const map = new Map<
    number,
    { total: number; pending: number; approved: number }
  >()
  for (const row of rows) {
    map.set(row.packageItemId, {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
    })
  }
  return map
}

export async function requestReview(
  db: Database,
  deviationId: number,
): Promise<void> {
  const existing = await db
    .select({
      id: deviations.id,
      decision: deviations.decision,
      isReviewRequested: deviations.isReviewRequested,
    })
    .from(deviations)
    .where(eq(deviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError(
      'Cannot request review for a deviation that already has a decision',
    )
  }

  if (existing[0].isReviewRequested === 1) {
    throw conflictError('Review has already been requested for this deviation')
  }

  await db
    .update(deviations)
    .set({
      isReviewRequested: 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(deviations.id, deviationId))
}

export async function revertToDraft(
  db: Database,
  deviationId: number,
): Promise<void> {
  const existing = await db
    .select({
      id: deviations.id,
      decision: deviations.decision,
      isReviewRequested: deviations.isReviewRequested,
    })
    .from(deviations)
    .where(eq(deviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError('Cannot revert a deviation that already has a decision')
  }

  if (existing[0].isReviewRequested === 0) {
    throw conflictError('Deviation is already in draft state')
  }

  await db
    .update(deviations)
    .set({
      isReviewRequested: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(deviations.id, deviationId))
}
