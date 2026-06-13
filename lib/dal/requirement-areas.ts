import {
  cleanupUnassignedRequirementResponsibilityPeople,
  upsertRequirementResponsibilityPerson,
} from '@/lib/dal/requirement-responsibility-people'
import type { SqlServerDatabase } from '@/lib/db'
import { conflictError, validationError } from '@/lib/requirements/errors'
import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'
import { formatRequirementResponsibilityPersonName } from '@/lib/requirements/responsibility-person'
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

export interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

export interface RequirementAreaCoAuthorSummary {
  displayName: string | null
  email: string | null
  hsaId: string
}

export type RequirementAreaOwnerPersonResolver = (
  executor: QueryExecutor,
  ownerHsaId: string,
) => Promise<RequirementResponsibilityPersonRecord>

function mapAreaRow(row: RequirementAreaRow): RequirementAreaRow {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

function uniqueHsaIds(hsaIds: string[] | undefined): string[] {
  return [...new Set((hsaIds ?? []).map(hsaId => hsaId.trim()).filter(Boolean))]
}

function normalizeHsaIdForComparison(hsaId: string): string {
  return hsaId.trim().toLowerCase()
}

function assertResponsibilityPersonHsaId(
  person: RequirementResponsibilityPersonRecord,
  expectedHsaId: string,
  reason: string,
  message: string,
): RequirementResponsibilityPersonRecord {
  if (
    normalizeHsaIdForComparison(person.hsaId) !==
    normalizeHsaIdForComparison(expectedHsaId)
  ) {
    throw validationError(message, { reason })
  }
  return person
}

function toStr(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function displayNameFromPersonRow(row: Record<string, unknown>): string | null {
  const hsaId = toStr(row.hsaId)
  const givenName = toStr(row.givenName)
  if (!hsaId || !givenName) return null
  return formatRequirementResponsibilityPersonName({
    givenName,
    hsaId,
    middleName: toStr(row.middleName),
    surname: toStr(row.surname),
  })
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

export async function listAreaIdsActorCanAuthor(
  db: SqlServerDatabase,
  actorHsaId: string | null,
): Promise<number[]> {
  if (!actorHsaId) {
    return []
  }

  const rows = (await db.query(
    `
      SELECT DISTINCT area.id AS id
      FROM requirement_areas area
      LEFT JOIN requirement_area_co_authors co_author
        ON co_author.area_id = area.id
      WHERE area.owner_hsa_id = @0 OR co_author.hsa_id = @0
      ORDER BY area.id ASC
    `,
    [actorHsaId],
  )) as Array<{ id: number }>
  return rows.map(row => Number(row.id)).filter(Number.isInteger)
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

export async function canManageAreaCoAuthors(
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
      SELECT TOP (1) id
      FROM requirement_areas
      WHERE id = @0
        AND owner_hsa_id = @1
    `,
    [areaId, actorHsaId],
  )
  return rows.length > 0
}

export async function listRequirementAreaCoAuthors(
  db: SqlServerDatabase,
  areaId: number,
): Promise<RequirementAreaCoAuthorSummary[]> {
  const rows = (await db.query(
    `
      SELECT
        co_author.hsa_id AS hsaId,
        person.given_name AS givenName,
        person.middle_name AS middleName,
        person.surname AS surname,
        person.email AS email
      FROM requirement_area_co_authors co_author
      LEFT JOIN requirement_responsibility_people person
        ON person.hsa_id = co_author.hsa_id
      WHERE co_author.area_id = @0
      ORDER BY person.surname ASC, person.given_name ASC, co_author.hsa_id ASC
    `,
    [areaId],
  )) as Array<Record<string, unknown>>

  return rows.map(row => ({
    displayName: displayNameFromPersonRow(row),
    email: toStr(row.email),
    hsaId: String(row.hsaId),
  }))
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
    prefix?: string
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
  if (data.prefix !== undefined) {
    params.push(data.prefix)
    sets.push(`prefix = @${params.length - 1}`)
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
    prefix?: string
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

export async function updateAreaWithOwnerCheck(
  db: SqlServerDatabase,
  id: number,
  data: {
    name?: string
    description?: string
    ownerHsaId?: string
    ownerPerson?: RequirementResponsibilityPersonRecord
    prefix?: string
    resolveOwnerPerson?: RequirementAreaOwnerPersonResolver
  },
): Promise<RequirementAreaRow | undefined> {
  if (data.ownerHsaId === undefined && data.prefix === undefined) {
    return updateArea(db, id, data)
  }

  return db.transaction('SERIALIZABLE', async manager => {
    const oldRows = (await manager.query(
      `
        SELECT owner_hsa_id AS ownerHsaId, prefix
        FROM requirement_areas WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @0
      `,
      [id],
    )) as Array<{ ownerHsaId: string; prefix: string }>
    if (oldRows.length === 0) return undefined

    if (data.prefix !== undefined && data.prefix !== oldRows[0].prefix) {
      const requirementRows = (await manager.query(
        `
          SELECT TOP (1) id
          FROM requirements WITH (UPDLOCK, HOLDLOCK)
          WHERE requirement_area_id = @0
        `,
        [id],
      )) as Array<{ id: number }>
      if (requirementRows.length > 0) {
        throw conflictError(
          'Requirement area prefix cannot be changed after requirements exist',
          { reason: 'requirement_area_prefix_locked', requirementAreaId: id },
        )
      }
    }

    const ownerHsaId = data.ownerHsaId
    if (ownerHsaId !== undefined) {
      const coAuthorRows = (await manager.query(
        `
          SELECT TOP (1) area_id AS areaId
          FROM requirement_area_co_authors WITH (UPDLOCK, HOLDLOCK)
          WHERE area_id = @0
            AND hsa_id = @1
        `,
        [id, ownerHsaId],
      )) as Array<{ areaId: number }>
      if (coAuthorRows.length > 0) {
        throw validationError(
          'Requirement area owner cannot also be requirement area co-author',
          { reason: 'area_owner_cannot_be_co_author' },
        )
      }
    }

    const ownerPerson =
      ownerHsaId === undefined
        ? undefined
        : data.ownerPerson
          ? assertResponsibilityPersonHsaId(
              data.ownerPerson,
              ownerHsaId,
              'owner_person_hsa_id_mismatch',
              'Requirement area owner person must match owner HSA-id',
            )
          : data.resolveOwnerPerson
            ? assertResponsibilityPersonHsaId(
                await data.resolveOwnerPerson(manager, ownerHsaId),
                ownerHsaId,
                'owner_person_hsa_id_mismatch',
                'Requirement area owner person must match owner HSA-id',
              )
            : undefined
    if (ownerPerson) {
      await upsertRequirementResponsibilityPerson(manager, ownerPerson)
    }

    const updated = await updateAreaFields(manager, id, data)
    if (!updated) return undefined
    if (ownerHsaId !== undefined) {
      await cleanupUnassignedRequirementResponsibilityPeople(
        manager,
        oldRows.map(row => row.ownerHsaId),
      )
    }
    return updated
  })
}

async function insertRequirementAreaCoAuthors(
  db: QueryExecutor,
  areaId: number,
  coAuthorHsaIds: string[],
  createdBy: { displayName: string | null; hsaId: string | null } | undefined,
  createdAt = new Date(),
): Promise<void> {
  for (const hsaId of coAuthorHsaIds) {
    await db.query(
      `
        INSERT INTO requirement_area_co_authors (
          area_id,
          hsa_id,
          created_at,
          created_by_hsa_id,
          created_by_display_name
        )
        SELECT @0, @1, @2, @3, @4
        WHERE NOT EXISTS (
          SELECT 1
          FROM requirement_area_co_authors
          WHERE area_id = @0
            AND hsa_id = @1
        )
      `,
      [
        areaId,
        hsaId,
        createdAt,
        createdBy?.hsaId ?? null,
        createdBy?.displayName ?? null,
      ],
    )
  }
}

async function syncRequirementAreaCoAuthors(
  db: QueryExecutor,
  areaId: number,
  nextHsaIds: string[],
  changedBy: { displayName: string | null; hsaId: string | null } | undefined,
): Promise<string[]> {
  const existingRows = (await db.query(
    `
      SELECT hsa_id AS hsaId
      FROM requirement_area_co_authors
      WHERE area_id = @0
    `,
    [areaId],
  )) as Array<{ hsaId: string }>
  const existingIds = existingRows.map(row => row.hsaId)
  const nextIdSet = new Set(nextHsaIds)
  const existingIdSet = new Set(existingIds)
  const removedIds = existingIds.filter(hsaId => !nextIdSet.has(hsaId))
  const addedIds = nextHsaIds.filter(hsaId => !existingIdSet.has(hsaId))

  if (removedIds.length > 0) {
    const placeholders = removedIds
      .map((_, index) => `@${index + 1}`)
      .join(', ')
    await db.query(
      `
        DELETE FROM requirement_area_co_authors
        WHERE area_id = @0
          AND hsa_id IN (${placeholders})
      `,
      [areaId, ...removedIds],
    )
  }

  await insertRequirementAreaCoAuthors(db, areaId, addedIds, changedBy)

  return removedIds
}

export async function replaceRequirementAreaCoAuthors(
  db: SqlServerDatabase,
  areaId: number,
  data: {
    changedBy?: { displayName: string | null; hsaId: string | null }
    coAuthorHsaIds: string[]
    coAuthorPeople?: RequirementResponsibilityPersonRecord[]
  },
): Promise<{ areaId: number; coAuthorHsaIds: string[] } | undefined> {
  return db.transaction('SERIALIZABLE', async manager => {
    const areaRows = (await manager.query(
      `
        SELECT owner_hsa_id AS ownerHsaId
        FROM requirement_areas WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @0
      `,
      [areaId],
    )) as Array<{ ownerHsaId: string }>
    const area = areaRows[0]
    if (!area) return undefined

    const coAuthorHsaIds = uniqueHsaIds(data.coAuthorHsaIds)
    if (coAuthorHsaIds.includes(area.ownerHsaId)) {
      throw validationError(
        'Requirement area owner cannot also be requirement area co-author',
        { reason: 'area_owner_cannot_be_co_author' },
      )
    }

    const coAuthorHsaIdSet = new Set(
      coAuthorHsaIds.map(normalizeHsaIdForComparison),
    )
    for (const coAuthorPerson of data.coAuthorPeople ?? []) {
      if (
        !coAuthorHsaIdSet.has(normalizeHsaIdForComparison(coAuthorPerson.hsaId))
      ) {
        throw validationError(
          'Requirement area co-author person must match a co-author HSA-id',
          { reason: 'co_author_person_hsa_id_mismatch' },
        )
      }
      await upsertRequirementResponsibilityPerson(manager, coAuthorPerson)
    }
    const removedHsaIds = await syncRequirementAreaCoAuthors(
      manager,
      areaId,
      coAuthorHsaIds,
      data.changedBy,
    )
    await cleanupUnassignedRequirementResponsibilityPeople(
      manager,
      removedHsaIds,
    )
    return { areaId, coAuthorHsaIds }
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
