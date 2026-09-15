import type { SqlExecutor } from '@/lib/dal/requirements-specifications'

export interface DeviationStateSnapshot {
  id: number
  isReviewRequested: number
  motivation: string
}

/** NULL means historical evidence is unavailable; [] means no cases existed. */
export function parseDeviationStateSnapshot(
  value: string | null | undefined,
): DeviationStateSnapshot[] | null {
  return value == null ? null : (JSON.parse(value) as DeviationStateSnapshot[])
}

export async function readAgreementCases(
  db: SqlExecutor,
  specificationId: number,
  itemRefs?: readonly string[],
) {
  return {
    deviationEndings: await db.query<
      Array<{
        id: number
        agreementId: number | null
        deviationId: number
        itemRef: string
        endedAt: Date | null
        cancelledAt: Date | null
        plannedEffectiveDate?: string | null
        agreementReference?: string | null
        recordedAt?: Date
      }>
    >(
      `SELECT ending.id, ending.agreement_id AS agreementId, COALESCE(ending.deviation_id, ending.local_deviation_id) AS deviationId,
              CASE WHEN ending.deviation_id IS NOT NULL THEN CONCAT('lib:', deviation.specification_item_id)
                ELSE CONCAT('local:', local_deviation.specification_local_requirement_id) END AS itemRef,
              ending.ended_at AS endedAt, ending.cancelled_at AS cancelledAt, ending.agreement_reference AS agreementReference,
              CONVERT(varchar(10), ending.planned_effective_date, 23) AS plannedEffectiveDate, ending.recorded_at AS recordedAt
             FROM specification_deviation_endings ending
             LEFT JOIN deviations deviation ON deviation.id = ending.deviation_id
             LEFT JOIN specification_local_requirement_deviations local_deviation ON local_deviation.id = ending.local_deviation_id
             WHERE ending.specification_id = @0 AND (@1 IS NULL OR CASE WHEN ending.deviation_id IS NOT NULL THEN CONCAT('lib:', deviation.specification_item_id) ELSE CONCAT('local:', local_deviation.specification_local_requirement_id) END IN (SELECT value FROM OPENJSON(@1))) ORDER BY ending.id`,
      [
        specificationId,
        itemRefs === undefined ? null : JSON.stringify(itemRefs),
      ],
    ),
    deviations: await db.query<
      Array<{
        id: number
        itemRef: string
        motivation: string
        createdAt?: Date
        updatedAt?: Date | null
        createdBy?: string | null
        decidedBy?: string | null
        isReviewRequested?: number
        agreementReferences?: string | null
        decision: number | null
        decisionMotivation: string | null
        decidedAt: Date | null
      }>
    >(
      `SELECT d.id, CONCAT('lib:', i.id) AS itemRef, d.motivation, d.decision, d.decision_motivation AS decisionMotivation, d.decided_at AS decidedAt, d.created_at AS createdAt, d.created_by AS createdBy, d.decided_by AS decidedBy, d.updated_at AS updatedAt, CAST(d.is_review_requested AS int) AS isReviewRequested,
               (SELECT STRING_AGG(CAST(agreement.agreement_reference AS nvarchar(max)), N', ') WITHIN GROUP (ORDER BY agreement.effective_date, agreement.id)
                FROM specification_agreement_items membership INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
                WHERE membership.specification_item_id = i.id AND membership.is_removed = 0 HAVING COUNT(*) > 1) AS agreementReferences
             FROM deviations d INNER JOIN requirements_specification_items i ON i.id = d.specification_item_id WHERE i.requirements_specification_id = @0 AND (@1 IS NULL OR CONCAT('lib:', i.id) IN (SELECT value FROM OPENJSON(@1)))
             UNION ALL
             SELECT d.id, CONCAT('local:', i.id), d.motivation, d.decision, d.decision_motivation, d.decided_at, d.created_at, d.created_by, d.decided_by, d.updated_at, CAST(d.is_review_requested AS int),
               (SELECT STRING_AGG(CAST(agreement.agreement_reference AS nvarchar(max)), N', ') WITHIN GROUP (ORDER BY agreement.effective_date, agreement.id)
                FROM specification_agreement_items membership INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
                WHERE membership.specification_local_requirement_id = i.id AND membership.is_removed = 0 HAVING COUNT(*) > 1)
             FROM specification_local_requirement_deviations d INNER JOIN specification_local_requirements i ON i.id = d.specification_local_requirement_id WHERE i.specification_id = @0 AND (@1 IS NULL OR CONCAT('local:', i.id) IN (SELECT value FROM OPENJSON(@1)))`,
      [
        specificationId,
        itemRefs === undefined ? null : JSON.stringify(itemRefs),
      ],
    ),
  }
}

/** Explicit end preview: identities and affected cases, without requirement bodies. */
export async function readAgreementEndPreview(
  db: SqlExecutor,
  specificationId: number,
  agreementId: number,
) {
  return db.query<
    Array<{ id: number; itemRef: string; uniqueId: string; motivation: string }>
  >(
    `SELECT d.id, CONCAT('lib:', item.id) AS itemRef, requirement.unique_id AS uniqueId, d.motivation
     FROM specification_agreements agreement
     INNER JOIN specification_agreement_items membership ON membership.specification_agreement_id = agreement.id AND membership.is_removed = 0
     INNER JOIN requirements_specification_items item ON item.id = membership.specification_item_id
     INNER JOIN requirements requirement ON requirement.id = item.requirement_id
     INNER JOIN deviations d ON d.specification_item_id = item.id
     WHERE agreement.specification_id = @0 AND agreement.id = @1 AND agreement.is_current = 1
       AND (d.decision IS NULL OR (d.decision = 1 AND NOT EXISTS (SELECT 1 FROM specification_deviation_endings ending WHERE ending.deviation_id = d.id AND ending.ended_at IS NOT NULL)))
     UNION ALL
     SELECT d.id, CONCAT('local:', item.id), item.unique_id, d.motivation
     FROM specification_agreements agreement
     INNER JOIN specification_agreement_items membership ON membership.specification_agreement_id = agreement.id AND membership.is_removed = 0
     INNER JOIN specification_local_requirements item ON item.id = membership.specification_local_requirement_id
     INNER JOIN specification_local_requirement_deviations d ON d.specification_local_requirement_id = item.id
     WHERE agreement.specification_id = @0 AND agreement.id = @1 AND agreement.is_current = 1
       AND (d.decision IS NULL OR (d.decision = 1 AND NOT EXISTS (SELECT 1 FROM specification_deviation_endings ending WHERE ending.local_deviation_id = d.id AND ending.ended_at IS NOT NULL)))`,
    [specificationId, agreementId],
  )
}
