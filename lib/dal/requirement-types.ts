import { eq } from 'drizzle-orm'
import { requirementTypeCategories, requirementTypes } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listTypes(db: Database) {
  return db.query.requirementTypes.findMany({
    orderBy: [requirementTypes.nameSv],
    with: {
      typeCategories: {
        orderBy: [requirementTypeCategories.nameSv],
      },
    },
  })
}

export async function listTypeCategories(db: Database, typeId?: number) {
  if (typeId != null) {
    return db.query.requirementTypeCategories.findMany({
      where: eq(requirementTypeCategories.requirementTypeId, typeId),
      orderBy: [requirementTypeCategories.nameSv],
    })
  }

  return db.query.requirementTypeCategories.findMany({
    orderBy: [requirementTypeCategories.nameSv],
  })
}

export async function createType(
  db: Database,
  data: { nameSv: string; nameEn: string },
) {
  const [type] = await db.insert(requirementTypes).values(data).returning()
  return type
}

export async function updateType(
  db: Database,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  const [updated] = await db
    .update(requirementTypes)
    .set(data)
    .where(eq(requirementTypes.id, id))
    .returning()
  return updated
}

export async function deleteType(db: Database, id: number) {
  await db.delete(requirementTypes).where(eq(requirementTypes.id, id))
}
