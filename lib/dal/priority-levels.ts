import type { SqlServerDatabase } from '@/lib/db'
import { conflictError, notFoundError } from '@/lib/requirements/errors'
import {
  type PriorityLevelEntity,
  priorityLevelEntity,
} from '@/lib/typeorm/entities'

const SYSTEM_PRIORITY_LEVEL_IDS = [1, 2, 3, 4, 5] as const
type SystemPriorityLevelId = (typeof SYSTEM_PRIORITY_LEVEL_IDS)[number]

export interface PriorityLevelRow {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface LinkedRequirementRow {
  description: string | null
  id: number
  statusColor: string | null
  statusIconName: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

export type { LinkedRequirementRow }

function map(row: PriorityLevelEntity): PriorityLevelRow {
  return {
    assessmentCriteriaEn: row.assessmentCriteriaEn,
    assessmentCriteriaSv: row.assessmentCriteriaSv,
    code: row.code,
    color: row.color,
    descriptionEn: row.descriptionEn,
    descriptionSv: row.descriptionSv,
    iconName: row.iconName ?? null,
    id: row.id,
    nameEn: row.nameEn,
    nameSv: row.nameSv,
    sortOrder: row.sortOrder,
  }
}

function isSystemPriorityLevelId(id: number): id is SystemPriorityLevelId {
  return SYSTEM_PRIORITY_LEVEL_IDS.includes(id as SystemPriorityLevelId)
}

export async function listPriorityLevels(
  db: SqlServerDatabase,
): Promise<PriorityLevelRow[]> {
  const rows = await db
    .getRepository(priorityLevelEntity)
    .find({ order: { sortOrder: 'ASC' } })
  return rows.map(map)
}

export async function getPriorityLevelById(
  db: SqlServerDatabase,
  id: number,
): Promise<PriorityLevelRow | null> {
  const row = await db
    .getRepository(priorityLevelEntity)
    .findOne({ where: { id } })
  return row ? map(row) : null
}

export async function countLinkedRequirements(
  db: SqlServerDatabase,
): Promise<Record<number, number>> {
  const rows = await db.query(`
    SELECT
      linked.priorityLevelId,
      COUNT(*) AS count
    FROM (
      SELECT DISTINCT
        priority_level_id AS priorityLevelId,
        CONCAT(N'library:', requirement_id) AS itemKey
      FROM requirement_versions
      WHERE priority_level_id IS NOT NULL
      UNION
      SELECT DISTINCT
        priority_level_id AS priorityLevelId,
        CONCAT(N'local:', id) AS itemKey
      FROM specification_local_requirements
      WHERE priority_level_id IS NOT NULL
    ) linked
    GROUP BY linked.priorityLevelId
  `)
  const counts: Record<number, number> = {}
  for (const row of rows as Array<{
    count: number
    priorityLevelId: number | null
  }>) {
    if (row.priorityLevelId != null) {
      counts[row.priorityLevelId] = row.count
    }
  }
  return counts
}

export async function getLinkedRequirements(
  db: SqlServerDatabase,
  priorityLevelId: number,
): Promise<LinkedRequirementRow[]> {
  return db.query(
    `
      SELECT
        linked.id,
        linked.uniqueId,
        linked.description,
        linked.versionNumber,
        linked.statusNameSv,
        linked.statusNameEn,
        linked.statusColor,
        linked.statusIconName
      FROM (
        SELECT
          requirements.id AS id,
          requirements.unique_id AS uniqueId,
          requirement_versions.description AS description,
          requirement_versions.version_number AS versionNumber,
          requirement_statuses.name_sv AS statusNameSv,
          requirement_statuses.name_en AS statusNameEn,
          requirement_statuses.color AS statusColor,
          requirement_statuses.icon_name AS statusIconName
        FROM requirement_versions
        INNER JOIN requirements
          ON requirement_versions.requirement_id = requirements.id
        LEFT JOIN requirement_statuses
          ON requirement_versions.requirement_status_id = requirement_statuses.id
        WHERE requirement_versions.priority_level_id = @0
        UNION
        SELECT
          local_requirement.id AS id,
          local_requirement.unique_id AS uniqueId,
          local_requirement.description AS description,
          1 AS versionNumber,
          specification_item_status.name_sv AS statusNameSv,
          specification_item_status.name_en AS statusNameEn,
          specification_item_status.color AS statusColor,
          specification_item_status.icon_name AS statusIconName
        FROM specification_local_requirements local_requirement
        LEFT JOIN specification_item_statuses specification_item_status
          ON local_requirement.specification_item_status_id = specification_item_status.id
        WHERE local_requirement.priority_level_id = @0
      ) linked
      ORDER BY linked.uniqueId ASC
    `,
    [priorityLevelId],
  )
}

export async function updatePriorityLevel(
  db: SqlServerDatabase,
  id: number,
  data: {
    assessmentCriteriaEn?: string
    assessmentCriteriaSv?: string
    color?: string
    descriptionEn?: string
    descriptionSv?: string
    iconName?: string | null
    nameEn?: string
    nameSv?: string
    sortOrder?: number
  },
): Promise<PriorityLevelRow | undefined> {
  if (!isSystemPriorityLevelId(id)) {
    throw conflictError('Only system priority levels can be edited')
  }
  const repository = db.getRepository(priorityLevelEntity)
  const patch: Partial<PriorityLevelEntity> = {}
  if (data.assessmentCriteriaEn !== undefined) {
    patch.assessmentCriteriaEn = data.assessmentCriteriaEn
  }
  if (data.assessmentCriteriaSv !== undefined) {
    patch.assessmentCriteriaSv = data.assessmentCriteriaSv
  }
  if (data.color !== undefined) patch.color = data.color
  if (data.descriptionEn !== undefined) patch.descriptionEn = data.descriptionEn
  if (data.descriptionSv !== undefined) patch.descriptionSv = data.descriptionSv
  if (data.iconName !== undefined) patch.iconName = data.iconName
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  if (!row) throw notFoundError('Priority level not found')
  return row ? map(row) : undefined
}
