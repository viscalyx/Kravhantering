import {
  parseSpecificationItemRef,
  type SqlExecutor,
} from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import { conflictError } from '@/lib/requirements/errors'
import { snapshotAgreementFollowup } from '@/lib/specifications/agreement-activation'
import { recordAgreementContentOrigin } from '@/lib/specifications/agreement-content-origin'
import { cancelPlannedDeviationEndings } from '@/lib/specifications/agreement-deviation-endings'

export async function copyAgreementRequirements(
  db: SqlExecutor,
  agreementId: number,
  actorHsaId: string | null,
  now: Date,
  draftId?: number,
  sourceItemRef?: string,
): Promise<void> {
  for (const [table, column, contentColumns] of [
    [
      'requirements_specification_items',
      'specification_item_id',
      [
        'requirements_specification_id',
        'requirement_id',
        'requirement_version_id',
      ],
    ],
    [
      'specification_local_requirements',
      'specification_local_requirement_id',
      [
        'specification_id',
        'unique_id',
        'sequence_number',
        'description',
        'acceptance_criteria',
        'requirement_category_id',
        'requirement_type_id',
        'quality_characteristic_id',
        'priority_level_id',
        'is_verifiable',
        'verification_method',
        'source_requirement_version_id',
        'updated_at',
      ],
    ],
  ] as const) {
    const source = sourceItemRef
      ? parseSpecificationItemRef(sourceItemRef)
      : null
    if (
      source &&
      (source.kind === 'library') !== (column === 'specification_item_id')
    )
      continue
    const members = await db.query<Array<{ id: number }>>(
      `SELECT ${column} AS id FROM specification_agreement_items
      WHERE specification_agreement_id = @0 AND ${column} IS NOT NULL AND is_removed = 0
        ${source ? `AND ${column} = @1` : ''}`,
      source ? [agreementId, source.id] : [agreementId],
    )
    for (const member of members) {
      if (draftId === undefined)
        await db.query(
          `UPDATE item SET valid_until = @1, needs_reference_snapshot = needs.text,
        owning_agreement_id = @2 FROM ${table} item LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
        WHERE item.id = @0`,
          [member.id, now, agreementId],
        )
      const copy = await db.query<Array<{ id: number }>>(
        `INSERT INTO ${table}
        (${contentColumns.join(', ')}, needs_reference_id, note, specification_item_status_id, status_updated_at,
         created_at, valid_from, binding_created_by_hsa_id, valid_until, owning_agreement_id)
        OUTPUT INSERTED.id AS id SELECT ${contentColumns.join(', ')}, needs_reference_id, note,
          CASE WHEN specification_item_status_id = 5 THEN 1 ELSE specification_item_status_id END,
          status_updated_at, @1, @1, @2, @3, @4 FROM ${table} WHERE id = @0`,
        [
          member.id,
          now,
          actorHsaId,
          draftId === undefined ? null : now,
          draftId ?? null,
        ],
      )
      if (draftId !== undefined)
        await db.query(
          `UPDATE specification_agreement_items SET ${column} = @2
        WHERE specification_agreement_id = @0 AND ${column} = @1`,
          [draftId, member.id, copy[0].id],
        )
      if (draftId !== undefined)
        await recordAgreementContentOrigin(
          db,
          column === 'specification_item_id' ? 'library' : 'local',
          copy[0].id,
          draftId,
        )
      if (column === 'specification_local_requirement_id')
        await db.query(
          `INSERT INTO specification_local_requirement_norm_references
        (specification_local_requirement_id, norm_reference_id) SELECT @1, norm_reference_id
        FROM specification_local_requirement_norm_references WHERE specification_local_requirement_id = @0`,
          [member.id, copy[0].id],
        )
    }
  }
}

export async function cancelUpcomingAgreement(
  db: SqlExecutor,
  specificationId: number,
  context: RequestContext,
  input: { agreementId: number; reason: string },
  now: Date,
): Promise<void> {
  const agreements = await db.query<Array<{ id: number }>>(
    `SELECT id FROM specification_agreements
    WHERE id = @0 AND specification_id = @1 AND is_pending = 1 AND confirmed_at IS NOT NULL`,
    [input.agreementId, specificationId],
  )
  if (!agreements[0])
    throw conflictError('Only a confirmed upcoming agreement can be cancelled')
  await snapshotAgreementFollowup(db, input.agreementId)
  await cancelPlannedDeviationEndings(
    db,
    input.agreementId,
    context.actor.hsaId,
    now,
  )
  for (const [table, column] of [
    ['deviations', 'specification_item_id'],
    [
      'specification_local_requirement_deviations',
      'specification_local_requirement_id',
    ],
  ]) {
    await db.query(
      `UPDATE deviation SET decision = 3, is_review_requested = 0, decision_motivation = @1,
      decided_at = @2, updated_at = @2, decided_by_hsa_id = @3, decided_by = @4 FROM ${table} deviation
      INNER JOIN specification_agreement_items membership ON membership.${column} = deviation.${column}
      WHERE membership.specification_agreement_id = @0 AND deviation.decision IS NULL
        AND NOT EXISTS (SELECT 1 FROM specification_agreement_items current_item INNER JOIN specification_agreements current_agreement
          ON current_agreement.id = current_item.specification_agreement_id WHERE current_agreement.is_current = 1
          AND current_item.${column} = deviation.${column} AND current_item.is_removed = 0)`,
      [
        input.agreementId,
        input.reason,
        now,
        context.actor.hsaId,
        context.actor.displayName,
      ],
    )
  }
  const current = await db.query<Array<{ id: number }>>(
    'SELECT id FROM specification_agreements WHERE specification_id = @0 AND activated_at IS NOT NULL',
    [specificationId],
  )
  if (!current.length)
    await copyAgreementRequirements(
      db,
      input.agreementId,
      context.actor.hsaId,
      now,
    )
  await db.query(
    `UPDATE specification_agreements SET is_pending = 0, cancelled_at = @1,
    cancelled_by_hsa_id = @2, cancellation_reason = @3, cancelled_by_display_name = @4 WHERE id = @0`,
    [
      input.agreementId,
      now,
      context.actor.hsaId,
      input.reason,
      context.actor.displayName,
    ],
  )
}
