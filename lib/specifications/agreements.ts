import type { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  parseSpecificationItemRef,
  type SpecificationItemRef,
  type SqlExecutor,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'
import { activateDueAgreements } from '@/lib/specifications/agreement-activation'
import {
  cancelUpcomingAgreement,
  copyAgreementRequirements,
} from '@/lib/specifications/agreement-cancellation'
import {
  type DeviationStateSnapshot,
  parseDeviationStateSnapshot,
  readAgreementCases,
  readAgreementEndPreview,
} from '@/lib/specifications/agreement-case-read'
import {
  prepareAgreementConfirmation,
  readConfirmationDeviations,
} from '@/lib/specifications/agreement-confirmation'
import {
  addAgreementLibraryRequirement,
  restoreOrRemoveAgreementRequirement,
  saveAgreementRequirement,
} from '@/lib/specifications/agreement-content'
import { recordAgreementContentOrigin } from '@/lib/specifications/agreement-content-origin'
import { agreementMutationSchema } from '@/lib/specifications/agreement-contract'
import { correctAgreement } from '@/lib/specifications/agreement-corrections'
import {
  agreementEffectiveAt,
  stockholmDate,
  validateAgreementDate,
} from '@/lib/specifications/agreement-dates'
import { guardAgreementRequirementChange } from '@/lib/specifications/agreement-deviation-endings'
import { discardAgreementDraft } from '@/lib/specifications/agreement-discard'
import { endCurrentAgreement } from '@/lib/specifications/agreement-end'
import { readAgreementRequirementHistory } from '@/lib/specifications/agreement-history'
import { assertSpecificationContentEditable } from '@/lib/specifications/agreement-policy'
import {
  canReadSpecification,
  isSpecificationResponsible,
  specificationPermissions,
} from '@/lib/specifications/permissions'

interface AgreementRecord {
  responsibleHsaId: string
}

export interface AgreementItem {
  acceptanceCriteria: string | null
  categoryNameEn?: string | null
  categoryNameSv?: string | null
  changeDate?: string | null
  changeKind?: 'added' | 'changed' | 'removed' | null
  currentAgreementReference?: string | null
  description: string
  deviationStateSnapshot?: DeviationStateSnapshot[] | null
  isRemoved?: boolean
  itemRef: SpecificationItemRef
  needsReference: string | null
  needsReferenceId: number | null
  newerPublishedVersionId: number | null
  normReferenceIds: number[]
  normReferences: string | null
  note: string | null
  priorityLevelId: number | null
  priorityLevelNameEn?: string | null
  priorityLevelNameSv?: string | null
  qualityCharacteristicId: number | null
  qualityCharacteristicNameEn?: string | null
  qualityCharacteristicNameSv?: string | null
  requirementCategoryId: number | null
  requirementId: number | null
  requirementTypeId: number | null
  requirementVersionId: number | null
  sourceRequirementVersionId: number | null
  sourceUniqueId: string | null
  sourceVersionNumber: number | null
  specificationItemStatusId: number
  typeNameEn?: string | null
  typeNameSv?: string | null
  uniqueId: string
  validFrom: Date
  validUntil: Date | null
  verifiable: boolean
  verificationMethod: string | null
  versionNumber: number | null
}

export type AgreementMutationInput = z.infer<typeof agreementMutationSchema>

interface VersionContent {
  acceptanceCriteria: string | null
  category: string | null
  categoryEn: string | null
  description: string
  id: number
  normReferences: string | null
  priority: string | null
  qualityCharacteristic: string | null
  qualityCharacteristicEn: string | null
  requirementId: number
  type: string | null
  typeEn: string | null
  verifiable: boolean
  verificationMethod: string | null
  versionNumber: number
}

async function agreementRecord(
  db: SqlExecutor,
  id: number,
): Promise<AgreementRecord> {
  const rows = await db.query<AgreementRecord[]>(
    `SELECT responsible_hsa_id AS responsibleHsaId FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0`,
    [id],
  )
  if (!rows[0]) throw notFoundError('Requirements specification not found')
  return rows[0]
}

async function permissionTarget(
  db: SqlExecutor,
  id: number,
  record: AgreementRecord,
) {
  const coAuthors = await db.query<Array<{ hsaId: string }>>(
    'SELECT hsa_id AS hsaId FROM specification_co_authors WHERE specification_id = @0',
    [id],
  )
  return { ...record, coAuthorHsaIds: coAuthors.map(person => person.hsaId) }
}

async function allItems(
  db: SqlExecutor,
  id: number,
  itemRefs?: readonly string[],
): Promise<AgreementItem[]> {
  if (itemRefs?.length === 0) return []
  const params = [id, itemRefs === undefined ? null : JSON.stringify(itemRefs)]
  const rows = await db.query<AgreementItem[]>(
    `SELECT CONCAT('lib:', item.id) AS itemRef, version.description AS description, (SELECT unique_id FROM requirements WHERE id = item.requirement_id) AS uniqueId, NULL AS sourceRequirementVersionId,
       item.requirement_id AS requirementId, item.requirement_version_id AS requirementVersionId,
       version.version_number AS versionNumber, CASE WHEN item.valid_until <= SYSUTCDATETIME() THEN COALESCE(item.needs_reference_snapshot, needs.text) ELSE needs.text END AS needsReference, item.note,
       item.specification_item_status_id AS specificationItemStatusId,
       item.valid_from AS validFrom, item.valid_until AS validUntil, newer.id AS newerPublishedVersionId,
       version.acceptance_criteria AS acceptanceCriteria, version.verification_method AS verificationMethod,
       version.is_verifiable AS verifiable, version.requirement_category_id AS requirementCategoryId,
       version.requirement_type_id AS requirementTypeId, version.quality_characteristic_id AS qualityCharacteristicId,
       version.priority_level_id AS priorityLevelId,
       (SELECT STRING_AGG(CAST(n.name AS nvarchar(MAX)), N'; ') WITHIN GROUP (ORDER BY n.name)
        FROM requirement_version_norm_references link INNER JOIN norm_references n ON n.id = link.norm_reference_id
        WHERE link.requirement_version_id = version.id) AS normReferences,
       item.needs_reference_id AS needsReferenceId, NULL AS sourceUniqueId, NULL AS sourceVersionNumber,
       (SELECT agreement.agreement_reference FROM specification_agreement_items shared
         INNER JOIN specification_agreements agreement ON agreement.id = shared.specification_agreement_id
         WHERE agreement.is_current = 1 AND shared.specification_item_id = item.id AND shared.is_removed = 0) AS currentAgreementReference,
       (SELECT name_sv FROM requirement_categories WHERE id = version.requirement_category_id) AS categoryNameSv,
       (SELECT name_en FROM requirement_categories WHERE id = version.requirement_category_id) AS categoryNameEn,
       (SELECT name_sv FROM requirement_types WHERE id = version.requirement_type_id) AS typeNameSv,
       (SELECT name_en FROM requirement_types WHERE id = version.requirement_type_id) AS typeNameEn,
       (SELECT name_sv FROM quality_characteristics WHERE id = version.quality_characteristic_id) AS qualityCharacteristicNameSv,
       (SELECT name_en FROM quality_characteristics WHERE id = version.quality_characteristic_id) AS qualityCharacteristicNameEn,
       (SELECT name_sv FROM priority_levels WHERE id = version.priority_level_id) AS priorityLevelNameSv,
       (SELECT name_en FROM priority_levels WHERE id = version.priority_level_id) AS priorityLevelNameEn
     FROM requirements_specification_items item
     INNER JOIN requirement_versions version ON version.id = item.requirement_version_id
     OUTER APPLY (SELECT TOP (1) id FROM requirement_versions published WHERE published.requirement_id = item.requirement_id AND published.requirement_status_id = 3 AND published.version_number > version.version_number ORDER BY published.version_number DESC) newer
     LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
     WHERE item.requirements_specification_id = @0 AND (@1 IS NULL OR CONCAT('lib:', item.id) IN (SELECT value FROM OPENJSON(@1)))
     UNION ALL
     SELECT CONCAT('local:', item.id), item.description, item.unique_id, item.source_requirement_version_id, NULL, NULL, NULL, CASE WHEN item.valid_until <= SYSUTCDATETIME() THEN COALESCE(item.needs_reference_snapshot, needs.text) ELSE needs.text END, item.note,
       item.specification_item_status_id, item.valid_from, item.valid_until, NULL,
       item.acceptance_criteria, item.verification_method, item.is_verifiable,
       item.requirement_category_id, item.requirement_type_id, item.quality_characteristic_id, item.priority_level_id,
       (SELECT STRING_AGG(CAST(n.name AS nvarchar(MAX)), N'; ') WITHIN GROUP (ORDER BY n.name)
        FROM specification_local_requirement_norm_references link INNER JOIN norm_references n ON n.id = link.norm_reference_id
        WHERE link.specification_local_requirement_id = item.id), item.needs_reference_id,
       (SELECT requirement.unique_id FROM requirement_versions source INNER JOIN requirements requirement ON requirement.id = source.requirement_id WHERE source.id = item.source_requirement_version_id),
       (SELECT version_number FROM requirement_versions source WHERE source.id = item.source_requirement_version_id),
       (SELECT agreement.agreement_reference FROM specification_agreement_items shared
         INNER JOIN specification_agreements agreement ON agreement.id = shared.specification_agreement_id
         WHERE agreement.is_current = 1 AND shared.specification_local_requirement_id = item.id AND shared.is_removed = 0),
       (SELECT name_sv FROM requirement_categories WHERE id = item.requirement_category_id) AS categoryNameSv,
       (SELECT name_en FROM requirement_categories WHERE id = item.requirement_category_id) AS categoryNameEn,
       (SELECT name_sv FROM requirement_types WHERE id = item.requirement_type_id) AS typeNameSv,
       (SELECT name_en FROM requirement_types WHERE id = item.requirement_type_id) AS typeNameEn,
       (SELECT name_sv FROM quality_characteristics WHERE id = item.quality_characteristic_id) AS qualityCharacteristicNameSv,
       (SELECT name_en FROM quality_characteristics WHERE id = item.quality_characteristic_id) AS qualityCharacteristicNameEn,
       (SELECT name_sv FROM priority_levels WHERE id = item.priority_level_id) AS priorityLevelNameSv,
       (SELECT name_en FROM priority_levels WHERE id = item.priority_level_id) AS priorityLevelNameEn
     FROM specification_local_requirements item
     LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
     WHERE item.specification_id = @0 AND (@1 IS NULL OR CONCAT('local:', item.id) IN (SELECT value FROM OPENJSON(@1)))`,
    params,
  )
  const norms = await db.query<
    Array<{ itemRef: string; normReferenceId: number }>
  >(
    `SELECT CONCAT('lib:', item.id) AS itemRef, link.norm_reference_id AS normReferenceId
     FROM requirements_specification_items item INNER JOIN requirement_version_norm_references link ON link.requirement_version_id = item.requirement_version_id
     WHERE item.requirements_specification_id = @0 AND (@1 IS NULL OR CONCAT('lib:', item.id) IN (SELECT value FROM OPENJSON(@1)))
     UNION ALL SELECT CONCAT('local:', item.id), link.norm_reference_id FROM specification_local_requirements item
     INNER JOIN specification_local_requirement_norm_references link ON link.specification_local_requirement_id = item.id WHERE item.specification_id = @0 AND (@1 IS NULL OR CONCAT('local:', item.id) IN (SELECT value FROM OPENJSON(@1)))`,
    params,
  )
  const normIdsByRef = new Map<string, number[]>()
  for (const norm of norms) {
    const ids = normIdsByRef.get(norm.itemRef) ?? []
    ids.push(norm.normReferenceId)
    normIdsByRef.set(norm.itemRef, ids)
  }
  return rows.map(item => ({
    ...item,
    normReferenceIds: normIdsByRef.get(item.itemRef) ?? [],
  }))
}

function isApplicable(item: AgreementItem, now: Date) {
  return (
    new Date(item.validFrom) <= now &&
    (!item.validUntil || new Date(item.validUntil) > now)
  )
}

async function versionContent(
  db: SqlExecutor,
  id: number,
): Promise<VersionContent> {
  const rows = await db.query<VersionContent[]>(
    `SELECT v.id, v.requirement_id AS requirementId, v.version_number AS versionNumber,
       v.description, v.acceptance_criteria AS acceptanceCriteria,
       v.verification_method AS verificationMethod, v.is_verifiable AS verifiable,
       category.name_sv AS category, category.name_en AS categoryEn, type.name_sv AS type, type.name_en AS typeEn,
       quality.name_sv AS qualityCharacteristic, quality.name_en AS qualityCharacteristicEn, priority.code AS priority,
       (SELECT STRING_AGG(CAST(n.name AS nvarchar(MAX)), N'; ') WITHIN GROUP (ORDER BY n.name)
        FROM requirement_version_norm_references link INNER JOIN norm_references n ON n.id = link.norm_reference_id
        WHERE link.requirement_version_id = v.id) AS normReferences
     FROM requirement_versions v
     LEFT JOIN requirement_categories category ON category.id = v.requirement_category_id
     LEFT JOIN requirement_types type ON type.id = v.requirement_type_id
     LEFT JOIN quality_characteristics quality ON quality.id = v.quality_characteristic_id
     LEFT JOIN priority_levels priority ON priority.id = v.priority_level_id
     WHERE v.id = @0`,
    [id],
  )
  if (!rows[0]) throw notFoundError('Requirement version not found')
  return rows[0]
}

async function adopt(
  db: SqlExecutor,
  context: RequestContext,
  specificationId: number,
  input: Extract<AgreementMutationInput, { operation: 'adopt' }>,
  now: Date,
) {
  const ref = parseSpecificationItemRef(input.itemRef)
  if (ref?.kind !== 'library')
    throw validationError('A library application is required')
  const items = await allItems(db, specificationId, [input.itemRef])
  const source = items.find(
    item =>
      item.itemRef === input.itemRef &&
      (input.agreementId !== undefined || isApplicable(item, now)),
  )
  if (!source?.requirementVersionId)
    throw conflictError('The source binding has changed')
  const draft =
    input.agreementId === undefined
      ? null
      : (
          await db.query<Array<{ id: number }>>(
            `SELECT membership.id FROM specification_agreement_items membership
     INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
     WHERE agreement.id = @0 AND agreement.specification_id = @1 AND agreement.is_pending = 1
       AND agreement.confirmed_at IS NULL AND membership.specification_item_id = @2 AND membership.is_removed = 0`,
            [input.agreementId, specificationId, ref.id],
          )
        )[0]
  if (input.agreementId !== undefined && !draft)
    throw conflictError('The selected draft binding has changed')
  const target = await versionContent(db, input.targetVersionId)
  const published = await db.query<Array<{ id: number }>>(
    `SELECT id FROM requirement_versions WHERE id = @0 AND requirement_status_id = @1`,
    [target.id, STATUS_PUBLISHED],
  )
  if (
    target.requirementId !== source.requirementId ||
    target.versionNumber <= (source.versionNumber ?? 0) ||
    !published[0]
  ) {
    throw conflictError(
      'The compared newer published version is no longer available',
    )
  }
  const active = await db.query<Array<{ id: number }>>(
    'SELECT id FROM deviations WITH (UPDLOCK, HOLDLOCK) WHERE specification_item_id = @0 AND decision IS NULL',
    [ref.id],
  )
  if (active.length)
    throw conflictError(
      'Cancel active deviations before changing the requirement',
      { reason: 'active_deviations' },
    )
  await guardAgreementRequirementChange(
    db,
    specificationId,
    context,
    input,
    now,
  )
  if (!draft)
    await db.query(
      `UPDATE item SET valid_until = @1, needs_reference_snapshot = needs.text FROM requirements_specification_items item LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id WHERE item.id = @0`,
      [ref.id, now],
    )
  const inserted = await db.query<Array<{ id: number }>>(
    `INSERT INTO requirements_specification_items
       (requirements_specification_id, requirement_id, requirement_version_id, needs_reference_id,
        note, specification_item_status_id, created_at, valid_from, binding_created_by_hsa_id, valid_until, owning_agreement_id)
     OUTPUT INSERTED.id AS id
     SELECT requirements_specification_id, requirement_id, @1, needs_reference_id,
       note, 1, @2, @2, @3, @4, @5 FROM requirements_specification_items WHERE id = @0`,
    [
      ref.id,
      target.id,
      now,
      context.actor.hsaId,
      draft ? now : null,
      input.agreementId ?? null,
    ],
  )
  if (draft)
    await db.query(
      `UPDATE specification_agreement_items SET specification_item_id = @1,
    changed_in_agreement_id = @2, change_kind = CASE WHEN previous_item_id IS NULL THEN 'added' ELSE 'changed' END WHERE id = @0`,
      [draft.id, inserted[0].id, input.agreementId],
    )
  await db.query(
    'UPDATE requirement_versions SET has_specification_item_history = 1 WHERE id = @0',
    [target.id],
  )
  if (input.agreementId !== undefined)
    await recordAgreementContentOrigin(
      db,
      'library',
      inserted[0].id,
      input.agreementId,
    )
  return { itemRef: `lib:${inserted[0].id}` }
}

export function createSpecificationAgreementWorkflow(
  db: SqlServerDatabase,
  clock: { now: () => Date } = { now: () => new Date() },
) {
  return {
    async read(
      context: RequestContext,
      specificationId: number,
      options: { agreementId?: number; itemRefs?: readonly string[] } = {},
    ) {
      return db.transaction(async manager => {
        const record = await agreementRecord(manager, specificationId)
        const target = await permissionTarget(manager, specificationId, record)
        if (
          !context.actor.isAuthenticated ||
          !canReadSpecification(context, target)
        )
          throw forbiddenError()
        await activateDueAgreements(manager, specificationId, clock.now())
        const items = await allItems(manager, specificationId, options.itemRefs)
        const now = clock.now()
        const agreements = await manager.query<
          Array<{
            id: number
            agreementReference: string
            effectiveDate: string
            description: string | null
            createdAt: Date
            createdBy: string | null
            confirmedBy: string | null
            cancelledBy: string | null
            endedBy: string | null
            cancellationReason: string | null
            endReason: string | null
            endDate: string | null
            confirmedAt: Date | null
            activatedAt: Date | null
            cancelledAt: Date | null
            endedAt: Date | null
            replacedAt: Date | null
          }>
        >(
          `SELECT id, agreement_reference AS agreementReference,
          CONVERT(varchar(10), effective_date, 23) AS effectiveDate, description, created_at AS createdAt,
          created_by_display_name AS createdBy, confirmed_by_display_name AS confirmedBy,
          cancelled_by_display_name AS cancelledBy, ended_by_display_name AS endedBy,
          cancellation_reason AS cancellationReason, end_reason AS endReason, CONVERT(varchar(10), end_date, 23) AS endDate,
          confirmed_at AS confirmedAt, activated_at AS activatedAt,
          cancelled_at AS cancelledAt, ended_at AS endedAt, replaced_at AS replacedAt
          FROM specification_agreements WHERE specification_id = @0 ORDER BY id`,
          [specificationId],
        )
        const agreementContexts = agreements.map(agreement => ({
          ...agreement,
          state: agreement.cancelledAt
            ? 'cancelled'
            : agreement.endedAt
              ? 'ended'
              : agreement.replacedAt
                ? 'previous'
                : agreement.activatedAt
                  ? 'current'
                  : agreement.confirmedAt
                    ? 'upcoming'
                    : 'draft',
        }))
        const selectedAgreement =
          options.agreementId !== undefined
            ? (agreementContexts.find(
                agreement => agreement.id === options.agreementId,
              ) ?? null)
            : (agreementContexts.find(
                agreement => agreement.state === 'current',
              ) ??
              agreementContexts.find(agreement =>
                ['draft', 'upcoming'].includes(agreement.state),
              ) ??
              agreementContexts.findLast(
                agreement => agreement.state === 'ended',
              ) ??
              null)
        if (options.agreementId !== undefined && !selectedAgreement)
          throw notFoundError('Agreement not found in this specification')
        const membership = selectedAgreement
          ? await manager.query<
              Array<{
                itemRef: string
                previousItemId: number | null
                changeKind: AgreementItem['changeKind']
                isRemoved: boolean
                changeDate: string | null
                hasFollowupSnapshot: boolean
                deviationStateJson: string | null
                specificationItemStatusId: number
                note: string | null
                needsReference: string | null
              }>
            >(
              `SELECT CASE WHEN specification_item_id IS NOT NULL THEN CONCAT('lib:', specification_item_id)
            ELSE CONCAT('local:', specification_local_requirement_id) END AS itemRef, previous_item_id AS previousItemId, change_kind AS changeKind, is_removed AS isRemoved, (SELECT CONVERT(varchar(10), effective_date, 23) FROM specification_agreements WHERE id = changed_in_agreement_id) AS changeDate, has_followup_snapshot AS hasFollowupSnapshot, deviation_state_json AS deviationStateJson, specification_item_status_id AS specificationItemStatusId, note, needs_reference AS needsReference
           FROM specification_agreement_items WHERE specification_agreement_id = @0 AND (is_removed = 0 OR @1 = 1)
             AND (@2 IS NULL OR CASE WHEN specification_item_id IS NOT NULL THEN CONCAT('lib:', specification_item_id) ELSE CONCAT('local:', specification_local_requirement_id) END IN (SELECT value FROM OPENJSON(@2)))`,
              [
                selectedAgreement.id,
                selectedAgreement.state === 'draft',
                options.itemRefs === undefined
                  ? null
                  : JSON.stringify(options.itemRefs),
              ],
            )
          : null
        const visibleRefs =
          options.itemRefs === undefined
            ? undefined
            : items
                .filter(item =>
                  membership
                    ? membership.some(
                        binding => binding.itemRef === item.itemRef,
                      )
                    : isApplicable(item, now),
                )
                .map(item => item.itemRef)
        return {
          agreements: agreementContexts,
          selectedAgreement,
          confirmationDeviations:
            selectedAgreement?.state === 'draft'
              ? await readConfirmationDeviations(
                  manager,
                  specificationId,
                  selectedAgreement.id,
                )
              : [],
          corrections: selectedAgreement
            ? await manager.query<
                Array<{
                  id: number
                  agreementId: number
                  oldAgreementReference: string
                  newAgreementReference: string
                  oldEffectiveDate: string
                  newEffectiveDate: string
                  oldDescription: string | null
                  newDescription: string | null
                  correctedAt: Date
                  correctedBy: string | null
                }>
              >(
                `SELECT id, agreement_id AS agreementId, old_agreement_reference AS oldAgreementReference,
              new_agreement_reference AS newAgreementReference, CONVERT(varchar(10), old_effective_date, 23) AS oldEffectiveDate,
              CONVERT(varchar(10), new_effective_date, 23) AS newEffectiveDate, old_description AS oldDescription,
              new_description AS newDescription, corrected_at AS correctedAt, corrected_by_display_name AS correctedBy
             FROM specification_agreement_corrections WHERE agreement_id = @0 ORDER BY id DESC`,
                [selectedAgreement.id],
              )
            : [],
          items: membership
            ? items
                .filter(item =>
                  membership.some(binding => binding.itemRef === item.itemRef),
                )
                .map(item => {
                  const snapshot = membership.find(
                    binding => binding.itemRef === item.itemRef,
                  )
                  return snapshot?.hasFollowupSnapshot
                    ? {
                        ...item,
                        isRemoved: Boolean(snapshot.isRemoved),
                        changeKind: snapshot.changeKind,
                        changeDate: snapshot.changeDate,
                        specificationItemStatusId:
                          snapshot.specificationItemStatusId,
                        deviationStateSnapshot: parseDeviationStateSnapshot(
                          snapshot.deviationStateJson,
                        ),
                        note: snapshot.note,
                        needsReference: snapshot.needsReference,
                      }
                    : {
                        ...item,
                        changeDate: snapshot?.changeDate ?? null,
                        isRemoved: Boolean(snapshot?.isRemoved),
                        changeKind: snapshot?.changeKind ?? null,
                      }
                })
            : items.filter(item => isApplicable(item, now)),
          canEditContent:
            specificationPermissions(context, target).canEditContent &&
            (!selectedAgreement || selectedAgreement.state === 'draft'),
          canFollowUp:
            specificationPermissions(context, target).canEditContent &&
            (!selectedAgreement || selectedAgreement.state === 'current'),
          canAuthor: specificationPermissions(context, target).canEditContent,
          canDecide: isSpecificationResponsible(context, target),
          canReviewDeviations: specificationPermissions(context, target)
            .canReviewDecisions,
          ...(await readAgreementCases(manager, specificationId, visibleRefs)),
        }
      })
    },
    async endPreview(
      context: RequestContext,
      specificationId: number,
      agreementId: number,
    ) {
      return db.transaction(async manager => {
        const record = await agreementRecord(manager, specificationId)
        const target = await permissionTarget(manager, specificationId, record)
        if (
          !context.actor.isAuthenticated ||
          !canReadSpecification(context, target)
        )
          throw forbiddenError()
        await activateDueAgreements(manager, specificationId, clock.now())
        const current = await manager.query<Array<{ id: number }>>(
          'SELECT id FROM specification_agreements WHERE specification_id = @0 AND id = @1 AND is_current = 1',
          [specificationId, agreementId],
        )
        if (!current[0])
          throw conflictError('Only the current agreement can be ended')
        return readAgreementEndPreview(manager, specificationId, agreementId)
      })
    },
    async history(
      context: RequestContext,
      specificationId: number,
      agreementId: number,
      itemRef: string,
    ) {
      return db.transaction(async manager => {
        const record = await agreementRecord(manager, specificationId)
        const target = await permissionTarget(manager, specificationId, record)
        if (
          !context.actor.isAuthenticated ||
          !canReadSpecification(context, target)
        )
          throw forbiddenError()
        await activateDueAgreements(manager, specificationId, clock.now())
        const history = await readAgreementRequirementHistory(
          manager,
          specificationId,
          agreementId,
          itemRef,
          refs => allItems(manager, specificationId, refs),
        )
        return {
          ...history,
          ...(await readAgreementCases(
            manager,
            specificationId,
            history.entries.map(entry => entry.item.itemRef),
          )),
        }
      })
    },
    async compare(
      context: RequestContext,
      specificationId: number,
      itemRef: string,
      options: { agreementId?: number } = {},
    ) {
      return db.transaction(async manager => {
        const record = await agreementRecord(manager, specificationId)
        const target = await permissionTarget(manager, specificationId, record)
        if (
          !context.actor.isAuthenticated ||
          !canReadSpecification(context, target)
        )
          throw forbiddenError()
        await activateDueAgreements(manager, specificationId, clock.now())
        if (options.agreementId !== undefined) {
          const ref = parseSpecificationItemRef(itemRef)
          const membership = await manager.query<Array<{ id: number }>>(
            `SELECT membership.id FROM specification_agreement_items membership
            INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
            WHERE agreement.id = @0 AND agreement.specification_id = @1 AND membership.specification_item_id = @2
              AND agreement.is_pending = 1 AND agreement.confirmed_at IS NULL AND membership.is_removed = 0`,
            [options.agreementId, specificationId, ref?.id],
          )
          if (!membership.length)
            throw conflictError(
              'Select the editable draft containing this library requirement',
            )
        } else
          await assertSpecificationContentEditable(manager, specificationId)
        const item = (await allItems(manager, specificationId, [itemRef])).find(
          item =>
            item.itemRef === itemRef &&
            (options.agreementId !== undefined ||
              isApplicable(item, clock.now())),
        )
        if (!item?.requirementVersionId)
          throw notFoundError('Current library application not found')
        const published = await manager.query<Array<{ id: number }>>(
          'SELECT TOP (1) id FROM requirement_versions WHERE requirement_id = @0 AND requirement_status_id = @1 AND version_number > @2 ORDER BY version_number DESC',
          [item.requirementId, STATUS_PUBLISHED, item.versionNumber],
        )
        if (!published[0]) throw notFoundError('No newer published version')
        return {
          pinned: await versionContent(manager, item.requirementVersionId),
          published: await versionContent(manager, published[0].id),
        }
      })
    },
    async mutate(
      context: RequestContext,
      specificationId: number,
      input: AgreementMutationInput,
    ) {
      input = agreementMutationSchema.parse(input)
      return db.transaction(async manager => {
        const perform = async () => {
          const record = await agreementRecord(manager, specificationId)
          const target = await permissionTarget(
            manager,
            specificationId,
            record,
          )
          if (
            !context.actor.isAuthenticated ||
            !([
              'add_library',
              'add_local',
              'undo_requirement',
              'remove_requirement',
              'save_requirement',
              'create_draft',
              'adopt',
              'cancel_deviation',
            ].includes(input.operation)
              ? specificationPermissions(context, target).canEditContent
              : isSpecificationResponsible(context, record))
          ) {
            throw forbiddenError('Specification responsibility is required')
          }
          await activateDueAgreements(manager, specificationId, clock.now())
          if (input.operation === 'correct')
            return correctAgreement(
              manager,
              specificationId,
              input,
              clock.now(),
              context,
            )
          if (input.operation === 'discard')
            return discardAgreementDraft(
              manager,
              specificationId,
              input.agreementId,
              context.actor.hsaId,
              clock.now(),
            )
          if (input.operation === 'cancel')
            return cancelUpcomingAgreement(
              manager,
              specificationId,
              context,
              input,
              clock.now(),
            )
          if (input.operation === 'end')
            return endCurrentAgreement(
              manager,
              specificationId,
              context,
              input,
              clock.now(),
            )
          if (
            input.operation === 'undo_requirement' ||
            input.operation === 'remove_requirement'
          ) {
            return restoreOrRemoveAgreementRequirement(
              manager,
              specificationId,
              input,
              context,
              clock.now(),
            )
          }
          if (input.operation === 'add_library')
            return addAgreementLibraryRequirement(
              manager,
              specificationId,
              context,
              input,
              clock.now(),
            )
          if (input.operation === 'add_local')
            return saveAgreementRequirement(
              manager,
              specificationId,
              context,
              input,
              undefined,
              clock.now(),
            )
          if (input.operation === 'save_requirement') {
            const source = (
              await allItems(manager, specificationId, [input.itemRef])
            ).find(item => item.itemRef === input.itemRef)
            return saveAgreementRequirement(
              manager,
              specificationId,
              context,
              input,
              source,
              clock.now(),
            )
          }
          if (input.operation === 'confirm') {
            const records = await manager.query<
              Array<{ id: number; effectiveDate: string }>
            >(
              `SELECT id, CONVERT(varchar(10), effective_date, 23) AS effectiveDate FROM specification_agreements
               WHERE id = @0 AND specification_id = @1 AND is_pending = 1 AND confirmed_at IS NULL`,
              [input.agreementId, specificationId],
            )
            const agreement = records[0]
            if (!agreement)
              throw conflictError('An editable agreement draft is required')
            if (agreement.effectiveDate < stockholmDate(clock.now()))
              throw conflictError(
                'Avtalsdatum har passerat. Välj dagens datum eller ett framtida datum.',
                { reason: 'agreement_date_passed' },
              )
            await prepareAgreementConfirmation(
              manager,
              specificationId,
              agreement.id,
              context,
              input.authorizeDeviationEndings,
              clock.now(),
            )
            await manager.query(
              `UPDATE specification_agreements SET confirmed_at = @1,
              confirmed_by_hsa_id = @2, effective_at = @3, confirmed_by_display_name = @4 WHERE id = @0`,
              [
                agreement.id,
                clock.now(),
                context.actor.hsaId,
                agreementEffectiveAt(agreement.effectiveDate, clock.now()),
                context.actor.displayName,
              ],
            )
            await activateDueAgreements(manager, specificationId, clock.now())
            return { agreementId: agreement.id }
          }
          if (input.operation === 'create_draft') {
            validateAgreementDate(input.effectiveDate)
            const reference = input.agreementReference.trim()
            if (!reference || reference.length > 450)
              throw validationError(
                'A reference of 1–450 characters is required',
              )
            const agreements = await manager.query<
              Array<{
                id: number
                effectiveDate: string
                isPending: boolean
                isCurrent: boolean
                endedAt: Date | null
              }>
            >(
              `SELECT id, CONVERT(varchar(10), effective_date, 23) AS effectiveDate,
                is_pending AS isPending, is_current AS isCurrent, ended_at AS endedAt
               FROM specification_agreements WHERE specification_id = @0 ORDER BY id`,
              [specificationId],
            )
            if (agreements.some(agreement => agreement.isPending))
              throw conflictError('A pending agreement already exists', {
                reason: 'pending_agreement',
              })
            const previous =
              agreements.find(agreement => agreement.isCurrent) ??
              agreements.findLast(agreement => agreement.endedAt)
            if (!previous)
              throw conflictError(
                'Register the first agreement before creating a successor',
              )
            if (
              input.effectiveDate < stockholmDate(clock.now()) ||
              input.effectiveDate <= previous.effectiveDate
            )
              throw validationError(
                'A successor requires today or a future date after the preceding agreement',
                { reason: 'agreement_date_order' },
              )
            const duplicates = await manager.query<Array<{ id: number }>>(
              `SELECT id FROM specification_agreements WHERE specification_id = @0 AND
                (agreement_reference = @1 OR (effective_date = @2 AND cancelled_at IS NULL))`,
              [specificationId, reference, input.effectiveDate],
            )
            if (duplicates.length)
              throw conflictError(
                'The agreement reference or date is already used',
                { reason: 'agreement_identity_conflict' },
              )
            const inserted = await manager.query<Array<{ id: number }>>(
              `INSERT INTO specification_agreements (specification_id, agreement_reference, effective_date,
                description, created_at, created_by_hsa_id, is_pending, is_current, previous_agreement_id, created_by_display_name)
               OUTPUT INSERTED.id AS id VALUES (@0, @1, @2, @3, @4, @5, 1, 0, @6, @7)`,
              [
                specificationId,
                reference,
                input.effectiveDate,
                input.description?.trim() || null,
                clock.now(),
                context.actor.hsaId,
                previous.id,
                context.actor.displayName,
              ],
            )
            await manager.query(
              `INSERT INTO specification_agreement_items
              (specification_agreement_id, specification_item_id, specification_local_requirement_id,
               previous_item_id, changed_in_agreement_id, change_kind)
              SELECT @0, specification_item_id, specification_local_requirement_id, id, changed_in_agreement_id, change_kind
              FROM specification_agreement_items WHERE specification_agreement_id = @1 AND is_removed = 0`,
              [inserted[0].id, previous.id],
            )
            if (previous.endedAt)
              await copyAgreementRequirements(
                manager,
                previous.id,
                context.actor.hsaId,
                clock.now(),
                inserted[0].id,
              )
            return { agreementId: inserted[0].id }
          }
          if ('reason' in input && !input.reason.trim())
            throw validationError('A reason is required')
          if (input.operation === 'cancel_deviation') {
            const ref = parseSpecificationItemRef(input.itemRef)
            const item = (
              await allItems(manager, specificationId, [input.itemRef])
            ).find(item => item.itemRef === input.itemRef)
            if (!ref || !item)
              throw notFoundError('Current application not found')
            if (input.agreementId !== undefined) {
              const matching = await manager.query<Array<{ id: number }>>(
                `SELECT membership.id FROM specification_agreement_items membership
                 INNER JOIN specification_agreements agreement ON agreement.id = membership.specification_agreement_id
                 WHERE agreement.id = @0 AND agreement.specification_id = @1 AND (agreement.is_current = 1 OR agreement.is_pending = 1)
                   AND membership.${ref.kind === 'library' ? 'specification_item_id' : 'specification_local_requirement_id'} = @2`,
                [input.agreementId, specificationId, ref.id],
              )
              if (!matching.length)
                throw conflictError(
                  'The selected agreement cannot change this deviation',
                )
            } else if (!isApplicable(item, clock.now()))
              throw conflictError(
                'Select the agreement containing this requirement',
              )
            const table =
              ref.kind === 'library'
                ? 'deviations'
                : 'specification_local_requirement_deviations'
            const parentColumn =
              ref.kind === 'library'
                ? 'specification_item_id'
                : 'specification_local_requirement_id'
            const rows = await manager.query<Array<{ id: number }>>(
              `UPDATE ${table} SET decision = 3, is_review_requested = 0, decision_motivation = @2,
              decided_at = @3, updated_at = @3, decided_by_hsa_id = @4, decided_by = @5
             OUTPUT INSERTED.id AS id WHERE id = @0 AND ${parentColumn} = @1 AND decision IS NULL`,
              [
                input.deviationId,
                ref.id,
                input.reason.trim(),
                clock.now(),
                context.actor.hsaId,
                context.actor.displayName,
              ],
            )
            if (!rows[0]) throw conflictError('Deviation is no longer active')
            return
          }
          if (input.operation === 'adopt') {
            if (input.agreementId === undefined)
              await assertSpecificationContentEditable(manager, specificationId)
            return adopt(manager, context, specificationId, input, clock.now())
          }
          await assertSpecificationContentEditable(manager, specificationId)
          validateAgreementDate(input.effectiveDate)
          if (!input.agreementReference.trim()) {
            throw validationError(
              'Agreement reference and effective date are required',
            )
          }
          const items = (await allItems(manager, specificationId)).filter(
            item => isApplicable(item, clock.now()),
          )
          const now = clock.now()
          const isFuture = input.effectiveDate > stockholmDate(now)
          const duplicates = await manager.query<Array<{ id: number }>>(
            `SELECT id FROM specification_agreements WHERE specification_id = @0
            AND (agreement_reference = @1 OR (effective_date = @2 AND cancelled_at IS NULL))`,
            [specificationId, input.agreementReference, input.effectiveDate],
          )
          if (duplicates.length)
            throw conflictError(
              'The agreement reference or date is already used',
              { reason: 'agreement_identity_conflict' },
            )
          const inserted = await manager.query<Array<{ id: number }>>(
            `INSERT INTO specification_agreements
             (specification_id, agreement_reference, effective_date, description, created_at, created_by_hsa_id,
              confirmed_at, confirmed_by_hsa_id, effective_at, activated_at, is_pending, is_current, created_by_display_name, confirmed_by_display_name)
             OUTPUT INSERTED.id AS id VALUES (@0, @1, @2, @3, @4, @5, @4, @5, @6, @7, @8, @9, @10, @10)`,
            [
              specificationId,
              input.agreementReference.trim(),
              input.effectiveDate,
              input.description?.trim() || null,
              now,
              context.actor.hsaId,
              isFuture ? agreementEffectiveAt(input.effectiveDate, now) : now,
              isFuture ? null : now,
              isFuture,
              !isFuture,
              context.actor.displayName,
            ],
          )
          for (const item of items) {
            const ref = parseSpecificationItemRef(item.itemRef)
            if (!ref) throw new Error('Invalid stored requirement binding')
            await manager.query(
              `INSERT INTO specification_agreement_items
              (specification_agreement_id, specification_item_id, specification_local_requirement_id)
              VALUES (@0, @1, @2)`,
              [
                inserted[0].id,
                ref.kind === 'library' ? ref.id : null,
                ref.kind === 'specificationLocal' ? ref.id : null,
              ],
            )
          }
        }
        const result = await perform()
        await recordAllowedActionAuditEvent(manager, context, {
          action: `specification.agreement.${input.operation}`,
          targetId: specificationId,
          targetKind: 'RequirementsSpecification',
          details: {
            operation: input.operation,
            ...('agreementId' in input
              ? { agreementId: input.agreementId }
              : {}),
            ...('itemRef' in input ? { itemRef: input.itemRef } : {}),
            ...(result && 'correction' in result ? result.correction : {}),
          },
        })
        return result
      })
    },
  }
}
