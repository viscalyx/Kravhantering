import type { SqlServerDatabase } from '@/lib/db'
import {
  type PackageLifecycleStatusEntity,
  packageLifecycleStatusEntity,
} from '@/lib/typeorm/entities'

export interface PackageLifecycleStatusRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(row: PackageLifecycleStatusEntity): PackageLifecycleStatusRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listPackageLifecycleStatuses(
  db: SqlServerDatabase,
): Promise<PackageLifecycleStatusRow[]> {
  const rows = await db
    .getRepository(packageLifecycleStatusEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createPackageLifecycleStatus(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<PackageLifecycleStatusRow> {
  const nameSv = data.nameSv.trim()
  const nameEn = data.nameEn.trim()
  if (!nameSv || !nameEn) {
    throw new Error('nameSv and nameEn are required')
  }
  const repository = db.getRepository(packageLifecycleStatusEntity)
  const row = await repository.save(repository.create({ nameSv, nameEn }))
  return map(row)
}

export async function updatePackageLifecycleStatus(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<PackageLifecycleStatusRow | undefined> {
  const patch: Partial<PackageLifecycleStatusEntity> = {}
  if (data.nameSv !== undefined) {
    const v = data.nameSv.trim()
    if (!v) throw new Error('nameSv must not be empty')
    patch.nameSv = v
  }
  if (data.nameEn !== undefined) {
    const v = data.nameEn.trim()
    if (!v) throw new Error('nameEn must not be empty')
    patch.nameEn = v
  }

  const repository = db.getRepository(packageLifecycleStatusEntity)
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deletePackageLifecycleStatus(
  db: SqlServerDatabase,
  id: number,
): Promise<number> {
  const result = await db.getRepository(packageLifecycleStatusEntity).delete(id)
  return result.affected ?? 0
}
