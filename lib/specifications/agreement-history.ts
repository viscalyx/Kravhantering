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
  deviationStateJson: string | null
  effectiveDate: string
  firstAgreementId: number
  hasFollowupSnapshot: boolean
  isRemoved: boolean
  itemRef: string
  membershipId: number
  needsReference: string | null
  note: string | null
  previousAgreementReference: string | null
  previousMembershipId: number | null
  specificationItemStatusId: number
}

export interface AgreementHistoryEntry {
  agreementId: number
  agreementReference: string
  effectiveDate: string
  item: AgreementItem
}

export interface AgreementRequirementChange {
  agreementId: number
  agreementReference: string
  effectiveDate: string
  kind: 'added' | 'changed' | 'removed' | 'libraryUpdated' | 'madeLocal'
  previousAgreementReference: string | null
  previousVersion: number | null
  version: number | null
}

export interface AgreementRequirementHistory {
  ancestorAgreementIds: number[]
  changes: AgreementRequirementChange[]
  deviationEndings?: Awaited<
    ReturnType<typeof readAgreementCases>
  >['deviationEndings']
  deviations?: Awaited<ReturnType<typeof readAgreementCases>>['deviations']
  entries: AgreementHistoryEntry[]
  previous: AgreementHistoryEntry | null
}

/** Compare requirement content, excluding mutable follow-up and copied binding identities. */
export function requirementContentChange(
  item: AgreementItem,
  previous: AgreementItem,
): AgreementRequirementChange['kind'] | null {
  if (item.isRemoved) return previous.isRemoved ? null : 'removed'
  if (previous.isRemoved) return 'added'
  if (previous.requirementId !== null && item.requirementId === null)
    return 'madeLocal'
  if (
    item.requirementId !== null &&
    item.requirementId === previous.requirementId &&
    item.requirementVersionId !== previous.requirementVersionId
  )
    return 'libraryUpdated'
  const content = (value: AgreementItem): unknown[] => [
    value.uniqueId,
    value.requirementId,
    value.requirementVersionId,
    value.description,
    value.acceptanceCriteria ?? '',
    value.verificationMethod ?? '',
    value.verifiable,
    value.requirementCategoryId,
    value.requirementTypeId,
    value.qualityCharacteristicId,
    value.priorityLevelId,
    [...value.normReferenceIds].sort((a, b) => a - b),
  ]
  return JSON.stringify(content(item)) === JSON.stringify(content(previous))
    ? null
    : 'changed'
}

/** Read the connected inclusion history, including cancelled branches and owned draft content. */
export async function readAgreementRequirementHistory(
  db: SqlExecutor,
  specificationId: number,
  agreementId: number,
  itemRef: string,
  loadItems: (itemRefs: readonly string[]) => Promise<AgreementItem[]>,
): Promise<AgreementRequirementHistory> {
  const lineage = await db.query<HistoryBinding[]>(
    `WITH ancestors AS (
      SELECT membership.* FROM specification_agreement_items membership
      INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
      WHERE agreement.specification_id = @0 AND agreement.id = @1
        AND CASE WHEN membership.specification_item_id IS NOT NULL THEN CONCAT('lib:', membership.specification_item_id)
          ELSE CONCAT('local:', membership.specification_local_requirement_id) END = @2
      UNION ALL
      SELECT previous.* FROM specification_agreement_items previous
      INNER JOIN ancestors ON ancestors.previous_item_id = previous.id
      INNER JOIN specification_agreements owner ON owner.id = previous.specification_agreement_id AND owner.specification_id = @0
    ), lineage AS (
      SELECT * FROM ancestors WHERE previous_item_id IS NULL
      UNION ALL
      SELECT successor.* FROM specification_agreement_items successor
      INNER JOIN lineage ON successor.previous_item_id = lineage.id
      INNER JOIN specification_agreements owner ON owner.id = successor.specification_agreement_id AND owner.specification_id = @0
    )
    SELECT lineage.id AS membershipId, agreement.id AS agreementId, agreement.agreement_reference AS agreementReference,
      CONVERT(varchar(10), agreement.effective_date, 23) AS effectiveDate,
      CASE WHEN lineage.specification_item_id IS NOT NULL THEN CONCAT('lib:', lineage.specification_item_id)
        ELSE CONCAT('local:', lineage.specification_local_requirement_id) END AS itemRef,
      lineage.previous_item_id AS previousMembershipId,
      predecessor.agreement_reference AS previousAgreementReference,
      (SELECT MIN(id) FROM specification_agreements WHERE specification_id = @0) AS firstAgreementId,
      lineage.has_followup_snapshot AS hasFollowupSnapshot, lineage.deviation_state_json AS deviationStateJson,
      lineage.specification_item_status_id AS specificationItemStatusId,
      lineage.needs_reference AS needsReference, lineage.note,
      lineage.change_kind AS changeKind, lineage.is_removed AS isRemoved,
      CONVERT(varchar(10), changed.effective_date, 23) AS changeDate
    FROM lineage INNER JOIN specification_agreements agreement ON agreement.id = lineage.specification_agreement_id
    LEFT JOIN specification_agreements predecessor ON predecessor.id = agreement.previous_agreement_id AND predecessor.specification_id = @0
    LEFT JOIN specification_agreements changed ON changed.id = lineage.changed_in_agreement_id
    WHERE agreement.specification_id = @0 ORDER BY agreement.effective_date DESC, agreement.id DESC OPTION (MAXRECURSION 0)`,
    [specificationId, agreementId, itemRef],
  )
  const selected = lineage.find(
    binding =>
      binding.agreementId === agreementId && binding.itemRef === itemRef,
  )
  if (!selected)
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
  const byMembership = new Map(
    lineage.map(binding => [binding.membershipId, binding]),
  )
  const changes: AgreementRequirementChange[] = []
  for (const binding of lineage) {
    const parent =
      binding.previousMembershipId === null
        ? undefined
        : byMembership.get(binding.previousMembershipId)
    const current = entryFor(binding)
    const previous = parent ? entryFor(parent) : null
    const kind = previous
      ? requirementContentChange(current.item, previous.item)
      : binding.agreementId !== binding.firstAgreementId &&
          !current.item.isRemoved
        ? 'added'
        : null
    if (kind)
      changes.push({
        agreementId: binding.agreementId,
        agreementReference: binding.agreementReference,
        effectiveDate: binding.effectiveDate,
        kind,
        previousAgreementReference: binding.previousAgreementReference,
        previousVersion: previous?.item.versionNumber ?? null,
        version: current.item.versionNumber,
      })
  }
  const ancestorAgreementIds: number[] = []
  let ancestor: HistoryBinding | undefined = selected
  while (ancestor) {
    ancestorAgreementIds.push(ancestor.agreementId)
    ancestor =
      ancestor.previousMembershipId === null
        ? undefined
        : byMembership.get(ancestor.previousMembershipId)
  }
  const parent =
    selected.previousMembershipId === null
      ? undefined
      : byMembership.get(selected.previousMembershipId)
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
  return {
    entries,
    changes,
    ancestorAgreementIds,
    previous: parent ? entryFor(parent) : null,
  }
}
