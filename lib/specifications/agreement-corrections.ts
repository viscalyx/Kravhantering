import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { activateDueAgreements } from '@/lib/specifications/agreement-activation'
import {
  agreementEffectiveAt,
  stockholmDate,
} from '@/lib/specifications/agreement-dates'
import type { AgreementMutationInput } from '@/lib/specifications/agreements'

export async function correctAgreement(
  db: SqlExecutor,
  specificationId: number,
  input: Extract<AgreementMutationInput, { operation: 'correct' }>,
  now: Date,
  context: RequestContext,
) {
  const rows = await db.query<
    Array<{
      agreementReference: string
      effectiveDate: string
      description: string | null
      confirmedAt: Date | null
      activatedAt: Date | null
      cancelledAt: Date | null
      previousDate: string | null
    }>
  >(
    `SELECT agreement.agreement_reference AS agreementReference,
    CONVERT(varchar(10), agreement.effective_date, 23) AS effectiveDate, agreement.description,
    agreement.confirmed_at AS confirmedAt, agreement.activated_at AS activatedAt,
    agreement.cancelled_at AS cancelledAt,
    CONVERT(varchar(10), previous.effective_date, 23) AS previousDate
    FROM specification_agreements agreement LEFT JOIN specification_agreements previous
      ON previous.id = agreement.previous_agreement_id
    WHERE agreement.id = @0 AND agreement.specification_id = @1`,
    [input.agreementId, specificationId],
  )
  const original = rows[0]
  if (!original)
    throw notFoundError('Agreement not found in this specification')
  const dateChanged = input.effectiveDate !== original.effectiveDate
  if (dateChanged && (original.activatedAt || original.cancelledAt)) {
    throw conflictError('The effective date of this agreement is locked', {
      reason: 'agreement_date_locked',
    })
  }
  const duplicates = await db.query<Array<{ id: number }>>(
    `SELECT id FROM specification_agreements WHERE specification_id = @0 AND id <> @1
      AND (agreement_reference = @2 OR (effective_date = @3 AND cancelled_at IS NULL AND @4 = 0))`,
    [
      specificationId,
      input.agreementId,
      input.agreementReference,
      input.effectiveDate,
      Boolean(original.cancelledAt),
    ],
  )
  if (duplicates.length)
    throw conflictError('The agreement reference or date is already used', {
      reason: 'agreement_identity_conflict',
    })
  if (
    dateChanged &&
    (input.effectiveDate < stockholmDate(now) ||
      (original.previousDate && input.effectiveDate <= original.previousDate))
  ) {
    throw validationError(
      'Choose today or a future date after the preceding agreement',
      { reason: 'agreement_date_order' },
    )
  }
  if (
    dateChanged &&
    original.confirmedAt &&
    input.effectiveDate === stockholmDate(now) &&
    !input.confirmImmediateActivation
  ) {
    throw conflictError('Confirm immediate activation of this agreement', {
      reason: 'activation_confirmation_required',
    })
  }
  const description =
    input.description === undefined
      ? original.description
      : input.description || null
  if (
    !dateChanged &&
    input.agreementReference === original.agreementReference &&
    description === original.description
  )
    return { agreementId: input.agreementId }
  await db.query(
    `INSERT INTO specification_agreement_corrections
     (agreement_id, old_agreement_reference, new_agreement_reference, old_effective_date, new_effective_date,
      old_description, new_description, corrected_at, corrected_by_hsa_id, corrected_by_display_name)
     VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9)`,
    [
      input.agreementId,
      original.agreementReference,
      input.agreementReference,
      original.effectiveDate,
      input.effectiveDate,
      original.description,
      description,
      now,
      context.actor.hsaId,
      context.actor.displayName,
    ],
  )
  await db.query(
    `UPDATE specification_agreements SET agreement_reference = @1,
    effective_date = @2, description = @3,
    effective_at = CASE WHEN @4 = 1 THEN @5 ELSE effective_at END WHERE id = @0`,
    [
      input.agreementId,
      input.agreementReference,
      input.effectiveDate,
      description,
      dateChanged && Boolean(original.confirmedAt),
      dateChanged ? agreementEffectiveAt(input.effectiveDate, now) : null,
    ],
  )
  await db.query(
    `UPDATE specification_deviation_endings SET planned_effective_date = @1,
    agreement_reference = @2 WHERE agreement_id = @0 AND cancelled_at IS NULL AND ended_at IS NULL`,
    [input.agreementId, input.effectiveDate, input.agreementReference],
  )
  await activateDueAgreements(db, specificationId, now)
  return {
    agreementId: input.agreementId,
    correction: {
      oldAgreementReference: original.agreementReference,
      oldEffectiveDate: original.effectiveDate,
      oldDescription: original.description,
      newAgreementReference: input.agreementReference,
      newEffectiveDate: input.effectiveDate,
      newDescription: description,
    },
  }
}
