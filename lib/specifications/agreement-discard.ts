import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import { conflictError } from '@/lib/requirements/errors'
import { cancelPlannedDeviationEndings } from '@/lib/specifications/agreement-deviation-endings'

/** Delete the draft's complete work, including superseded draft-only content. */
export async function discardAgreementDraft(
  db: SqlExecutor,
  specificationId: number,
  agreementId: number,
  actorHsaId: string | null,
  now: Date,
): Promise<void> {
  const agreements = await db.query<Array<{ id: number }>>(
    `SELECT id FROM specification_agreements WHERE id = @0 AND specification_id = @1
      AND is_pending = 1 AND confirmed_at IS NULL`,
    [agreementId, specificationId],
  )
  if (!agreements[0])
    throw conflictError('Only an unconfirmed agreement draft can be discarded')
  await cancelPlannedDeviationEndings(db, agreementId, actorHsaId, now)
  // Own cases disappear with the discarded draft; plans concerning shared
  // current cases retain cancellation evidence after membership is removed.
  await db.query(
    `DELETE FROM specification_deviation_endings WHERE agreement_id = @0 AND (
    deviation_id IN (SELECT deviation.id FROM deviations deviation INNER JOIN requirements_specification_items item
      ON item.id = deviation.specification_item_id WHERE item.owning_agreement_id = @0)
    OR local_deviation_id IN (SELECT deviation.id FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements item ON item.id = deviation.specification_local_requirement_id
      WHERE item.owning_agreement_id = @0))`,
    [agreementId],
  )
  await db.query(
    'UPDATE specification_deviation_endings SET agreement_item_id = NULL WHERE agreement_id = @0',
    [agreementId],
  )
  await db.query(
    'DELETE FROM specification_agreement_items WHERE specification_agreement_id = @0',
    [agreementId],
  )
  // Deviation cases and norm references cascade from their exact content. Shared
  // current bindings are owned by the earlier agreement and remain untouched.
  for (const table of [
    'requirements_specification_items',
    'specification_local_requirements',
  ]) {
    await db.query(`DELETE FROM ${table} WHERE owning_agreement_id = @0`, [
      agreementId,
    ])
  }
  await db.query('DELETE FROM specification_agreements WHERE id = @0', [
    agreementId,
  ])
}
