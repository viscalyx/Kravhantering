import { eq } from 'drizzle-orm'
import { requirementScenarios } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listScenarios(db: Database) {
  return db.query.requirementScenarios.findMany({
    orderBy: [requirementScenarios.nameSv],
  })
}

export async function getScenarioById(db: Database, id: number) {
  return (
    db.query.requirementScenarios.findFirst({
      where: eq(requirementScenarios.id, id),
    }) ?? null
  )
}

export async function createScenario(
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string
    descriptionEn?: string
    owner?: string
  },
) {
  const [scenario] = await db
    .insert(requirementScenarios)
    .values(data)
    .returning()
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
    owner?: string
  },
) {
  const [updated] = await db
    .update(requirementScenarios)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(requirementScenarios.id, id))
    .returning()
  return updated
}

export async function deleteScenario(db: Database, id: number) {
  await db.delete(requirementScenarios).where(eq(requirementScenarios.id, id))
}
