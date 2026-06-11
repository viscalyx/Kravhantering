import {
  cleanupUnassignedRequirementResponsibilityPeople,
  upsertRequirementResponsibilityPerson,
} from '@/lib/dal/requirement-responsibility-people'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'
import { toIsoString } from '@/lib/typeorm/value-mappers'

export interface RequirementAreaRow {
  createdAt: Date | string
  description: string | null
  id: number
  name: string
  nextSequence: number
  ownerHsaId: string
  prefix: string
  updatedAt: Date | string
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

function mapAreaRow(row: RequirementAreaRow): RequirementAreaRow {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function listAreas(
  db: SqlServerDatabase,
): Promise<RequirementAreaRow[]> {
  const rows = await db.query(`
    SELECT
      id,
      prefix,
      name,
      description,
      owner_hsa_id AS ownerHsaId,
      next_sequence AS nextSequence,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM requirement_areas
    ORDER BY name ASC
  `)
  return rows.map(mapAreaRow)
}

export async function listAreasActorCanAuthor(
  db: SqlServerDatabase,
  actorHsaId: string | null,
  isAdmin: boolean,
): Promise<RequirementAreaRow[]> {
  if (isAdmin) {
    return listAreas(db)
  }

  if (!actorHsaId) {
    return []
  }

  const rows = await db.query(
    `
      SELECT DISTINCT
        area.id,
        area.prefix,
        area.name,
        area.description,
        area.owner_hsa_id AS ownerHsaId,
        area.next_sequence AS nextSequence,
        area.created_at AS createdAt,
        area.updated_at AS updatedAt
      FROM requirement_areas area
      LEFT JOIN requirement_area_co_authors co_author
        ON co_author.area_id = area.id
      WHERE area.owner_hsa_id = @0 OR co_author.hsa_id = @0
      ORDER BY area.name ASC
    `,
    [actorHsaId],
  )
  return rows.map(mapAreaRow)
}

export async function canAuthorArea(
  db: SqlServerDatabase,
  areaId: number,
  actorHsaId: string | null,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) {
    return true
  }

  if (!actorHsaId) {
    return false
  }

  const rows = await db.query(
    `
      SELECT TOP (1) area.id
      FROM requirement_areas area
      LEFT JOIN requirement_area_co_authors co_author
        ON co_author.area_id = area.id
      WHERE area.id = @0
        AND (area.owner_hsa_id = @1 OR co_author.hsa_id = @1)
    `,
    [areaId, actorHsaId],
  )
  return rows.length > 0
}

export async function canAuthorAnyArea(
  db: SqlServerDatabase,
  actorHsaId: string | null,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) {
    return true
  }

  if (!actorHsaId) {
    return false
  }

  const rows = await db.query(
    `
      SELECT TOP (1) area.id
      FROM requirement_areas area
      LEFT JOIN requirement_area_co_authors co_author
        ON co_author.area_id = area.id
      WHERE area.owner_hsa_id = @0 OR co_author.hsa_id = @0
    `,
    [actorHsaId],
  )
  return rows.length > 0
}

export async function getAreaById(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementAreaRow | null> {
  const rows = await db.query(
    `
      SELECT
        id,
        prefix,
        name,
        description,
        owner_hsa_id AS ownerHsaId,
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

export async function createArea(
  db: SqlServerDatabase,
  data: {
    prefix: string
    name: string
    description?: string
    ownerHsaId: string
    ownerPerson?: RequirementResponsibilityPersonRecord
  },
): Promise<RequirementAreaRow> {
  const now = new Date()
  const ownerPerson = data.ownerPerson
  const insertArea = async (executor: QueryExecutor) => {
    const rows = await executor.query(
      `
        INSERT INTO requirement_areas (
          prefix,
          name,
          description,
          owner_hsa_id,
          created_at,
          updated_at
        )
        OUTPUT
          inserted.id AS id,
          inserted.prefix AS prefix,
          inserted.name AS name,
          inserted.description AS description,
          inserted.owner_hsa_id AS ownerHsaId,
          inserted.next_sequence AS nextSequence,
          inserted.created_at AS createdAt,
          inserted.updated_at AS updatedAt
        VALUES (@0, @1, @2, @3, @4, @4)
      `,
      [data.prefix, data.name, data.description ?? null, data.ownerHsaId, now],
    )
    return mapAreaRow((rows as RequirementAreaRow[])[0])
  }

  if (ownerPerson) {
    return db.transaction(async manager => {
      await upsertRequirementResponsibilityPerson(manager, ownerPerson)
      return insertArea(manager)
    })
  }

  return insertArea(db)
}

async function updateAreaFields(
  db: QueryExecutor,
  id: number,
  data: {
    name?: string
    description?: string
    ownerHsaId?: string
  },
): Promise<RequirementAreaRow | undefined> {
  const sets: string[] = []
  const params: Array<string | number | Date | null> = []

  if (data.name !== undefined) {
    params.push(data.name)
    sets.push(`name = @${params.length - 1}`)
  }
  if (data.description !== undefined) {
    params.push(data.description)
    sets.push(`description = @${params.length - 1}`)
  }
  if (data.ownerHsaId !== undefined) {
    params.push(data.ownerHsaId)
    sets.push(`owner_hsa_id = @${params.length - 1}`)
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
        inserted.owner_hsa_id AS ownerHsaId,
        inserted.next_sequence AS nextSequence,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      WHERE id = @${params.length - 1}
    `,
    params,
  )
  return (rows as RequirementAreaRow[])[0]
    ? mapAreaRow((rows as RequirementAreaRow[])[0])
    : undefined
}

export async function updateArea(
  db: SqlServerDatabase,
  id: number,
  data: {
    name?: string
    description?: string
    ownerHsaId?: string
    ownerPerson?: RequirementResponsibilityPersonRecord
  },
): Promise<RequirementAreaRow | undefined> {
  const ownerPerson = data.ownerPerson
  if (!ownerPerson) return updateAreaFields(db, id, data)

  return db.transaction(async manager => {
    const oldRows = (await manager.query(
      `
        SELECT owner_hsa_id AS ownerHsaId
        FROM requirement_areas
        WHERE id = @0
      `,
      [id],
    )) as Array<{ ownerHsaId: string }>
    const updated = await updateAreaFields(manager, id, data)
    if (!updated) return undefined
    await upsertRequirementResponsibilityPerson(manager, ownerPerson)
    await cleanupUnassignedRequirementResponsibilityPeople(
      manager,
      oldRows.map(row => row.ownerHsaId),
    )
    return updated
  })
}

export async function deleteArea(
  db: SqlServerDatabase,
  id: number,
): Promise<number> {
  return db.transaction(async manager => {
    const assignmentRows = (await manager.query(
      `
        SELECT owner_hsa_id AS hsaId
        FROM requirement_areas
        WHERE id = @0
        UNION
        SELECT hsa_id AS hsaId
        FROM requirement_area_co_authors
        WHERE area_id = @0
      `,
      [id],
    )) as Array<{ hsaId: string }>
    const rows = await manager.query(
      `
        DELETE FROM requirement_areas
        OUTPUT deleted.id AS id
        WHERE id = @0
      `,
      [id],
    )
    await cleanupUnassignedRequirementResponsibilityPeople(
      manager,
      assignmentRows.map(row => row.hsaId),
    )
    return rows.length
  })
}
