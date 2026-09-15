import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import { conflictError, notFoundError } from '@/lib/requirements/errors'
import { activateDueAgreements } from '@/lib/specifications/agreement-activation'
import { guardAgreementRequirementChange } from '@/lib/specifications/agreement-deviation-endings'

async function lockSpecification(
  db: SqlExecutor,
  specificationId: number,
): Promise<void> {
  const rows = await db.query<Array<{ id: number }>>(
    'SELECT id FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0',
    [specificationId],
  )
  if (!rows[0]) throw notFoundError('Requirements specification not found')
  await activateDueAgreements(db, specificationId, new Date())
}

export async function assertSpecificationContentEditable(
  db: SqlExecutor,
  specificationId: number,
  agreementId?: number,
): Promise<void> {
  await lockSpecification(db, specificationId)
  if (agreementId !== undefined) {
    const drafts = await db.query<Array<{ id: number }>>(
      `SELECT id FROM specification_agreements WHERE id = @0 AND specification_id = @1 AND is_pending = 1 AND confirmed_at IS NULL`,
      [agreementId, specificationId],
    )
    if (!drafts[0])
      throw conflictError('An editable agreement draft is required', {
        reason: 'specification_content_locked',
      })
    return
  }
  const agreements = await db.query<Array<{ id: number }>>(
    'SELECT id FROM specification_agreements WHERE specification_id = @0 AND cancelled_at IS NULL',
    [specificationId],
  )
  if (agreements.length)
    throw conflictError(
      'Select an editable agreement draft to change agreement content',
      { reason: 'specification_content_locked' },
    )
}

export async function assertSpecificationDeletionAllowed(
  db: SqlExecutor,
  specificationId: number,
): Promise<void> {
  await lockSpecification(db, specificationId)
  const agreements = await db.query<Array<{ id: number }>>(
    'SELECT id FROM specification_agreements WHERE specification_id = @0 AND (is_pending = 1 OR is_current = 1)',
    [specificationId],
  )
  if (agreements.length)
    throw conflictError('A current or pending agreement prevents deletion', {
      reason: 'specification_content_locked',
    })
}

export async function assertNewDeviationAllowed(
  db: SqlExecutor,
  kind: 'library' | 'specificationLocal',
  itemId: number,
  agreementId?: number,
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
  await activateDueAgreements(db, parents[0].specificationId, new Date())
  const bindingColumn =
    kind === 'library'
      ? 'specification_item_id'
      : 'specification_local_requirement_id'
  if (agreementId !== undefined) {
    const selected = await db.query<Array<{ id: number }>>(
      `SELECT membership.id FROM specification_agreement_items membership
       INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
       WHERE agreement.id = @0 AND agreement.specification_id = @1
         AND (agreement.is_current = 1 OR agreement.is_pending = 1)
         AND membership.${bindingColumn} = @2 AND membership.is_removed = 0`,
      [agreementId, parents[0].specificationId, itemId],
    )
    if (!selected[0])
      throw conflictError(
        'The selected agreement content is historical or has changed',
        { reason: 'binding_reserved' },
      )
  }
  const rows = await db.query<Array<{ id: number }>>(
    `SELECT item.id FROM ${table} item WHERE item.id = @0 AND (
      EXISTS (SELECT 1 FROM specification_agreement_items membership
        INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
        WHERE membership.${bindingColumn} = item.id AND membership.is_removed = 0
          AND (agreement.is_current = 1 OR agreement.is_pending = 1))
      OR (item.valid_until IS NULL AND NOT EXISTS (SELECT 1 FROM specification_agreements
        WHERE specification_id = @1 AND cancelled_at IS NULL)))`,
    [itemId, parents[0].specificationId],
  )
  if (!rows[0])
    throw conflictError(
      'The application is historical or reserved for an agreed change',
      { reason: 'binding_reserved' },
    )
  const reservations = await db.query<Array<{ id: number }>>(
    `SELECT upcoming.id FROM specification_agreements upcoming
     WHERE upcoming.specification_id = @0 AND upcoming.is_pending = 1 AND upcoming.confirmed_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM specification_agreement_items current_item
         INNER JOIN specification_agreements current_agreement ON current_agreement.id = current_item.specification_agreement_id
         WHERE current_agreement.specification_id = @0 AND current_agreement.is_current = 1
           AND current_item.${bindingColumn} = @1 AND current_item.is_removed = 0)
       AND NOT EXISTS (SELECT 1 FROM specification_agreement_items replacement
         WHERE replacement.specification_agreement_id = upcoming.id
           AND replacement.${bindingColumn} = @1 AND replacement.is_removed = 0)`,
    [parents[0].specificationId, itemId],
  )
  if (reservations.length)
    throw conflictError(
      'The upcoming agreement replaces or removes this content',
      {
        reason: 'binding_reserved',
        agreementId: reservations[0].id,
      },
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
    throw conflictError('The application already has an active deviation', {
      reason: 'active_deviation_exists',
    })
}

export async function assertApplicationFollowupAllowed(
  db: SqlExecutor,
  kind: 'library' | 'specificationLocal',
  itemId: number,
  agreementId?: number,
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
  await activateDueAgreements(db, parents[0].specificationId, new Date())
  const column =
    kind === 'library'
      ? 'specification_item_id'
      : 'specification_local_requirement_id'
  const rows = await db.query<Array<{ id: number }>>(
    `SELECT item.id FROM ${table} item WHERE item.id = @0 AND (
      EXISTS (SELECT 1 FROM specification_agreement_items membership
        INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
        WHERE membership.${column} = item.id AND membership.is_removed = 0 AND agreement.is_current = 1 AND (@2 IS NULL OR agreement.id = @2))
      OR (@2 IS NULL AND item.valid_until IS NULL AND NOT EXISTS (SELECT 1 FROM specification_agreements
        WHERE specification_id = @1 AND cancelled_at IS NULL)))`,
    [itemId, parents[0].specificationId, agreementId ?? null],
  )
  if (!rows[0]) throw conflictError('Only current content supports follow-up')
}

/** End membership without cascading the evidence attached to the old binding.
 * The caller holds the specification lock in its mutation transaction.
 */
export interface WorkingRequirementChangeOptions {
  actorHsaId?: string | null
  authorizeDeviationEndings?: boolean
}

export async function retireSpecificationApplications(
  db: SqlExecutor,
  specificationId: number,
  kind: 'library' | 'specificationLocal',
  ids: number[],
  byRequirement = false,
  options: WorkingRequirementChangeOptions = {},
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
  const approved = await db.query<Array<{ id: number }>>(
    `SELECT DISTINCT item.id FROM ${table} item INNER JOIN ${deviations} deviation ON deviation.${child} = item.id
     WHERE ${condition} AND deviation.decision = 1 AND NOT EXISTS (SELECT 1 FROM specification_deviation_endings ending
       WHERE ending.${kind === 'library' ? 'deviation_id' : 'local_deviation_id'} = deviation.id AND ending.ended_at IS NOT NULL)`,
    [specificationId, ...ids],
  )
  for (const item of approved)
    await guardAgreementRequirementChange(
      db,
      specificationId,
      { actor: { hsaId: options.actorHsaId ?? null } },
      {
        itemRef: `${kind === 'library' ? 'lib' : 'local'}:${item.id}`,
        authorizeDeviationEndings: options.authorizeDeviationEndings,
      },
      new Date(),
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
