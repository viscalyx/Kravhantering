import { eq } from 'drizzle-orm'
import { requirementAreas } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listAreas(db: Database) {
  return db.query.requirementAreas.findMany({
    orderBy: [requirementAreas.name],
  })
}

export async function getAreaById(db: Database, id: number) {
  return (
    db.query.requirementAreas.findFirst({
      where: eq(requirementAreas.id, id),
    }) ?? null
  )
}

export async function createArea(
  db: Database,
  data: {
    prefix: string
    name: string
    description?: string
    ownerId?: string
  },
) {
  const [area] = await db
    .insert(requirementAreas)
    .values({
      prefix: data.prefix,
      name: data.name,
      description: data.description,
      ownerId: data.ownerId,
    })
    .returning()

  return area
}

export async function updateArea(
  db: Database,
  id: number,
  data: {
    name?: string
    description?: string
    ownerId?: string
  },
) {
  const [updated] = await db
    .update(requirementAreas)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(requirementAreas.id, id))
    .returning()

  return updated
}

export async function deleteArea(db: Database, id: number) {
  await db.delete(requirementAreas).where(eq(requirementAreas.id, id))
}
