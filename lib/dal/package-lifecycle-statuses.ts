import { eq } from 'drizzle-orm'
import { packageLifecycleStatuses } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listPackageLifecycleStatuses(db: Database) {
  return db.query.packageLifecycleStatuses.findMany({
    orderBy: [packageLifecycleStatuses.nameSv],
  })
}

export async function createPackageLifecycleStatus(
  db: Database,
  data: { nameSv: string; nameEn: string },
) {
  const [row] = await db
    .insert(packageLifecycleStatuses)
    .values(data)
    .returning()
  return row
}

export async function updatePackageLifecycleStatus(
  db: Database,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  const [updated] = await db
    .update(packageLifecycleStatuses)
    .set(data)
    .where(eq(packageLifecycleStatuses.id, id))
    .returning()
  return updated
}

export async function deletePackageLifecycleStatus(db: Database, id: number) {
  await db
    .delete(packageLifecycleStatuses)
    .where(eq(packageLifecycleStatuses.id, id))
}
