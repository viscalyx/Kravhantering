import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import { conflictError } from '@/lib/requirements/errors'

interface ConfirmationDeviation {
  agreementItemId: number
  agreementReference: string
  decision: number | null
  deviationId: number
  effectiveDate: string
  itemRef: string
  motivation: string
}

/** Current-content cases can change after editing a draft. Recheck at confirmation. */
export async function readConfirmationDeviations(
  db: SqlExecutor,
  specificationId: number,
  agreementId: number,
): Promise<ConfirmationDeviation[]> {
  const branches = (['library', 'local'] as const).map(kind => {
    const library = kind === 'library'
    const column = library
      ? 'specification_item_id'
      : 'specification_local_requirement_id'
    const caseColumn = library ? 'deviation_id' : 'local_deviation_id'
    const table = library
      ? 'deviations'
      : 'specification_local_requirement_deviations'
    return `SELECT membership.id AS agreementItemId, agreement.agreement_reference AS agreementReference,
      CONVERT(varchar(10), agreement.effective_date, 23) AS effectiveDate,
      deviation.id AS deviationId, CONCAT('${library ? 'lib' : 'local'}:', previous.${column}) AS itemRef,
      deviation.motivation, deviation.decision
     FROM specification_agreement_items membership
     INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
     INNER JOIN specification_agreement_items previous ON previous.id = membership.previous_item_id
     INNER JOIN specification_agreements current_agreement ON current_agreement.id = previous.specification_agreement_id
     INNER JOIN ${table} deviation ON deviation.${column} = previous.${column}
     WHERE agreement.specification_id = @0 AND agreement.id = @1 AND agreement.is_pending = 1 AND agreement.confirmed_at IS NULL
       AND current_agreement.is_current = 1
       AND (membership.is_removed = 1 OR ISNULL(membership.${column}, 0) <> previous.${column})
       AND (deviation.decision IS NULL OR (deviation.decision = 1
         AND NOT EXISTS (SELECT 1 FROM specification_deviation_endings ending WHERE ending.${caseColumn} = deviation.id
           AND (ending.ended_at IS NOT NULL OR (ending.agreement_id = @1 AND ending.cancelled_at IS NULL)))))`
  })
  return db.query<ConfirmationDeviation[]>(branches.join('\nUNION ALL\n'), [
    specificationId,
    agreementId,
  ])
}

export async function prepareAgreementConfirmation(
  db: SqlExecutor,
  specificationId: number,
  agreementId: number,
  context: RequestContext,
  authorizeDeviationEndings: boolean | undefined,
  now: Date,
): Promise<void> {
  const cases = await readConfirmationDeviations(
    db,
    specificationId,
    agreementId,
  )
  if (cases.some(deviation => deviation.decision === null))
    throw conflictError(
      'Cancel pending deviations on the replaced current content before confirming',
      { reason: 'active_deviations' },
    )
  if (cases.length && !authorizeDeviationEndings)
    throw conflictError(
      'Authorize planned endings of newly approved current-content deviations',
      { reason: 'approved_deviations' },
    )
  for (const deviation of cases) {
    await db.query(
      `INSERT INTO specification_deviation_endings
       (specification_id, agreement_id, agreement_reference, agreement_item_id, deviation_id, local_deviation_id,
        planned_effective_date, recorded_at, recorded_by_hsa_id)
       VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8)`,
      [
        specificationId,
        agreementId,
        deviation.agreementReference,
        deviation.agreementItemId,
        deviation.itemRef.startsWith('lib:') ? deviation.deviationId : null,
        deviation.itemRef.startsWith('local:') ? deviation.deviationId : null,
        deviation.effectiveDate,
        now,
        context.actor.hsaId,
      ],
    )
  }
}
