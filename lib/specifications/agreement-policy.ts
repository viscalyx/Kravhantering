import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import { conflictError, notFoundError } from '@/lib/requirements/errors'

async function lockEstablishmentStatus(
  db: SqlExecutor,
  specificationId: number,
): Promise<string> {
  const rows = await db.query<Array<{ establishmentStatus: string }>>(
    `SELECT establishment_status AS establishmentStatus
     FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0`,
    [specificationId],
  )
  if (!rows[0]) throw notFoundError('Requirements specification not found')
  return rows[0].establishmentStatus
}

export async function assertSpecificationContentEditable(
  db: SqlExecutor,
  specificationId: number,
): Promise<void> {
  if ((await lockEstablishmentStatus(db, specificationId)) !== 'editable') {
    throw conflictError('Agreement content is locked', {
      reason: 'specification_content_locked',
    })
  }
}

export async function assertSpecificationDeletionAllowed(
  db: SqlExecutor,
  specificationId: number,
): Promise<void> {
  const status = await lockEstablishmentStatus(db, specificationId)
  if (status !== 'editable' && status !== 'ended') {
    throw conflictError('An active or unassessed agreement prevents deletion', {
      reason: 'specification_content_locked',
    })
  }
}

export async function assertNewDeviationAllowed(
  db: SqlExecutor,
  kind: 'library' | 'specificationLocal',
  itemId: number,
): Promise<void> {
  const table =
    kind === 'library'
      ? 'requirements_specification_items'
      : 'specification_local_requirements'
  const parentColumn =
    kind === 'library' ? 'requirements_specification_id' : 'specification_id'
  const parents = await db.query<Array<{ specificationId: number }>>(
    `SELECT ${parentColumn} AS specificationId FROM ${table} WHERE id = @0`,
    [itemId],
  )
  if (!parents[0]) throw notFoundError('Requirement application not found')
  await db.query(
    'SELECT id FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0',
    [parents[0].specificationId],
  )
  const rows = await db.query<Array<{ id: number }>>(
    `SELECT id FROM ${table} WHERE id = @0 AND valid_from <= SYSUTCDATETIME() AND valid_until IS NULL`,
    [itemId],
  )
  if (!rows[0])
    throw conflictError(
      'The application is historical or reserved for an agreed change',
      { reason: 'binding_reserved' },
    )
  const deviations =
    kind === 'library'
      ? 'deviations'
      : 'specification_local_requirement_deviations'
  const childColumn =
    kind === 'library'
      ? 'specification_item_id'
      : 'specification_local_requirement_id'
  const active = await db.query<Array<{ id: number }>>(
    `SELECT id FROM ${deviations} WHERE ${childColumn} = @0 AND decision IS NULL`,
    [itemId],
  )
  if (active.length)
    throw conflictError('The application already has an active deviation')
}

export async function assertApplicationFollowupAllowed(
  db: SqlExecutor,
  kind: 'library' | 'specificationLocal',
  itemId: number,
  statusId?: number,
): Promise<void> {
  const table =
    kind === 'library'
      ? 'requirements_specification_items'
      : 'specification_local_requirements'
  const parent =
    kind === 'library' ? 'requirements_specification_id' : 'specification_id'
  const parents = await db.query<Array<{ specificationId: number }>>(
    `SELECT ${parent} AS specificationId FROM ${table} WHERE id = @0`,
    [itemId],
  )
  if (!parents[0]) throw notFoundError('Requirement application not found')
  await db.query(
    'SELECT id FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0',
    [parents[0].specificationId],
  )
  const rows = await db.query<Array<{ requiresReassessment: boolean }>>(
    `SELECT is_reassessment_required AS requiresReassessment FROM ${table}
     WHERE id = @0 AND valid_from <= SYSUTCDATETIME() AND (valid_until IS NULL OR valid_until > SYSUTCDATETIME())`,
    [itemId],
  )
  if (!rows[0])
    throw conflictError('Historical or future applications cannot be changed')
  if (rows[0].requiresReassessment && (statusId === 3 || statusId === 4))
    throw conflictError('Explicit reassessment is required', {
      reason: 'reassessment_required',
    })
}

/** End membership without cascading the evidence attached to the old binding.
 * The caller holds the specification lock in its mutation transaction.
 */
export async function retireSpecificationApplications(
  db: SqlExecutor,
  specificationId: number,
  kind: 'library' | 'specificationLocal',
  ids: number[],
  byRequirement = false,
): Promise<number> {
  if (!ids.length) return 0
  const table =
    kind === 'library'
      ? 'requirements_specification_items'
      : 'specification_local_requirements'
  const parent =
    kind === 'library' ? 'requirements_specification_id' : 'specification_id'
  const deviations =
    kind === 'library'
      ? 'deviations'
      : 'specification_local_requirement_deviations'
  const child =
    kind === 'library'
      ? 'specification_item_id'
      : 'specification_local_requirement_id'
  const placeholders = ids.map((_, index) => `@${index + 1}`).join(', ')
  const condition = `item.${parent} = @0 AND item.${byRequirement ? 'requirement_id' : 'id'} IN (${placeholders}) AND item.valid_until IS NULL AND item.valid_from <= SYSUTCDATETIME()`
  const active = await db.query<Array<{ id: number }>>(
    `SELECT d.id FROM ${deviations} d INNER JOIN ${table} item ON item.id = d.${child}
     WHERE ${condition} AND d.decision IS NULL`,
    [specificationId, ...ids],
  )
  if (active.length)
    throw conflictError(
      'Cancel active deviations before removing the requirement',
      { reason: 'active_deviations' },
    )
  const rows = await db.query<Array<{ id: number }>>(
    `UPDATE item SET valid_until = SYSUTCDATETIME(), needs_reference_snapshot = needs.text
     OUTPUT INSERTED.id AS id FROM ${table} item
     LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
     WHERE ${condition}`,
    [specificationId, ...ids],
  )
  return rows.length
}
