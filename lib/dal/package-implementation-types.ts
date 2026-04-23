import type { SqlServerDatabase } from '@/lib/db'
import {
  type PackageImplementationTypeEntity,
  packageImplementationTypeEntity,
} from '@/lib/typeorm/entities'

export interface PackageImplementationTypeRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(
  row: PackageImplementationTypeEntity,
): PackageImplementationTypeRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listPackageImplementationTypes(
  db: SqlServerDatabase,
): Promise<PackageImplementationTypeRow[]> {
  const rows = await db
    .getRepository(packageImplementationTypeEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createPackageImplementationType(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<PackageImplementationTypeRow> {
  const repository = db.getRepository(packageImplementationTypeEntity)
  const row = await repository.save(
    repository.create({ nameSv: data.nameSv, nameEn: data.nameEn }),
  )
  return map(row)
}

export async function updatePackageImplementationType(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<PackageImplementationTypeRow | undefined> {
  const repository = db.getRepository(packageImplementationTypeEntity)
  const patch: Partial<PackageImplementationTypeEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deletePackageImplementationType(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(packageImplementationTypeEntity).delete(id)
}
