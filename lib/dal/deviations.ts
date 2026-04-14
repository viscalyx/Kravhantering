import { eq, sql } from 'drizzle-orm'
import {
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  deviations,
  packageLocalRequirementDeviations,
  packageLocalRequirements,
  requirementPackageItems,
  requirementPackages,
  requirements,
  requirementVersions,
} from '@/drizzle/schema'
import {
  createLibraryItemRef,
  createPackageLocalItemRef,
  parsePackageItemRef,
} from '@/lib/dal/requirement-packages'
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
  isPackageLocal?: boolean
  isReviewRequested: number
  itemRef?: string
  motivation: string
  packageItemId: number | null
  packageLocalRequirementId?: number | null
  packageName: string | null
  packageUniqueId: string | null
  requirementDescription: string | null
  requirementUniqueId: string | null
  requirementVersionId: number | null
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

  return rows.map(row => ({
    ...row,
    isPackageLocal: false,
    itemRef: createLibraryItemRef(row.packageItemId),
    packageLocalRequirementId: null,
  }))
}

export async function listDeviationsForPackage(
  db: Database,
  packageId: number,
): Promise<DeviationRow[]> {
  const [libraryRows, packageLocalRows] = await Promise.all([
    db
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
        eq(
          requirementPackageItems.requirementVersionId,
          requirementVersions.id,
        ),
      )
      .innerJoin(
        requirementPackages,
        eq(requirementPackageItems.packageId, requirementPackages.id),
      )
      .where(eq(requirementPackageItems.packageId, packageId))
      .orderBy(requirements.uniqueId, deviations.createdAt),
    db
      .select({
        createdAt: packageLocalRequirementDeviations.createdAt,
        createdBy: packageLocalRequirementDeviations.createdBy,
        decidedAt: packageLocalRequirementDeviations.decidedAt,
        decidedBy: packageLocalRequirementDeviations.decidedBy,
        decision: packageLocalRequirementDeviations.decision,
        decisionMotivation:
          packageLocalRequirementDeviations.decisionMotivation,
        id: packageLocalRequirementDeviations.id,
        isReviewRequested: packageLocalRequirementDeviations.isReviewRequested,
        motivation: packageLocalRequirementDeviations.motivation,
        packageItemId: sql<number | null>`NULL`.as('package_item_id'),
        packageLocalRequirementId: packageLocalRequirements.id,
        packageName: requirementPackages.name,
        packageUniqueId: requirementPackages.uniqueId,
        requirementDescription: packageLocalRequirements.description,
        requirementUniqueId: packageLocalRequirements.uniqueId,
        requirementVersionId: sql<number | null>`NULL`.as(
          'requirement_version_id',
        ),
        updatedAt: packageLocalRequirementDeviations.updatedAt,
      })
      .from(packageLocalRequirementDeviations)
      .innerJoin(
        packageLocalRequirements,
        eq(
          packageLocalRequirementDeviations.packageLocalRequirementId,
          packageLocalRequirements.id,
        ),
      )
      .innerJoin(
        requirementPackages,
        eq(packageLocalRequirements.packageId, requirementPackages.id),
      )
      .where(eq(packageLocalRequirements.packageId, packageId))
      .orderBy(
        packageLocalRequirements.uniqueId,
        packageLocalRequirementDeviations.createdAt,
      ),
  ])

  return [
    ...libraryRows.map(row => ({
      ...row,
      isPackageLocal: false,
      itemRef: createLibraryItemRef(row.packageItemId),
      packageLocalRequirementId: null,
    })),
    ...packageLocalRows.map(row => ({
      ...row,
      isPackageLocal: true,
      itemRef: createPackageLocalItemRef(row.packageLocalRequirementId),
    })),
  ].sort((left, right) => {
    const idCompare = (left.requirementUniqueId ?? '').localeCompare(
      right.requirementUniqueId ?? '',
      'sv',
    )
    if (idCompare !== 0) {
      return idCompare
    }

    return left.createdAt.localeCompare(right.createdAt, 'sv')
  })
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

  return {
    ...rows[0],
    isPackageLocal: false,
    itemRef: createLibraryItemRef(rows[0].packageItemId),
    packageLocalRequirementId: null,
  }
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

export async function listDeviationsForPackageLocalRequirement(
  db: Database,
  packageLocalRequirementId: number,
): Promise<DeviationRow[]> {
  const rows = await db
    .select({
      createdAt: packageLocalRequirementDeviations.createdAt,
      createdBy: packageLocalRequirementDeviations.createdBy,
      decidedAt: packageLocalRequirementDeviations.decidedAt,
      decidedBy: packageLocalRequirementDeviations.decidedBy,
      decision: packageLocalRequirementDeviations.decision,
      decisionMotivation: packageLocalRequirementDeviations.decisionMotivation,
      id: packageLocalRequirementDeviations.id,
      isReviewRequested: packageLocalRequirementDeviations.isReviewRequested,
      motivation: packageLocalRequirementDeviations.motivation,
      packageItemId: sql<number | null>`NULL`.as('package_item_id'),
      packageLocalRequirementId: packageLocalRequirements.id,
      packageName: requirementPackages.name,
      packageUniqueId: requirementPackages.uniqueId,
      requirementDescription: packageLocalRequirements.description,
      requirementUniqueId: packageLocalRequirements.uniqueId,
      requirementVersionId: sql<number | null>`NULL`.as(
        'requirement_version_id',
      ),
      updatedAt: packageLocalRequirementDeviations.updatedAt,
    })
    .from(packageLocalRequirementDeviations)
    .innerJoin(
      packageLocalRequirements,
      eq(
        packageLocalRequirementDeviations.packageLocalRequirementId,
        packageLocalRequirements.id,
      ),
    )
    .innerJoin(
      requirementPackages,
      eq(packageLocalRequirements.packageId, requirementPackages.id),
    )
    .where(
      eq(
        packageLocalRequirementDeviations.packageLocalRequirementId,
        packageLocalRequirementId,
      ),
    )
    .orderBy(packageLocalRequirementDeviations.createdAt)

  return rows.map(row => ({
    ...row,
    isPackageLocal: true,
    itemRef: createPackageLocalItemRef(packageLocalRequirementId),
  }))
}

export async function createPackageLocalDeviation(
  db: Database,
  data: {
    createdBy?: string | null
    motivation: string
    packageLocalRequirementId: number
  },
): Promise<{ id: number }> {
  if (!data.motivation.trim()) {
    throw validationError('Motivation is required')
  }

  const requirement = await db
    .select({ id: packageLocalRequirements.id })
    .from(packageLocalRequirements)
    .where(eq(packageLocalRequirements.id, data.packageLocalRequirementId))
    .limit(1)

  if (requirement.length === 0) {
    throw notFoundError(
      `Package-local requirement ${data.packageLocalRequirementId} not found`,
    )
  }

  const now = new Date().toISOString()
  const [inserted] = await db
    .insert(packageLocalRequirementDeviations)
    .values({
      createdAt: now,
      createdBy: data.createdBy ?? null,
      motivation: data.motivation.trim(),
      packageLocalRequirementId: data.packageLocalRequirementId,
    })
    .returning({ id: packageLocalRequirementDeviations.id })

  return { id: inserted.id }
}

export async function createDeviationForItemRef(
  db: Database,
  data: {
    createdBy?: string | null
    itemRef: string
    motivation: string
  },
): Promise<{ id: number }> {
  const parsed = parsePackageItemRef(data.itemRef)
  if (!parsed) {
    throw validationError('Invalid itemRef', { itemRef: data.itemRef })
  }

  if (parsed.kind === 'library') {
    return createDeviation(db, {
      createdBy: data.createdBy,
      motivation: data.motivation,
      packageItemId: parsed.id,
    })
  }

  return createPackageLocalDeviation(db, {
    createdBy: data.createdBy,
    motivation: data.motivation,
    packageLocalRequirementId: parsed.id,
  })
}

export async function getPackageLocalDeviation(
  db: Database,
  deviationId: number,
): Promise<DeviationRow> {
  const rows = await db
    .select({
      createdAt: packageLocalRequirementDeviations.createdAt,
      createdBy: packageLocalRequirementDeviations.createdBy,
      decidedAt: packageLocalRequirementDeviations.decidedAt,
      decidedBy: packageLocalRequirementDeviations.decidedBy,
      decision: packageLocalRequirementDeviations.decision,
      decisionMotivation: packageLocalRequirementDeviations.decisionMotivation,
      id: packageLocalRequirementDeviations.id,
      isReviewRequested: packageLocalRequirementDeviations.isReviewRequested,
      motivation: packageLocalRequirementDeviations.motivation,
      packageItemId: sql<number | null>`NULL`.as('package_item_id'),
      packageLocalRequirementId: packageLocalRequirements.id,
      packageName: requirementPackages.name,
      packageUniqueId: requirementPackages.uniqueId,
      requirementDescription: packageLocalRequirements.description,
      requirementUniqueId: packageLocalRequirements.uniqueId,
      requirementVersionId: sql<number | null>`NULL`.as(
        'requirement_version_id',
      ),
      updatedAt: packageLocalRequirementDeviations.updatedAt,
    })
    .from(packageLocalRequirementDeviations)
    .innerJoin(
      packageLocalRequirements,
      eq(
        packageLocalRequirementDeviations.packageLocalRequirementId,
        packageLocalRequirements.id,
      ),
    )
    .innerJoin(
      requirementPackages,
      eq(packageLocalRequirements.packageId, requirementPackages.id),
    )
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
    .limit(1)

  if (rows.length === 0) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  return {
    ...rows[0],
    isPackageLocal: true,
    itemRef: createPackageLocalItemRef(rows[0].packageLocalRequirementId),
  }
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

export async function updatePackageLocalDeviation(
  db: Database,
  deviationId: number,
  data: { motivation?: string },
): Promise<void> {
  const existing = await db
    .select({
      decision: packageLocalRequirementDeviations.decision,
      id: packageLocalRequirementDeviations.id,
    })
    .from(packageLocalRequirementDeviations)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
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

  await db
    .update(packageLocalRequirementDeviations)
    .set(updates)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
}

export async function recordPackageLocalDecision(
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
      decision: packageLocalRequirementDeviations.decision,
      id: packageLocalRequirementDeviations.id,
    })
    .from(packageLocalRequirementDeviations)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError(
      'A decision has already been recorded for this deviation',
    )
  }

  const now = new Date().toISOString()
  await db
    .update(packageLocalRequirementDeviations)
    .set({
      decision: data.decision,
      decisionMotivation: data.decisionMotivation.trim(),
      decidedAt: now,
      decidedBy: data.decidedBy.trim(),
      updatedAt: now,
    })
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
}

export async function deletePackageLocalDeviation(
  db: Database,
  deviationId: number,
): Promise<void> {
  const existing = await db
    .select({
      decision: packageLocalRequirementDeviations.decision,
      id: packageLocalRequirementDeviations.id,
    })
    .from(packageLocalRequirementDeviations)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError(
      'Cannot delete a deviation after a decision has been recorded',
    )
  }

  await db
    .delete(packageLocalRequirementDeviations)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
}

export async function countDeviationsByPackage(
  db: Database,
  packageId: number,
): Promise<DeviationCounts> {
  const [libraryRows, packageLocalRows] = await Promise.all([
    db
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
      .where(eq(requirementPackageItems.packageId, packageId)),
    db
      .select({
        total: sql<number>`COUNT(*)`.as('total'),
        pending:
          sql<number>`SUM(CASE WHEN ${packageLocalRequirementDeviations.decision} IS NULL THEN 1 ELSE 0 END)`.as(
            'pending',
          ),
        approved:
          sql<number>`SUM(CASE WHEN ${packageLocalRequirementDeviations.decision} = ${DEVIATION_APPROVED} THEN 1 ELSE 0 END)`.as(
            'approved',
          ),
        rejected:
          sql<number>`SUM(CASE WHEN ${packageLocalRequirementDeviations.decision} = ${DEVIATION_REJECTED} THEN 1 ELSE 0 END)`.as(
            'rejected',
          ),
      })
      .from(packageLocalRequirementDeviations)
      .innerJoin(
        packageLocalRequirements,
        eq(
          packageLocalRequirementDeviations.packageLocalRequirementId,
          packageLocalRequirements.id,
        ),
      )
      .where(eq(packageLocalRequirements.packageId, packageId)),
  ])

  const rows = [libraryRows[0], packageLocalRows[0]].filter(Boolean)
  if (rows.length === 0) {
    return { total: 0, pending: 0, approved: 0, rejected: 0 }
  }

  return {
    total: rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0),
    pending: rows.reduce((sum, row) => sum + (Number(row.pending) || 0), 0),
    approved: rows.reduce((sum, row) => sum + (Number(row.approved) || 0), 0),
    rejected: rows.reduce((sum, row) => sum + (Number(row.rejected) || 0), 0),
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

export async function countDeviationsPerItemRef(
  db: Database,
  packageId: number,
): Promise<Map<string, { total: number; pending: number; approved: number }>> {
  const [libraryRows, packageLocalRows] = await Promise.all([
    db
      .select({
        approved:
          sql<number>`SUM(CASE WHEN ${deviations.decision} = ${DEVIATION_APPROVED} THEN 1 ELSE 0 END)`.as(
            'approved',
          ),
        packageItemId: deviations.packageItemId,
        pending:
          sql<number>`SUM(CASE WHEN ${deviations.decision} IS NULL THEN 1 ELSE 0 END)`.as(
            'pending',
          ),
        total: sql<number>`COUNT(*)`.as('total'),
      })
      .from(deviations)
      .innerJoin(
        requirementPackageItems,
        eq(deviations.packageItemId, requirementPackageItems.id),
      )
      .where(eq(requirementPackageItems.packageId, packageId))
      .groupBy(deviations.packageItemId),
    db
      .select({
        approved:
          sql<number>`SUM(CASE WHEN ${packageLocalRequirementDeviations.decision} = ${DEVIATION_APPROVED} THEN 1 ELSE 0 END)`.as(
            'approved',
          ),
        packageLocalRequirementId:
          packageLocalRequirementDeviations.packageLocalRequirementId,
        pending:
          sql<number>`SUM(CASE WHEN ${packageLocalRequirementDeviations.decision} IS NULL THEN 1 ELSE 0 END)`.as(
            'pending',
          ),
        total: sql<number>`COUNT(*)`.as('total'),
      })
      .from(packageLocalRequirementDeviations)
      .innerJoin(
        packageLocalRequirements,
        eq(
          packageLocalRequirementDeviations.packageLocalRequirementId,
          packageLocalRequirements.id,
        ),
      )
      .where(eq(packageLocalRequirements.packageId, packageId))
      .groupBy(packageLocalRequirementDeviations.packageLocalRequirementId),
  ])

  const map = new Map<
    string,
    { total: number; pending: number; approved: number }
  >()

  for (const row of libraryRows) {
    map.set(createLibraryItemRef(row.packageItemId), {
      approved: Number(row.approved) || 0,
      pending: Number(row.pending) || 0,
      total: Number(row.total) || 0,
    })
  }

  for (const row of packageLocalRows) {
    map.set(createPackageLocalItemRef(row.packageLocalRequirementId), {
      approved: Number(row.approved) || 0,
      pending: Number(row.pending) || 0,
      total: Number(row.total) || 0,
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

export async function requestPackageLocalReview(
  db: Database,
  deviationId: number,
): Promise<void> {
  const existing = await db
    .select({
      decision: packageLocalRequirementDeviations.decision,
      id: packageLocalRequirementDeviations.id,
      isReviewRequested: packageLocalRequirementDeviations.isReviewRequested,
    })
    .from(packageLocalRequirementDeviations)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
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
    .update(packageLocalRequirementDeviations)
    .set({
      isReviewRequested: 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
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

export async function revertPackageLocalToDraft(
  db: Database,
  deviationId: number,
): Promise<void> {
  const existing = await db
    .select({
      decision: packageLocalRequirementDeviations.decision,
      id: packageLocalRequirementDeviations.id,
      isReviewRequested: packageLocalRequirementDeviations.isReviewRequested,
    })
    .from(packageLocalRequirementDeviations)
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
    .limit(1)

  if (existing.length === 0) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  if (existing[0].decision !== null) {
    throw conflictError('Cannot revert a deviation that already has a decision')
  }

  if (existing[0].isReviewRequested === 0) {
    throw conflictError('Deviation is already in draft state')
  }

  await db
    .update(packageLocalRequirementDeviations)
    .set({
      isReviewRequested: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(packageLocalRequirementDeviations.id, deviationId))
}
