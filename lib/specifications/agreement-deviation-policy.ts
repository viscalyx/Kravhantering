import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import { conflictError, notFoundError } from '@/lib/requirements/errors'
import { activateDueAgreements } from '@/lib/specifications/agreement-activation'

/** Serialize case decisions with changes to the agreement containing the reviewed content. */
export async function assertDeviationMutationAllowed(
  db: SqlExecutor,
  kind: 'library' | 'local',
  deviationId: number,
  agreementId?: number,
): Promise<void> {
  const library = kind === 'library'
  const cases = library
    ? 'deviations'
    : 'specification_local_requirement_deviations'
  const items = library
    ? 'requirements_specification_items'
    : 'specification_local_requirements'
  const binding = library
    ? 'specification_item_id'
    : 'specification_local_requirement_id'
  const parent = library ? 'requirements_specification_id' : 'specification_id'
  const rows = await db.query<
    Array<{ specificationId: number; itemId: number }>
  >(
    `SELECT item.${parent} AS specificationId, item.id AS itemId
     FROM ${cases} deviation INNER JOIN ${items} item ON item.id = deviation.${binding}
     WHERE deviation.id = @0`,
    [deviationId],
  )
  const target = rows[0]
  if (!target) throw notFoundError('Deviation not found')
  await db.query(
    'SELECT id FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0',
    [target.specificationId],
  )
  await activateDueAgreements(db, target.specificationId, new Date())
  const eligible = await db.query<Array<{ id: number }>>(
    `SELECT item.id FROM ${items} item WHERE item.id = @0 AND (
      EXISTS (SELECT 1 FROM specification_agreement_items membership
        INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
        WHERE membership.${binding} = item.id AND membership.is_removed = 0
          AND (agreement.is_current = 1 OR agreement.is_pending = 1)
          AND (@2 IS NULL OR agreement.id = @2))
      OR (@2 IS NULL AND item.valid_until IS NULL AND NOT EXISTS (
        SELECT 1 FROM specification_agreements WHERE specification_id = @1 AND cancelled_at IS NULL)))`,
    [target.itemId, target.specificationId, agreementId ?? null],
  )
  if (!eligible[0])
    throw conflictError(
      'The selected agreement content is historical or has changed',
      { reason: 'binding_reserved' },
    )
}
