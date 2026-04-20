import { eq, sql } from 'drizzle-orm'
import {
  requirementStatuses,
  requirementStatusTransitions,
  requirementVersions,
} from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'
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

function mapStatusRow(row: RequirementStatusRow): RequirementStatusRecord {
  return {
    ...row,
    isSystem: toBoolean(row.isSystem),
  }
}

export async function listStatuses(
  db: AppDatabaseConnection,
): Promise<RequirementStatusRecord[]> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn,
        sort_order AS sortOrder,
        color,
        is_system AS isSystem
      FROM requirement_statuses
      ORDER BY sort_order ASC
    `)
    return rows.map(mapStatusRow)
  }

  return db.query.requirementStatuses.findMany({
    orderBy: [requirementStatuses.sortOrder],
  })
}

export async function getStatusById(
  db: AppDatabaseConnection,
  id: number,
): Promise<RequirementStatusRecord | null> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        SELECT
          id,
          name_sv AS nameSv,
          name_en AS nameEn,
          sort_order AS sortOrder,
          color,
          is_system AS isSystem
        FROM requirement_statuses
        WHERE id = @0
      `,
      [id],
    )
    return rows[0] ? mapStatusRow(rows[0]) : null
  }

  return (await db.query.requirementStatuses.findFirst({
    where: eq(requirementStatuses.id, id),
  })) ?? null
}

export async function createStatus(
  db: AppDatabaseConnection,
  data: {
    nameSv: string
    nameEn: string
    sortOrder: number
    color: string
    isSystem?: boolean
  },
): Promise<RequirementStatusRecord> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO requirement_statuses (
          name_sv,
          name_en,
          sort_order,
          color,
          is_system
        )
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn,
          inserted.sort_order AS sortOrder,
          inserted.color AS color,
          inserted.is_system AS isSystem
        VALUES (@0, @1, @2, @3, @4)
      `,
      [
        data.nameSv,
        data.nameEn,
        data.sortOrder,
        data.color,
        data.isSystem ?? false,
      ],
    )
    return mapStatusRow(rows[0])
  }

  const [status] = await db.insert(requirementStatuses).values(data).returning()
  return status
}

export async function updateStatus(
  db: AppDatabaseConnection,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    sortOrder?: number
    color?: string
  },
): Promise<RequirementStatusRecord | undefined> {
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

    if (data.sortOrder !== undefined) {
      params.push(data.sortOrder)
      sets.push(`sort_order = @${params.length - 1}`)
    }

    if (data.color !== undefined) {
      params.push(data.color)
      sets.push(`color = @${params.length - 1}`)
    }

    if (sets.length === 0) {
      return (await getStatusById(db, id)) ?? undefined
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE requirement_statuses
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn,
          inserted.sort_order AS sortOrder,
          inserted.color AS color,
          inserted.is_system AS isSystem
        WHERE id = @${params.length - 1}
      `,
      params,
    )
    return rows[0] ? mapStatusRow(rows[0]) : undefined
  }

  const [updated] = await db
    .update(requirementStatuses)
    .set(data)
    .where(eq(requirementStatuses.id, id))
    .returning()
  return updated
}

export async function deleteStatus(db: AppDatabaseConnection, id: number) {
  // Check if system status
  const status = await getStatusById(db, id)
  if (!status) throw new Error('Status not found')
  if (status.isSystem) throw new Error('Cannot delete a system status')

  // Check if in use
  const usage = isSqlServerDatabaseConnection(db)
    ? (
        await db.query(
          `
            SELECT COUNT(*) AS count
            FROM requirement_versions
            WHERE requirement_status_id = @0
          `,
          [id],
        )
      )[0]
    : (
        await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(requirementVersions)
          .where(eq(requirementVersions.statusId, id))
      )[0]
  if (usage.count > 0) {
    throw new Error(
      'Cannot delete a status that is in use by requirement versions',
    )
  }

  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM requirement_statuses WHERE id = @0`, [id])
    return
  }

  await db.delete(requirementStatuses).where(eq(requirementStatuses.id, id))
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export async function listTransitions(
  db: AppDatabaseConnection,
): Promise<RequirementStatusTransitionDetail[]> {
  if (isSqlServerDatabaseConnection(db)) {
    const [transitions, statuses] = await Promise.all([
      db.query(`
        SELECT
          id,
          from_requirement_status_id AS fromStatusId,
          to_requirement_status_id AS toStatusId
        FROM requirement_status_transitions
        ORDER BY id ASC
      `),
      listStatuses(db),
    ])
    const statusById = new Map(
      statuses.map((status: RequirementStatusRecord) => [status.id, status]),
    )

    return transitions.flatMap((transition: RequirementStatusTransitionRow) => {
      const fromStatus = statusById.get(transition.fromStatusId)
      const toStatus = statusById.get(transition.toStatusId)
      if (!fromStatus || !toStatus) {
        return []
      }

      return [{ ...transition, fromStatus, toStatus }]
    })
  }

  return db.query.requirementStatusTransitions.findMany({
    with: {
      fromStatus: true,
      toStatus: true,
    },
  })
}

export async function getTransitionsFrom(
  db: AppDatabaseConnection,
  statusId: number,
): Promise<RequirementStatusRecord[]> {
  if (isSqlServerDatabaseConnection(db)) {
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
      ),
      listStatuses(db),
    ])
    const statusById = new Map(
      statuses.map((status: RequirementStatusRecord) => [status.id, status]),
    )
    const nextStatuses: Array<RequirementStatusRecord | null> = transitions
      .map(
        (transition: RequirementStatusTransitionRow) =>
          statusById.get(transition.toStatusId) ?? null,
      )
    return nextStatuses
      .filter(
        (status: RequirementStatusRecord | null): status is RequirementStatusRecord =>
          status !== null,
      )
  }

  const rows = await db.query.requirementStatusTransitions.findMany({
    where: eq(requirementStatusTransitions.fromStatusId, statusId),
    with: {
      toStatus: true,
    },
  })
  return rows.map(r => r.toStatus)
}

export async function createTransition(
  db: AppDatabaseConnection,
  fromStatusId: number,
  toStatusId: number,
): Promise<RequirementStatusTransitionRow> {
  if (isSqlServerDatabaseConnection(db)) {
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

  const [transition] = await db
    .insert(requirementStatusTransitions)
    .values({ fromStatusId, toStatusId })
    .returning()
  return transition
}

export async function deleteTransition(db: AppDatabaseConnection, id: number) {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM requirement_status_transitions WHERE id = @0`, [
      id,
    ])
    return
  }

  await db
    .delete(requirementStatusTransitions)
    .where(eq(requirementStatusTransitions.id, id))
}
