import {
  formatSpecificationLocalRequirementUniqueId,
  parseSpecificationItemRef,
  type SqlExecutor,
} from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

export type AmendmentChange =
  | { kind: 'add_local'; description: string }
  | { kind: 'add_library'; targetVersionId: number }
  | { kind: 'replace_library'; itemRef: string; targetVersionId: number }
  | { kind: 'change_local'; itemRef: string; description: string }
  | { kind: 'remove'; itemRef: string }

export interface PrepareAmendmentInput {
  agreementReference: string
  changes: AmendmentChange[]
  effectiveDate: string
  operation: 'prepare_amendment'
  reason: string
  replacesAmendmentId?: number
}

export interface AmendmentRecord {
  agreementReference: string
  cancellationReason: string | null
  cancelledAt: Date | null
  cancelledByHsaId: string | null
  changesJson: string
  createdAt: Date
  createdByHsaId: string | null
  decidedAt: Date | null
  decidedByHsaId: string | null
  effectiveAt: Date | null
  effectiveDate: Date
  id: number
  reason: string
  replacesAmendmentId: number | null
}

export function stockholmDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function validateAgreementDate(value: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw validationError('A valid calendar date is required')
  }
}

export function amendmentEffectiveAt(date: string, now: Date): Date {
  validateAgreementDate(date)
  const today = stockholmDate(now)
  if (date < today) throw validationError('Amendments cannot be backdated')
  if (date === today) return now
  const midnightUtc = new Date(`${date}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Stockholm',
    timeZoneName: 'shortOffset',
  }).formatToParts(midnightUtc)
  const offset = parts.find(part => part.type === 'timeZoneName')?.value
  const hours = Number(offset?.replace('GMT', ''))
  if (!Number.isFinite(hours))
    throw new Error('Could not resolve Stockholm time zone')
  return new Date(midnightUtc.getTime() - hours * 3600000)
}

export async function listAmendments(
  db: SqlExecutor,
  specificationId: number,
): Promise<AmendmentRecord[]> {
  return db.query<AmendmentRecord[]>(
    `SELECT id, reason, replaces_amendment_id AS replacesAmendmentId, cancelled_at AS cancelledAt, cancelled_by_hsa_id AS cancelledByHsaId, cancellation_reason AS cancellationReason, agreement_reference AS agreementReference, effective_date AS effectiveDate,
       effective_at AS effectiveAt, created_at AS createdAt, created_by_hsa_id AS createdByHsaId,
       decided_at AS decidedAt, decided_by_hsa_id AS decidedByHsaId, changes_json AS changesJson
     FROM specification_amendments WHERE specification_id = @0 ORDER BY id`,
    [specificationId],
  )
}

export async function prepareAmendment(
  db: SqlExecutor,
  context: RequestContext,
  specificationId: number,
  input: PrepareAmendmentInput,
  now: Date,
) {
  amendmentEffectiveAt(input.effectiveDate, now)
  if (
    !input.agreementReference.trim() ||
    !input.changes.length ||
    input.changes.length > 100
  )
    throw validationError('Agreement reference and 1–100 changes are required')
  if (input.replacesAmendmentId != null) {
    const original = (await listAmendments(db, specificationId)).find(
      row => row.id === input.replacesAmendmentId,
    )
    if (
      !original ||
      (!original.cancelledAt &&
        (!original.effectiveAt || new Date(original.effectiveAt) > now))
    ) {
      throw conflictError(
        'Corrections must link to a cancelled or effective amendment in this specification',
      )
    }
  }
  const targets = new Set<string>()
  for (const change of input.changes) {
    const target =
      'itemRef' in change
        ? change.itemRef
        : 'targetVersionId' in change
          ? `version:${change.targetVersionId}`
          : `new-local:${targets.size}`
    if (targets.has(target))
      throw validationError('A requirement can only occur once in an amendment')
    targets.add(target)
    if ('itemRef' in change && !parseSpecificationItemRef(change.itemRef))
      throw validationError('Invalid application reference')
    if ('description' in change && !change.description.trim())
      throw validationError('Requirement text is required')
    if ('targetVersionId' in change) {
      const rows = await db.query<Array<{ id: number }>>(
        'SELECT id FROM requirement_versions WHERE id = @0 AND requirement_status_id = @1',
        [change.targetVersionId, STATUS_PUBLISHED],
      )
      if (!rows[0]) throw conflictError('Target must be a published version')
    }
  }
  const rows = await db.query<Array<{ id: number }>>(
    `INSERT INTO specification_amendments (specification_id, reason, agreement_reference, effective_date, changes_json, created_at, created_by_hsa_id, replaces_amendment_id)
     OUTPUT INSERTED.id AS id VALUES (@0, @1, @2, @3, @4, @5, @6, @7)`,
    [
      specificationId,
      input.reason.trim(),
      input.agreementReference.trim(),
      input.effectiveDate,
      JSON.stringify(input.changes),
      now,
      context.actor.hsaId,
      input.replacesAmendmentId ?? null,
    ],
  )
  if (!rows[0])
    throw new Error('Amendment insertion did not return its identity')
  return { amendmentId: rows[0].id }
}

export async function decideAmendment(
  db: SqlExecutor,
  context: RequestContext,
  specificationId: number,
  amendmentId: number,
  now: Date,
) {
  const amendment = (await listAmendments(db, specificationId)).find(
    row => row.id === amendmentId,
  )
  if (!amendment) throw notFoundError('Amendment not found')
  if (amendment.cancelledAt) throw conflictError('The amendment is cancelled')
  if (amendment.decidedAt) return { amendmentId }
  const effectiveAt = amendmentEffectiveAt(
    new Date(amendment.effectiveDate).toISOString().slice(0, 10),
    now,
  )
  const changes = JSON.parse(amendment.changesJson) as AmendmentChange[]
  for (const change of changes) {
    const ref =
      'itemRef' in change ? parseSpecificationItemRef(change.itemRef) : null
    const table =
      ref?.kind === 'specificationLocal'
        ? 'specification_local_requirements'
        : 'requirements_specification_items'
    const parent =
      ref?.kind === 'specificationLocal'
        ? 'specification_id'
        : 'requirements_specification_id'
    if (ref) {
      const rows = await db.query<Array<{ id: number }>>(
        `SELECT id FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE id = @0 AND ${parent} = @1 AND valid_from <= @2 AND valid_until IS NULL`,
        [ref.id, specificationId, now],
      )
      if (!rows[0])
        throw conflictError(
          'The source binding changed or already has a future amendment',
        )
      const deviations =
        ref.kind === 'library'
          ? 'deviations'
          : 'specification_local_requirement_deviations'
      const deviationParent =
        ref.kind === 'library'
          ? 'specification_item_id'
          : 'specification_local_requirement_id'
      const active = await db.query<Array<{ id: number }>>(
        `SELECT id FROM ${deviations} WITH (UPDLOCK, HOLDLOCK) WHERE ${deviationParent} = @0 AND decision IS NULL`,
        [ref.id],
      )
      if (active.length)
        throw conflictError(
          'Cancel all active deviations before changing the requirement',
          { reason: 'active_deviations' },
        )
      await db.query(
        `UPDATE item SET valid_until = @1, needs_reference_snapshot = needs.text FROM ${table} item LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id WHERE item.id = @0`,
        [ref.id, effectiveAt],
      )
    }
    if (change.kind === 'add_local') {
      const sequence = await db.query<Array<{ nextSequence: number }>>(
        `UPDATE requirements_specifications
        SET local_requirement_next_sequence = local_requirement_next_sequence + 1
        OUTPUT INSERTED.local_requirement_next_sequence AS nextSequence WHERE id = @0`,
        [specificationId],
      )
      if (!sequence[0])
        throw new Error('Specification sequence allocation failed')
      const number = sequence[0].nextSequence - 1
      await db.query(
        `INSERT INTO specification_local_requirements
        (specification_id, unique_id, sequence_number, description, specification_item_status_id,
         created_at, updated_at, valid_from, binding_reason, binding_created_by_hsa_id, specification_amendment_id)
        VALUES (@0, @1, @2, @3, 1, @4, @4, @5, @6, @7, @8)`,
        [
          specificationId,
          formatSpecificationLocalRequirementUniqueId(number),
          number,
          change.description.trim(),
          now,
          effectiveAt,
          amendment.reason,
          context.actor.hsaId,
          amendmentId,
        ],
      )
    }
    if (change.kind === 'change_local') {
      if (ref?.kind !== 'specificationLocal')
        throw validationError('A local requirement is required')
      const rows = await db.query<Array<{ id: number }>>(
        `INSERT INTO specification_local_requirements
          (specification_id, unique_id, sequence_number, description, acceptance_criteria,
           requirement_category_id, requirement_type_id, quality_characteristic_id, priority_level_id,
           is_verifiable, verification_method, needs_reference_id, note, specification_item_status_id,
           created_at, updated_at, valid_from, is_reassessment_required, binding_reason, binding_created_by_hsa_id, specification_amendment_id)
         OUTPUT INSERTED.id AS id
         SELECT specification_id, unique_id, sequence_number, @1, acceptance_criteria,
           requirement_category_id, requirement_type_id, quality_characteristic_id, priority_level_id,
           is_verifiable, verification_method, needs_reference_id, note, 1, @2, @2, @3, 1, @4, @5, @6
         FROM specification_local_requirements WHERE id = @0`,
        [
          ref.id,
          change.description.trim(),
          now,
          effectiveAt,
          amendment.reason,
          context.actor.hsaId,
          amendmentId,
        ],
      )
      if (!rows[0])
        throw new Error('Local successor insertion did not return its identity')
      await db.query(
        `INSERT INTO specification_local_requirement_norm_references (specification_local_requirement_id, norm_reference_id)
        SELECT @1, norm_reference_id FROM specification_local_requirement_norm_references WHERE specification_local_requirement_id = @0`,
        [ref.id, rows[0].id],
      )
    }
    if (change.kind === 'add_library' || change.kind === 'replace_library') {
      const versions = await db.query<
        Array<{ requirementId: number; versionNumber: number }>
      >(
        'SELECT requirement_id AS requirementId, version_number AS versionNumber FROM requirement_versions WHERE id = @0 AND published_at IS NOT NULL',
        [change.targetVersionId],
      )
      const version = versions[0]
      if (!version)
        throw conflictError('The selected published version is unavailable')
      if (change.kind === 'replace_library') {
        if (ref?.kind !== 'library')
          throw validationError('A library application is required')
        const matching = await db.query<Array<{ id: number }>>(
          `SELECT item.id FROM requirements_specification_items item
          INNER JOIN requirement_versions v ON v.id = item.requirement_version_id
          WHERE item.id = @0 AND item.requirement_id = @1 AND v.version_number < @2`,
          [ref.id, version.requirementId, version.versionNumber],
        )
        if (!matching[0])
          throw conflictError(
            'The replacement must be a newer version of the same requirement',
          )
      }
      const existing = await db.query<Array<{ id: number }>>(
        `SELECT id FROM requirements_specification_items
        WHERE requirements_specification_id = @0 AND requirement_id = @1 AND (valid_until IS NULL OR valid_until > @2) AND (valid_until IS NULL OR valid_until > valid_from) AND id <> @3`,
        [specificationId, version.requirementId, now, ref?.id ?? -1],
      )
      if (existing.length)
        throw conflictError(
          'Requirement already has an applicable or reserved binding',
        )
      await db.query(
        `INSERT INTO requirements_specification_items
          (requirements_specification_id, requirement_id, requirement_version_id, specification_item_status_id,
           created_at, valid_from, is_reassessment_required, binding_reason, binding_created_by_hsa_id, specification_amendment_id,
           needs_reference_id, note)
         VALUES (@0, @1, @2, 1, @3, @4, @5, @6, @7, @8,
           (SELECT needs_reference_id FROM requirements_specification_items WHERE id = @9),
           (SELECT note FROM requirements_specification_items WHERE id = @9))`,
        [
          specificationId,
          version.requirementId,
          change.targetVersionId,
          now,
          effectiveAt,
          change.kind === 'replace_library' ? 1 : 0,
          amendment.reason,
          context.actor.hsaId,
          amendmentId,
          ref?.id ?? null,
        ],
      )
      await db.query(
        'UPDATE requirement_versions SET has_specification_item_history = 1 WHERE id = @0',
        [change.targetVersionId],
      )
    }
  }
  await db.query(
    'UPDATE specification_amendments SET decided_at = @1, decided_by_hsa_id = @2, effective_at = @3 WHERE id = @0',
    [amendmentId, now, context.actor.hsaId, effectiveAt],
  )
  return { amendmentId }
}

export async function cancelAmendment(
  db: SqlExecutor,
  context: RequestContext,
  specificationId: number,
  amendmentId: number,
  reason: string,
  now: Date,
) {
  const amendment = (await listAmendments(db, specificationId)).find(
    row => row.id === amendmentId,
  )
  if (!amendment) throw notFoundError('Amendment not found')
  if (amendment.cancelledAt) return { amendmentId }
  if (amendment.effectiveAt && new Date(amendment.effectiveAt) <= now)
    throw conflictError(
      'Effective amendments require a new correcting amendment',
    )
  if (amendment.decidedAt) {
    for (const table of [
      'requirements_specification_items',
      'specification_local_requirements',
    ]) {
      await db.query(
        `UPDATE ${table} SET valid_until = valid_from WHERE specification_amendment_id = @0`,
        [amendmentId],
      )
    }
    for (const change of JSON.parse(
      amendment.changesJson,
    ) as AmendmentChange[]) {
      if (!('itemRef' in change)) continue
      const ref = parseSpecificationItemRef(change.itemRef)
      if (!ref) throw new Error('Invalid stored application reference')
      const table =
        ref.kind === 'library'
          ? 'requirements_specification_items'
          : 'specification_local_requirements'
      await db.query(
        `UPDATE ${table} SET valid_until = NULL, needs_reference_snapshot = NULL WHERE id = @0`,
        [ref.id],
      )
    }
  }
  await db.query(
    'UPDATE specification_amendments SET cancelled_at = @1, cancelled_by_hsa_id = @2, cancellation_reason = @3 WHERE id = @0',
    [amendmentId, now, context.actor.hsaId, reason.trim()],
  )
  return { amendmentId }
}
