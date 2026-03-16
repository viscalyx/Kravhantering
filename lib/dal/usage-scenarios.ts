import { eq, sql } from 'drizzle-orm'
import {
  requirementStatuses,
  requirements,
  requirementVersions,
  requirementVersionUsageScenarios,
  usageScenarios,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'

interface ScenarioOwner {
  email: string
  firstName: string
  id: number
  lastName: string
}

interface ScenarioRow {
  createdAt: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  ownerId: number | null
  updatedAt: string
}

interface ScenarioWithOwner extends ScenarioRow {
  owner: ScenarioOwner | null
}

interface LinkedRequirementRow {
  description: string | null
  id: number
  statusColor: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

export type { LinkedRequirementRow, ScenarioRow, ScenarioWithOwner }

export async function listScenarios(
  db: Database,
): Promise<ScenarioWithOwner[]> {
  return db.query.usageScenarios.findMany({
    orderBy: [usageScenarios.nameSv],
    with: {
      owner: true,
    },
  })
}

export async function countLinkedRequirements(
  db: Database,
): Promise<Record<number, number>> {
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

export async function getLinkedRequirements(
  db: Database,
  scenarioId: number,
): Promise<LinkedRequirementRow[]> {
  const rows = await db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      description: requirementVersions.description,
      versionNumber: requirementVersions.versionNumber,
      statusId: requirementVersions.statusId,
      statusNameSv: requirementStatuses.nameSv,
      statusNameEn: requirementStatuses.nameEn,
      statusColor: requirementStatuses.color,
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
    .leftJoin(
      requirementStatuses,
      eq(requirementVersions.statusId, requirementStatuses.id),
    )
    .where(eq(requirementVersionUsageScenarios.usageScenarioId, scenarioId))
    .orderBy(requirements.uniqueId)
  return rows
}

export async function getScenarioById(
  db: Database,
  id: number,
): Promise<ScenarioWithOwner | null> {
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
    ownerId?: number | null
  },
): Promise<ScenarioRow> {
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
    ownerId?: number | null
  },
): Promise<ScenarioRow | undefined> {
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

export async function deleteScenario(db: Database, id: number): Promise<void> {
  await db.delete(usageScenarios).where(eq(usageScenarios.id, id))
}
