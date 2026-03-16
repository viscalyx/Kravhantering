import { eq, sql } from 'drizzle-orm'
import {
  requirements,
  requirementVersions,
  requirementVersionUsageScenarios,
  usageScenarios,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listScenarios(db: Database) {
  return db.query.usageScenarios.findMany({
    orderBy: [usageScenarios.nameSv],
    with: {
      owner: true,
    },
  })
}

export async function countLinkedRequirements(db: Database) {
  const rows = await db
    .select({
      scenarioId: requirementVersionUsageScenarios.usageScenarioId,
      count:
        sql<number>`COUNT(DISTINCT ${requirementVersions.requirementId})`.as(
          'count',
        ),
    })
    .from(requirementVersionUsageScenarios)
    .innerJoin(
      requirementVersions,
      eq(
        requirementVersionUsageScenarios.requirementVersionId,
        requirementVersions.id,
      ),
    )
    .groupBy(requirementVersionUsageScenarios.usageScenarioId)
  const counts: Record<number, number> = {}
  for (const row of rows) {
    counts[row.scenarioId] = row.count
  }
  return counts
}

export async function getLinkedRequirements(db: Database, scenarioId: number) {
  const rows = await db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      description: requirementVersions.description,
      versionNumber: requirementVersions.versionNumber,
      statusId: requirementVersions.statusId,
      statusNameSv:
        sql<string>`(SELECT rs.name_sv FROM requirement_statuses rs WHERE rs.id = ${requirementVersions.statusId})`.as(
          'status_name_sv',
        ),
      statusNameEn:
        sql<string>`(SELECT rs.name_en FROM requirement_statuses rs WHERE rs.id = ${requirementVersions.statusId})`.as(
          'status_name_en',
        ),
      statusColor:
        sql<string>`(SELECT rs.color FROM requirement_statuses rs WHERE rs.id = ${requirementVersions.statusId})`.as(
          'status_color',
        ),
    })
    .from(requirementVersionUsageScenarios)
    .innerJoin(
      requirementVersions,
      eq(
        requirementVersionUsageScenarios.requirementVersionId,
        requirementVersions.id,
      ),
    )
    .innerJoin(
      requirements,
      eq(requirementVersions.requirementId, requirements.id),
    )
    .where(eq(requirementVersionUsageScenarios.usageScenarioId, scenarioId))
    .groupBy(requirements.id)
    .orderBy(requirements.uniqueId)
  return rows
}

export async function getScenarioById(db: Database, id: number) {
  return (
    (await db.query.usageScenarios.findFirst({
      where: eq(usageScenarios.id, id),
      with: {
        owner: true,
      },
    })) ?? null
  )
}

export async function createScenario(
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string
    descriptionEn?: string
    ownerId?: number
  },
) {
  const [scenario] = await db.insert(usageScenarios).values(data).returning()
  return scenario
}

export async function updateScenario(
  db: Database,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    descriptionSv?: string
    descriptionEn?: string
    ownerId?: number
  },
) {
  const [updated] = await db
    .update(usageScenarios)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(usageScenarios.id, id))
    .returning()
  return updated
}

export async function deleteScenario(db: Database, id: number) {
  await db.delete(usageScenarios).where(eq(usageScenarios.id, id))
}
