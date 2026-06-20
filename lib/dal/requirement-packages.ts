import {
  cleanupUnassignedRequirementResponsibilityPeople,
  upsertRequirementResponsibilityPerson,
} from '@/lib/dal/requirement-responsibility-people'
import {
  cleanupRequirementSelectionPackageLinks,
  type RequirementSelectionCleanupResult,
} from '@/lib/dal/requirement-selection-questions'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import {
  formatRequirementResponsibilityPersonName,
  type RequirementResponsibilityPersonRecord,
} from '@/lib/requirements/responsibility-person'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'
import { toBoolean, toIsoString } from '@/lib/typeorm/value-mappers'

interface RequirementPackageRow {
  coAuthors: RequirementPackageCoAuthorRow[]
  createdAt: string
  description: string | null
  id: number
  isArchived: boolean
  leadDisplayName: string
  leadEmail: string | null
  leadHsaId: string
  name: string
  updatedAt: string
}

interface RequirementPackageCoAuthorRow {
  createdAt: string
  displayName: string
  email: string | null
  hsaId: string
}

interface RequirementPackageUsage {
  answerLinkCount: number
  libraryRequirementCount: number
  localRequirementCount: number
}

interface RequirementPackageMutationResult {
  cleanup: RequirementSelectionCleanupResult
  requirementPackage: RequirementPackageRow
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

interface LinkedRequirementRow {
  archiveInitiatedAt: string | null
  description: string | null
  id: number
  statusColor: string | null
  statusIconName: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

interface LinkedRequirementDbRow
  extends Omit<LinkedRequirementRow, 'archiveInitiatedAt'> {
  archiveInitiatedAt: Date | string | null
}

function emptyRequirementSelectionCleanup(): RequirementSelectionCleanupResult {
  return {
    affectedAnswerIds: [],
    affectedRequirementIds: [],
    removedLinkCount: 0,
  }
}

export type {
  LinkedRequirementRow,
  RequirementPackageCoAuthorRow,
  RequirementPackageMutationResult,
  RequirementPackageRow,
  RequirementPackageUsage,
}

function mapRequirementPackageRow(
  row: Record<string, unknown>,
): RequirementPackageRow {
  const leadHsaId = row.leadHsaId as string
  const leadGivenName = row.leadGivenName as string | null | undefined
  return {
    coAuthors: [],
    createdAt: toIsoString(row.createdAt as Date | string),
    description: row.description as string | null,
    id: row.id as number,
    isArchived: toBoolean(row.isArchived as boolean | number | string),
    leadDisplayName: leadGivenName
      ? formatRequirementResponsibilityPersonName({
          givenName: leadGivenName,
          hsaId: leadHsaId,
          middleName: row.leadMiddleName as string | null,
          surname: row.leadSurname as string | null,
        })
      : leadHsaId,
    leadEmail: (row.leadEmail as string | null | undefined) ?? null,
    leadHsaId,
    name: row.name as string,
    updatedAt: toIsoString(row.updatedAt as Date | string),
  }
}

function mapRequirementPackageCoAuthorRow(
  row: Record<string, unknown>,
): RequirementPackageCoAuthorRow {
  const hsaId = row.hsaId as string
  return {
    createdAt: toIsoString(row.createdAt as Date | string),
    displayName: formatRequirementResponsibilityPersonName({
      givenName: row.givenName as string,
      hsaId,
      middleName: row.middleName as string | null,
      surname: row.surname as string | null,
    }),
    email: row.email as string | null,
    hsaId,
  }
}

function uniqueHsaIds(hsaIds: string[] | undefined): string[] {
  return [...new Set((hsaIds ?? []).map(hsaId => hsaId.trim()).filter(Boolean))]
}

function canStartTransaction(
  db: QueryExecutor,
): db is QueryExecutor & Pick<SqlServerDatabase, 'transaction'> {
  return typeof (db as Partial<SqlServerDatabase>).transaction === 'function'
}

async function listRequirementPackageCoAuthorsByPackage(
  db: QueryExecutor,
  requirementPackageIds: number[],
): Promise<Record<number, RequirementPackageCoAuthorRow[]>> {
  const ids = [...new Set(requirementPackageIds)]
  if (ids.length === 0) return {}

  const placeholders = ids.map((_, index) => `@${index}`).join(', ')
  const rows = (await db.query(
    `
      SELECT
        co_author.requirement_package_id AS requirementPackageId,
        co_author.hsa_id AS hsaId,
        person.given_name AS givenName,
        person.middle_name AS middleName,
        person.surname AS surname,
        person.email AS email,
        co_author.created_at AS createdAt
      FROM requirement_package_co_authors AS co_author
      INNER JOIN requirement_responsibility_people AS person
        ON person.hsa_id = co_author.hsa_id
      WHERE co_author.requirement_package_id IN (${placeholders})
      ORDER BY
        co_author.requirement_package_id ASC,
        person.surname ASC,
        person.given_name ASC,
        co_author.hsa_id ASC
    `,
    ids,
  )) as Record<string, unknown>[]

  const coAuthorsByPackage: Record<number, RequirementPackageCoAuthorRow[]> = {}
  for (const row of rows) {
    const requirementPackageId = row.requirementPackageId as number
    coAuthorsByPackage[requirementPackageId] ??= []
    coAuthorsByPackage[requirementPackageId].push(
      mapRequirementPackageCoAuthorRow(row),
    )
  }
  return coAuthorsByPackage
}

export async function listRequirementPackageCoAuthors(
  db: SqlServerDatabase,
  requirementPackageId: number,
): Promise<RequirementPackageCoAuthorRow[]> {
  const coAuthorsByPackage = await listRequirementPackageCoAuthorsByPackage(
    db,
    [requirementPackageId],
  )
  return coAuthorsByPackage[requirementPackageId] ?? []
}

async function getRequirementPackageRowById(
  db: QueryExecutor,
  id: number,
): Promise<RequirementPackageRow | null> {
  const rows = await db.query<Record<string, unknown>[]>(
    `
      SELECT
        requirementPackages.id AS id,
        requirementPackages.name AS name,
        requirementPackages.description AS description,
        requirementPackages.lead_hsa_id AS leadHsaId,
        lead_person.given_name AS leadGivenName,
        lead_person.middle_name AS leadMiddleName,
        lead_person.surname AS leadSurname,
        lead_person.email AS leadEmail,
        requirementPackages.is_archived AS isArchived,
        requirementPackages.created_at AS createdAt,
        requirementPackages.updated_at AS updatedAt
      FROM requirement_packages AS requirementPackages
      INNER JOIN requirement_responsibility_people AS lead_person
        ON lead_person.hsa_id = requirementPackages.lead_hsa_id
      WHERE requirementPackages.id = @0
    `,
    [id],
  )
  const row = rows[0] ? mapRequirementPackageRow(rows[0]) : null
  if (!row) return null
  const coAuthorsByPackage = await listRequirementPackageCoAuthorsByPackage(
    db,
    [id],
  )
  return {
    ...row,
    coAuthors: coAuthorsByPackage[id] ?? [],
  }
}

export async function listRequirementPackages(
  db: SqlServerDatabase,
  options: { includeArchived?: boolean } = {},
): Promise<RequirementPackageRow[]> {
  const rows = (await db.query(
    `
      SELECT
        requirementPackages.id AS id,
        requirementPackages.name AS name,
        requirementPackages.description AS description,
        requirementPackages.lead_hsa_id AS leadHsaId,
        lead_person.given_name AS leadGivenName,
        lead_person.middle_name AS leadMiddleName,
        lead_person.surname AS leadSurname,
        lead_person.email AS leadEmail,
        requirementPackages.is_archived AS isArchived,
        requirementPackages.created_at AS createdAt,
        requirementPackages.updated_at AS updatedAt
      FROM requirement_packages AS requirementPackages
      INNER JOIN requirement_responsibility_people AS lead_person
        ON lead_person.hsa_id = requirementPackages.lead_hsa_id
      WHERE @0 = 1 OR requirementPackages.is_archived = 0
      ORDER BY requirementPackages.is_archived ASC, requirementPackages.name ASC
    `,
    [options.includeArchived ? 1 : 0],
  )) as Record<string, unknown>[]
  const packages = rows.map(mapRequirementPackageRow)
  const coAuthorsByPackage = await listRequirementPackageCoAuthorsByPackage(
    db,
    packages.map(requirementPackage => requirementPackage.id),
  )
  return packages.map(requirementPackage => ({
    ...requirementPackage,
    coAuthors: coAuthorsByPackage[requirementPackage.id] ?? [],
  }))
}

export async function countLinkedRequirementsByPackage(
  db: SqlServerDatabase,
): Promise<Record<number, number>> {
  const rows = await db.query(`
    SELECT
      requirement_package_id AS requirementPackageId,
      COUNT(DISTINCT requirement_id) AS count
    FROM requirement_version_requirement_packages AS links
    INNER JOIN requirement_versions AS versions
      ON links.requirement_version_id = versions.id
    WHERE versions.requirement_status_id = ${STATUS_PUBLISHED}
    GROUP BY requirement_package_id
  `)
  const counts: Record<number, number> = {}
  for (const row of rows as Array<{
    count: number
    requirementPackageId: number
  }>) {
    counts[row.requirementPackageId] = row.count
  }
  return counts
}

export async function getLinkedRequirementsForPackage(
  db: SqlServerDatabase,
  requirementPackageId: number,
): Promise<LinkedRequirementRow[]> {
  const rows = (await db.query(
    `
      SELECT
        requirements.id AS id,
        requirements.unique_id AS uniqueId,
        requirement_versions.description AS description,
        requirement_versions.version_number AS versionNumber,
        requirement_versions.requirement_status_id AS statusId,
        requirement_versions.archive_initiated_at AS archiveInitiatedAt,
        requirement_statuses.name_sv AS statusNameSv,
        requirement_statuses.name_en AS statusNameEn,
        requirement_statuses.color AS statusColor,
        requirement_statuses.icon_name AS statusIconName
      FROM requirement_version_requirement_packages AS links
      INNER JOIN requirement_versions
        ON links.requirement_version_id = requirement_versions.id
      INNER JOIN requirements
        ON requirement_versions.requirement_id = requirements.id
      LEFT JOIN requirement_statuses
        ON requirement_versions.requirement_status_id = requirement_statuses.id
      WHERE links.requirement_package_id = @0
        AND requirement_versions.requirement_status_id = ${STATUS_PUBLISHED}
      ORDER BY requirements.unique_id ASC
    `,
    [requirementPackageId],
  )) as LinkedRequirementDbRow[]
  return rows.map(row => ({
    ...row,
    archiveInitiatedAt:
      row.archiveInitiatedAt == null
        ? null
        : toIsoString(row.archiveInitiatedAt as Date | string),
  })) as LinkedRequirementRow[]
}

export async function getRequirementPackageById(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementPackageRow | null> {
  return getRequirementPackageRowById(db, id)
}

export async function getRequirementPackageUsage(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementPackageUsage> {
  const [row] = (await db.query(
    `
      SELECT
        (
          SELECT COUNT(DISTINCT versions.requirement_id)
          FROM requirement_version_requirement_packages AS links
          INNER JOIN requirement_versions AS versions
            ON links.requirement_version_id = versions.id
          WHERE links.requirement_package_id = @0
            AND versions.requirement_status_id = ${STATUS_PUBLISHED}
        ) AS libraryRequirementCount,
        (
          SELECT COUNT(DISTINCT links.specification_local_requirement_id)
          FROM specification_local_requirement_requirement_packages AS links
          WHERE links.requirement_package_id = @0
        ) AS localRequirementCount,
        (
          SELECT COUNT(DISTINCT links.answer_id)
          FROM requirement_selection_answer_packages AS links
          WHERE links.requirement_package_id = @0
        ) AS answerLinkCount
    `,
    [id],
  )) as Array<{
    answerLinkCount: number
    libraryRequirementCount: number
    localRequirementCount: number
  }>
  return {
    answerLinkCount: Number(row?.answerLinkCount ?? 0),
    libraryRequirementCount: Number(row?.libraryRequirementCount ?? 0),
    localRequirementCount: Number(row?.localRequirementCount ?? 0),
  }
}

export async function createRequirementPackage(
  db: SqlServerDatabase | QueryExecutor,
  data: {
    description?: string | null
    leadHsaId: string
    leadPerson?: RequirementResponsibilityPersonRecord
    name: string
  },
  options: { useExistingTransaction?: boolean } = {},
): Promise<RequirementPackageRow> {
  const now = new Date()
  const leadPerson = data.leadPerson
  const insertPackage = async (executor: QueryExecutor) => {
    const rows = await executor.query(
      `
        INSERT INTO requirement_packages (
          name,
          description,
          lead_hsa_id,
          is_archived,
          created_at,
          updated_at
        )
        OUTPUT
          inserted.id AS id,
          inserted.name AS name,
          inserted.description AS description,
          inserted.lead_hsa_id AS leadHsaId,
          inserted.is_archived AS isArchived,
          inserted.created_at AS createdAt,
          inserted.updated_at AS updatedAt
        VALUES (@0, @1, @2, 0, @3, @3)
      `,
      [data.name, data.description ?? null, data.leadHsaId, now],
    )
    const inserted = rows[0] as Record<string, unknown>
    const requirementPackageId = inserted.id as number
    return (
      (await getRequirementPackageRowById(executor, requirementPackageId)) ??
      mapRequirementPackageRow({
        ...inserted,
        leadGivenName: leadPerson?.givenName ?? null,
        leadMiddleName: leadPerson?.middleName ?? null,
        leadSurname: leadPerson?.surname ?? null,
      })
    )
  }

  const createWithResponsibilityPeople = async (executor: QueryExecutor) => {
    if (leadPerson) {
      await upsertRequirementResponsibilityPerson(executor, leadPerson)
    }
    return insertPackage(executor)
  }

  if (
    leadPerson &&
    !options.useExistingTransaction &&
    canStartTransaction(db)
  ) {
    return db.transaction(async manager => {
      return createWithResponsibilityPeople(manager)
    })
  }

  return leadPerson ? createWithResponsibilityPeople(db) : insertPackage(db)
}

export async function updateRequirementPackage(
  db: SqlServerDatabase,
  id: number,
  data: {
    description?: string | null
    leadHsaId?: string
    leadPerson?: RequirementResponsibilityPersonRecord
    name?: string
  },
): Promise<RequirementPackageRow | undefined> {
  const leadPerson = data.leadPerson
  if (leadPerson) {
    return db.transaction(async manager => {
      const oldRows = (await manager.query(
        `
          SELECT lead_hsa_id AS leadHsaId
          FROM requirement_packages
          WHERE id = @0
        `,
        [id],
      )) as Array<{ leadHsaId: string }>
      if (oldRows.length === 0) return undefined

      if (leadPerson) {
        await upsertRequirementResponsibilityPerson(manager, leadPerson)
      }
      const updated = await updateRequirementPackageFields(manager, id, data)
      await cleanupUnassignedRequirementResponsibilityPeople(manager, [
        ...(data.leadHsaId === undefined
          ? []
          : oldRows.map(row => row.leadHsaId)),
      ])
      return updated
    })
  }

  return updateRequirementPackageFields(db, id, data)
}

async function updateRequirementPackageFields(
  db: QueryExecutor,
  id: number,
  data: {
    description?: string | null
    leadHsaId?: string
    leadPerson?: RequirementResponsibilityPersonRecord
    name?: string
  },
): Promise<RequirementPackageRow | undefined> {
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
  if (data.leadHsaId !== undefined) {
    params.push(data.leadHsaId)
    sets.push(`lead_hsa_id = @${params.length - 1}`)
  }

  params.push(new Date())
  sets.push(`updated_at = @${params.length - 1}`)
  params.push(id)

  await db.query(
    `
      UPDATE requirement_packages
      SET ${sets.join(', ')}
      WHERE id = @${params.length - 1}
    `,
    params,
  )
  return (await getRequirementPackageRowById(db, id)) ?? undefined
}

async function insertRequirementPackageCoAuthors(
  db: QueryExecutor,
  requirementPackageId: number,
  coAuthorHsaIds: string[],
  createdBy: { displayName: string | null; hsaId: string | null } | undefined,
  createdAt = new Date(),
): Promise<void> {
  for (const hsaId of coAuthorHsaIds) {
    await db.query(
      `
        INSERT INTO requirement_package_co_authors (
          requirement_package_id,
          hsa_id,
          created_at,
          created_by_hsa_id,
          created_by_display_name
        )
        SELECT @0, @1, @2, @3, @4
        WHERE NOT EXISTS (
          SELECT 1
          FROM requirement_package_co_authors
          WHERE requirement_package_id = @0
            AND hsa_id = @1
        )
      `,
      [
        requirementPackageId,
        hsaId,
        createdAt,
        createdBy?.hsaId ?? null,
        createdBy?.displayName ?? null,
      ],
    )
  }
}

async function syncRequirementPackageCoAuthors(
  db: QueryExecutor,
  requirementPackageId: number,
  nextHsaIds: string[],
  changedBy: { displayName: string | null; hsaId: string | null } | undefined,
): Promise<string[]> {
  const existingRows = (await db.query(
    `
      SELECT hsa_id AS hsaId
      FROM requirement_package_co_authors
      WHERE requirement_package_id = @0
    `,
    [requirementPackageId],
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
        DELETE FROM requirement_package_co_authors
        WHERE requirement_package_id = @0
          AND hsa_id IN (${placeholders})
      `,
      [requirementPackageId, ...removedIds],
    )
  }

  await insertRequirementPackageCoAuthors(
    db,
    requirementPackageId,
    addedIds,
    changedBy,
  )

  return removedIds
}

export async function replaceRequirementPackageCoAuthors(
  db: SqlServerDatabase,
  requirementPackageId: number,
  data: {
    changedBy?: { displayName: string | null; hsaId: string | null }
    coAuthorHsaIds: string[]
    coAuthorPeople?: RequirementResponsibilityPersonRecord[]
  },
): Promise<
  { coAuthorHsaIds: string[]; requirementPackageId: number } | undefined
> {
  return db.transaction('SERIALIZABLE', async manager => {
    const packageRows = (await manager.query(
      `
        SELECT lead_hsa_id AS leadHsaId
        FROM requirement_packages WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @0
      `,
      [requirementPackageId],
    )) as Array<{ leadHsaId: string }>
    const requirementPackage = packageRows[0]
    if (!requirementPackage) return undefined

    const coAuthorHsaIds = uniqueHsaIds(data.coAuthorHsaIds)
    if (coAuthorHsaIds.includes(requirementPackage.leadHsaId)) {
      throw validationError('Package lead cannot also be package co-author', {
        reason: 'package_lead_cannot_be_co_author',
      })
    }

    const coAuthorHsaIdSet = new Set(coAuthorHsaIds)
    for (const coAuthorPerson of data.coAuthorPeople ?? []) {
      if (!coAuthorHsaIdSet.has(coAuthorPerson.hsaId)) {
        throw validationError(
          'Requirement package co-author person must match a co-author HSA-id',
          { reason: 'co_author_person_hsa_id_mismatch' },
        )
      }
      await upsertRequirementResponsibilityPerson(manager, coAuthorPerson)
    }

    const removedHsaIds = await syncRequirementPackageCoAuthors(
      manager,
      requirementPackageId,
      coAuthorHsaIds,
      data.changedBy,
    )
    await cleanupUnassignedRequirementResponsibilityPeople(
      manager,
      removedHsaIds,
    )

    return { coAuthorHsaIds, requirementPackageId }
  })
}

async function setRequirementPackageArchived(
  db: QueryExecutor,
  id: number,
  isArchived: boolean,
): Promise<RequirementPackageRow | undefined> {
  await db.query<Record<string, unknown>[]>(
    `
      UPDATE requirement_packages
      SET is_archived = @0, updated_at = @1
      WHERE id = @2
    `,
    [isArchived ? 1 : 0, new Date(), id],
  )
  return (await getRequirementPackageRowById(db, id)) ?? undefined
}

export async function archiveRequirementPackage(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementPackageMutationResult | undefined> {
  return db.transaction(async manager => {
    const cleanup = await cleanupRequirementSelectionPackageLinks(manager, [id])
    const requirementPackage = await setRequirementPackageArchived(
      manager,
      id,
      true,
    )
    return requirementPackage ? { cleanup, requirementPackage } : undefined
  })
}

export async function reactivateRequirementPackage(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementPackageRow | undefined> {
  return setRequirementPackageArchived(db, id, false)
}

export async function deleteRequirementPackage(
  db: SqlServerDatabase,
  id: number,
): Promise<{
  cleanup: RequirementSelectionCleanupResult
  deletedCount: number
}> {
  return db.transaction(async manager => {
    const assignmentRows = (await manager.query(
      `
        SELECT lead_hsa_id AS hsaId
        FROM requirement_packages
        WHERE id = @0
        UNION
        SELECT hsa_id AS hsaId
        FROM requirement_package_co_authors
        WHERE requirement_package_id = @0
      `,
      [id],
    )) as Array<{ hsaId: string }>
    const deletableRows = (await manager.query(
      `
        SELECT requirement_package.id AS id
        FROM requirement_packages AS requirement_package
        WHERE requirement_package.id = @0
          AND NOT EXISTS (
            SELECT 1
            FROM requirement_version_requirement_packages AS links
            WHERE links.requirement_package_id = requirement_package.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM specification_local_requirement_requirement_packages AS links
            WHERE links.requirement_package_id = requirement_package.id
          )
      `,
      [id],
    )) as Array<{ id: number }>
    if (deletableRows.length === 0) {
      return {
        cleanup: emptyRequirementSelectionCleanup(),
        deletedCount: 0,
      }
    }
    const cleanup = await cleanupRequirementSelectionPackageLinks(manager, [id])
    const rows = await manager.query(
      `
        DELETE FROM requirement_packages
        OUTPUT deleted.id AS id
        WHERE id = @0
      `,
      [id],
    )
    await cleanupUnassignedRequirementResponsibilityPeople(
      manager,
      assignmentRows.map(row => row.hsaId),
    )
    return { cleanup, deletedCount: rows.length }
  })
}
