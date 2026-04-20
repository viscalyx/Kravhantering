import { eq, sql } from 'drizzle-orm'
import {
  requirementStatuses,
  requirements,
  requirementVersions,
  requirementVersionUsageScenarios,
  usageScenarios,
} from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'
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

export async function listScenarios(
  db: AppDatabaseConnection,
): Promise<ScenarioWithOwner[]> {
  if (isSqlServerDatabaseConnection(db)) {
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

    return rows.map((row: Record<string, unknown>) => ({
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
    }))
  }

  return db.query.usageScenarios.findMany({
    orderBy: [usageScenarios.nameSv],
    with: {
      owner: true,
    },
  })
}

export async function countLinkedRequirements(
  db: AppDatabaseConnection,
): Promise<Record<number, number>> {
  if (isSqlServerDatabaseConnection(db)) {
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

  const rows = await db
    .select({
      scenarioId: requirementVersionUsageScenarios.usageScenarioId,
      count:
        sql<number>`COUNT(DISTINCT ${requirementVersions.requirementId})`.as(
          'count',
        ),
    })
    .from(requirementVersionUsageScenarios)
    .innerJoin(
      requirementVersions,
      eq(
        requirementVersionUsageScenarios.requirementVersionId,
        requirementVersions.id,
      ),
    )
    .groupBy(requirementVersionUsageScenarios.usageScenarioId)
  const counts: Record<number, number> = {}
  for (const row of rows) {
    counts[row.scenarioId] = row.count
  }
  return counts
}

export async function getLinkedRequirements(
  db: AppDatabaseConnection,
  scenarioId: number,
): Promise<LinkedRequirementRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
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

  const rows = await db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      description: requirementVersions.description,
      versionNumber: requirementVersions.versionNumber,
      statusId: requirementVersions.statusId,
      statusNameSv: requirementStatuses.nameSv,
      statusNameEn: requirementStatuses.nameEn,
      statusColor: requirementStatuses.color,
    })
    .from(requirementVersionUsageScenarios)
    .innerJoin(
      requirementVersions,
      eq(
        requirementVersionUsageScenarios.requirementVersionId,
        requirementVersions.id,
      ),
    )
    .innerJoin(
      requirements,
      eq(requirementVersions.requirementId, requirements.id),
    )
    .leftJoin(
      requirementStatuses,
      eq(requirementVersions.statusId, requirementStatuses.id),
    )
    .where(eq(requirementVersionUsageScenarios.usageScenarioId, scenarioId))
    .orderBy(requirements.uniqueId)
  return rows
}

export async function getScenarioById(
  db: AppDatabaseConnection,
  id: number,
): Promise<ScenarioWithOwner | null> {
  if (isSqlServerDatabaseConnection(db)) {
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

    if (!rows[0]) {
      return null
    }

    const row = rows[0]

    return {
      createdAt: toIsoString(row.createdAt),
      descriptionEn: row.descriptionEn,
      descriptionSv: row.descriptionSv,
      id: row.id,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      owner:
        row.owner_id_join == null
          ? null
          : {
              email: row.owner_email,
              firstName: row.owner_firstName,
              id: row.owner_id_join,
              lastName: row.owner_lastName,
            },
      ownerId: row.ownerId,
      updatedAt: toIsoString(row.updatedAt),
    }
  }

  return (
    (await db.query.usageScenarios.findFirst({
      where: eq(usageScenarios.id, id),
      with: {
        owner: true,
      },
    })) ?? null
  )
}

export async function createScenario(
  db: AppDatabaseConnection,
  data: {
    nameSv: string
    nameEn: string
    descriptionSv?: string
    descriptionEn?: string
    ownerId?: number | null
  },
): Promise<ScenarioRow> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO usage_scenarios (
          name_sv,
          name_en,
          description_sv,
          description_en,
          owner_id
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
        VALUES (@0, @1, @2, @3, @4)
      `,
      [
        data.nameSv,
        data.nameEn,
        data.descriptionSv ?? null,
        data.descriptionEn ?? null,
        data.ownerId ?? null,
      ],
    )
    return {
      ...rows[0],
      createdAt: toIsoString(rows[0].createdAt),
      updatedAt: toIsoString(rows[0].updatedAt),
    }
  }

  const [scenario] = await db.insert(usageScenarios).values(data).returning()
  return scenario
}

export async function updateScenario(
  db: AppDatabaseConnection,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    descriptionSv?: string
    descriptionEn?: string
    ownerId?: number | null
  },
): Promise<ScenarioRow | undefined> {
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

  const [updated] = await db
    .update(usageScenarios)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(usageScenarios.id, id))
    .returning()
  return updated
}

export async function deleteScenario(
  db: AppDatabaseConnection,
  id: number,
): Promise<void> {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM usage_scenarios WHERE id = @0`, [id])
    return
  }

  await db.delete(usageScenarios).where(eq(usageScenarios.id, id))
}
