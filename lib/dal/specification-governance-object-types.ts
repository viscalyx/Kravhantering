import type { SqlServerExecutor } from '@/lib/db'
import {
  type SpecificationGovernanceObjectTypeEntity,
  specificationGovernanceObjectTypeEntity,
} from '@/lib/typeorm/entities'

export interface SpecificationGovernanceObjectTypeRow {
  id: number
  nameEn: string
  nameSv: string
}

function map(
  row: SpecificationGovernanceObjectTypeEntity,
): SpecificationGovernanceObjectTypeRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listSpecificationGovernanceObjectTypes(
  db: SqlServerExecutor,
): Promise<SpecificationGovernanceObjectTypeRow[]> {
  const rows = await db
    .getRepository(specificationGovernanceObjectTypeEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(map)
}

export async function createSpecificationGovernanceObjectType(
  db: SqlServerExecutor,
  data: { nameSv: string; nameEn: string },
): Promise<SpecificationGovernanceObjectTypeRow> {
  const repository = db.getRepository(specificationGovernanceObjectTypeEntity)
  const row = await repository.save(
    repository.create({ nameSv: data.nameSv, nameEn: data.nameEn }),
  )
  return map(row)
}

export async function updateSpecificationGovernanceObjectType(
  db: SqlServerExecutor,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<SpecificationGovernanceObjectTypeRow | undefined> {
  const repository = db.getRepository(specificationGovernanceObjectTypeEntity)
  const patch: Partial<SpecificationGovernanceObjectTypeEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

export async function deleteSpecificationGovernanceObjectType(
  db: SqlServerExecutor,
  id: number,
): Promise<number> {
  const result = await db
    .getRepository(specificationGovernanceObjectTypeEntity)
    .delete(id)
  return result.affected ?? 0
}
