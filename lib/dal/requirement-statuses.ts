import type { SqlServerDatabase } from '@/lib/db'
import {
  type RequirementStatusEntity,
  requirementStatusEntity,
} from '@/lib/typeorm/entities'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface RequirementStatusRow {
  color: string
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
    .find({ order: { sortOrder: 'ASC' } })
  return rows.map(mapStatus)
}

export async function getStatusById(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementStatusRecord | null> {
  const row = await db
    .getRepository(requirementStatusEntity)
    .findOne({ where: { id } })
  return row ? mapStatus(row) : null
}

export async function createStatus(
  db: SqlServerDatabase,
  data: {
    nameSv: string
    nameEn: string
    sortOrder: number
    color: string
    isSystem?: boolean
  },
): Promise<RequirementStatusRecord> {
  const repository = db.getRepository(requirementStatusEntity)
  const row = await repository.save(
    repository.create({
      nameSv: data.nameSv,
      nameEn: data.nameEn,
      sortOrder: data.sortOrder,
      color: data.color,
      isSystem: data.isSystem ?? false,
    }),
  )
  return mapStatus(row)
}

export async function updateStatus(
  db: SqlServerDatabase,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    sortOrder?: number
    color?: string
  },
): Promise<RequirementStatusRecord | undefined> {
  const repository = db.getRepository(requirementStatusEntity)
  const patch: Partial<RequirementStatusEntity> = {}
  if (data.nameSv !== undefined) patch.nameSv = data.nameSv
  if (data.nameEn !== undefined) patch.nameEn = data.nameEn
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  if (data.color !== undefined) patch.color = data.color
  if (Object.keys(patch).length > 0) {
    await repository.update(id, patch)
  }
  const row = await repository.findOne({ where: { id } })
  return row ? mapStatus(row) : undefined
}

export async function deleteStatus(db: SqlServerDatabase, id: number) {
  const status = await getStatusById(db, id)
  if (!status) throw new Error('Status not found')
  if (status.isSystem) throw new Error('Cannot delete a system status')

  const usage = (
    await db.query(
      `
        SELECT COUNT(*) AS count
        FROM requirement_versions
        WHERE requirement_status_id = @0
      `,
      [id],
    )
  )[0]
  if (usage.count > 0) {
    throw new Error(
      'Cannot delete a status that is in use by requirement versions',
    )
  }

  await db.getRepository(requirementStatusEntity).delete(id)
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
