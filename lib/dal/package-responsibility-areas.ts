import { eq } from 'drizzle-orm'
import { packageResponsibilityAreas } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listPackageResponsibilityAreas(db: Database) {
  return db.query.packageResponsibilityAreas.findMany({
    orderBy: [packageResponsibilityAreas.nameSv],
  })
}

export async function createPackageResponsibilityArea(
  db: Database,
  data: { nameSv: string; nameEn: string },
) {
  const [row] = await db
    .insert(packageResponsibilityAreas)
    .values(data)
    .returning()
  return row
}

export async function updatePackageResponsibilityArea(
  db: Database,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  const [updated] = await db
    .update(packageResponsibilityAreas)
    .set(data)
    .where(eq(packageResponsibilityAreas.id, id))
    .returning()
  return updated
}

export async function deletePackageResponsibilityArea(
  db: Database,
  id: number,
) {
  await db
    .delete(packageResponsibilityAreas)
    .where(eq(packageResponsibilityAreas.id, id))
}
