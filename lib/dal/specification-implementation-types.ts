import type { SqlServerDatabase } from '@/lib/db'
import {
  type SpecificationImplementationTypeEntity,
  specificationImplementationTypeEntity,
} from '@/lib/typeorm/entities'

export interface SpecificationImplementationTypeRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(
  row: SpecificationImplementationTypeEntity,
): SpecificationImplementationTypeRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listSpecificationImplementationTypes(
  db: SqlServerDatabase,
): Promise<SpecificationImplementationTypeRow[]> {
  const rows = await db
    .getRepository(specificationImplementationTypeEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createSpecificationImplementationType(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<SpecificationImplementationTypeRow> {
  const repository = db.getRepository(specificationImplementationTypeEntity)
  const row = await repository.save(
    repository.create({ nameSv: data.nameSv, nameEn: data.nameEn }),
  )
  return map(row)
}

export async function updateSpecificationImplementationType(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<SpecificationImplementationTypeRow | undefined> {
  const repository = db.getRepository(specificationImplementationTypeEntity)
  const patch: Partial<SpecificationImplementationTypeEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deleteSpecificationImplementationType(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(specificationImplementationTypeEntity).delete(id)
}
