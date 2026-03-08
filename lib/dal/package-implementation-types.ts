import { eq } from 'drizzle-orm'
import { packageImplementationTypes } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listPackageImplementationTypes(db: Database) {
  return db.query.packageImplementationTypes.findMany({
    orderBy: [packageImplementationTypes.nameSv],
  })
}

export async function createPackageImplementationType(
  db: Database,
  data: { nameSv: string; nameEn: string },
) {
  const [row] = await db
    .insert(packageImplementationTypes)
    .values(data)
    .returning()
  return row
}

export async function updatePackageImplementationType(
  db: Database,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  const [updated] = await db
    .update(packageImplementationTypes)
    .set(data)
    .where(eq(packageImplementationTypes.id, id))
    .returning()
  return updated
}

export async function deletePackageImplementationType(
  db: Database,
  id: number,
) {
  await db
    .delete(packageImplementationTypes)
    .where(eq(packageImplementationTypes.id, id))
}
