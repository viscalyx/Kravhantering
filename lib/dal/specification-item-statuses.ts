import type { SqlServerDatabase } from '@/lib/db'
import {
  DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
  DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
} from '@/lib/specification-item-status-constants'
import {
  type SpecificationItemStatusEntity,
  specificationItemStatusEntity,
} from '@/lib/typeorm/entities'

export interface SpecificationItemStatusRow {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface LinkedPackageRow {
  requirementCount: number
  specificationId: number
  specificationName: string
}

export type { LinkedPackageRow }

function map(row: SpecificationItemStatusEntity): SpecificationItemStatusRow {
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

export async function listSpecificationItemStatuses(
  db: SqlServerDatabase,
): Promise<SpecificationItemStatusRow[]> {
  const rows = await db
    .getRepository(specificationItemStatusEntity)
    .find({ order: { sortOrder: 'ASC' } })
  return rows.map(map)
}

export async function getSpecificationItemStatusById(
  db: SqlServerDatabase,
  id: number,
): Promise<SpecificationItemStatusRow | null> {
  const row = await db
    .getRepository(specificationItemStatusEntity)
    .findOne({ where: { id } })
  return row ? map(row) : null
}

export async function countLinkedPackageItems(
  db: SqlServerDatabase,
): Promise<Record<number, number>> {
  const rows = await db.query(`
    SELECT
      specification_item_status_id AS statusId,
      COUNT(*) AS count
    FROM requirements_specification_items
    WHERE specification_item_status_id IS NOT NULL
    GROUP BY specification_item_status_id
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
        requirements_specifications.id AS specificationId,
        requirements_specifications.name AS specificationName,
        COUNT(*) AS requirementCount
      FROM requirements_specification_items
      INNER JOIN requirements_specifications
        ON requirements_specifications.id = requirements_specification_items.specification_id
      WHERE requirements_specification_items.specification_item_status_id = @0
      GROUP BY requirements_specifications.id, requirements_specifications.name
      ORDER BY requirements_specifications.name ASC
    `,
    [statusId],
  )
}

export async function createSpecificationItemStatus(
  db: SqlServerDatabase,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string | null
    descriptionEn?: string | null
    color: string
    sortOrder?: number
  },
): Promise<SpecificationItemStatusRow> {
  const repository = db.getRepository(specificationItemStatusEntity)
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

export async function updateSpecificationItemStatus(
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
): Promise<SpecificationItemStatusRow | undefined> {
  const { sortOrder, ...rest } = data
  const isLockedSortOrder =
    id === DEFAULT_SPECIFICATION_ITEM_STATUS_ID ||
    id === DEVIATED_SPECIFICATION_ITEM_STATUS_ID
  const safeSortOrder = isLockedSortOrder ? undefined : sortOrder

  const patch: Partial<SpecificationItemStatusEntity> = {}
  if (rest.nameSv !== undefined) patch.nameSv = rest.nameSv
  if (rest.nameEn !== undefined) patch.nameEn = rest.nameEn
  if (rest.descriptionSv !== undefined) patch.descriptionSv = rest.descriptionSv
  if (rest.descriptionEn !== undefined) patch.descriptionEn = rest.descriptionEn
  if (rest.color !== undefined) patch.color = rest.color
  if (safeSortOrder !== undefined) patch.sortOrder = safeSortOrder

  const repository = db.getRepository(specificationItemStatusEntity)
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deleteSpecificationItemStatus(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(specificationItemStatusEntity).delete(id)
}
