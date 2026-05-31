import type { SqlServerDatabase } from '@/lib/db'
import { toBoolean, toIsoString } from '@/lib/typeorm/value-mappers'

interface RequirementPackageRow {
  createdAt: string
  description: string | null
  id: number
  isArchived: boolean
  leadDisplayName: string
  leadHsaId: string
  name: string
  updatedAt: string
}

interface RequirementPackageUsage {
  answerLinkCount: number
  libraryRequirementCount: number
  localRequirementCount: number
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

export type {
  LinkedRequirementRow,
  RequirementPackageRow,
  RequirementPackageUsage,
}

function mapRequirementPackageRow(
  row: Record<string, unknown>,
): RequirementPackageRow {
  return {
    createdAt: toIsoString(row.createdAt as Date | string),
    description: row.description as string | null,
    id: row.id as number,
    isArchived: toBoolean(row.isArchived as boolean | number | string),
    leadDisplayName: row.leadDisplayName as string,
    leadHsaId: row.leadHsaId as string,
    name: row.name as string,
    updatedAt: toIsoString(row.updatedAt as Date | string),
  }
}

export async function listRequirementPackages(
  db: SqlServerDatabase,
  options: { includeArchived?: boolean } = {},
): Promise<RequirementPackageRow[]> {
  const rows = await db.query(
    `
      SELECT
        requirementPackages.id AS id,
        requirementPackages.name AS name,
        requirementPackages.description AS description,
        requirementPackages.lead_hsa_id AS leadHsaId,
        requirementPackages.lead_display_name AS leadDisplayName,
        requirementPackages.is_archived AS isArchived,
        requirementPackages.created_at AS createdAt,
        requirementPackages.updated_at AS updatedAt
      FROM requirement_packages AS requirementPackages
      WHERE @0 = 1 OR requirementPackages.is_archived = 0
      ORDER BY requirementPackages.is_archived ASC, requirementPackages.name ASC
    `,
    [options.includeArchived ? 1 : 0],
  )
  return rows.map(mapRequirementPackageRow)
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
  const rows = await db.query(
    `
      SELECT
        requirementPackages.id AS id,
        requirementPackages.name AS name,
        requirementPackages.description AS description,
        requirementPackages.lead_hsa_id AS leadHsaId,
        requirementPackages.lead_display_name AS leadDisplayName,
        requirementPackages.is_archived AS isArchived,
        requirementPackages.created_at AS createdAt,
        requirementPackages.updated_at AS updatedAt
      FROM requirement_packages AS requirementPackages
      WHERE requirementPackages.id = @0
    `,
    [id],
  )
  return rows[0] ? mapRequirementPackageRow(rows[0]) : null
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
  db: SqlServerDatabase,
  data: {
    description?: string | null
    leadDisplayName: string
    leadHsaId: string
    name: string
  },
): Promise<RequirementPackageRow> {
  const now = new Date()
  const rows = await db.query(
    `
      INSERT INTO requirement_packages (
        name,
        description,
        lead_hsa_id,
        lead_display_name,
        is_archived,
        created_at,
        updated_at
      )
      OUTPUT
        inserted.id AS id,
        inserted.name AS name,
        inserted.description AS description,
        inserted.lead_hsa_id AS leadHsaId,
        inserted.lead_display_name AS leadDisplayName,
        inserted.is_archived AS isArchived,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      VALUES (@0, @1, @2, @3, 0, @4, @4)
    `,
    [
      data.name,
      data.description ?? null,
      data.leadHsaId,
      data.leadDisplayName,
      now,
    ],
  )
  return mapRequirementPackageRow(rows[0])
}

export async function updateRequirementPackage(
  db: SqlServerDatabase,
  id: number,
  data: {
    description?: string | null
    leadDisplayName?: string
    leadHsaId?: string
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
  if (data.leadDisplayName !== undefined) {
    params.push(data.leadDisplayName)
    sets.push(`lead_display_name = @${params.length - 1}`)
  }

  params.push(new Date())
  sets.push(`updated_at = @${params.length - 1}`)
  params.push(id)

  const rows = await db.query(
    `
      UPDATE requirement_packages
      SET ${sets.join(', ')}
      OUTPUT
        inserted.id AS id,
        inserted.name AS name,
        inserted.description AS description,
        inserted.lead_hsa_id AS leadHsaId,
        inserted.lead_display_name AS leadDisplayName,
        inserted.is_archived AS isArchived,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      WHERE id = @${params.length - 1}
    `,
    params,
  )
  return rows[0] ? mapRequirementPackageRow(rows[0]) : undefined
}

async function setRequirementPackageArchived(
  db: SqlServerDatabase,
  id: number,
  isArchived: boolean,
): Promise<RequirementPackageRow | undefined> {
  const rows = await db.query(
    `
      UPDATE requirement_packages
      SET is_archived = @0, updated_at = @1
      OUTPUT
        inserted.id AS id,
        inserted.name AS name,
        inserted.description AS description,
        inserted.lead_hsa_id AS leadHsaId,
        inserted.lead_display_name AS leadDisplayName,
        inserted.is_archived AS isArchived,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      WHERE id = @2
    `,
    [isArchived ? 1 : 0, new Date(), id],
  )
  return rows[0] ? mapRequirementPackageRow(rows[0]) : undefined
}

export async function archiveRequirementPackage(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementPackageRow | undefined> {
  return setRequirementPackageArchived(db, id, true)
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
): Promise<number> {
  const rows = await db.query(
    `
      DELETE FROM requirement_packages
      OUTPUT deleted.id AS id
      WHERE id = @0
        AND NOT EXISTS (
          SELECT 1
          FROM requirement_version_requirement_packages AS links
          WHERE links.requirement_package_id = requirement_packages.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM specification_local_requirement_requirement_packages AS links
          WHERE links.requirement_package_id = requirement_packages.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM requirement_selection_answer_packages AS links
          WHERE links.requirement_package_id = requirement_packages.id
        )
    `,
    [id],
  )
  return rows.length
}
