import type { SqlExecutor } from '@/lib/dal/requirements-specifications'

/** Called under the specification lock, within the caller's transaction. */
export async function snapshotAgreementFollowup(
  db: SqlExecutor,
  agreementId: number,
): Promise<void> {
  for (const [table, column, cases] of [
    ['requirements_specification_items', 'specification_item_id', 'deviations'],
    [
      'specification_local_requirements',
      'specification_local_requirement_id',
      'specification_local_requirement_deviations',
    ],
  ]) {
    await db.query(
      `UPDATE membership SET has_followup_snapshot = 1,
        deviation_state_json = (SELECT deviation.id, deviation.motivation,
          CAST(deviation.is_review_requested AS int) AS isReviewRequested
          FROM ${cases} deviation WHERE deviation.${column} = item.id ORDER BY deviation.id FOR JSON PATH),
        specification_item_status_id = item.specification_item_status_id,
        note = item.note, needs_reference = needs.text, status_updated_at = item.status_updated_at
       FROM specification_agreement_items membership
       INNER JOIN ${table} item ON item.id = membership.${column}
       LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
       WHERE membership.specification_agreement_id = @0 AND membership.has_followup_snapshot = 0`,
      [agreementId],
    )
  }
}

/** Materialize a due transition before reading or changing its business context. */
export async function activateDueAgreements(
  db: SqlExecutor,
  specificationId: number,
  now: Date,
): Promise<void> {
  const due = await db.query<Array<{ id: number; effectiveAt: Date }>>(
    `SELECT id, effective_at AS effectiveAt FROM specification_agreements
     WHERE specification_id = @0 AND is_pending = 1 AND confirmed_at IS NOT NULL
       AND effective_at <= @1`,
    [specificationId, now],
  )
  for (const agreement of due) {
    const previous = await db.query<Array<{ id: number }>>(
      'SELECT id FROM specification_agreements WHERE specification_id = @0 AND is_current = 1',
      [specificationId],
    )
    if (previous[0]) {
      await snapshotAgreementFollowup(db, previous[0].id)
      await db.query(
        'UPDATE specification_agreements SET is_current = 0, replaced_at = @1 WHERE id = @0',
        [previous[0].id, agreement.effectiveAt],
      )
    }
    for (const [table, parent, column] of [
      [
        'requirements_specification_items',
        'requirements_specification_id',
        'specification_item_id',
      ],
      [
        'specification_local_requirements',
        'specification_id',
        'specification_local_requirement_id',
      ],
    ]) {
      await db.query(
        `UPDATE item SET valid_until = @2, needs_reference_snapshot = needs.text
         FROM ${table} item LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
         WHERE item.${parent} = @0 AND item.valid_until IS NULL AND NOT EXISTS
           (SELECT 1 FROM specification_agreement_items membership WHERE membership.specification_agreement_id = @1
            AND membership.${column} = item.id AND membership.is_removed = 0)`,
        [specificationId, agreement.id, agreement.effectiveAt],
      )
      await db.query(
        `UPDATE item SET valid_from = CASE WHEN item.valid_until <= item.valid_from THEN @1 ELSE item.valid_from END,
          valid_until = NULL
         FROM ${table} item INNER JOIN specification_agreement_items membership ON membership.${column} = item.id
         WHERE membership.specification_agreement_id = @0 AND membership.is_removed = 0`,
        [agreement.id, agreement.effectiveAt],
      )
    }
    await db.query(
      `UPDATE specification_agreements SET is_pending = 0, is_current = 1, activated_at = @1 WHERE id = @0`,
      [agreement.id, agreement.effectiveAt],
    )
    await db.query(
      `UPDATE specification_deviation_endings SET ended_at = @1
      WHERE agreement_id = @0 AND cancelled_at IS NULL AND ended_at IS NULL`,
      [agreement.id, agreement.effectiveAt],
    )
  }
}
