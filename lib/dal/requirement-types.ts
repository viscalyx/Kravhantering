import type { SqlServerDatabase } from '@/lib/db'
import {
  type RequirementTypeEntity,
  requirementTypeEntity,
} from '@/lib/typeorm/entities'

export interface QualityCharacteristicRow {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
  requirementTypeId: number
}

export interface RequirementTypeRow {
  id: number
  nameEn: string
  nameSv: string
}

export interface RequirementTypeWithQualityCharacteristics
  extends RequirementTypeRow {
  qualityCharacteristics: QualityCharacteristicRow[]
}

function mapType(row: RequirementTypeEntity): RequirementTypeRow {
  return { id: row.id, nameEn: row.nameEn, nameSv: row.nameSv }
}

export async function listTypes(
  db: SqlServerDatabase,
): Promise<RequirementTypeWithQualityCharacteristics[]> {
  const [typeRows, characteristics] = await Promise.all([
    db.getRepository(requirementTypeEntity).find({ order: { nameSv: 'ASC' } }),
    listQualityCharacteristics(db),
  ])
  const types = typeRows.map(mapType)
  const groupedCharacteristics = new Map<number, QualityCharacteristicRow[]>()
  for (const characteristic of characteristics) {
    const bucket =
      groupedCharacteristics.get(characteristic.requirementTypeId) ?? []
    bucket.push(characteristic)
    groupedCharacteristics.set(characteristic.requirementTypeId, bucket)
  }

  return types.map(type => ({
    ...type,
    qualityCharacteristics: groupedCharacteristics.get(type.id) ?? [],
  }))
}

// Quality characteristics expose `requirement_type_id` and `parent_id` as
// integer FK columns at the DAL boundary. The entity models them as
// relations only, so reading just the IDs would force loading both joined
// rows on every query. Raw SQL stays here to avoid that cost.

export async function listQualityCharacteristics(
  db: SqlServerDatabase,
  typeId?: number,
): Promise<QualityCharacteristicRow[]> {
  return db.query(
    `
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn,
        requirement_type_id AS requirementTypeId,
        parent_id AS parentId
      FROM quality_characteristics
      ${typeId != null ? 'WHERE requirement_type_id = @0' : ''}
      ORDER BY name_sv ASC
    `,
    typeId != null ? [typeId] : [],
  )
}

export async function createType(
  db: SqlServerDatabase,
  data: { nameSv: string; nameEn: string },
): Promise<RequirementTypeRow> {
  const repository = db.getRepository(requirementTypeEntity)
  const row = await repository.save(
    repository.create({ nameSv: data.nameSv, nameEn: data.nameEn }),
  )
  return mapType(row)
}

export async function updateType(
  db: SqlServerDatabase,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<RequirementTypeRow | undefined> {
  const repository = db.getRepository(requirementTypeEntity)
  const patch: Partial<RequirementTypeEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? mapType(row) : undefined
}

export async function deleteType(db: SqlServerDatabase, id: number) {
  await db.getRepository(requirementTypeEntity).delete(id)
}

export async function createQualityCharacteristic(
  db: SqlServerDatabase,
  data: {
    nameSv: string
    nameEn: string
    requirementTypeId: number
    parentId?: number | null
  },
): Promise<QualityCharacteristicRow> {
  const rows = await db.query(
    `
      INSERT INTO quality_characteristics (
        name_sv,
        name_en,
        requirement_type_id,
        parent_id
      )
      OUTPUT
        inserted.id AS id,
        inserted.name_sv AS nameSv,
        inserted.name_en AS nameEn,
        inserted.requirement_type_id AS requirementTypeId,
        inserted.parent_id AS parentId
      VALUES (@0, @1, @2, @3)
    `,
    [data.nameSv, data.nameEn, data.requirementTypeId, data.parentId ?? null],
  )
  return rows[0]
}

export async function updateQualityCharacteristic(
  db: SqlServerDatabase,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    requirementTypeId?: number
    parentId?: number | null
  },
) {
  const sets: string[] = []
  const params: Array<string | number | null> = []

  if (data.nameSv !== undefined) {
    params.push(data.nameSv)
    sets.push(`name_sv = @${params.length - 1}`)
  }
  if (data.nameEn !== undefined) {
    params.push(data.nameEn)
    sets.push(`name_en = @${params.length - 1}`)
  }
  if (data.requirementTypeId !== undefined) {
    params.push(data.requirementTypeId)
    sets.push(`requirement_type_id = @${params.length - 1}`)
  }
  if (data.parentId !== undefined) {
    params.push(data.parentId)
    sets.push(`parent_id = @${params.length - 1}`)
  }

  if (sets.length === 0) {
    const rows = await db.query(
      `
        SELECT
          id,
          name_sv AS nameSv,
          name_en AS nameEn,
          requirement_type_id AS requirementTypeId,
          parent_id AS parentId
        FROM quality_characteristics
        WHERE id = @0
      `,
      [id],
    )
    return rows[0] ?? null
  }

  params.push(id)
  const rows = await db.query(
    `
      UPDATE quality_characteristics
      SET ${sets.join(', ')}
      OUTPUT
        inserted.id AS id,
        inserted.name_sv AS nameSv,
        inserted.name_en AS nameEn,
        inserted.requirement_type_id AS requirementTypeId,
        inserted.parent_id AS parentId
      WHERE id = @${params.length - 1}
    `,
    params,
  )
  return rows[0] ?? null
}

export async function deleteQualityCharacteristic(
  db: SqlServerDatabase,
  id: number,
) {
  const rows = await db.query(
    `
      DELETE FROM quality_characteristics
      OUTPUT deleted.id AS id
      WHERE id = @0
    `,
    [id],
  )
  return rows.length > 0
}
