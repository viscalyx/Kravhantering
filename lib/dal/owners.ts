import { eq } from 'drizzle-orm'
import { owners } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

export async function listOwners(db: Database): Promise<Owner[]> {
  const rows = await db.query.owners.findMany({
    orderBy: [owners.lastName, owners.firstName],
  })
  return rows.map(o => ({
    id: o.id,
    firstName: o.firstName,
    lastName: o.lastName,
    email: o.email,
  }))
}

export async function getOwnerById(
  db: Database,
  id: number,
): Promise<Owner | null> {
  const row = await db.query.owners.findFirst({
    where: eq(owners.id, id),
  })
  if (!row) return null
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
  }
}

export async function createOwner(
  db: Database,
  data: { firstName: string; lastName: string; email: string },
) {
  const [row] = await db
    .insert(owners)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
    })
    .returning()
  return row
}

export async function updateOwner(
  db: Database,
  id: number,
  data: { firstName?: string; lastName?: string; email?: string },
) {
  const [updated] = await db
    .update(owners)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(owners.id, id))
    .returning()
  return updated
}

export async function deleteOwner(db: Database, id: number) {
  await db.delete(owners).where(eq(owners.id, id))
}
