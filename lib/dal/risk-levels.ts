import { eq, sql } from 'drizzle-orm'
import {
  requirementStatuses,
  requirements,
  requirementVersions,
  riskLevels,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'

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

export async function listRiskLevels(db: Database): Promise<RiskLevelRow[]> {
  return db.query.riskLevels.findMany({
    orderBy: [riskLevels.sortOrder],
  })
}

export async function getRiskLevelById(
  db: Database,
  id: number,
): Promise<RiskLevelRow | null> {
  return (
    (await db.query.riskLevels.findFirst({
      where: eq(riskLevels.id, id),
    })) ?? null
  )
}

export async function countLinkedRequirements(
  db: Database,
): Promise<Record<number, number>> {
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
  db: Database,
  riskLevelId: number,
): Promise<LinkedRequirementRow[]> {
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
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    color: string
    sortOrder?: number
  },
): Promise<RiskLevelRow> {
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
  db: Database,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    color?: string
    sortOrder?: number
  },
): Promise<RiskLevelRow | undefined> {
  const [updated] = await db
    .update(riskLevels)
    .set(data)
    .where(eq(riskLevels.id, id))
    .returning()
  return updated
}

export async function deleteRiskLevel(db: Database, id: number): Promise<void> {
  await db.delete(riskLevels).where(eq(riskLevels.id, id))
}
