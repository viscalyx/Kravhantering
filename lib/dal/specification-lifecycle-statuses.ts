import type { SqlServerDatabase } from '@/lib/db'
import {
  type SpecificationLifecycleStatusEntity,
  specificationLifecycleStatusEntity,
} from '@/lib/typeorm/entities'

export interface SpecificationLifecycleStatusRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(
  row: SpecificationLifecycleStatusEntity,
): SpecificationLifecycleStatusRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listSpecificationLifecycleStatuses(
  db: SqlServerDatabase,
): Promise<SpecificationLifecycleStatusRow[]> {
  const rows = await db
    .getRepository(specificationLifecycleStatusEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createSpecificationLifecycleStatus(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<SpecificationLifecycleStatusRow> {
  const nameSv = data.nameSv.trim()
  const nameEn = data.nameEn.trim()
  if (!nameSv || !nameEn) {
    throw new Error('nameSv and nameEn are required')
  }
  const repository = db.getRepository(specificationLifecycleStatusEntity)
  const row = await repository.save(repository.create({ nameSv, nameEn }))
  return map(row)
}

export async function updateSpecificationLifecycleStatus(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<SpecificationLifecycleStatusRow | undefined> {
  const patch: Partial<SpecificationLifecycleStatusEntity> = {}
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

  const repository = db.getRepository(specificationLifecycleStatusEntity)
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deleteSpecificationLifecycleStatus(
  db: SqlServerDatabase,
  id: number,
): Promise<number> {
  const result = await db
    .getRepository(specificationLifecycleStatusEntity)
    .delete(id)
  return result.affected ?? 0
}
