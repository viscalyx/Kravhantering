import { eq, sql } from 'drizzle-orm'
import {
  packageItemStatuses,
  requirementPackageItems,
  requirementPackages,
} from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'
import {
  DEFAULT_PACKAGE_ITEM_STATUS_ID,
  DEVIATED_PACKAGE_ITEM_STATUS_ID,
} from '@/lib/package-item-status-constants'

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
  db: AppDatabaseConnection,
): Promise<PackageItemStatusRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn,
        description_sv AS descriptionSv,
        description_en AS descriptionEn,
        color,
        sort_order AS sortOrder
      FROM package_item_statuses
      ORDER BY sort_order ASC
    `)
  }

  return db.query.packageItemStatuses.findMany({
    orderBy: [packageItemStatuses.sortOrder],
  })
}

export async function getPackageItemStatusById(
  db: AppDatabaseConnection,
  id: number,
): Promise<PackageItemStatusRow | null> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        SELECT
          id,
          name_sv AS nameSv,
          name_en AS nameEn,
          description_sv AS descriptionSv,
          description_en AS descriptionEn,
          color,
          sort_order AS sortOrder
        FROM package_item_statuses
        WHERE id = @0
      `,
      [id],
    )
    return (rows[0] as PackageItemStatusRow | undefined) ?? null
  }

  return (
    (await db.query.packageItemStatuses.findFirst({
      where: eq(packageItemStatuses.id, id),
    })) ?? null
  )
}

export async function countLinkedPackageItems(
  db: AppDatabaseConnection,
): Promise<Record<number, number>> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(`
      SELECT
        package_item_status_id AS statusId,
        COUNT(*) AS count
      FROM requirement_package_items
      WHERE package_item_status_id IS NOT NULL
      GROUP BY package_item_status_id
    `)
    const counts: Record<number, number> = {}
    for (const row of rows as Array<{ count: number; statusId: number | null }>) {
      if (row.statusId != null) {
        counts[row.statusId] = row.count
      }
    }
    return counts
  }

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
  db: AppDatabaseConnection,
  statusId: number,
): Promise<LinkedPackageRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
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
  db: AppDatabaseConnection,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string | null
    descriptionEn?: string | null
    color: string
    sortOrder?: number
  },
): Promise<PackageItemStatusRow> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO package_item_statuses (
          name_sv,
          name_en,
          description_sv,
          description_en,
          color,
          sort_order
        )
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn,
          inserted.description_sv AS descriptionSv,
          inserted.description_en AS descriptionEn,
          inserted.color AS color,
          inserted.sort_order AS sortOrder
        VALUES (@0, @1, @2, @3, @4, @5)
      `,
      [
        data.nameSv,
        data.nameEn,
        data.descriptionSv ?? null,
        data.descriptionEn ?? null,
        data.color,
        data.sortOrder ?? 0,
      ],
    )
    return rows[0] as PackageItemStatusRow
  }

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
  db: AppDatabaseConnection,
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
  const safeData = rest
  const safeSortOrder = isLockedSortOrder ? undefined : sortOrder

  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (safeData.nameSv !== undefined) {
      params.push(safeData.nameSv)
      sets.push(`name_sv = @${params.length - 1}`)
    }
    if (safeData.nameEn !== undefined) {
      params.push(safeData.nameEn)
      sets.push(`name_en = @${params.length - 1}`)
    }
    if (safeData.descriptionSv !== undefined) {
      params.push(safeData.descriptionSv)
      sets.push(`description_sv = @${params.length - 1}`)
    }
    if (safeData.descriptionEn !== undefined) {
      params.push(safeData.descriptionEn)
      sets.push(`description_en = @${params.length - 1}`)
    }
    if (safeData.color !== undefined) {
      params.push(safeData.color)
      sets.push(`color = @${params.length - 1}`)
    }
    if (safeSortOrder !== undefined) {
      params.push(safeSortOrder)
      sets.push(`sort_order = @${params.length - 1}`)
    }

    if (sets.length === 0) {
      return (await getPackageItemStatusById(db, id)) ?? undefined
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE package_item_statuses
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn,
          inserted.description_sv AS descriptionSv,
          inserted.description_en AS descriptionEn,
          inserted.color AS color,
          inserted.sort_order AS sortOrder
        WHERE id = @${params.length - 1}
      `,
      params,
    )
    return rows[0] as PackageItemStatusRow | undefined
  }

  const [updated] = await db
    .update(packageItemStatuses)
    .set(safeSortOrder === undefined ? safeData : { ...safeData, sortOrder: safeSortOrder })
    .where(eq(packageItemStatuses.id, id))
    .returning()
  return updated
}

export async function deletePackageItemStatus(
  db: AppDatabaseConnection,
  id: number,
): Promise<void> {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM package_item_statuses WHERE id = @0`, [id])
    return
  }

  await db.delete(packageItemStatuses).where(eq(packageItemStatuses.id, id))
}
