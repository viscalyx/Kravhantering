import {
  createLibraryItemRef,
  createPackageLocalItemRef,
  parsePackageItemRef,
} from '@/lib/dal/requirement-packages'
import type { SqlServerDatabase } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

export const DEVIATION_APPROVED = 1
export const DEVIATION_REJECTED = 2

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

function mapSqlServerDeviationRow(row: Record<string, unknown>): DeviationRow {
  const packageItemId = toOptionalNumber(row.packageItemId)
  const packageLocalRequirementId = toOptionalNumber(
    row.packageLocalRequirementId,
  )
  const isPackageLocal =
    toNumericFlag(row.isPackageLocal ?? row.isLocal ?? 0) === 1

  return {
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    createdBy: row.createdBy == null ? null : String(row.createdBy),
    decidedAt: toIsoString(row.decidedAt),
    decidedBy: row.decidedBy == null ? null : String(row.decidedBy),
    decision: toOptionalNumber(row.decision),
    decisionMotivation:
      row.decisionMotivation == null ? null : String(row.decisionMotivation),
    id: Number(row.id),
    isPackageLocal,
    isReviewRequested: toNumericFlag(row.isReviewRequested),
    itemRef: isPackageLocal
      ? createPackageLocalItemRef(packageLocalRequirementId as number)
      : createLibraryItemRef(packageItemId as number),
    motivation: String(row.motivation ?? ''),
    packageItemId,
    packageLocalRequirementId,
    packageName: row.packageName == null ? null : String(row.packageName),
    packageUniqueId:
      row.packageUniqueId == null ? null : String(row.packageUniqueId),
    requirementDescription:
      row.requirementDescription == null
        ? null
        : String(row.requirementDescription),
    requirementUniqueId:
      row.requirementUniqueId == null ? null : String(row.requirementUniqueId),
    requirementVersionId: toOptionalNumber(row.requirementVersionId),
    updatedAt: toIsoString(row.updatedAt),
  }
}

async function findSqlServerDeviationState(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<{
  decision: number | null
  id: number
  isReviewRequested: number
} | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        deviation.decision AS decision,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested
      FROM deviations deviation
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    return null
  }

  return {
    decision: toOptionalNumber(rows[0].decision),
    id: Number(rows[0].id),
    isReviewRequested: toNumericFlag(rows[0].isReviewRequested),
  }
}

async function findSqlServerPackageLocalDeviationState(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<{
  decision: number | null
  id: number
  isReviewRequested: number
} | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        deviation.decision AS decision,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested
      FROM package_local_requirement_deviations deviation
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    return null
  }

  return {
    decision: toOptionalNumber(rows[0].decision),
    id: Number(rows[0].id),
    isReviewRequested: toNumericFlag(rows[0].isReviewRequested),
  }
}

export async function listDeviationsForPackageItem(
  db: SqlServerDatabase,
  packageItemId: number,
): Promise<DeviationRow[]> {
  const rows = (await db.query(
    `
      SELECT
        deviation.id AS id,
        deviation.package_item_id AS packageItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        requirement.unique_id AS requirementUniqueId,
        requirement_version.description AS requirementDescription,
        package_item.requirement_version_id AS requirementVersionId,
        package_record.name AS packageName,
        package_record.unique_id AS packageUniqueId,
        CAST(0 AS int) AS isPackageLocal,
        CAST(NULL AS int) AS packageLocalRequirementId
      FROM deviations deviation
      INNER JOIN requirement_package_items package_item
        ON package_item.id = deviation.package_item_id
      INNER JOIN requirements requirement
        ON requirement.id = package_item.requirement_id
      INNER JOIN requirement_versions requirement_version
        ON requirement_version.id = package_item.requirement_version_id
      INNER JOIN requirement_packages package_record
        ON package_record.id = package_item.requirement_package_id
      WHERE deviation.package_item_id = @0
      ORDER BY deviation.created_at ASC, deviation.id ASC
    `,
    [packageItemId],
  )) as Array<Record<string, unknown>>

  return rows.map(mapSqlServerDeviationRow)
}

export async function listDeviationsForPackage(
  db: SqlServerDatabase,
  packageId: number,
): Promise<DeviationRow[]> {
  const rows = (await db.query(
    `
      SELECT
        deviation.id AS id,
        deviation.package_item_id AS packageItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        requirement.unique_id AS requirementUniqueId,
        requirement_version.description AS requirementDescription,
        package_item.requirement_version_id AS requirementVersionId,
        package_record.name AS packageName,
        package_record.unique_id AS packageUniqueId,
        CAST(0 AS int) AS isPackageLocal,
        CAST(NULL AS int) AS packageLocalRequirementId
      FROM deviations deviation
      INNER JOIN requirement_package_items package_item
        ON package_item.id = deviation.package_item_id
      INNER JOIN requirements requirement
        ON requirement.id = package_item.requirement_id
      INNER JOIN requirement_versions requirement_version
        ON requirement_version.id = package_item.requirement_version_id
      INNER JOIN requirement_packages package_record
        ON package_record.id = package_item.requirement_package_id
      WHERE package_item.requirement_package_id = @0

      UNION ALL

      SELECT
        deviation.id AS id,
        CAST(NULL AS int) AS packageItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        package_local_requirement.unique_id AS requirementUniqueId,
        package_local_requirement.description AS requirementDescription,
        CAST(NULL AS int) AS requirementVersionId,
        package_record.name AS packageName,
        package_record.unique_id AS packageUniqueId,
        CAST(1 AS int) AS isPackageLocal,
        package_local_requirement.id AS packageLocalRequirementId
      FROM package_local_requirement_deviations deviation
      INNER JOIN package_local_requirements package_local_requirement
        ON package_local_requirement.id = deviation.package_local_requirement_id
      INNER JOIN requirement_packages package_record
        ON package_record.id = package_local_requirement.package_id
      WHERE package_local_requirement.package_id = @0

      ORDER BY requirementUniqueId ASC, createdAt ASC, id ASC
    `,
    [packageId],
  )) as Array<Record<string, unknown>>

  return rows.map(mapSqlServerDeviationRow)
}

export async function getDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<DeviationRow> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        deviation.package_item_id AS packageItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        requirement.unique_id AS requirementUniqueId,
        requirement_version.description AS requirementDescription,
        package_item.requirement_version_id AS requirementVersionId,
        package_record.name AS packageName,
        package_record.unique_id AS packageUniqueId,
        CAST(0 AS int) AS isPackageLocal,
        CAST(NULL AS int) AS packageLocalRequirementId
      FROM deviations deviation
      INNER JOIN requirement_package_items package_item
        ON package_item.id = deviation.package_item_id
      INNER JOIN requirements requirement
        ON requirement.id = package_item.requirement_id
      INNER JOIN requirement_versions requirement_version
        ON requirement_version.id = package_item.requirement_version_id
      INNER JOIN requirement_packages package_record
        ON package_record.id = package_item.requirement_package_id
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  return mapSqlServerDeviationRow(rows[0])
}

export async function createDeviation(
  db: SqlServerDatabase,
  data: {
    packageItemId: number
    motivation: string
    createdBy?: string | null
  },
): Promise<{ id: number }> {
  if (!data.motivation.trim()) {
    throw validationError('Motivation is required')
  }

  const itemRows = (await db.query(
    `
      SELECT TOP (1) package_item.id AS id
      FROM requirement_package_items package_item
      WHERE package_item.id = @0
    `,
    [data.packageItemId],
  )) as Array<Record<string, unknown>>

  if (itemRows.length === 0) {
    throw notFoundError(`Package item ${data.packageItemId} not found`)
  }

  const now = new Date()
  const insertedRows = (await db.query(
    `
      INSERT INTO deviations (
        package_item_id,
        motivation,
        created_by,
        created_at
      )
      OUTPUT INSERTED.id AS id
      VALUES (@0, @1, @2, @3)
    `,
    [data.packageItemId, data.motivation.trim(), data.createdBy ?? null, now],
  )) as Array<Record<string, unknown>>

  return { id: Number(insertedRows[0]?.id) }
}

export async function listDeviationsForPackageLocalRequirement(
  db: SqlServerDatabase,
  packageLocalRequirementId: number,
): Promise<DeviationRow[]> {
  const rows = (await db.query(
    `
      SELECT
        deviation.id AS id,
        CAST(NULL AS int) AS packageItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        package_local_requirement.unique_id AS requirementUniqueId,
        package_local_requirement.description AS requirementDescription,
        CAST(NULL AS int) AS requirementVersionId,
        package_record.name AS packageName,
        package_record.unique_id AS packageUniqueId,
        CAST(1 AS int) AS isPackageLocal,
        package_local_requirement.id AS packageLocalRequirementId
      FROM package_local_requirement_deviations deviation
      INNER JOIN package_local_requirements package_local_requirement
        ON package_local_requirement.id = deviation.package_local_requirement_id
      INNER JOIN requirement_packages package_record
        ON package_record.id = package_local_requirement.package_id
      WHERE deviation.package_local_requirement_id = @0
      ORDER BY deviation.created_at ASC, deviation.id ASC
    `,
    [packageLocalRequirementId],
  )) as Array<Record<string, unknown>>

  return rows.map(mapSqlServerDeviationRow)
}

export async function createPackageLocalDeviation(
  db: SqlServerDatabase,
  data: {
    createdBy?: string | null
    motivation: string
    packageLocalRequirementId: number
  },
): Promise<{ id: number }> {
  if (!data.motivation.trim()) {
    throw validationError('Motivation is required')
  }

  const requirementRows = (await db.query(
    `
      SELECT TOP (1) requirement.id AS id
      FROM package_local_requirements requirement
      WHERE requirement.id = @0
    `,
    [data.packageLocalRequirementId],
  )) as Array<Record<string, unknown>>

  if (requirementRows.length === 0) {
    throw notFoundError(
      `Package-local requirement ${data.packageLocalRequirementId} not found`,
    )
  }

  const now = new Date()
  const insertedRows = (await db.query(
    `
      INSERT INTO package_local_requirement_deviations (
        package_local_requirement_id,
        motivation,
        created_by,
        created_at
      )
      OUTPUT INSERTED.id AS id
      VALUES (@0, @1, @2, @3)
    `,
    [
      data.packageLocalRequirementId,
      data.motivation.trim(),
      data.createdBy ?? null,
      now,
    ],
  )) as Array<Record<string, unknown>>

  return { id: Number(insertedRows[0]?.id) }
}

export async function createDeviationForItemRef(
  db: SqlServerDatabase,
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
  db: SqlServerDatabase,
  deviationId: number,
): Promise<DeviationRow> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        CAST(NULL AS int) AS packageItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        package_local_requirement.unique_id AS requirementUniqueId,
        package_local_requirement.description AS requirementDescription,
        CAST(NULL AS int) AS requirementVersionId,
        package_record.name AS packageName,
        package_record.unique_id AS packageUniqueId,
        CAST(1 AS int) AS isPackageLocal,
        package_local_requirement.id AS packageLocalRequirementId
      FROM package_local_requirement_deviations deviation
      INNER JOIN package_local_requirements package_local_requirement
        ON package_local_requirement.id = deviation.package_local_requirement_id
      INNER JOIN requirement_packages package_record
        ON package_record.id = package_local_requirement.package_id
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  return mapSqlServerDeviationRow(rows[0])
}

export async function updateDeviation(
  db: SqlServerDatabase,
  deviationId: number,
  data: { motivation?: string; createdBy?: string | null },
): Promise<void> {
  const existing = await findSqlServerDeviationState(db, deviationId)

  if (!existing) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'Cannot edit a deviation after a decision has been recorded',
    )
  }

  if (existing.isReviewRequested === 1) {
    throw conflictError(
      'Cannot edit a deviation that has been submitted for review',
    )
  }

  const now = new Date()
  if (data.motivation !== undefined) {
    if (!data.motivation.trim()) {
      throw validationError('Motivation is required')
    }

    if (data.createdBy !== undefined) {
      await db.query(
        `
          UPDATE deviations
          SET
            motivation = @0,
            created_by = @1,
            updated_at = @2
          WHERE id = @3
        `,
        [data.motivation.trim(), data.createdBy, now, deviationId],
      )
    } else {
      await db.query(
        `
          UPDATE deviations
          SET
            motivation = @0,
            updated_at = @1
          WHERE id = @2
        `,
        [data.motivation.trim(), now, deviationId],
      )
    }
    return
  }

  if (data.createdBy !== undefined) {
    await db.query(
      `
        UPDATE deviations
        SET
          created_by = @0,
          updated_at = @1
        WHERE id = @2
      `,
      [data.createdBy, now, deviationId],
    )
    return
  }

  await db.query(
    `
      UPDATE deviations
      SET updated_at = @0
      WHERE id = @1
    `,
    [now, deviationId],
  )
  return
}

export async function recordDecision(
  db: SqlServerDatabase,
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

  const existing = await findSqlServerDeviationState(db, deviationId)

  if (!existing) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'A decision has already been recorded for this deviation',
    )
  }

  if (existing.isReviewRequested !== 1) {
    throw conflictError(
      'Can only approve or reject deviations that have been submitted for review',
    )
  }

  const now = new Date()
  await db.query(
    `
      UPDATE deviations
      SET
        decision = @0,
        decision_motivation = @1,
        decided_by = @2,
        decided_at = @3,
        updated_at = @3
      WHERE id = @4
    `,
    [
      data.decision,
      data.decisionMotivation.trim(),
      data.decidedBy.trim(),
      now,
      deviationId,
    ],
  )
  return
}

export async function deleteDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const existing = await findSqlServerDeviationState(db, deviationId)

  if (!existing) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'Cannot delete a deviation after a decision has been recorded',
    )
  }

  if (existing.isReviewRequested === 1) {
    throw conflictError(
      'Cannot delete a deviation that has been submitted for review',
    )
  }

  await db.query(`DELETE FROM deviations WHERE id = @0`, [deviationId])
  return
}

export async function updatePackageLocalDeviation(
  db: SqlServerDatabase,
  deviationId: number,
  data: { motivation?: string; createdBy?: string | null },
): Promise<void> {
  const existing = await findSqlServerPackageLocalDeviationState(
    db,
    deviationId,
  )

  if (!existing) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'Cannot edit a deviation after a decision has been recorded',
    )
  }

  if (existing.isReviewRequested === 1) {
    throw conflictError(
      'Cannot edit a deviation that has been submitted for review',
    )
  }

  const now = new Date()
  if (data.motivation !== undefined) {
    if (!data.motivation.trim()) {
      throw validationError('Motivation is required')
    }

    if (data.createdBy !== undefined) {
      await db.query(
        `
          UPDATE package_local_requirement_deviations
          SET
            motivation = @0,
            created_by = @1,
            updated_at = @2
          WHERE id = @3
        `,
        [data.motivation.trim(), data.createdBy, now, deviationId],
      )
    } else {
      await db.query(
        `
          UPDATE package_local_requirement_deviations
          SET
            motivation = @0,
            updated_at = @1
          WHERE id = @2
        `,
        [data.motivation.trim(), now, deviationId],
      )
    }
    return
  }

  if (data.createdBy !== undefined) {
    await db.query(
      `
        UPDATE package_local_requirement_deviations
        SET
          created_by = @0,
          updated_at = @1
        WHERE id = @2
      `,
      [data.createdBy, now, deviationId],
    )
    return
  }

  await db.query(
    `
      UPDATE package_local_requirement_deviations
      SET updated_at = @0
      WHERE id = @1
    `,
    [now, deviationId],
  )
  return
}

export async function recordPackageLocalDecision(
  db: SqlServerDatabase,
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

  const existing = await findSqlServerPackageLocalDeviationState(
    db,
    deviationId,
  )

  if (!existing) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'A decision has already been recorded for this deviation',
    )
  }

  if (existing.isReviewRequested !== 1) {
    throw conflictError(
      'Can only approve or reject deviations that have been submitted for review',
    )
  }

  const now = new Date()
  await db.query(
    `
      UPDATE package_local_requirement_deviations
      SET
        decision = @0,
        decision_motivation = @1,
        decided_by = @2,
        decided_at = @3,
        updated_at = @3
      WHERE id = @4
    `,
    [
      data.decision,
      data.decisionMotivation.trim(),
      data.decidedBy.trim(),
      now,
      deviationId,
    ],
  )
  return
}

export async function deletePackageLocalDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const existing = await findSqlServerPackageLocalDeviationState(
    db,
    deviationId,
  )

  if (!existing) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'Cannot delete a deviation after a decision has been recorded',
    )
  }

  if (existing.isReviewRequested === 1) {
    throw conflictError(
      'Cannot delete a deviation that has been submitted for review',
    )
  }

  await db.query(
    `DELETE FROM package_local_requirement_deviations WHERE id = @0`,
    [deviationId],
  )
  return
}

export async function countDeviationsByPackage(
  db: SqlServerDatabase,
  packageId: number,
): Promise<DeviationCounts> {
  const rows = (await db.query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN deviation.decision = @2 THEN 1 ELSE 0 END) AS rejected
      FROM deviations deviation
      INNER JOIN requirement_package_items package_item
        ON package_item.id = deviation.package_item_id
      WHERE package_item.requirement_package_id = @0

      UNION ALL

      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN deviation.decision = @2 THEN 1 ELSE 0 END) AS rejected
      FROM package_local_requirement_deviations deviation
      INNER JOIN package_local_requirements package_local_requirement
        ON package_local_requirement.id = deviation.package_local_requirement_id
      WHERE package_local_requirement.package_id = @0
    `,
    [packageId, DEVIATION_APPROVED, DEVIATION_REJECTED],
  )) as Array<Record<string, unknown>>

  return {
    total: rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0),
    pending: rows.reduce((sum, row) => sum + (Number(row.pending) || 0), 0),
    approved: rows.reduce((sum, row) => sum + (Number(row.approved) || 0), 0),
    rejected: rows.reduce((sum, row) => sum + (Number(row.rejected) || 0), 0),
  }
}

export async function countDeviationsPerItem(
  db: SqlServerDatabase,
  packageId: number,
): Promise<Map<number, { total: number; pending: number; approved: number }>> {
  const rows = (await db.query(
    `
      SELECT
        deviation.package_item_id AS packageItemId,
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved
      FROM deviations deviation
      INNER JOIN requirement_package_items package_item
        ON package_item.id = deviation.package_item_id
      WHERE package_item.requirement_package_id = @0
      GROUP BY deviation.package_item_id
    `,
    [packageId, DEVIATION_APPROVED],
  )) as Array<Record<string, unknown>>

  const map = new Map<
    number,
    { total: number; pending: number; approved: number }
  >()
  for (const row of rows) {
    map.set(Number(row.packageItemId), {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
    })
  }
  return map
}

export async function countDeviationsPerItemRef(
  db: SqlServerDatabase,
  packageId: number,
): Promise<Map<string, { total: number; pending: number; approved: number }>> {
  const rows = (await db.query(
    `
      SELECT
        deviation.package_item_id AS itemId,
        CAST(0 AS int) AS isPackageLocal,
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved
      FROM deviations deviation
      INNER JOIN requirement_package_items package_item
        ON package_item.id = deviation.package_item_id
      WHERE package_item.requirement_package_id = @0
      GROUP BY deviation.package_item_id

      UNION ALL

      SELECT
        deviation.package_local_requirement_id AS itemId,
        CAST(1 AS int) AS isPackageLocal,
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved
      FROM package_local_requirement_deviations deviation
      INNER JOIN package_local_requirements package_local_requirement
        ON package_local_requirement.id = deviation.package_local_requirement_id
      WHERE package_local_requirement.package_id = @0
      GROUP BY deviation.package_local_requirement_id
    `,
    [packageId, DEVIATION_APPROVED],
  )) as Array<Record<string, unknown>>

  const map = new Map<
    string,
    { total: number; pending: number; approved: number }
  >()

  for (const row of rows) {
    const key =
      toNumericFlag(row.isPackageLocal) === 1
        ? createPackageLocalItemRef(Number(row.itemId))
        : createLibraryItemRef(Number(row.itemId))
    map.set(key, {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
    })
  }

  return map
}

export async function requestReview(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const now = new Date()
  const updatedRows = (await db.query(
    `
      UPDATE deviations
      SET
        is_review_requested = 1,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 0
    `,
    [now, deviationId],
  )) as Array<Record<string, unknown>>

  if (updatedRows[0]) {
    return
  }

  const row = await findSqlServerDeviationState(db, deviationId)
  if (!row) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }
  if (row.decision !== null) {
    throw conflictError(
      'Cannot request review for a deviation that already has a decision',
    )
  }
  throw conflictError('Review has already been requested for this deviation')
}

export async function requestPackageLocalReview(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const now = new Date()
  const updatedRows = (await db.query(
    `
      UPDATE package_local_requirement_deviations
      SET
        is_review_requested = 1,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 0
    `,
    [now, deviationId],
  )) as Array<Record<string, unknown>>

  if (updatedRows[0]) {
    return
  }

  const row = await findSqlServerPackageLocalDeviationState(db, deviationId)
  if (!row) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }
  if (row.decision !== null) {
    throw conflictError(
      'Cannot request review for a deviation that already has a decision',
    )
  }
  throw conflictError('Review has already been requested for this deviation')
}

export async function revertToDraft(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const now = new Date()
  const updatedRows = (await db.query(
    `
      UPDATE deviations
      SET
        is_review_requested = 0,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 1
    `,
    [now, deviationId],
  )) as Array<Record<string, unknown>>

  if (updatedRows[0]) {
    return
  }

  const row = await findSqlServerDeviationState(db, deviationId)
  if (!row) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }
  if (row.decision !== null) {
    throw conflictError('Cannot revert a deviation that already has a decision')
  }
  throw conflictError('Deviation is already in draft state')
}

export async function revertPackageLocalToDraft(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const now = new Date()
  const updatedRows = (await db.query(
    `
      UPDATE package_local_requirement_deviations
      SET
        is_review_requested = 0,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 1
    `,
    [now, deviationId],
  )) as Array<Record<string, unknown>>

  if (updatedRows[0]) {
    return
  }

  const row = await findSqlServerPackageLocalDeviationState(db, deviationId)
  if (!row) {
    throw notFoundError(`Package-local deviation ${deviationId} not found`)
  }
  if (row.decision !== null) {
    throw conflictError('Cannot revert a deviation that already has a decision')
  }
  throw conflictError('Deviation is already in draft state')
}
