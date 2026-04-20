import { eq } from 'drizzle-orm'
import { qualityCharacteristics, requirementTypes } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'

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

export async function listTypes(
  db: AppDatabaseConnection,
): Promise<RequirementTypeWithQualityCharacteristics[]> {
  if (isSqlServerDatabaseConnection(db)) {
    const [types, characteristics] = await Promise.all([
      db.query(`
        SELECT
          id,
          name_sv AS nameSv,
          name_en AS nameEn
        FROM requirement_types
        ORDER BY name_sv ASC
      `),
      listQualityCharacteristics(db),
    ])
    const groupedCharacteristics = new Map()

    for (const characteristic of characteristics) {
      const bucket =
        groupedCharacteristics.get(characteristic.requirementTypeId) ?? []
      bucket.push(characteristic)
      groupedCharacteristics.set(characteristic.requirementTypeId, bucket)
    }

    return types.map((type: RequirementTypeRow) => ({
      ...type,
      qualityCharacteristics: groupedCharacteristics.get(type.id) ?? [],
    }))
  }

  return db.query.requirementTypes.findMany({
    orderBy: [requirementTypes.nameSv],
    with: {
      qualityCharacteristics: {
        orderBy: [qualityCharacteristics.nameSv],
      },
    },
  })
}

export async function listQualityCharacteristics(
  db: AppDatabaseConnection,
  typeId?: number,
): Promise<QualityCharacteristicRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
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

  if (typeId != null) {
    return db.query.qualityCharacteristics.findMany({
      where: eq(qualityCharacteristics.requirementTypeId, typeId),
      orderBy: [qualityCharacteristics.nameSv],
    })
  }

  return db.query.qualityCharacteristics.findMany({
    orderBy: [qualityCharacteristics.nameSv],
  })
}

export async function createType(
  db: AppDatabaseConnection,
  data: { nameSv: string; nameEn: string },
): Promise<RequirementTypeRow> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO requirement_types (name_sv, name_en)
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn
        VALUES (@0, @1)
      `,
      [data.nameSv, data.nameEn],
    )
    return rows[0]
  }

  const [type] = await db.insert(requirementTypes).values(data).returning()
  return type
}

export async function updateType(
  db: AppDatabaseConnection,
  id: number,
  data: { nameSv?: string; nameEn?: string },
): Promise<RequirementTypeRow | undefined> {
  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (data.nameSv !== undefined) {
      params.push(data.nameSv)
      sets.push(`name_sv = @${params.length - 1}`)
    }

    if (data.nameEn !== undefined) {
      params.push(data.nameEn)
      sets.push(`name_en = @${params.length - 1}`)
    }

    if (sets.length === 0) {
      const rows = await db.query(
        `
          SELECT
            id,
            name_sv AS nameSv,
            name_en AS nameEn
          FROM requirement_types
          WHERE id = @0
        `,
        [id],
      )
      return rows[0]
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE requirement_types
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn
        WHERE id = @${params.length - 1}
      `,
      params,
    )
    return rows[0]
  }

  const [updated] = await db
    .update(requirementTypes)
    .set(data)
    .where(eq(requirementTypes.id, id))
    .returning()
  return updated
}

export async function deleteType(db: AppDatabaseConnection, id: number) {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM requirement_types WHERE id = @0`, [id])
    return
  }

  await db.delete(requirementTypes).where(eq(requirementTypes.id, id))
}

export async function createQualityCharacteristic(
  db: AppDatabaseConnection,
  data: {
    nameSv: string
    nameEn: string
    requirementTypeId: number
    parentId?: number | null
  },
): Promise<QualityCharacteristicRow> {
  if (isSqlServerDatabaseConnection(db)) {
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

  const [category] = await db
    .insert(qualityCharacteristics)
    .values({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      requirementTypeId: data.requirementTypeId,
      parentId: data.parentId ?? null,
    })
    .returning()
  return category
}

export async function updateQualityCharacteristic(
  db: AppDatabaseConnection,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    requirementTypeId?: number
    parentId?: number | null
  },
) {
  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

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

  const rows = await db
    .update(qualityCharacteristics)
    .set(data)
    .where(eq(qualityCharacteristics.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteQualityCharacteristic(
  db: AppDatabaseConnection,
  id: number,
) {
  if (isSqlServerDatabaseConnection(db)) {
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

  const deleted = await db
    .delete(qualityCharacteristics)
    .where(eq(qualityCharacteristics.id, id))
    .returning()
  return deleted.length > 0
}
