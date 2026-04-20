import { eq } from 'drizzle-orm'
import { requirementAreas } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'
import { toIsoString } from '@/lib/typeorm/value-mappers'

export interface RequirementAreaRow {
  createdAt: Date | string
  description: string | null
  id: number
  name: string
  nextSequence: number
  ownerId: number | null
  prefix: string
  updatedAt: Date | string
}

function mapAreaRow(row: RequirementAreaRow): RequirementAreaRow {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function listAreas(
  db: AppDatabaseConnection,
): Promise<RequirementAreaRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(`
      SELECT
        id,
        prefix,
        name,
        description,
        owner_id AS ownerId,
        next_sequence AS nextSequence,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM requirement_areas
      ORDER BY name ASC
    `)
    return rows.map(mapAreaRow)
  }

  return db.query.requirementAreas.findMany({
    orderBy: [requirementAreas.name],
  })
}

export async function getAreaById(
  db: AppDatabaseConnection,
  id: number,
): Promise<RequirementAreaRow | null> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        SELECT
          id,
          prefix,
          name,
          description,
          owner_id AS ownerId,
          next_sequence AS nextSequence,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM requirement_areas
        WHERE id = @0
      `,
      [id],
    )
    return rows[0] ? mapAreaRow(rows[0]) : null
  }

  return (
    (await db.query.requirementAreas.findFirst({
      where: eq(requirementAreas.id, id),
    })) ?? null
  )
}

export async function createArea(
  db: AppDatabaseConnection,
  data: {
    prefix: string
    name: string
    description?: string
    ownerId?: number
  },
): Promise<RequirementAreaRow> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO requirement_areas (
          prefix,
          name,
          description,
          owner_id
        )
        OUTPUT
          inserted.id AS id,
          inserted.prefix AS prefix,
          inserted.name AS name,
          inserted.description AS description,
          inserted.owner_id AS ownerId,
          inserted.next_sequence AS nextSequence,
          inserted.created_at AS createdAt,
          inserted.updated_at AS updatedAt
        VALUES (@0, @1, @2, @3)
      `,
      [data.prefix, data.name, data.description ?? null, data.ownerId ?? null],
    )

    return mapAreaRow(rows[0])
  }

  const [area] = await db
    .insert(requirementAreas)
    .values({
      prefix: data.prefix,
      name: data.name,
      description: data.description,
      ownerId: data.ownerId,
    })
    .returning()

  return area
}

export async function updateArea(
  db: AppDatabaseConnection,
  id: number,
  data: {
    name?: string
    description?: string
    ownerId?: number
  },
): Promise<RequirementAreaRow | undefined> {
  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (data.name !== undefined) {
      params.push(data.name)
      sets.push(`name = @${params.length - 1}`)
    }

    if (data.description !== undefined) {
      params.push(data.description)
      sets.push(`description = @${params.length - 1}`)
    }

    if (data.ownerId !== undefined) {
      params.push(data.ownerId)
      sets.push(`owner_id = @${params.length - 1}`)
    }

    params.push(new Date())
    sets.push(`updated_at = @${params.length - 1}`)
    params.push(id)

    const rows = await db.query(
      `
        UPDATE requirement_areas
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.prefix AS prefix,
          inserted.name AS name,
          inserted.description AS description,
          inserted.owner_id AS ownerId,
          inserted.next_sequence AS nextSequence,
          inserted.created_at AS createdAt,
          inserted.updated_at AS updatedAt
        WHERE id = @${params.length - 1}
      `,
      params,
    )

    return rows[0] ? mapAreaRow(rows[0]) : undefined
  }

  const [updated] = await db
    .update(requirementAreas)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(requirementAreas.id, id))
    .returning()

  return updated
}

export async function deleteArea(db: AppDatabaseConnection, id: number) {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM requirement_areas WHERE id = @0`, [id])
    return
  }

  await db.delete(requirementAreas).where(eq(requirementAreas.id, id))
}
