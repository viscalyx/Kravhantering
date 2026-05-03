import type { SqlServerDatabase } from '@/lib/db'
import {
  type SpecificationResponsibilityAreaEntity,
  specificationResponsibilityAreaEntity,
} from '@/lib/typeorm/entities'

export interface SpecificationResponsibilityAreaRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(
  row: SpecificationResponsibilityAreaEntity,
): SpecificationResponsibilityAreaRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listSpecificationResponsibilityAreas(
  db: SqlServerDatabase,
): Promise<SpecificationResponsibilityAreaRow[]> {
  const rows = await db
    .getRepository(specificationResponsibilityAreaEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createSpecificationResponsibilityArea(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<SpecificationResponsibilityAreaRow> {
  const repository = db.getRepository(specificationResponsibilityAreaEntity)
  const row = await repository.save(
    repository.create({ nameSv: data.nameSv, nameEn: data.nameEn }),
  )
  return map(row)
}

export async function updateSpecificationResponsibilityArea(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<SpecificationResponsibilityAreaRow | undefined> {
  const repository = db.getRepository(specificationResponsibilityAreaEntity)
  const patch: Partial<SpecificationResponsibilityAreaEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deleteSpecificationResponsibilityArea(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(specificationResponsibilityAreaEntity).delete(id)
}
