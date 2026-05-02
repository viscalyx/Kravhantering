import type { SqlServerDatabase } from '@/lib/db'
import { toIsoString } from '@/lib/typeorm/value-mappers'

interface ScenarioOwner {
  email: string
  firstName: string
  id: number
  lastName: string
}

interface ScenarioRow {
  createdAt: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  ownerId: number | null
  updatedAt: string
}

interface ScenarioWithOwner extends ScenarioRow {
  owner: ScenarioOwner | null
}

interface LinkedRequirementRow {
  description: string | null
  id: number
  statusColor: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

export type { LinkedRequirementRow, ScenarioRow, ScenarioWithOwner }

function mapScenarioRow(row: Record<string, unknown>): ScenarioWithOwner {
  return {
    createdAt: toIsoString(row.createdAt as Date | string),
    descriptionEn: row.descriptionEn as string | null,
    descriptionSv: row.descriptionSv as string | null,
    id: row.id as number,
    nameEn: row.nameEn as string,
    nameSv: row.nameSv as string,
    owner:
      row.owner_id_join == null
        ? null
        : {
            email: row.owner_email as string,
            firstName: row.owner_firstName as string,
            id: row.owner_id_join as number,
            lastName: row.owner_lastName as string,
          },
    ownerId: row.ownerId as number | null,
    updatedAt: toIsoString(row.updatedAt as Date | string),
  }
}

export async function listScenarios(
  db: SqlServerDatabase,
): Promise<ScenarioWithOwner[]> {
  const rows = await db.query(`
    SELECT
      scenarios.id AS id,
      scenarios.name_sv AS nameSv,
      scenarios.name_en AS nameEn,
      scenarios.description_sv AS descriptionSv,
      scenarios.description_en AS descriptionEn,
      scenarios.owner_id AS ownerId,
      scenarios.created_at AS createdAt,
      scenarios.updated_at AS updatedAt,
      owners.id AS owner_id_join,
      owners.first_name AS owner_firstName,
      owners.last_name AS owner_lastName,
      owners.email AS owner_email
    FROM usage_scenarios AS scenarios
    LEFT JOIN owners
      ON scenarios.owner_id = owners.id
    ORDER BY scenarios.name_sv ASC
  `)
  return rows.map(mapScenarioRow)
}

export async function countLinkedRequirements(
  db: SqlServerDatabase,
): Promise<Record<number, number>> {
  const rows = await db.query(`
    SELECT
      usage_scenario_id AS scenarioId,
      COUNT(DISTINCT requirement_id) AS count
    FROM requirement_version_usage_scenarios AS links
    INNER JOIN requirement_versions AS versions
      ON links.requirement_version_id = versions.id
    GROUP BY usage_scenario_id
  `)
  const counts: Record<number, number> = {}
  for (const row of rows as Array<{ count: number; scenarioId: number }>) {
    counts[row.scenarioId] = row.count
  }
  return counts
}

export async function getLinkedRequirements(
  db: SqlServerDatabase,
  scenarioId: number,
): Promise<LinkedRequirementRow[]> {
  return db.query(
    `
      SELECT
        requirements.id AS id,
        requirements.unique_id AS uniqueId,
        requirement_versions.description AS description,
        requirement_versions.version_number AS versionNumber,
        requirement_versions.requirement_status_id AS statusId,
        requirement_statuses.name_sv AS statusNameSv,
        requirement_statuses.name_en AS statusNameEn,
        requirement_statuses.color AS statusColor
      FROM requirement_version_usage_scenarios AS links
      INNER JOIN requirement_versions
        ON links.requirement_version_id = requirement_versions.id
      INNER JOIN requirements
        ON requirement_versions.requirement_id = requirements.id
      LEFT JOIN requirement_statuses
        ON requirement_versions.requirement_status_id = requirement_statuses.id
      WHERE links.usage_scenario_id = @0
      ORDER BY requirements.unique_id ASC
    `,
    [scenarioId],
  )
}

export async function getScenarioById(
  db: SqlServerDatabase,
  id: number,
): Promise<ScenarioWithOwner | null> {
  const rows = await db.query(
    `
      SELECT
        scenarios.id AS id,
        scenarios.name_sv AS nameSv,
        scenarios.name_en AS nameEn,
        scenarios.description_sv AS descriptionSv,
        scenarios.description_en AS descriptionEn,
        scenarios.owner_id AS ownerId,
        scenarios.created_at AS createdAt,
        scenarios.updated_at AS updatedAt,
        owners.id AS owner_id_join,
        owners.first_name AS owner_firstName,
        owners.last_name AS owner_lastName,
        owners.email AS owner_email
      FROM usage_scenarios AS scenarios
      LEFT JOIN owners
        ON scenarios.owner_id = owners.id
      WHERE scenarios.id = @0
    `,
    [id],
  )
  return rows[0] ? mapScenarioRow(rows[0]) : null
}

export async function createScenario(
  db: SqlServerDatabase,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string
    descriptionEn?: string
    ownerId?: number | null
  },
): Promise<ScenarioRow> {
  const now = new Date()
  const rows = await db.query(
    `
      INSERT INTO usage_scenarios (
        name_sv,
        name_en,
        description_sv,
        description_en,
        owner_id,
        created_at,
        updated_at
      )
      OUTPUT
        inserted.id AS id,
        inserted.name_sv AS nameSv,
        inserted.name_en AS nameEn,
        inserted.description_sv AS descriptionSv,
        inserted.description_en AS descriptionEn,
        inserted.owner_id AS ownerId,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      VALUES (@0, @1, @2, @3, @4, @5, @5)
    `,
    [
      data.nameSv,
      data.nameEn,
      data.descriptionSv ?? null,
      data.descriptionEn ?? null,
      data.ownerId ?? null,
      now,
    ],
  )
  return {
    ...rows[0],
    createdAt: toIsoString(rows[0].createdAt),
    updatedAt: toIsoString(rows[0].updatedAt),
  }
}

export async function updateScenario(
  db: SqlServerDatabase,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    descriptionSv?: string
    descriptionEn?: string
    ownerId?: number | null
  },
): Promise<ScenarioRow | undefined> {
  const sets: string[] = []
  const params: Array<string | number | Date | null> = []

  if (data.nameSv !== undefined) {
    params.push(data.nameSv)
    sets.push(`name_sv = @${params.length - 1}`)
  }
  if (data.nameEn !== undefined) {
    params.push(data.nameEn)
    sets.push(`name_en = @${params.length - 1}`)
  }
  if (data.descriptionSv !== undefined) {
    params.push(data.descriptionSv)
    sets.push(`description_sv = @${params.length - 1}`)
  }
  if (data.descriptionEn !== undefined) {
    params.push(data.descriptionEn)
    sets.push(`description_en = @${params.length - 1}`)
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
      UPDATE usage_scenarios
      SET ${sets.join(', ')}
      OUTPUT
        inserted.id AS id,
        inserted.name_sv AS nameSv,
        inserted.name_en AS nameEn,
        inserted.description_sv AS descriptionSv,
        inserted.description_en AS descriptionEn,
        inserted.owner_id AS ownerId,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      WHERE id = @${params.length - 1}
    `,
    params,
  )
  return rows[0]
    ? {
        ...rows[0],
        createdAt: toIsoString(rows[0].createdAt),
        updatedAt: toIsoString(rows[0].updatedAt),
      }
    : undefined
}

export async function deleteScenario(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.query(`DELETE FROM usage_scenarios WHERE id = @0`, [id])
}
