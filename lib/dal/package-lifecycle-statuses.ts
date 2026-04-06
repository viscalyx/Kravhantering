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
  const nameSv = data.nameSv.trim()
  const nameEn = data.nameEn.trim()
  if (!nameSv || !nameEn) {
    throw new Error('nameSv and nameEn are required')
  }
  const [row] = await db
    .insert(packageLifecycleStatuses)
    .values({ nameSv, nameEn })
    .returning()
  return row
}

export async function updatePackageLifecycleStatus(
  db: Database,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  const trimmed: { nameSv?: string; nameEn?: string } = {}
  if (data.nameSv !== undefined) {
    const v = data.nameSv.trim()
    if (!v) throw new Error('nameSv must not be empty')
    trimmed.nameSv = v
  }
  if (data.nameEn !== undefined) {
    const v = data.nameEn.trim()
    if (!v) throw new Error('nameEn must not be empty')
    trimmed.nameEn = v
  }
  const [updated] = await db
    .update(packageLifecycleStatuses)
    .set(trimmed)
    .where(eq(packageLifecycleStatuses.id, id))
    .returning()
  return updated
}

export async function deletePackageLifecycleStatus(db: Database, id: number) {
  const result = await db
    .delete(packageLifecycleStatuses)
    .where(eq(packageLifecycleStatuses.id, id))
    .returning()
  return result.length
}
