import {
  parseSpecificationItemRef,
  type SqlExecutor,
} from '@/lib/dal/requirements-specifications'
import {
  conflictError,
  forbiddenError,
  notFoundError,
} from '@/lib/requirements/errors'
import { stockholmDate } from '@/lib/specifications/agreement-dates'

/** The caller holds the specification lock and saves content in this transaction. */
export async function guardAgreementRequirementChange(
  db: SqlExecutor,
  specificationId: number,
  context: { actor: { hsaId: string | null } },
  input: {
    agreementId?: number
    itemRef: string
    authorizeDeviationEndings?: boolean
  },
  now: Date,
): Promise<void> {
  const ref = parseSpecificationItemRef(input.itemRef)
  if (!ref) throw notFoundError('Requirement not found')
  const library = ref.kind === 'library'
  const column = library
    ? 'specification_item_id'
    : 'specification_local_requirement_id'
  const caseColumn = library ? 'deviation_id' : 'local_deviation_id'
  const table = library
    ? 'deviations'
    : 'specification_local_requirement_deviations'
  const cases = await db.query<Array<{ id: number; decision: number | null }>>(
    `SELECT id, decision FROM ${table} deviation WHERE ${column} = @0
      AND (decision IS NULL OR (decision = 1 AND NOT EXISTS (SELECT 1 FROM specification_deviation_endings ending
        WHERE ending.${caseColumn} = deviation.id AND ending.ended_at IS NOT NULL)))`,
    [ref.id],
  )
  if (cases.some(deviation => deviation.decision === null)) {
    throw conflictError(
      'Cancel pending deviations before changing the requirement',
      { reason: 'active_deviations' },
    )
  }
  if (!cases.length) return
  if (!input.authorizeDeviationEndings) {
    throw conflictError(
      'The responsible person must authorize ending the approved deviations with this change',
      { reason: 'approved_deviations' },
    )
  }
  const owner = await db.query<Array<{ responsibleHsaId: string }>>(
    'SELECT responsible_hsa_id AS responsibleHsaId FROM requirements_specifications WHERE id = @0',
    [specificationId],
  )
  if (owner[0]?.responsibleHsaId !== context.actor.hsaId)
    throw forbiddenError(
      'Specification responsibility is required to authorize deviation endings',
    )
  const membership =
    input.agreementId === undefined
      ? []
      : await db.query<
          Array<{
            id: number
            reference: string
            effectiveDate: string
            isInherited: boolean
          }>
        >(
          `SELECT membership.id, agreement.agreement_reference AS reference, CONVERT(varchar(10), agreement.effective_date, 23) AS effectiveDate,
      CAST(CASE WHEN EXISTS (SELECT 1 FROM specification_agreement_items current_item
        INNER JOIN specification_agreements current_agreement ON current_agreement.id = current_item.specification_agreement_id
        WHERE current_agreement.specification_id = @0 AND current_agreement.is_current = 1
          AND current_item.${column} = @2 AND current_item.is_removed = 0) THEN 1 ELSE 0 END AS bit) AS isInherited
     FROM specification_agreement_items membership
     INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
     WHERE agreement.specification_id = @0 AND agreement.id = @1 AND membership.${column} = @2
       AND agreement.is_pending = 1 AND agreement.confirmed_at IS NULL AND membership.is_removed = 0`,
          [specificationId, input.agreementId, ref.id],
        )
  const item =
    input.agreementId === undefined
      ? {
          id: null,
          reference: null,
          effectiveDate: stockholmDate(now),
          isInherited: false,
        }
      : membership[0]
  if (!item) throw conflictError('An editable draft requirement is required')
  for (const deviation of cases) {
    await db.query(
      `INSERT INTO specification_deviation_endings
      (specification_id, agreement_id, agreement_reference, agreement_item_id, ${caseColumn},
       planned_effective_date, recorded_at, recorded_by_hsa_id, ended_at)
      SELECT @0, @1, @2, @3, @4, @5, @6, @7, @8 WHERE NOT EXISTS
       (SELECT 1 FROM specification_deviation_endings WHERE agreement_id = @1 AND ${caseColumn} = @4
         AND cancelled_at IS NULL AND ended_at IS NULL)`,
      [
        specificationId,
        input.agreementId ?? null,
        item.reference,
        item.id,
        deviation.id,
        item.effectiveDate,
        now,
        context.actor.hsaId,
        item.isInherited ? null : now,
      ],
    )
  }
}

export async function cancelPlannedDeviationEndings(
  db: SqlExecutor,
  agreementId: number,
  actorHsaId: string | null,
  now: Date,
  membershipId?: number,
): Promise<void> {
  await db.query(
    `UPDATE specification_deviation_endings SET cancelled_at = @1, cancelled_by_hsa_id = @2
    WHERE agreement_id = @0 AND cancelled_at IS NULL AND ended_at IS NULL
      ${membershipId === undefined ? '' : 'AND agreement_item_id = @3'}`,
    membershipId === undefined
      ? [agreementId, now, actorHsaId]
      : [agreementId, now, actorHsaId, membershipId],
  )
}
