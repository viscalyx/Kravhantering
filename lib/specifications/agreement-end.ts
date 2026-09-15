import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import { conflictError, validationError } from '@/lib/requirements/errors'
import { snapshotAgreementFollowup } from '@/lib/specifications/agreement-activation'
import { stockholmDate } from '@/lib/specifications/agreement-dates'

export async function endCurrentAgreement(
  db: SqlExecutor,
  specificationId: number,
  context: RequestContext,
  input: { agreementId: number; endDate: string; reason: string },
  now: Date,
): Promise<void> {
  const pending = await db.query<Array<{ id: number }>>(
    'SELECT id FROM specification_agreements WHERE specification_id = @0 AND is_pending = 1',
    [specificationId],
  )
  if (pending.length)
    throw conflictError(
      'Resolve the pending agreement before recording the current agreement end',
      { reason: 'pending_agreement', agreementId: pending[0].id },
    )
  const agreements = await db.query<
    Array<{ reference: string; effectiveDate: string }>
  >(
    `SELECT agreement_reference AS reference,
    CONVERT(varchar(10), effective_date, 23) AS effectiveDate FROM specification_agreements
    WHERE id = @0 AND specification_id = @1 AND is_current = 1`,
    [input.agreementId, specificationId],
  )
  const agreement = agreements[0]
  if (!agreement) throw conflictError('Only the current agreement can be ended')
  if (
    input.endDate < agreement.effectiveDate ||
    input.endDate > stockholmDate(now)
  )
    throw validationError(
      'The end date must be between the effective date and today',
      { reason: 'agreement_end_date_invalid' },
    )
  await snapshotAgreementFollowup(db, input.agreementId)
  for (const [table, column, endingColumn, itemTable] of [
    [
      'deviations',
      'specification_item_id',
      'deviation_id',
      'requirements_specification_items',
    ],
    [
      'specification_local_requirement_deviations',
      'specification_local_requirement_id',
      'local_deviation_id',
      'specification_local_requirements',
    ],
  ]) {
    await db.query(
      `INSERT INTO specification_deviation_endings
      (specification_id, agreement_id, agreement_reference, agreement_item_id, ${endingColumn},
       planned_effective_date, recorded_at, recorded_by_hsa_id, ended_at)
      SELECT @0, @1, @2, membership.id, deviation.id, @3, @4, @5, @4 FROM ${table} deviation
      INNER JOIN specification_agreement_items membership ON membership.${column} = deviation.${column}
      WHERE membership.specification_agreement_id = @1 AND membership.is_removed = 0 AND deviation.decision = 1
        AND NOT EXISTS (SELECT 1 FROM specification_deviation_endings ending WHERE ending.${endingColumn} = deviation.id AND ending.ended_at IS NOT NULL)`,
      [
        specificationId,
        input.agreementId,
        agreement.reference,
        input.endDate,
        now,
        context.actor.hsaId,
      ],
    )
    await db.query(
      `UPDATE deviation SET decision = 3, is_review_requested = 0, decision_motivation = @1,
      decided_at = @2, updated_at = @2, decided_by_hsa_id = @3, decided_by = @4 FROM ${table} deviation
      INNER JOIN specification_agreement_items membership ON membership.${column} = deviation.${column}
      WHERE membership.specification_agreement_id = @0 AND deviation.decision IS NULL`,
      [
        input.agreementId,
        input.reason,
        now,
        context.actor.hsaId,
        context.actor.displayName,
      ],
    )
    await db.query(
      `UPDATE item SET valid_until = @1, needs_reference_snapshot = needs.text FROM ${itemTable} item
      INNER JOIN specification_agreement_items membership ON membership.${column} = item.id
      LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
      WHERE membership.specification_agreement_id = @0 AND item.valid_until IS NULL`,
      [input.agreementId, now],
    )
  }
  await db.query(
    `UPDATE specification_agreements SET is_current = 0, ended_at = @1,
    ended_by_hsa_id = @2, end_date = @3, end_reason = @4, ended_by_display_name = @5 WHERE id = @0`,
    [
      input.agreementId,
      now,
      context.actor.hsaId,
      input.endDate,
      input.reason,
      context.actor.displayName,
    ],
  )
}
