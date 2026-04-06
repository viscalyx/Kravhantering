import { eq, sql } from 'drizzle-orm'
import {
  packageItemStatuses,
  requirementPackageItems,
  requirementPackages,
} from '@/drizzle/schema'
import { DEFAULT_PACKAGE_ITEM_STATUS_ID } from '@/lib/dal/requirement-packages'
import type { Database } from '@/lib/db'

export interface PackageItemStatusRow {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface LinkedPackageRow {
  packageId: number
  packageName: string
  requirementCount: number
}

export type { LinkedPackageRow }

export async function listPackageItemStatuses(
  db: Database,
): Promise<PackageItemStatusRow[]> {
  return db.query.packageItemStatuses.findMany({
    orderBy: [packageItemStatuses.sortOrder],
  })
}

export async function getPackageItemStatusById(
  db: Database,
  id: number,
): Promise<PackageItemStatusRow | null> {
  return (
    (await db.query.packageItemStatuses.findFirst({
      where: eq(packageItemStatuses.id, id),
    })) ?? null
  )
}

export async function countLinkedPackageItems(
  db: Database,
): Promise<Record<number, number>> {
  const rows = await db
    .select({
      statusId: requirementPackageItems.packageItemStatusId,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(requirementPackageItems)
    .where(sql`${requirementPackageItems.packageItemStatusId} IS NOT NULL`)
    .groupBy(requirementPackageItems.packageItemStatusId)
  const counts: Record<number, number> = {}
  for (const row of rows) {
    if (row.statusId != null) {
      counts[row.statusId] = row.count
    }
  }
  return counts
}

export async function getLinkedPackageItems(
  db: Database,
  statusId: number,
): Promise<LinkedPackageRow[]> {
  return db
    .select({
      packageId: requirementPackages.id,
      packageName: requirementPackages.name,
      requirementCount: sql<number>`COUNT(*)`.as('requirement_count'),
    })
    .from(requirementPackageItems)
    .innerJoin(
      requirementPackages,
      eq(requirementPackages.id, requirementPackageItems.packageId),
    )
    .where(eq(requirementPackageItems.packageItemStatusId, statusId))
    .groupBy(requirementPackages.id, requirementPackages.name)
    .orderBy(requirementPackages.name)
}

export async function createPackageItemStatus(
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string | null
    descriptionEn?: string | null
    color: string
    sortOrder?: number
  },
): Promise<PackageItemStatusRow> {
  const [row] = await db
    .insert(packageItemStatuses)
    .values({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      descriptionSv: data.descriptionSv ?? null,
      descriptionEn: data.descriptionEn ?? null,
      color: data.color,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning()
  return row
}

export async function updatePackageItemStatus(
  db: Database,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    descriptionSv?: string | null
    descriptionEn?: string | null
    color?: string
    sortOrder?: number
  },
): Promise<PackageItemStatusRow | undefined> {
  const { sortOrder, ...rest } = data
  const safeData =
    id === DEFAULT_PACKAGE_ITEM_STATUS_ID ? rest : { ...rest, sortOrder }
  const [updated] = await db
    .update(packageItemStatuses)
    .set(safeData)
    .where(eq(packageItemStatuses.id, id))
    .returning()
  return updated
}

export async function deletePackageItemStatus(
  db: Database,
  id: number,
): Promise<void> {
  await db.delete(packageItemStatuses).where(eq(packageItemStatuses.id, id))
}
