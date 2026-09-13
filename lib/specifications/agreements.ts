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
import {
  cancelAmendment,
  decideAmendment,
  listAmendments,
  type PrepareAmendmentInput,
  prepareAmendment,
  stockholmDate,
  validateAgreementDate,
} from '@/lib/specifications/amendments'
import {
  canReadSpecification,
  isSpecificationResponsible,
  specificationPermissions,
} from '@/lib/specifications/permissions'

interface AgreementRecord {
  agreementDate: Date | null
  agreementEndDate: Date | null
  agreementEndReason: string | null
  agreementReason: string | null
  agreementReference: string | null
  endedAt: Date | null
  endedByHsaId: string | null
  establishedAt: Date | null
  establishedByHsaId: string | null
  establishmentStatus: 'assessment' | 'editable' | 'established' | 'ended'
  originalContentJson: string | null
  responsibleHsaId: string
}

export interface AgreementItem {
  acceptanceCriteria: string | null
  amendmentId: number | null
  description: string
  itemRef: SpecificationItemRef
  needsReference: string | null
  newerPublishedVersionId: number | null
  normReferences: string | null
  note: string | null
  priorityLevelId: number | null
  qualityCharacteristicId: number | null
  reassessmentRequired: boolean
  requirementCategoryId: number | null
  requirementId: number | null
  requirementTypeId: number | null
  requirementVersionId: number | null
  specificationItemStatusId: number
  validFrom: Date
  validUntil: Date | null
  verifiable: boolean
  verificationMethod: string | null
  versionNumber: number | null
}

export interface EstablishSpecificationInput {
  agreementReference: string
  effectiveDate: string
  operation: 'establish'
  reason: string
}

export type AgreementMutationInput =
  | { operation: 'confirm_editable'; reason: string }
  | { operation: 'end_agreement'; reason: string; effectiveDate: string }
  | {
      operation: 'reassess'
      itemRef: string
      reason: string
      specificationItemStatusId: number
    }
  | { operation: 'cancel_amendment'; amendmentId: number; reason: string }
  | {
      operation: 'cancel_deviation'
      itemRef: string
      deviationId: number
      reason: string
    }
  | EstablishSpecificationInput
  | PrepareAmendmentInput
  | { operation: 'decide_amendment'; amendmentId: number }
  | {
      operation: 'adopt'
      itemRef: string
      targetVersionId: number
      reason: string
    }

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
    `SELECT establishment_status AS establishmentStatus,
       responsible_hsa_id AS responsibleHsaId, agreement_reference AS agreementReference,
       agreement_reason AS agreementReason, agreement_date AS agreementDate,
       established_at AS establishedAt, established_by_hsa_id AS establishedByHsaId,
       ended_at AS endedAt, ended_by_hsa_id AS endedByHsaId,
       agreement_end_date AS agreementEndDate, agreement_end_reason AS agreementEndReason,
       original_content_json AS originalContentJson
     FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK) WHERE id = @0`,
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

async function allItems(db: SqlExecutor, id: number): Promise<AgreementItem[]> {
  const rows = await db.query<AgreementItem[]>(
    `SELECT CONCAT('lib:', item.id) AS itemRef, version.description AS description,
       item.requirement_id AS requirementId, item.requirement_version_id AS requirementVersionId,
       version.version_number AS versionNumber, COALESCE(item.needs_reference_snapshot, needs.text) AS needsReference, item.note,
       item.specification_item_status_id AS specificationItemStatusId,
       item.is_reassessment_required AS reassessmentRequired, item.valid_from AS validFrom, item.valid_until AS validUntil, item.specification_amendment_id AS amendmentId, newer.id AS newerPublishedVersionId,
       version.acceptance_criteria AS acceptanceCriteria, version.verification_method AS verificationMethod,
       version.is_verifiable AS verifiable, version.requirement_category_id AS requirementCategoryId,
       version.requirement_type_id AS requirementTypeId, version.quality_characteristic_id AS qualityCharacteristicId,
       version.priority_level_id AS priorityLevelId,
       (SELECT STRING_AGG(CAST(n.name AS nvarchar(MAX)), N'; ') WITHIN GROUP (ORDER BY n.name)
        FROM requirement_version_norm_references link INNER JOIN norm_references n ON n.id = link.norm_reference_id
        WHERE link.requirement_version_id = version.id) AS normReferences
     FROM requirements_specification_items item
     INNER JOIN requirement_versions version ON version.id = item.requirement_version_id
     OUTER APPLY (SELECT TOP (1) id FROM requirement_versions published WHERE published.requirement_id = item.requirement_id AND published.requirement_status_id = 3 AND published.version_number > version.version_number ORDER BY published.version_number DESC) newer
     LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
     WHERE item.requirements_specification_id = @0
     UNION ALL
     SELECT CONCAT('local:', item.id), item.description, NULL, NULL, NULL, COALESCE(item.needs_reference_snapshot, needs.text), item.note,
       item.specification_item_status_id, item.is_reassessment_required, item.valid_from, item.valid_until, item.specification_amendment_id, NULL,
       item.acceptance_criteria, item.verification_method, item.is_verifiable,
       item.requirement_category_id, item.requirement_type_id, item.quality_characteristic_id, item.priority_level_id,
       (SELECT STRING_AGG(CAST(n.name AS nvarchar(MAX)), N'; ') WITHIN GROUP (ORDER BY n.name)
        FROM specification_local_requirement_norm_references link INNER JOIN norm_references n ON n.id = link.norm_reference_id
        WHERE link.specification_local_requirement_id = item.id)
     FROM specification_local_requirements item
     LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id
     WHERE item.specification_id = @0`,
    [id],
  )
  return rows.map(row => ({
    ...row,
    reassessmentRequired: Boolean(row.reassessmentRequired),
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
  const items = await allItems(db, specificationId)
  const source = items.find(
    item => item.itemRef === input.itemRef && isApplicable(item, now),
  )
  if (!source?.requirementVersionId)
    throw conflictError('The source binding has changed')
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
  await db.query(
    `UPDATE item SET valid_until = @1, needs_reference_snapshot = needs.text FROM requirements_specification_items item LEFT JOIN specification_needs_references needs ON needs.id = item.needs_reference_id WHERE item.id = @0`,
    [ref.id, now],
  )
  await db.query(
    `INSERT INTO requirements_specification_items
       (requirements_specification_id, requirement_id, requirement_version_id, needs_reference_id,
        note, specification_item_status_id, created_at, valid_from, is_reassessment_required,
        binding_reason, binding_created_by_hsa_id)
     SELECT requirements_specification_id, requirement_id, @1, needs_reference_id,
       note, 1, @2, @2, 1, @3, @4 FROM requirements_specification_items WHERE id = @0`,
    [ref.id, target.id, now, input.reason.trim(), context.actor.hsaId],
  )
  await db.query(
    'UPDATE requirement_versions SET has_specification_item_history = 1 WHERE id = @0',
    [target.id],
  )
}

export function createSpecificationAgreementWorkflow(
  db: SqlServerDatabase,
  clock: { now: () => Date } = { now: () => new Date() },
) {
  return {
    async read(
      context: RequestContext,
      specificationId: number,
      versionSearch = '',
    ) {
      return db.transaction(async manager => {
        const record = await agreementRecord(manager, specificationId)
        const target = await permissionTarget(manager, specificationId, record)
        if (
          !context.actor.isAuthenticated ||
          !canReadSpecification(context, target)
        )
          throw forbiddenError()
        const items = await allItems(manager, specificationId)
        const now = clock.now()
        return {
          selectedVersions: await manager.query<
            Array<{ id: number; versionNumber: number; description: string }>
          >(
            `SELECT DISTINCT v.id, v.version_number AS versionNumber, v.description FROM specification_amendments amendment
             CROSS APPLY OPENJSON(amendment.changes_json) WITH (targetVersionId int '$.targetVersionId') change
             INNER JOIN requirement_versions v ON v.id = change.targetVersionId WHERE amendment.specification_id = @0`,
            [specificationId],
          ),
          availableVersions: await manager.query<
            Array<{
              id: number
              uniqueId: string
              versionNumber: number
              description: string
            }>
          >(
            `SELECT TOP (100) v.id, r.unique_id AS uniqueId, v.version_number AS versionNumber, v.description
             FROM requirement_versions v INNER JOIN requirements r ON r.id = v.requirement_id
             WHERE v.requirement_status_id = 3 AND (r.unique_id LIKE @0 OR v.description LIKE @0) ORDER BY r.unique_id`,
            [`%${versionSearch}%`],
          ),
          canAuthor: specificationPermissions(context, target).canEditContent,
          canDecide: isSpecificationResponsible(context, target),
          deviations: await manager.query<
            Array<{
              id: number
              itemRef: string
              motivation: string
              decision: number | null
              decisionMotivation: string | null
              decidedAt: Date | null
            }>
          >(
            `SELECT d.id, CONCAT('lib:', i.id) AS itemRef, d.motivation, d.decision, d.decision_motivation AS decisionMotivation, d.decided_at AS decidedAt
             FROM deviations d INNER JOIN requirements_specification_items i ON i.id = d.specification_item_id WHERE i.requirements_specification_id = @0
             UNION ALL
             SELECT d.id, CONCAT('local:', i.id), d.motivation, d.decision, d.decision_motivation, d.decided_at
             FROM specification_local_requirement_deviations d INNER JOIN specification_local_requirements i ON i.id = d.specification_local_requirement_id WHERE i.specification_id = @0`,
            [specificationId],
          ),
          amendments: (await listAmendments(manager, specificationId)).map(
            amendment => ({
              ...amendment,
              changes: JSON.parse(
                amendment.changesJson,
              ) as PrepareAmendmentInput['changes'],
              status: amendment.cancelledAt
                ? 'cancelled'
                : !amendment.decidedAt
                  ? 'draft'
                  : amendment.effectiveAt &&
                      new Date(amendment.effectiveAt) <= now
                    ? 'effective'
                    : 'decided',
            }),
          ),
          agreement: {
            reason: record.agreementReason,
            date: record.agreementDate,
            establishedAt: record.establishedAt,
            establishedByHsaId: record.establishedByHsaId,
            endedAt: record.endedAt,
            endedByHsaId: record.endedByHsaId,
            endDate: record.agreementEndDate,
            endReason: record.agreementEndReason,
          },
          establishmentStatus: record.establishmentStatus,
          agreementReference: record.agreementReference,
          originalItems: JSON.parse(
            record.originalContentJson ?? '[]',
          ) as AgreementItem[],
          currentItems: items.filter(item => isApplicable(item, now)),
          historyItems: items.filter(
            item =>
              item.validUntil &&
              new Date(item.validUntil) > new Date(item.validFrom) &&
              new Date(item.validUntil) <= now,
          ),
        }
      })
    },
    async compare(
      context: RequestContext,
      specificationId: number,
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
        const item = (await allItems(manager, specificationId)).find(
          item => item.itemRef === itemRef && isApplicable(item, clock.now()),
        )
        if (!item?.requirementVersionId)
          throw notFoundError('Current library application not found')
        const published = await manager.query<Array<{ id: number }>>(
          'SELECT id FROM requirement_versions WHERE requirement_id = @0 AND requirement_status_id = @1 AND version_number > @2',
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
              'adopt',
              'prepare_amendment',
              'cancel_deviation',
              'reassess',
            ].includes(input.operation)
              ? specificationPermissions(context, target).canEditContent
              : isSpecificationResponsible(context, record))
          ) {
            throw forbiddenError('Specification responsibility is required')
          }
          if ('reason' in input && !input.reason.trim())
            throw validationError('A reason is required')
          if (input.operation === 'confirm_editable') {
            if (record.establishmentStatus !== 'assessment')
              throw conflictError(
                'Only unassessed specifications can be confirmed editable',
              )
            await manager.query(
              `UPDATE requirements_specifications SET establishment_status = N'editable', assessed_at = @1,
            assessed_by_hsa_id = @2, assessment_reason = @3 WHERE id = @0`,
              [
                specificationId,
                clock.now(),
                context.actor.hsaId,
                input.reason.trim(),
              ],
            )
            return
          }
          if (input.operation === 'end_agreement') {
            validateAgreementDate(input.effectiveDate)
            if (input.effectiveDate > stockholmDate(clock.now()))
              throw validationError('Agreement end cannot be in the future')
            if (record.establishmentStatus !== 'established')
              throw conflictError('An active agreement is required')
            const future = (
              await listAmendments(manager, specificationId)
            ).some(
              amendment =>
                !amendment.cancelledAt &&
                amendment.effectiveAt &&
                new Date(amendment.effectiveAt) > clock.now(),
            )
            if (future)
              throw conflictError(
                'Cancel future amendments before ending the agreement',
              )
            await manager.query(
              `UPDATE requirements_specifications SET establishment_status = N'ended', ended_at = @1,
            ended_by_hsa_id = @2, agreement_end_date = @3, agreement_end_reason = @4 WHERE id = @0`,
              [
                specificationId,
                clock.now(),
                context.actor.hsaId,
                input.effectiveDate,
                input.reason.trim(),
              ],
            )
            return
          }
          if (input.operation === 'reassess') {
            const ref = parseSpecificationItemRef(input.itemRef)
            const item = (await allItems(manager, specificationId)).find(
              item =>
                item.itemRef === input.itemRef &&
                isApplicable(item, clock.now()),
            )
            if (!ref || !item)
              throw notFoundError('Current application not found')
            if (![1, 2, 3, 4, 5, 6].includes(input.specificationItemStatusId))
              throw validationError('Invalid usage status')
            const table =
              ref.kind === 'library'
                ? 'requirements_specification_items'
                : 'specification_local_requirements'
            if (input.specificationItemStatusId === 5) {
              const deviations =
                ref.kind === 'library'
                  ? 'deviations'
                  : 'specification_local_requirement_deviations'
              const parentColumn =
                ref.kind === 'library'
                  ? 'specification_item_id'
                  : 'specification_local_requirement_id'
              const approvals = await manager.query<Array<{ id: number }>>(
                `SELECT id FROM ${deviations} WHERE ${parentColumn} = @0 AND decision = 1`,
                [ref.id],
              )
              if (!approvals.length)
                throw conflictError(
                  'A new approved deviation is required for this binding',
                )
            }
            await manager.query(
              `UPDATE ${table} SET is_reassessment_required = 0, reassessed_at = @1,
            reassessed_by_hsa_id = @2, reassessment_reason = @3, specification_item_status_id = @4, status_updated_at = @1 WHERE id = @0`,
              [
                ref.id,
                clock.now(),
                context.actor.hsaId,
                input.reason.trim(),
                input.specificationItemStatusId,
              ],
            )
            return
          }
          if (input.operation === 'cancel_deviation') {
            const ref = parseSpecificationItemRef(input.itemRef)
            const item = (await allItems(manager, specificationId)).find(
              item =>
                item.itemRef === input.itemRef &&
                isApplicable(item, clock.now()),
            )
            if (!ref || !item)
              throw notFoundError('Current application not found')
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
          if (input.operation === 'cancel_amendment')
            return cancelAmendment(
              manager,
              context,
              specificationId,
              input.amendmentId,
              input.reason,
              clock.now(),
            )
          if (
            input.operation === 'prepare_amendment' ||
            input.operation === 'decide_amendment'
          ) {
            if (record.establishmentStatus !== 'established')
              throw conflictError('An active established agreement is required')
            return input.operation === 'prepare_amendment'
              ? prepareAmendment(
                  manager,
                  context,
                  specificationId,
                  input,
                  clock.now(),
                )
              : decideAmendment(
                  manager,
                  context,
                  specificationId,
                  input.amendmentId,
                  clock.now(),
                )
          }
          if (input.operation === 'adopt') {
            if (record.establishmentStatus !== 'editable')
              throw conflictError('Agreement content is locked')
            return adopt(manager, context, specificationId, input, clock.now())
          }
          if (!['editable', 'assessment'].includes(record.establishmentStatus))
            throw conflictError('Specification is already established')
          validateAgreementDate(input.effectiveDate)
          if (!input.agreementReference.trim()) {
            throw validationError(
              'Reason, agreement reference and date are required',
            )
          }
          const items = (await allItems(manager, specificationId)).filter(
            item => isApplicable(item, clock.now()),
          )
          await manager.query(
            `UPDATE requirements_specifications SET establishment_status = N'established',
             agreement_reference = @1, agreement_reason = @2, agreement_date = @3,
             established_at = @6, established_by_hsa_id = @4, original_content_json = @5
           WHERE id = @0`,
            [
              specificationId,
              input.agreementReference.trim(),
              input.reason.trim(),
              input.effectiveDate,
              context.actor.hsaId,
              JSON.stringify(items),
              clock.now(),
            ],
          )
        }
        const result = await perform()
        await recordAllowedActionAuditEvent(manager, context, {
          action: `specification.agreement.${input.operation}`,
          targetId: specificationId,
          targetKind: 'RequirementsSpecification',
          details: {
            operation: input.operation,
            ...('amendmentId' in input
              ? { amendmentId: input.amendmentId }
              : {}),
            ...('itemRef' in input ? { itemRef: input.itemRef } : {}),
          },
        })
        return result
      })
    },
  }
}
