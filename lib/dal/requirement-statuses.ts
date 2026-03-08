import { eq, sql } from 'drizzle-orm'
import {
  requirementStatuses,
  requirementStatusTransitions,
  requirementVersions,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listStatuses(db: Database) {
  return db.query.requirementStatuses.findMany({
    orderBy: [requirementStatuses.sortOrder],
  })
}

export async function getStatusById(db: Database, id: number) {
  return (
    (await db.query.requirementStatuses.findFirst({
      where: eq(requirementStatuses.id, id),
    })) ?? null
  )
}

export async function createStatus(
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    sortOrder: number
    color: string
    isSystem?: boolean
  },
) {
  const [status] = await db.insert(requirementStatuses).values(data).returning()
  return status
}

export async function updateStatus(
  db: Database,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    sortOrder?: number
    color?: string
  },
) {
  const [updated] = await db
    .update(requirementStatuses)
    .set(data)
    .where(eq(requirementStatuses.id, id))
    .returning()
  return updated
}

export async function deleteStatus(db: Database, id: number) {
  // Check if system status
  const status = await getStatusById(db, id)
  if (!status) throw new Error('Status not found')
  if (status.isSystem) throw new Error('Cannot delete a system status')

  // Check if in use
  const [usage] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(requirementVersions)
    .where(eq(requirementVersions.statusId, id))
  if (usage.count > 0) {
    throw new Error(
      'Cannot delete a status that is in use by requirement versions',
    )
  }

  await db.delete(requirementStatuses).where(eq(requirementStatuses.id, id))
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export async function listTransitions(db: Database) {
  return db.query.requirementStatusTransitions.findMany({
    with: {
      fromStatus: true,
      toStatus: true,
    },
  })
}

export async function getTransitionsFrom(db: Database, statusId: number) {
  const rows = await db.query.requirementStatusTransitions.findMany({
    where: eq(requirementStatusTransitions.fromStatusId, statusId),
    with: {
      toStatus: true,
    },
  })
  return rows.map(r => r.toStatus)
}

export async function createTransition(
  db: Database,
  fromStatusId: number,
  toStatusId: number,
) {
  const [transition] = await db
    .insert(requirementStatusTransitions)
    .values({ fromStatusId, toStatusId })
    .returning()
  return transition
}

export async function deleteTransition(db: Database, id: number) {
  await db
    .delete(requirementStatusTransitions)
    .where(eq(requirementStatusTransitions.id, id))
}
