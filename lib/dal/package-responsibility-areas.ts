import type { SqlServerDatabase } from '@/lib/db'
import {
  type PackageResponsibilityAreaEntity,
  packageResponsibilityAreaEntity,
} from '@/lib/typeorm/entities'

export interface PackageResponsibilityAreaRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(
  row: PackageResponsibilityAreaEntity,
): PackageResponsibilityAreaRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listPackageResponsibilityAreas(
  db: SqlServerDatabase,
): Promise<PackageResponsibilityAreaRow[]> {
  const rows = await db
    .getRepository(packageResponsibilityAreaEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createPackageResponsibilityArea(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<PackageResponsibilityAreaRow> {
  const repository = db.getRepository(packageResponsibilityAreaEntity)
  const row = await repository.save(
    repository.create({ nameSv: data.nameSv, nameEn: data.nameEn }),
  )
  return map(row)
}

export async function updatePackageResponsibilityArea(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<PackageResponsibilityAreaRow | undefined> {
  const repository = db.getRepository(packageResponsibilityAreaEntity)
  const patch: Partial<PackageResponsibilityAreaEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deletePackageResponsibilityArea(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(packageResponsibilityAreaEntity).delete(id)
}
