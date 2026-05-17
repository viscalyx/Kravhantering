import type { SqlServerDatabase } from '@/lib/db'
import { conflictError, notFoundError } from '@/lib/requirements/errors'
import {
  type RequirementStatusEntity,
  requirementStatusEntity,
} from '@/lib/typeorm/entities'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface RequirementStatusRow {
  color: string
  iconName: string | null
  id: number
  isSystem: boolean | number | string
  nameEn: string
  nameSv: string
  sortOrder: number
}

export interface RequirementStatusRecord
  extends Omit<RequirementStatusRow, 'isSystem'> {
  isSystem: boolean
}

export interface RequirementStatusTransitionRow {
  fromStatusId: number
  id: number
  toStatusId: number
}

export interface RequirementStatusTransitionDetail
  extends RequirementStatusTransitionRow {
  fromStatus: RequirementStatusRecord
  toStatus: RequirementStatusRecord
}

function mapStatus(row: RequirementStatusEntity): RequirementStatusRecord {
  return {
    color: row.color,
    iconName: row.iconName ?? null,
    id: row.id,
    isSystem: toBoolean(row.isSystem),
    nameEn: row.nameEn,
    nameSv: row.nameSv,
    sortOrder: row.sortOrder,
  }
}

export async function listStatuses(
  db: SqlServerDatabase,
): Promise<RequirementStatusRecord[]> {
  const rows = await db
    .getRepository(requirementStatusEntity)
    .find({ order: { sortOrder: 'ASC' }, where: { isSystem: true } })
  return rows.map(mapStatus)
}

async function getStatusById(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementStatusRecord | null> {
  const row = await db
    .getRepository(requirementStatusEntity)
    .findOne({ where: { id } })
  return row ? mapStatus(row) : null
}

export async function updateStatus(
  db: SqlServerDatabase,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    sortOrder?: number
    color?: string
    iconName?: string | null
  },
): Promise<RequirementStatusRecord | undefined> {
  const repository = db.getRepository(requirementStatusEntity)
  const existing = await getStatusById(db, id)
  if (!existing) throw notFoundError('Status not found')
  if (!existing.isSystem) {
    throw conflictError('Only system requirement statuses can be edited')
  }

  const patch: Partial<RequirementStatusEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  if (data.color !== undefined) patch.color = data.color
  if (data.iconName !== undefined) patch.iconName = data.iconName
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? mapStatus(row) : undefined
}

// ─── Transitions ─────────────────────────────────────────────────────────────
//
// Transitions are kept on raw SQL: the entity exposes its FK columns only as
// relations, so reading just the integer FK IDs would require loading both
// joined rows on every query. Raw `SELECT` of the FK columns is cheaper and
// matches how the calling service consumes the data.

export async function listTransitions(
  db: SqlServerDatabase,
): Promise<RequirementStatusTransitionDetail[]> {
  const [transitions, statuses] = await Promise.all([
    db.query(`
      SELECT
        id,
        from_requirement_status_id AS fromStatusId,
        to_requirement_status_id AS toStatusId
      FROM requirement_status_transitions
      ORDER BY id ASC
    `) as Promise<RequirementStatusTransitionRow[]>,
    listStatuses(db),
  ])
  const statusById = new Map(statuses.map(s => [s.id, s]))

  return transitions.flatMap(transition => {
    const fromStatus = statusById.get(transition.fromStatusId)
    const toStatus = statusById.get(transition.toStatusId)
    if (!fromStatus || !toStatus) {
      return []
    }
    return [{ ...transition, fromStatus, toStatus }]
  })
}

export async function getTransitionsFrom(
  db: SqlServerDatabase,
  statusId: number,
): Promise<RequirementStatusRecord[]> {
  const [transitions, statuses] = await Promise.all([
    db.query(
      `
        SELECT
          id,
          from_requirement_status_id AS fromStatusId,
          to_requirement_status_id AS toStatusId
        FROM requirement_status_transitions
        WHERE from_requirement_status_id = @0
      `,
      [statusId],
    ) as Promise<RequirementStatusTransitionRow[]>,
    listStatuses(db),
  ])
  const statusById = new Map(statuses.map(s => [s.id, s]))
  return transitions
    .map(transition => statusById.get(transition.toStatusId) ?? null)
    .filter((s): s is RequirementStatusRecord => s !== null)
}

export async function createTransition(
  db: SqlServerDatabase,
  fromStatusId: number,
  toStatusId: number,
): Promise<RequirementStatusTransitionRow> {
  const rows = await db.query(
    `
      INSERT INTO requirement_status_transitions (
        from_requirement_status_id,
        to_requirement_status_id
      )
      OUTPUT
        inserted.id AS id,
        inserted.from_requirement_status_id AS fromStatusId,
        inserted.to_requirement_status_id AS toStatusId
      VALUES (@0, @1)
    `,
    [fromStatusId, toStatusId],
  )
  return rows[0]
}

export async function deleteTransition(db: SqlServerDatabase, id: number) {
  await db.query(`DELETE FROM requirement_status_transitions WHERE id = @0`, [
    id,
  ])
}
