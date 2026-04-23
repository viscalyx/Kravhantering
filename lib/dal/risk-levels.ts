import type { SqlServerDatabase } from '@/lib/db'
import { type RiskLevelEntity, riskLevelEntity } from '@/lib/typeorm/entities'

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

function map(row: RiskLevelEntity): RiskLevelRow {
  return {
    color: row.color,
    id: row.id,
    nameEn: row.nameEn,
    nameSv: row.nameSv,
    sortOrder: row.sortOrder,
  }
}

export async function listRiskLevels(
  db: SqlServerDatabase,
): Promise<RiskLevelRow[]> {
  const rows = await db
    .getRepository(riskLevelEntity)
    .find({ order: { sortOrder: 'ASC' } })
  return rows.map(map)
}

export async function getRiskLevelById(
  db: SqlServerDatabase,
  id: number,
): Promise<RiskLevelRow | null> {
  const row = await db.getRepository(riskLevelEntity).findOne({ where: { id } })
  return row ? map(row) : null
}

export async function countLinkedRequirements(
  db: SqlServerDatabase,
): Promise<Record<number, number>> {
  const rows = await db.query(`
    SELECT
      risk_level_id AS riskLevelId,
      COUNT(DISTINCT requirement_id) AS count
    FROM requirement_versions
    WHERE risk_level_id IS NOT NULL
    GROUP BY risk_level_id
  `)
  const counts: Record<number, number> = {}
  for (const row of rows as Array<{
    count: number
    riskLevelId: number | null
  }>) {
    if (row.riskLevelId != null) {
      counts[row.riskLevelId] = row.count
    }
  }
  return counts
}

export async function getLinkedRequirements(
  db: SqlServerDatabase,
  riskLevelId: number,
): Promise<LinkedRequirementRow[]> {
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

export async function createRiskLevel(
  db: SqlServerDatabase,
  data: {
    nameSv: string
    nameEn: string
    color: string
    sortOrder?: number
  },
): Promise<RiskLevelRow> {
  const repository = db.getRepository(riskLevelEntity)
  const row = await repository.save(
    repository.create({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      color: data.color,
      sortOrder: data.sortOrder ?? 0,
    }),
  )
  return map(row)
}

export async function updateRiskLevel(
  db: SqlServerDatabase,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    color?: string
    sortOrder?: number
  },
): Promise<RiskLevelRow | undefined> {
  const repository = db.getRepository(riskLevelEntity)
  const patch: Partial<RiskLevelEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (data.color !== undefined) patch.color = data.color
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deleteRiskLevel(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(riskLevelEntity).delete(id)
}
