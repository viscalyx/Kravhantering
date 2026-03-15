import { eq } from 'drizzle-orm'
import { qualityCharacteristics, requirementTypes } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listTypes(db: Database) {
  return db.query.requirementTypes.findMany({
    orderBy: [requirementTypes.nameSv],
    with: {
      qualityCharacteristics: {
        orderBy: [qualityCharacteristics.nameSv],
      },
    },
  })
}

export async function listQualityCharacteristics(
  db: Database,
  typeId?: number,
) {
  if (typeId != null) {
    return db.query.qualityCharacteristics.findMany({
      where: eq(qualityCharacteristics.requirementTypeId, typeId),
      orderBy: [qualityCharacteristics.nameSv],
    })
  }

  return db.query.qualityCharacteristics.findMany({
    orderBy: [qualityCharacteristics.nameSv],
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

export async function createQualityCharacteristic(
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    requirementTypeId: number
    parentId?: number | null
  },
) {
  const [category] = await db
    .insert(qualityCharacteristics)
    .values({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      requirementTypeId: data.requirementTypeId,
      parentId: data.parentId ?? null,
    })
    .returning()
  return category
}

export async function updateQualityCharacteristic(
  db: Database,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    requirementTypeId?: number
    parentId?: number | null
  },
) {
  const rows = await db
    .update(qualityCharacteristics)
    .set(data)
    .where(eq(qualityCharacteristics.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteQualityCharacteristic(db: Database, id: number) {
  const deleted = await db
    .delete(qualityCharacteristics)
    .where(eq(qualityCharacteristics.id, id))
    .returning()
  return deleted.length > 0
}
