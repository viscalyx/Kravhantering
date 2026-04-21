import type { SqlServerDatabase } from '@/lib/db'
import {
  DEFAULT_PACKAGE_ITEM_STATUS_ID,
  DEVIATED_PACKAGE_ITEM_STATUS_ID,
} from '@/lib/package-item-status-constants'
import {
  type PackageItemStatusEntity,
  packageItemStatusEntity,
} from '@/lib/typeorm/entities'

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

function map(row: PackageItemStatusEntity): PackageItemStatusRow {
  return {
    color: row.color,
    descriptionEn: row.descriptionEn,
    descriptionSv: row.descriptionSv,
    id: row.id,
    nameEn: row.nameEn,
    nameSv: row.nameSv,
    sortOrder: row.sortOrder,
  }
}

export async function listPackageItemStatuses(
  db: SqlServerDatabase,
): Promise<PackageItemStatusRow[]> {
  const rows = await db
    .getRepository(packageItemStatusEntity)
    .find({ order: { sortOrder: 'ASC' } })
  return rows.map(map)
}

export async function getPackageItemStatusById(
  db: SqlServerDatabase,
  id: number,
): Promise<PackageItemStatusRow | null> {
  const row = await db
    .getRepository(packageItemStatusEntity)
    .findOne({ where: { id } })
  return row ? map(row) : null
}

export async function countLinkedPackageItems(
  db: SqlServerDatabase,
): Promise<Record<number, number>> {
  const rows = await db.query(`
    SELECT
      package_item_status_id AS statusId,
      COUNT(*) AS count
    FROM requirement_package_items
    WHERE package_item_status_id IS NOT NULL
    GROUP BY package_item_status_id
  `)
  const counts: Record<number, number> = {}
  for (const row of rows as Array<{
    count: number
    statusId: number | null
  }>) {
    if (row.statusId != null) {
      counts[row.statusId] = row.count
    }
  }
  return counts
}

export async function getLinkedPackageItems(
  db: SqlServerDatabase,
  statusId: number,
): Promise<LinkedPackageRow[]> {
  return db.query(
    `
      SELECT
        requirement_packages.id AS packageId,
        requirement_packages.name AS packageName,
        COUNT(*) AS requirementCount
      FROM requirement_package_items
      INNER JOIN requirement_packages
        ON requirement_packages.id = requirement_package_items.package_id
      WHERE requirement_package_items.package_item_status_id = @0
      GROUP BY requirement_packages.id, requirement_packages.name
      ORDER BY requirement_packages.name ASC
    `,
    [statusId],
  )
}

export async function createPackageItemStatus(
  db: SqlServerDatabase,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string | null
    descriptionEn?: string | null
    color: string
    sortOrder?: number
  },
): Promise<PackageItemStatusRow> {
  const repository = db.getRepository(packageItemStatusEntity)
  const row = await repository.save(
    repository.create({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      descriptionSv: data.descriptionSv ?? null,
      descriptionEn: data.descriptionEn ?? null,
      color: data.color,
      sortOrder: data.sortOrder ?? 0,
    }),
  )
  return map(row)
}

export async function updatePackageItemStatus(
  db: SqlServerDatabase,
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
  const isLockedSortOrder =
    id === DEFAULT_PACKAGE_ITEM_STATUS_ID ||
    id === DEVIATED_PACKAGE_ITEM_STATUS_ID
  const safeSortOrder = isLockedSortOrder ? undefined : sortOrder

  const patch: Partial<PackageItemStatusEntity> = {}
  if (rest.nameSv !== undefined) patch.nameSv = rest.nameSv
  if (rest.nameEn !== undefined) patch.nameEn = rest.nameEn
  if (rest.descriptionSv !== undefined) patch.descriptionSv = rest.descriptionSv
  if (rest.descriptionEn !== undefined) patch.descriptionEn = rest.descriptionEn
  if (rest.color !== undefined) patch.color = rest.color
  if (safeSortOrder !== undefined) patch.sortOrder = safeSortOrder

  const repository = db.getRepository(packageItemStatusEntity)
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deletePackageItemStatus(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(packageItemStatusEntity).delete(id)
}
