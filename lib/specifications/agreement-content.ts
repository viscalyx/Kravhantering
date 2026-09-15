import {
  formatSpecificationLocalRequirementUniqueId,
  normalizeSpecificationLocalRequirementInput,
  parseSpecificationItemRef,
  type SpecificationLocalRequirementMutationInput,
  type SqlExecutor,
} from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import { conflictError, notFoundError } from '@/lib/requirements/errors'
import { copyAgreementRequirements } from '@/lib/specifications/agreement-cancellation'
import { recordAgreementContentOrigin } from '@/lib/specifications/agreement-content-origin'
import {
  cancelPlannedDeviationEndings,
  guardAgreementRequirementChange,
} from '@/lib/specifications/agreement-deviation-endings'
import type { AgreementItem } from '@/lib/specifications/agreements'

export interface SaveAgreementRequirementInput {
  agreementId: number
  authorizeDeviationEndings?: boolean
  content: SpecificationLocalRequirementMutationInput
  itemRef: string
  operation: 'save_requirement'
}

export type AddAgreementRequirementInput =
  | { operation: 'add_library'; agreementId: number; targetVersionId: number }
  | {
      operation: 'add_local'
      agreementId: number
      content: SpecificationLocalRequirementMutationInput
    }

export type RestoreAgreementRequirementInput = {
  agreementId: number
  itemRef: string
  operation: 'remove_requirement' | 'undo_requirement'
  authorizeDeviationEndings?: boolean
}

export async function restoreOrRemoveAgreementRequirement(
  db: SqlExecutor,
  specificationId: number,
  input: RestoreAgreementRequirementInput,
  context: RequestContext,
  now: Date,
): Promise<void> {
  const ref = parseSpecificationItemRef(input.itemRef)
  if (!ref) throw notFoundError('Requirement not found')
  const records = await db.query<
    Array<{
      id: number
      previousItemId: number | null
      previousItemRef: string | null
      previousAgreementId: number | null
      previousEndedAt: Date | null
      isRemoved: boolean
    }>
  >(
    `SELECT membership.id, membership.previous_item_id AS previousItemId, membership.is_removed AS isRemoved,
      previous.specification_agreement_id AS previousAgreementId, previous_agreement.ended_at AS previousEndedAt,
      CASE WHEN previous.specification_item_id IS NOT NULL THEN CONCAT('lib:', previous.specification_item_id)
        WHEN previous.specification_local_requirement_id IS NOT NULL THEN CONCAT('local:', previous.specification_local_requirement_id) END AS previousItemRef
     FROM specification_agreement_items membership
     INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
     LEFT JOIN specification_agreement_items previous ON previous.id = membership.previous_item_id
     LEFT JOIN specification_agreements previous_agreement ON previous_agreement.id = previous.specification_agreement_id
     WHERE agreement.id = @0 AND agreement.specification_id = @1 AND agreement.is_pending = 1
       AND agreement.confirmed_at IS NULL
       AND membership.${ref.kind === 'library' ? 'specification_item_id' : 'specification_local_requirement_id'} = @2`,
    [input.agreementId, specificationId, ref.id],
  )
  const item = records[0]
  if (!item)
    throw conflictError('The selected draft requirement content has changed')
  if (
    input.operation === 'undo_requirement' &&
    !item.isRemoved &&
    item.previousItemRef !== input.itemRef
  ) {
    await guardAgreementRequirementChange(
      db,
      specificationId,
      context,
      input,
      now,
    )
  }
  if (input.operation === 'remove_requirement') {
    if (item.isRemoved)
      throw conflictError('The selected requirement has already been removed')
    await guardAgreementRequirementChange(
      db,
      specificationId,
      context,
      input,
      now,
    )
    await db.query(
      "UPDATE specification_agreement_items SET is_removed = 1, change_kind = 'removed', changed_in_agreement_id = @1 WHERE id = @0",
      [item.id, input.agreementId],
    )
  } else if (item.previousItemId) {
    await cancelPlannedDeviationEndings(
      db,
      input.agreementId,
      context.actor.hsaId,
      now,
      item.id,
    )
    await db.query(
      `UPDATE membership SET specification_item_id = previous.specification_item_id,
        specification_local_requirement_id = previous.specification_local_requirement_id,
        changed_in_agreement_id = previous.changed_in_agreement_id, change_kind = previous.change_kind, is_removed = 0
       FROM specification_agreement_items membership
       INNER JOIN specification_agreement_items previous ON previous.id = membership.previous_item_id
       WHERE membership.id = @0`,
      [item.id],
    )
    if (
      item.previousEndedAt &&
      item.previousAgreementId &&
      item.previousItemRef
    ) {
      await copyAgreementRequirements(
        db,
        item.previousAgreementId,
        context.actor.hsaId,
        now,
        input.agreementId,
        item.previousItemRef,
      )
    }
  } else {
    await cancelPlannedDeviationEndings(
      db,
      input.agreementId,
      context.actor.hsaId,
      now,
      item.id,
    )
    await db.query(
      'UPDATE specification_deviation_endings SET agreement_item_id = NULL WHERE agreement_item_id = @0',
      [item.id],
    )
    await db.query('DELETE FROM specification_agreement_items WHERE id = @0', [
      item.id,
    ])
  }
}

export async function saveAgreementRequirement(
  db: SqlExecutor,
  specificationId: number,
  context: RequestContext,
  input:
    | SaveAgreementRequirementInput
    | Extract<AddAgreementRequirementInput, { operation: 'add_local' }>,
  source: AgreementItem | undefined,
  now: Date,
): Promise<{ itemRef: string }> {
  const agreements = await db.query<Array<{ id: number }>>(
    `SELECT id FROM specification_agreements WHERE id = @0 AND specification_id = @1
     AND confirmed_at IS NULL AND is_pending = 1`,
    [input.agreementId, specificationId],
  )
  if (!agreements[0])
    throw conflictError('An editable agreement draft is required')
  const ref =
    input.operation === 'save_requirement'
      ? parseSpecificationItemRef(input.itemRef)
      : null
  if (input.operation === 'save_requirement' && (!source || !ref))
    throw notFoundError('Requirement not found')
  const membership = ref
    ? await db.query<Array<{ id: number }>>(
        `SELECT id FROM specification_agreement_items WHERE specification_agreement_id = @0
     AND ${ref.kind === 'library' ? 'specification_item_id' : 'specification_local_requirement_id'} = @1 AND is_removed = 0`,
        [input.agreementId, ref.id],
      )
    : []
  if (input.operation === 'save_requirement' && !membership[0])
    throw conflictError('The selected requirement content has changed')
  const library = ref?.kind === 'library'
  const sourceTable = library
    ? 'requirements_specification_items'
    : 'specification_local_requirements'
  const sourceRows = ref
    ? await db.query<
        Array<{
          needsReferenceId: number | null
          sequenceNumber: number | null
          uniqueId: string | null
        }>
      >(
        `SELECT needs_reference_id AS needsReferenceId,
      ${library ? 'NULL AS sequenceNumber, NULL AS uniqueId' : 'sequence_number AS sequenceNumber, unique_id AS uniqueId'}
     FROM ${sourceTable} WHERE id = @0`,
        [ref.id],
      )
    : [{ needsReferenceId: null, sequenceNumber: null, uniqueId: null }]
  const original = sourceRows[0]
  const norms =
    ref && source
      ? await db.query<Array<{ id: number }>>(
          `SELECT norm_reference_id AS id FROM ${library ? 'requirement_version_norm_references' : 'specification_local_requirement_norm_references'}
     WHERE ${library ? 'requirement_version_id' : 'specification_local_requirement_id'} = @0`,
          [library ? source.requirementVersionId : ref.id],
        )
      : []
  const content = await normalizeSpecificationLocalRequirementInput(
    db,
    specificationId,
    {
      ...source,
      needsReferenceId: original.needsReferenceId,
      normReferenceIds: norms.map(norm => norm.id),
      ...input.content,
    },
  )
  if (
    source &&
    content.description === source.description &&
    content.acceptanceCriteria === source.acceptanceCriteria &&
    content.verificationMethod === source.verificationMethod &&
    content.verifiable === Boolean(source.verifiable) &&
    content.requirementCategoryId === source.requirementCategoryId &&
    content.requirementTypeId === source.requirementTypeId &&
    content.qualityCharacteristicId === source.qualityCharacteristicId &&
    content.priorityLevelId === source.priorityLevelId &&
    content.needsReferenceId === original.needsReferenceId &&
    content.normReferenceIds.length === norms.length &&
    content.normReferenceIds.every(id => norms.some(norm => norm.id === id))
  ) {
    return { itemRef: source.itemRef }
  }
  if (input.operation === 'save_requirement')
    await guardAgreementRequirementChange(
      db,
      specificationId,
      context,
      input,
      now,
    )
  let sequence = original.sequenceNumber
  if (sequence === null) {
    const allocated = await db.query<Array<{ sequence: number }>>(
      `UPDATE requirements_specifications SET local_requirement_next_sequence = local_requirement_next_sequence + 1
       OUTPUT INSERTED.local_requirement_next_sequence - 1 AS sequence WHERE id = @0`,
      [specificationId],
    )
    sequence = allocated[0].sequence
  }
  const inserted = await db.query<Array<{ id: number }>>(
    `INSERT INTO specification_local_requirements
     (specification_id, unique_id, sequence_number, description, acceptance_criteria,
      requirement_category_id, requirement_type_id, quality_characteristic_id, priority_level_id,
      is_verifiable, verification_method, needs_reference_id, note, specification_item_status_id,
      created_at, updated_at, valid_from, valid_until, binding_created_by_hsa_id, source_requirement_version_id, owning_agreement_id)
     OUTPUT INSERTED.id AS id
     VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, 1, @13, @13,
       @13, @13, @14, @15, @16)`,
    [
      specificationId,
      original.uniqueId ??
        formatSpecificationLocalRequirementUniqueId(sequence),
      sequence,
      content.description,
      content.acceptanceCriteria,
      content.requirementCategoryId,
      content.requirementTypeId,
      content.qualityCharacteristicId,
      content.priorityLevelId,
      content.verifiable,
      content.verificationMethod,
      content.needsReferenceId,
      source?.note ?? null,
      now,
      context.actor.hsaId,
      source?.requirementVersionId ??
        source?.sourceRequirementVersionId ??
        null,
      input.agreementId,
    ],
  )
  const id = inserted[0].id
  for (const normId of content.normReferenceIds) {
    await db.query(
      `INSERT INTO specification_local_requirement_norm_references (specification_local_requirement_id, norm_reference_id) VALUES (@0, @1)`,
      [id, normId],
    )
  }
  if (membership[0])
    await db.query(
      `UPDATE specification_agreement_items SET specification_item_id = NULL,
      specification_local_requirement_id = @1, changed_in_agreement_id = @2, change_kind = CASE WHEN previous_item_id IS NULL THEN 'added' ELSE 'changed' END WHERE id = @0`,
      [membership[0].id, id, input.agreementId],
    )
  else
    await db.query(
      `INSERT INTO specification_agreement_items
    (specification_agreement_id, specification_local_requirement_id, changed_in_agreement_id, change_kind)
    VALUES (@0, @1, @0, 'added')`,
      [input.agreementId, id],
    )
  await recordAgreementContentOrigin(db, 'local', id, input.agreementId)
  return { itemRef: `local:${id}` }
}

export async function addAgreementLibraryRequirement(
  db: SqlExecutor,
  specificationId: number,
  context: RequestContext,
  input: Extract<AddAgreementRequirementInput, { operation: 'add_library' }>,
  now: Date,
): Promise<{ itemRef: string }> {
  const agreements = await db.query<Array<{ id: number }>>(
    `SELECT id FROM specification_agreements WHERE id = @0 AND specification_id = @1
     AND is_pending = 1 AND confirmed_at IS NULL`,
    [input.agreementId, specificationId],
  )
  if (!agreements[0])
    throw conflictError('An editable agreement draft is required')
  const versions = await db.query<Array<{ requirementId: number }>>(
    'SELECT requirement_id AS requirementId FROM requirement_versions WHERE id = @0 AND requirement_status_id = 3',
    [input.targetVersionId],
  )
  const version = versions[0]
  if (!version)
    throw conflictError('The selected published version is no longer available')
  const duplicates = await db.query<Array<{ id: number }>>(
    `SELECT membership.id FROM specification_agreement_items membership
     INNER JOIN requirements_specification_items item ON item.id = membership.specification_item_id
     WHERE membership.specification_agreement_id = @0 AND item.requirement_id = @1`,
    [input.agreementId, version.requirementId],
  )
  if (duplicates.length)
    throw conflictError('The requirement already belongs to this agreement')
  const inserted = await db.query<Array<{ id: number }>>(
    `INSERT INTO requirements_specification_items (requirements_specification_id, requirement_id, requirement_version_id,
      specification_item_status_id, created_at, valid_from, valid_until, binding_created_by_hsa_id, owning_agreement_id)
     OUTPUT INSERTED.id AS id VALUES (@0, @1, @2, 1, @3, @3, @3, @4, @5)`,
    [
      specificationId,
      version.requirementId,
      input.targetVersionId,
      now,
      context.actor.hsaId,
      input.agreementId,
    ],
  )
  await db.query(
    `INSERT INTO specification_agreement_items
    (specification_agreement_id, specification_item_id, changed_in_agreement_id, change_kind) VALUES (@0, @1, @0, 'added')`,
    [input.agreementId, inserted[0].id],
  )
  await db.query(
    'UPDATE requirement_versions SET has_specification_item_history = 1 WHERE id = @0',
    [input.targetVersionId],
  )
  await recordAgreementContentOrigin(
    db,
    'library',
    inserted[0].id,
    input.agreementId,
  )
  return { itemRef: `lib:${inserted[0].id}` }
}
