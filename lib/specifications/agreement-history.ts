import type { SqlExecutor } from '@/lib/dal/requirements-specifications'
import { notFoundError } from '@/lib/requirements/errors'
import {
  parseDeviationStateSnapshot,
  type readAgreementCases,
} from '@/lib/specifications/agreement-case-read'
import type { AgreementItem } from '@/lib/specifications/agreements'

interface HistoryBinding {
  agreementId: number
  agreementReference: string
  changeDate: string | null
  changeKind: AgreementItem['changeKind']
  depth: number
  deviationStateJson: string | null
  effectiveDate: string
  hasFollowupSnapshot: boolean
  isRemoved: boolean
  itemRef: string
  membershipId: number
  needsReference: string | null
  note: string | null
  specificationItemStatusId: number
}

export interface AgreementHistoryEntry {
  agreementId: number
  agreementReference: string
  effectiveDate: string
  item: AgreementItem
}

export interface AgreementRequirementHistory {
  deviationEndings?: Awaited<
    ReturnType<typeof readAgreementCases>
  >['deviationEndings']
  deviations?: Awaited<ReturnType<typeof readAgreementCases>>['deviations']
  entries: AgreementHistoryEntry[]
  previous: AgreementHistoryEntry | null
}

/** Read one requirement's ancestry, including superseded content owned by its draft. */
export async function readAgreementRequirementHistory(
  db: SqlExecutor,
  specificationId: number,
  agreementId: number,
  itemRef: string,
  loadItems: (itemRefs: readonly string[]) => Promise<AgreementItem[]>,
): Promise<AgreementRequirementHistory> {
  const lineage = await db.query<HistoryBinding[]>(
    `WITH lineage AS (
      SELECT membership.*, 0 AS depth FROM specification_agreement_items membership
      INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
      WHERE agreement.specification_id = @0 AND agreement.id = @1
        AND CASE WHEN membership.specification_item_id IS NOT NULL THEN CONCAT('lib:', membership.specification_item_id)
          ELSE CONCAT('local:', membership.specification_local_requirement_id) END = @2
      UNION ALL
      SELECT previous.*, lineage.depth + 1 FROM specification_agreement_items previous
      INNER JOIN lineage ON lineage.previous_item_id = previous.id
    )
    SELECT lineage.id AS membershipId, agreement.id AS agreementId, agreement.agreement_reference AS agreementReference,
      CONVERT(varchar(10), agreement.effective_date, 23) AS effectiveDate,
      CASE WHEN lineage.specification_item_id IS NOT NULL THEN CONCAT('lib:', lineage.specification_item_id)
        ELSE CONCAT('local:', lineage.specification_local_requirement_id) END AS itemRef,
      lineage.depth, lineage.has_followup_snapshot AS hasFollowupSnapshot, lineage.deviation_state_json AS deviationStateJson,
      lineage.specification_item_status_id AS specificationItemStatusId,
      lineage.needs_reference AS needsReference, lineage.note,
      lineage.change_kind AS changeKind, lineage.is_removed AS isRemoved,
      CONVERT(varchar(10), changed.effective_date, 23) AS changeDate
    FROM lineage INNER JOIN specification_agreements agreement ON agreement.id = lineage.specification_agreement_id
    LEFT JOIN specification_agreements changed ON changed.id = lineage.changed_in_agreement_id
    WHERE agreement.specification_id = @0 ORDER BY lineage.depth OPTION (MAXRECURSION 0)`,
    [specificationId, agreementId, itemRef],
  )
  if (!lineage[0])
    throw notFoundError('Requirement not found in selected agreement')
  const items = await loadItems(lineage.map(binding => binding.itemRef))
  const byRef = new Map<string, AgreementItem>(
    items.map(item => [item.itemRef, item]),
  )
  const entryFor = (binding: HistoryBinding): AgreementHistoryEntry => {
    const item = byRef.get(binding.itemRef)
    if (!item) throw notFoundError('Historical requirement content not found')
    return {
      agreementId: binding.agreementId,
      agreementReference: binding.agreementReference,
      effectiveDate: binding.effectiveDate,
      item: {
        ...item,
        deviationStateSnapshot: parseDeviationStateSnapshot(
          binding.deviationStateJson,
        ),
        changeKind: binding.changeKind,
        changeDate: binding.changeDate,
        isRemoved: Boolean(binding.isRemoved),
        ...(binding.hasFollowupSnapshot
          ? {
              specificationItemStatusId: binding.specificationItemStatusId,
              needsReference: binding.needsReference,
              note: binding.note,
            }
          : {}),
      },
    }
  }
  const entries = lineage.map(entryFor)
  const owned = await db.query<Array<{ itemRef: string; agreementId: number }>>(
    `SELECT CONCAT('lib:', item.id) AS itemRef, item.owning_agreement_id AS agreementId
     FROM requirements_specification_items item
     WHERE item.requirements_specification_id = @0
       AND item.origin_agreement_item_id IN (SELECT CONVERT(int, value) FROM OPENJSON(@1))
     UNION ALL
     SELECT CONCAT('local:', item.id), item.owning_agreement_id
     FROM specification_local_requirements item
     WHERE item.specification_id = @0
       AND item.origin_agreement_item_id IN (SELECT CONVERT(int, value) FROM OPENJSON(@1))`,
    [specificationId, JSON.stringify(lineage.map(entry => entry.membershipId))],
  )
  const additional = await loadItems(
    owned.map(binding => binding.itemRef).filter(ref => !byRef.has(ref)),
  )
  for (const item of additional) byRef.set(item.itemRef, item)
  for (const binding of owned) {
    const agreement = lineage.find(
      entry => entry.agreementId === binding.agreementId,
    )
    const item = byRef.get(binding.itemRef)
    if (
      !agreement ||
      !item ||
      entries.some(
        entry =>
          entry.agreementId === binding.agreementId &&
          entry.item.itemRef === binding.itemRef,
      )
    )
      continue
    entries.push({
      agreementId: agreement.agreementId,
      agreementReference: agreement.agreementReference,
      effectiveDate: agreement.effectiveDate,
      item,
    })
  }
  return { entries, previous: lineage[1] ? entryFor(lineage[1]) : null }
}
