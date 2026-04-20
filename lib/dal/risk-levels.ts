import { eq, sql } from 'drizzle-orm'
import {
  requirementStatuses,
  requirements,
  requirementVersions,
  riskLevels,
} from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'

export interface RiskLevelRow {
  color: string
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface LinkedRequirementRow {
  description: string | null
  id: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

export type { LinkedRequirementRow }

export async function listRiskLevels(
  db: AppDatabaseConnection,
): Promise<RiskLevelRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn,
        sort_order AS sortOrder,
        color
      FROM risk_levels
      ORDER BY sort_order ASC
    `)
  }

  return db.query.riskLevels.findMany({
    orderBy: [riskLevels.sortOrder],
  })
}

export async function getRiskLevelById(
  db: AppDatabaseConnection,
  id: number,
): Promise<RiskLevelRow | null> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        SELECT
          id,
          name_sv AS nameSv,
          name_en AS nameEn,
          sort_order AS sortOrder,
          color
        FROM risk_levels
        WHERE id = @0
      `,
      [id],
    )
    return rows[0] ?? null
  }

  return (
    (await db.query.riskLevels.findFirst({
      where: eq(riskLevels.id, id),
    })) ?? null
  )
}

export async function countLinkedRequirements(
  db: AppDatabaseConnection,
): Promise<Record<number, number>> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(`
      SELECT
        risk_level_id AS riskLevelId,
        COUNT(DISTINCT requirement_id) AS count
      FROM requirement_versions
      WHERE risk_level_id IS NOT NULL
      GROUP BY risk_level_id
    `)
    const counts: Record<number, number> = {}
    for (const row of rows as Array<{ count: number; riskLevelId: number | null }>) {
      if (row.riskLevelId != null) {
        counts[row.riskLevelId] = row.count
      }
    }
    return counts
  }

  const rows = await db
    .select({
      riskLevelId: requirementVersions.riskLevelId,
      count:
        sql<number>`COUNT(DISTINCT ${requirementVersions.requirementId})`.as(
          'count',
        ),
    })
    .from(requirementVersions)
    .where(sql`${requirementVersions.riskLevelId} IS NOT NULL`)
    .groupBy(requirementVersions.riskLevelId)
  const counts: Record<number, number> = {}
  for (const row of rows) {
    if (row.riskLevelId != null) {
      counts[row.riskLevelId] = row.count
    }
  }
  return counts
}

export async function getLinkedRequirements(
  db: AppDatabaseConnection,
  riskLevelId: number,
): Promise<LinkedRequirementRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(
      `
        SELECT
          requirements.id AS id,
          requirements.unique_id AS uniqueId,
          requirement_versions.description AS description,
          requirement_versions.version_number AS versionNumber,
          requirement_statuses.name_sv AS statusNameSv,
          requirement_statuses.name_en AS statusNameEn,
          requirement_statuses.color AS statusColor
        FROM requirement_versions
        INNER JOIN requirements
          ON requirement_versions.requirement_id = requirements.id
        LEFT JOIN requirement_statuses
          ON requirement_versions.requirement_status_id = requirement_statuses.id
        WHERE requirement_versions.risk_level_id = @0
        ORDER BY requirements.unique_id ASC
      `,
      [riskLevelId],
    )
  }

  const rows = await db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      description: requirementVersions.description,
      versionNumber: requirementVersions.versionNumber,
      statusNameSv: requirementStatuses.nameSv,
      statusNameEn: requirementStatuses.nameEn,
      statusColor: requirementStatuses.color,
    })
    .from(requirementVersions)
    .innerJoin(
      requirements,
      eq(requirementVersions.requirementId, requirements.id),
    )
    .leftJoin(
      requirementStatuses,
      eq(requirementVersions.statusId, requirementStatuses.id),
    )
    .where(eq(requirementVersions.riskLevelId, riskLevelId))
    .orderBy(requirements.uniqueId)
  return rows
}

export async function createRiskLevel(
  db: AppDatabaseConnection,
  data: {
    nameSv: string
    nameEn: string
    color: string
    sortOrder?: number
  },
): Promise<RiskLevelRow> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO risk_levels (name_sv, name_en, color, sort_order)
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn,
          inserted.color AS color,
          inserted.sort_order AS sortOrder
        VALUES (@0, @1, @2, @3)
      `,
      [data.nameSv, data.nameEn, data.color, data.sortOrder ?? 0],
    )
    return rows[0]
  }

  const [row] = await db
    .insert(riskLevels)
    .values({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      color: data.color,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning()
  return row
}

export async function updateRiskLevel(
  db: AppDatabaseConnection,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    color?: string
    sortOrder?: number
  },
): Promise<RiskLevelRow | undefined> {
  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (data.nameSv !== undefined) {
      params.push(data.nameSv)
      sets.push(`name_sv = @${params.length - 1}`)
    }

    if (data.nameEn !== undefined) {
      params.push(data.nameEn)
      sets.push(`name_en = @${params.length - 1}`)
    }

    if (data.color !== undefined) {
      params.push(data.color)
      sets.push(`color = @${params.length - 1}`)
    }

    if (data.sortOrder !== undefined) {
      params.push(data.sortOrder)
      sets.push(`sort_order = @${params.length - 1}`)
    }

    if (sets.length === 0) {
      return (await getRiskLevelById(db, id)) ?? undefined
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE risk_levels
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn,
          inserted.color AS color,
          inserted.sort_order AS sortOrder
        WHERE id = @${params.length - 1}
      `,
      params,
    )
    return rows[0]
  }

  const [updated] = await db
    .update(riskLevels)
    .set(data)
    .where(eq(riskLevels.id, id))
    .returning()
  return updated
}

export async function deleteRiskLevel(
  db: AppDatabaseConnection,
  id: number,
): Promise<void> {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM risk_levels WHERE id = @0`, [id])
    return
  }

  await db.delete(riskLevels).where(eq(riskLevels.id, id))
}
