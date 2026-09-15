import {
  createLibraryItemRef,
  createSpecificationLocalItemRef,
  parseSpecificationItemRef,
  type SqlExecutor,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { assertDeviationMutationAllowed } from '@/lib/specifications/agreement-deviation-policy'
import { assertNewDeviationAllowed } from '@/lib/specifications/agreement-policy'

export const DEVIATION_APPROVED = 1
export const DEVIATION_REJECTED = 2

export interface DeviationRow {
  createdAt: string
  createdBy: string | null
  createdByHsaId: string | null
  decidedAt: string | null
  decidedBy: string | null
  decidedByHsaId: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  isSpecificationLocal?: boolean
  itemRef?: string
  motivation: string
  requirementDescription: string | null
  requirementUniqueId: string | null
  requirementVersionId: number | null
  specificationCode: string | null
  specificationItemId: number | null
  specificationLocalRequirementId?: number | null
  specificationName: string | null
  updatedAt: string | null
}

export interface DeviationCounts {
  approved: number
  pending: number
  rejected: number
  total: number
}

function toIsoString(value: unknown): string | null {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

function toNumericFlag(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapSqlServerDeviationRow(row: Record<string, unknown>): DeviationRow {
  const specificationItemId = toOptionalNumber(row.specificationItemId)
  const specificationLocalRequirementId = toOptionalNumber(
    row.specificationLocalRequirementId,
  )
  const isSpecificationLocal =
    toNumericFlag(row.isSpecificationLocal ?? row.isLocal ?? 0) === 1

  return {
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    createdBy: row.createdBy == null ? null : String(row.createdBy),
    createdByHsaId:
      row.createdByHsaId == null ? null : String(row.createdByHsaId),
    decidedAt: toIsoString(row.decidedAt),
    decidedBy: row.decidedBy == null ? null : String(row.decidedBy),
    decidedByHsaId:
      row.decidedByHsaId == null ? null : String(row.decidedByHsaId),
    decision: toOptionalNumber(row.decision),
    decisionMotivation:
      row.decisionMotivation == null ? null : String(row.decisionMotivation),
    id: Number(row.id),
    isSpecificationLocal,
    isReviewRequested: toNumericFlag(row.isReviewRequested),
    itemRef: isSpecificationLocal
      ? createSpecificationLocalItemRef(
          specificationLocalRequirementId as number,
        )
      : createLibraryItemRef(specificationItemId as number),
    motivation: String(row.motivation ?? ''),
    specificationItemId,
    specificationLocalRequirementId,
    specificationName:
      row.specificationName == null ? null : String(row.specificationName),
    specificationCode:
      row.specificationCode == null ? null : String(row.specificationCode),
    requirementDescription:
      row.requirementDescription == null
        ? null
        : String(row.requirementDescription),
    requirementUniqueId:
      row.requirementUniqueId == null ? null : String(row.requirementUniqueId),
    requirementVersionId: toOptionalNumber(row.requirementVersionId),
    updatedAt: toIsoString(row.updatedAt),
  }
}

async function findSqlServerDeviationState(
  db: SqlExecutor,
  deviationId: number,
): Promise<{
  decision: number | null
  id: number
  isReviewRequested: number
} | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        deviation.decision AS decision,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested
      FROM deviations deviation
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    return null
  }

  return {
    decision: toOptionalNumber(rows[0].decision),
    id: Number(rows[0].id),
    isReviewRequested: toNumericFlag(rows[0].isReviewRequested),
  }
}

async function findSqlServerSpecificationLocalDeviationState(
  db: SqlExecutor,
  deviationId: number,
): Promise<DeviationState | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        deviation.decision AS decision,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested
      FROM specification_local_requirement_deviations deviation
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    return null
  }

  return {
    decision: toOptionalNumber(rows[0].decision),
    id: Number(rows[0].id),
    isReviewRequested: toNumericFlag(rows[0].isReviewRequested),
  }
}

interface DeviationState {
  decision: number | null
  id: number
  isReviewRequested: number
}

type DeviationStateFinder = (
  db: SqlExecutor,
  deviationId: number,
) => Promise<DeviationState | null>

export type ConflictMessageForDeviationState = (state: DeviationState) => string

export interface RunGuardedDeviationMutationOptions {
  agreementId?: number
  conflictMessageForState: ConflictMessageForDeviationState
  db: SqlServerDatabase
  deviationId: number
  findState: DeviationStateFinder
  kind?: 'library' | 'local'
  mutationSql: string
  notFoundMessage: string
  parameters: unknown[]
}

async function runGuardedDeviationMutation({
  conflictMessageForState,
  db,
  findState,
  mutationSql,
  notFoundMessage,
  parameters,
  deviationId,
  agreementId,
  kind = 'library',
}: RunGuardedDeviationMutationOptions): Promise<void> {
  await db.transaction(async manager => {
    await assertDeviationMutationAllowed(
      manager,
      kind,
      deviationId,
      agreementId,
    )
    const mutatedRows = await manager.query<Array<Record<string, unknown>>>(
      mutationSql,
      parameters,
    )
    if (mutatedRows[0]) return
    const row = await findState(manager, deviationId)
    if (!row) throw notFoundError(notFoundMessage)
    throw conflictError(conflictMessageForState(row))
  })
}

function editDeviationConflictMessage(state: DeviationState): string {
  if (state.decision !== null) {
    return 'Cannot edit a deviation after a decision has been recorded'
  }

  if (state.isReviewRequested === 1) {
    return 'Cannot edit a deviation that has been submitted for review'
  }

  return 'Cannot edit a deviation because it changed before the update completed'
}

function recordDecisionConflictMessage(state: DeviationState): string {
  if (state.decision !== null) {
    return 'A decision has already been recorded for this deviation'
  }

  if (state.isReviewRequested !== 1) {
    return 'Can only approve or reject deviations that have been submitted for review'
  }

  return 'Cannot record a decision because the deviation changed before the update completed'
}

export async function listDeviationsForSpecificationItem(
  db: SqlServerDatabase,
  specificationItemId: number,
): Promise<DeviationRow[]> {
  const rows = (await db.query(
    `
      SELECT
        deviation.id AS id,
        deviation.specification_item_id AS specificationItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_by_hsa_id AS decidedByHsaId,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_by_hsa_id AS createdByHsaId,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        requirement.unique_id AS requirementUniqueId,
        requirement_version.description AS requirementDescription,
        specification_item.requirement_version_id AS requirementVersionId,
        specification_record.name AS specificationName,
        specification_record.specification_code AS specificationCode,
        CAST(0 AS int) AS isSpecificationLocal,
        CAST(NULL AS int) AS specificationLocalRequirementId
      FROM deviations deviation
      INNER JOIN requirements_specification_items specification_item
        ON specification_item.id = deviation.specification_item_id
      INNER JOIN requirements requirement
        ON requirement.id = specification_item.requirement_id
      INNER JOIN requirement_versions requirement_version
        ON requirement_version.id = specification_item.requirement_version_id
      INNER JOIN requirements_specifications specification_record
        ON specification_record.id = specification_item.requirements_specification_id
      WHERE deviation.specification_item_id = @0
      ORDER BY deviation.created_at ASC, deviation.id ASC
    `,
    [specificationItemId],
  )) as Array<Record<string, unknown>>

  return rows.map(mapSqlServerDeviationRow)
}

export async function listDeviationsForSpecification(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<DeviationRow[]> {
  const rows = (await db.query(
    `
      SELECT
        deviation.id AS id,
        deviation.specification_item_id AS specificationItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_by_hsa_id AS decidedByHsaId,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_by_hsa_id AS createdByHsaId,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        requirement.unique_id AS requirementUniqueId,
        requirement_version.description AS requirementDescription,
        specification_item.requirement_version_id AS requirementVersionId,
        specification_record.name AS specificationName,
        specification_record.specification_code AS specificationCode,
        CAST(0 AS int) AS isSpecificationLocal,
        CAST(NULL AS int) AS specificationLocalRequirementId
      FROM deviations deviation
      INNER JOIN requirements_specification_items specification_item
        ON specification_item.id = deviation.specification_item_id
      INNER JOIN requirements requirement
        ON requirement.id = specification_item.requirement_id
      INNER JOIN requirement_versions requirement_version
        ON requirement_version.id = specification_item.requirement_version_id
      INNER JOIN requirements_specifications specification_record
        ON specification_record.id = specification_item.requirements_specification_id
      WHERE specification_item.requirements_specification_id = @0

      UNION ALL

      SELECT
        deviation.id AS id,
        CAST(NULL AS int) AS specificationItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_by_hsa_id AS decidedByHsaId,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_by_hsa_id AS createdByHsaId,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        specification_local_requirement.unique_id AS requirementUniqueId,
        specification_local_requirement.description AS requirementDescription,
        CAST(NULL AS int) AS requirementVersionId,
        specification_record.name AS specificationName,
        specification_record.specification_code AS specificationCode,
        CAST(1 AS int) AS isSpecificationLocal,
        specification_local_requirement.id AS specificationLocalRequirementId
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements specification_local_requirement
        ON specification_local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications specification_record
        ON specification_record.id = specification_local_requirement.specification_id
      WHERE specification_local_requirement.specification_id = @0

      ORDER BY requirementUniqueId ASC, createdAt ASC, id ASC
    `,
    [specificationId],
  )) as Array<Record<string, unknown>>

  return rows.map(mapSqlServerDeviationRow)
}

export async function getDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<DeviationRow> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        deviation.specification_item_id AS specificationItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_by_hsa_id AS decidedByHsaId,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_by_hsa_id AS createdByHsaId,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        requirement.unique_id AS requirementUniqueId,
        requirement_version.description AS requirementDescription,
        specification_item.requirement_version_id AS requirementVersionId,
        specification_record.name AS specificationName,
        specification_record.specification_code AS specificationCode,
        CAST(0 AS int) AS isSpecificationLocal,
        CAST(NULL AS int) AS specificationLocalRequirementId
      FROM deviations deviation
      INNER JOIN requirements_specification_items specification_item
        ON specification_item.id = deviation.specification_item_id
      INNER JOIN requirements requirement
        ON requirement.id = specification_item.requirement_id
      INNER JOIN requirement_versions requirement_version
        ON requirement_version.id = specification_item.requirement_version_id
      INNER JOIN requirements_specifications specification_record
        ON specification_record.id = specification_item.requirements_specification_id
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  return mapSqlServerDeviationRow(rows[0])
}

export async function createDeviation(
  db: SqlServerDatabase,
  data: {
    agreementId?: number
    specificationItemId: number
    motivation: string
    createdBy?: string | null
    createdByHsaId?: string | null
  },
): Promise<{ id: number }> {
  if (!data.motivation.trim()) {
    throw validationError('Motivation is required')
  }
  return db.transaction(async manager => {
    await assertNewDeviationAllowed(
      manager,
      'library',
      data.specificationItemId,
      data.agreementId,
    )

    const itemRows = (await manager.query(
      `
      SELECT TOP (1) specification_item.id AS id
      FROM requirements_specification_items specification_item
      WHERE specification_item.id = @0
    `,
      [data.specificationItemId],
    )) as Array<Record<string, unknown>>

    if (itemRows.length === 0) {
      throw notFoundError(
        `Requirement application ${data.specificationItemId} not found`,
      )
    }

    const now = new Date()
    const insertedRows = (await manager.query(
      `
      INSERT INTO deviations (
        specification_item_id,
        motivation,
        created_by,
        created_by_hsa_id,
        created_at
      )
      OUTPUT INSERTED.id AS id
      VALUES (@0, @1, @2, @3, @4)
    `,
      [
        data.specificationItemId,
        data.motivation.trim(),
        data.createdBy ?? null,
        data.createdByHsaId ?? null,
        now,
      ],
    )) as Array<Record<string, unknown>>

    return { id: Number(insertedRows[0]?.id) }
  })
}

export async function listDeviationsForSpecificationLocalRequirement(
  db: SqlServerDatabase,
  specificationLocalRequirementId: number,
): Promise<DeviationRow[]> {
  const rows = (await db.query(
    `
      SELECT
        deviation.id AS id,
        CAST(NULL AS int) AS specificationItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_by_hsa_id AS decidedByHsaId,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_by_hsa_id AS createdByHsaId,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        specification_local_requirement.unique_id AS requirementUniqueId,
        specification_local_requirement.description AS requirementDescription,
        CAST(NULL AS int) AS requirementVersionId,
        specification_record.name AS specificationName,
        specification_record.specification_code AS specificationCode,
        CAST(1 AS int) AS isSpecificationLocal,
        specification_local_requirement.id AS specificationLocalRequirementId
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements specification_local_requirement
        ON specification_local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications specification_record
        ON specification_record.id = specification_local_requirement.specification_id
      WHERE deviation.specification_local_requirement_id = @0
      ORDER BY deviation.created_at ASC, deviation.id ASC
    `,
    [specificationLocalRequirementId],
  )) as Array<Record<string, unknown>>

  return rows.map(mapSqlServerDeviationRow)
}

export async function createSpecificationLocalDeviation(
  db: SqlServerDatabase,
  data: {
    agreementId?: number
    createdBy?: string | null
    createdByHsaId?: string | null
    motivation: string
    specificationLocalRequirementId: number
  },
): Promise<{ id: number }> {
  if (!data.motivation.trim()) {
    throw validationError('Motivation is required')
  }
  return db.transaction(async manager => {
    await assertNewDeviationAllowed(
      manager,
      'specificationLocal',
      data.specificationLocalRequirementId,
      data.agreementId,
    )

    const requirementRows = (await manager.query(
      `
      SELECT TOP (1) requirement.id AS id
      FROM specification_local_requirements requirement
      WHERE requirement.id = @0
    `,
      [data.specificationLocalRequirementId],
    )) as Array<Record<string, unknown>>

    if (requirementRows.length === 0) {
      throw notFoundError(
        `Specification-local requirement ${data.specificationLocalRequirementId} not found`,
      )
    }

    const now = new Date()
    const insertedRows = (await manager.query(
      `
      INSERT INTO specification_local_requirement_deviations (
        specification_local_requirement_id,
        motivation,
        created_by,
        created_by_hsa_id,
        created_at
      )
      OUTPUT INSERTED.id AS id
      VALUES (@0, @1, @2, @3, @4)
    `,
      [
        data.specificationLocalRequirementId,
        data.motivation.trim(),
        data.createdBy ?? null,
        data.createdByHsaId ?? null,
        now,
      ],
    )) as Array<Record<string, unknown>>

    return { id: Number(insertedRows[0]?.id) }
  })
}

export async function createDeviationForItemRef(
  db: SqlServerDatabase,
  data: {
    agreementId?: number
    createdBy?: string | null
    createdByHsaId?: string | null
    itemRef: string
    motivation: string
  },
): Promise<{ id: number }> {
  const parsed = parseSpecificationItemRef(data.itemRef)
  if (!parsed) {
    throw validationError('Invalid itemRef', { itemRef: data.itemRef })
  }

  if (parsed.kind === 'library') {
    return createDeviation(db, {
      agreementId: data.agreementId,
      createdBy: data.createdBy,
      createdByHsaId: data.createdByHsaId,
      motivation: data.motivation,
      specificationItemId: parsed.id,
    })
  }

  return createSpecificationLocalDeviation(db, {
    agreementId: data.agreementId,
    createdBy: data.createdBy,
    createdByHsaId: data.createdByHsaId,
    motivation: data.motivation,
    specificationLocalRequirementId: parsed.id,
  })
}

export async function getSpecificationLocalDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<DeviationRow> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        deviation.id AS id,
        CAST(NULL AS int) AS specificationItemId,
        deviation.motivation AS motivation,
        CAST(deviation.is_review_requested AS int) AS isReviewRequested,
        deviation.decision AS decision,
        deviation.decision_motivation AS decisionMotivation,
        deviation.decided_by AS decidedBy,
        deviation.decided_by_hsa_id AS decidedByHsaId,
        deviation.decided_at AS decidedAt,
        deviation.created_by AS createdBy,
        deviation.created_by_hsa_id AS createdByHsaId,
        deviation.created_at AS createdAt,
        deviation.updated_at AS updatedAt,
        specification_local_requirement.unique_id AS requirementUniqueId,
        specification_local_requirement.description AS requirementDescription,
        CAST(NULL AS int) AS requirementVersionId,
        specification_record.name AS specificationName,
        specification_record.specification_code AS specificationCode,
        CAST(1 AS int) AS isSpecificationLocal,
        specification_local_requirement.id AS specificationLocalRequirementId
      FROM specification_local_requirement_deviations deviation
      INNER JOIN specification_local_requirements specification_local_requirement
        ON specification_local_requirement.id = deviation.specification_local_requirement_id
      INNER JOIN requirements_specifications specification_record
        ON specification_record.id = specification_local_requirement.specification_id
      WHERE deviation.id = @0
    `,
    [deviationId],
  )) as Array<Record<string, unknown>>

  if (!rows[0]) {
    throw notFoundError(
      `Specification-local deviation ${deviationId} not found`,
    )
  }

  return mapSqlServerDeviationRow(rows[0])
}

export async function updateDeviation(
  db: SqlServerDatabase,
  deviationId: number,
  data: {
    agreementId?: number
    createdBy?: string | null
    createdByHsaId?: string | null
    motivation?: string
  },
): Promise<void> {
  const existing = await findSqlServerDeviationState(db, deviationId)

  if (!existing) {
    throw notFoundError(`Deviation ${deviationId} not found`)
  }

  if (existing.decision !== null) {
    throw conflictError(
      'Cannot edit a deviation after a decision has been recorded',
    )
  }

  if (existing.isReviewRequested === 1) {
    throw conflictError(
      'Cannot edit a deviation that has been submitted for review',
    )
  }

  const now = new Date()
  if (data.motivation !== undefined) {
    if (!data.motivation.trim()) {
      throw validationError('Motivation is required')
    }

    if (data.createdBy !== undefined) {
      await runGuardedDeviationMutation({
        agreementId: data.agreementId,
        conflictMessageForState: editDeviationConflictMessage,
        db,
        deviationId,
        findState: findSqlServerDeviationState,
        mutationSql: `
          UPDATE deviations
          SET
            motivation = @0,
            created_by = @1,
            created_by_hsa_id = @2,
            updated_at = @3
          OUTPUT INSERTED.id AS id
          WHERE
            id = @4
            AND decision IS NULL
            AND is_review_requested = 0
        `,
        notFoundMessage: `Deviation ${deviationId} not found`,
        parameters: [
          data.motivation.trim(),
          data.createdBy,
          data.createdByHsaId ?? null,
          now,
          deviationId,
        ],
      })
    } else {
      await runGuardedDeviationMutation({
        agreementId: data.agreementId,
        conflictMessageForState: editDeviationConflictMessage,
        db,
        deviationId,
        findState: findSqlServerDeviationState,
        mutationSql: `
          UPDATE deviations
          SET
            motivation = @0,
            updated_at = @1
          OUTPUT INSERTED.id AS id
          WHERE
            id = @2
            AND decision IS NULL
            AND is_review_requested = 0
        `,
        notFoundMessage: `Deviation ${deviationId} not found`,
        parameters: [data.motivation.trim(), now, deviationId],
      })
    }
    return
  }

  if (data.createdBy !== undefined) {
    await runGuardedDeviationMutation({
      agreementId: data.agreementId,
      conflictMessageForState: editDeviationConflictMessage,
      db,
      deviationId,
      findState: findSqlServerDeviationState,
      mutationSql: `
        UPDATE deviations
        SET
          created_by = @0,
          created_by_hsa_id = @1,
          updated_at = @2
        OUTPUT INSERTED.id AS id
        WHERE
          id = @3
          AND decision IS NULL
          AND is_review_requested = 0
      `,
      notFoundMessage: `Deviation ${deviationId} not found`,
      parameters: [
        data.createdBy,
        data.createdByHsaId ?? null,
        now,
        deviationId,
      ],
    })
    return
  }

  await runGuardedDeviationMutation({
    agreementId: data.agreementId,
    conflictMessageForState: editDeviationConflictMessage,
    db,
    deviationId,
    findState: findSqlServerDeviationState,
    mutationSql: `
      UPDATE deviations
      SET updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 0
    `,
    notFoundMessage: `Deviation ${deviationId} not found`,
    parameters: [now, deviationId],
  })
  return
}

export async function recordDecision(
  db: SqlServerDatabase,
  deviationId: number,
  data: {
    agreementId?: number
    decision: number
    decisionMotivation: string
    decidedBy: string
    decidedByHsaId: string
  },
): Promise<void> {
  if (
    data.decision !== DEVIATION_APPROVED &&
    data.decision !== DEVIATION_REJECTED
  ) {
    throw validationError('Decision must be 1 (approved) or 2 (rejected)')
  }

  if (!data.decisionMotivation.trim()) {
    throw validationError('Decision motivation is required')
  }

  if (!data.decidedBy.trim()) {
    throw validationError('Decided by is required')
  }

  const now = new Date()
  await runGuardedDeviationMutation({
    agreementId: data.agreementId,
    conflictMessageForState: recordDecisionConflictMessage,
    db,
    deviationId,
    findState: findSqlServerDeviationState,
    mutationSql: `
      UPDATE deviations
      SET
        decision = @0,
        decision_motivation = @1,
        decided_by = @2,
        decided_by_hsa_id = @3,
        decided_at = @4,
        updated_at = @4
      OUTPUT INSERTED.id AS id
      WHERE
        id = @5
        AND decision IS NULL
        AND is_review_requested = 1
    `,
    notFoundMessage: `Deviation ${deviationId} not found`,
    parameters: [
      data.decision,
      data.decisionMotivation.trim(),
      data.decidedBy.trim(),
      data.decidedByHsaId,
      now,
      deviationId,
    ],
  })
  return
}

export async function deleteDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const state = await findSqlServerDeviationState(db, deviationId)
  if (!state) throw notFoundError(`Deviation ${deviationId} not found`)
  throw conflictError(
    'Cancel the deviation with a reason to preserve its history',
    { reason: 'deviation_cancellation_required' },
  )
}

export async function updateSpecificationLocalDeviation(
  db: SqlServerDatabase,
  deviationId: number,
  data: {
    agreementId?: number
    createdBy?: string | null
    createdByHsaId?: string | null
    motivation?: string
  },
): Promise<void> {
  const existing = await findSqlServerSpecificationLocalDeviationState(
    db,
    deviationId,
  )

  if (!existing) {
    throw notFoundError(
      `Specification-local deviation ${deviationId} not found`,
    )
  }

  if (existing.decision !== null) {
    throw conflictError(
      'Cannot edit a deviation after a decision has been recorded',
    )
  }

  if (existing.isReviewRequested === 1) {
    throw conflictError(
      'Cannot edit a deviation that has been submitted for review',
    )
  }

  const now = new Date()
  if (data.motivation !== undefined) {
    if (!data.motivation.trim()) {
      throw validationError('Motivation is required')
    }

    if (data.createdBy !== undefined) {
      await runGuardedDeviationMutation({
        agreementId: data.agreementId,
        conflictMessageForState: editDeviationConflictMessage,
        db,
        deviationId,
        kind: 'local',
        findState: findSqlServerSpecificationLocalDeviationState,
        mutationSql: `
          UPDATE specification_local_requirement_deviations
          SET
            motivation = @0,
            created_by = @1,
            created_by_hsa_id = @2,
            updated_at = @3
          OUTPUT INSERTED.id AS id
          WHERE
            id = @4
            AND decision IS NULL
            AND is_review_requested = 0
        `,
        notFoundMessage: `Specification-local deviation ${deviationId} not found`,
        parameters: [
          data.motivation.trim(),
          data.createdBy,
          data.createdByHsaId ?? null,
          now,
          deviationId,
        ],
      })
    } else {
      await runGuardedDeviationMutation({
        agreementId: data.agreementId,
        conflictMessageForState: editDeviationConflictMessage,
        db,
        deviationId,
        kind: 'local',
        findState: findSqlServerSpecificationLocalDeviationState,
        mutationSql: `
          UPDATE specification_local_requirement_deviations
          SET
            motivation = @0,
            updated_at = @1
          OUTPUT INSERTED.id AS id
          WHERE
            id = @2
            AND decision IS NULL
            AND is_review_requested = 0
        `,
        notFoundMessage: `Specification-local deviation ${deviationId} not found`,
        parameters: [data.motivation.trim(), now, deviationId],
      })
    }
    return
  }

  if (data.createdBy !== undefined) {
    await runGuardedDeviationMutation({
      agreementId: data.agreementId,
      conflictMessageForState: editDeviationConflictMessage,
      db,
      deviationId,
      kind: 'local',
      findState: findSqlServerSpecificationLocalDeviationState,
      mutationSql: `
        UPDATE specification_local_requirement_deviations
        SET
          created_by = @0,
          created_by_hsa_id = @1,
          updated_at = @2
        OUTPUT INSERTED.id AS id
        WHERE
          id = @3
          AND decision IS NULL
          AND is_review_requested = 0
      `,
      notFoundMessage: `Specification-local deviation ${deviationId} not found`,
      parameters: [
        data.createdBy,
        data.createdByHsaId ?? null,
        now,
        deviationId,
      ],
    })
    return
  }

  await runGuardedDeviationMutation({
    agreementId: data.agreementId,
    conflictMessageForState: editDeviationConflictMessage,
    db,
    deviationId,
    kind: 'local',
    findState: findSqlServerSpecificationLocalDeviationState,
    mutationSql: `
      UPDATE specification_local_requirement_deviations
      SET updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 0
    `,
    notFoundMessage: `Specification-local deviation ${deviationId} not found`,
    parameters: [now, deviationId],
  })
  return
}

export async function recordSpecificationLocalDecision(
  db: SqlServerDatabase,
  deviationId: number,
  data: {
    agreementId?: number
    decision: number
    decisionMotivation: string
    decidedBy: string
    decidedByHsaId: string
  },
): Promise<void> {
  if (
    data.decision !== DEVIATION_APPROVED &&
    data.decision !== DEVIATION_REJECTED
  ) {
    throw validationError('Decision must be 1 (approved) or 2 (rejected)')
  }

  if (!data.decisionMotivation.trim()) {
    throw validationError('Decision motivation is required')
  }

  if (!data.decidedBy.trim()) {
    throw validationError('Decided by is required')
  }

  const now = new Date()
  await runGuardedDeviationMutation({
    agreementId: data.agreementId,
    conflictMessageForState: recordDecisionConflictMessage,
    db,
    deviationId,
    kind: 'local',
    findState: findSqlServerSpecificationLocalDeviationState,
    mutationSql: `
      UPDATE specification_local_requirement_deviations
      SET
        decision = @0,
        decision_motivation = @1,
        decided_by = @2,
        decided_by_hsa_id = @3,
        decided_at = @4,
        updated_at = @4
      OUTPUT INSERTED.id AS id
      WHERE
        id = @5
        AND decision IS NULL
        AND is_review_requested = 1
    `,
    notFoundMessage: `Specification-local deviation ${deviationId} not found`,
    parameters: [
      data.decision,
      data.decisionMotivation.trim(),
      data.decidedBy.trim(),
      data.decidedByHsaId,
      now,
      deviationId,
    ],
  })
  return
}

export async function deleteSpecificationLocalDeviation(
  db: SqlServerDatabase,
  deviationId: number,
): Promise<void> {
  const state = await findSqlServerSpecificationLocalDeviationState(
    db,
    deviationId,
  )
  if (!state)
    throw notFoundError(
      `Specification-local deviation ${deviationId} not found`,
    )
  throw conflictError(
    'Cancel the deviation with a reason to preserve its history',
    { reason: 'deviation_cancellation_required' },
  )
}

export async function countDeviationsBySpecification(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<DeviationCounts> {
  const rows = (await db.query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN deviation.decision = @2 THEN 1 ELSE 0 END) AS rejected
      FROM deviations deviation
      INNER JOIN current_requirement_applications specification_item
        ON specification_item.id = deviation.specification_item_id
      WHERE specification_item.requirements_specification_id = @0

      UNION ALL

      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN deviation.decision = @2 THEN 1 ELSE 0 END) AS rejected
      FROM specification_local_requirement_deviations deviation
      INNER JOIN current_specification_local_requirements specification_local_requirement
        ON specification_local_requirement.id = deviation.specification_local_requirement_id
      WHERE specification_local_requirement.specification_id = @0
    `,
    [specificationId, DEVIATION_APPROVED, DEVIATION_REJECTED],
  )) as Array<Record<string, unknown>>

  return {
    total: rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0),
    pending: rows.reduce((sum, row) => sum + (Number(row.pending) || 0), 0),
    approved: rows.reduce((sum, row) => sum + (Number(row.approved) || 0), 0),
    rejected: rows.reduce((sum, row) => sum + (Number(row.rejected) || 0), 0),
  }
}

export async function countDeviationsPerItem(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<Map<number, { total: number; pending: number; approved: number }>> {
  const rows = (await db.query(
    `
      SELECT
        deviation.specification_item_id AS specificationItemId,
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved
      FROM deviations deviation
      INNER JOIN current_requirement_applications specification_item
        ON specification_item.id = deviation.specification_item_id
      WHERE specification_item.requirements_specification_id = @0
      GROUP BY deviation.specification_item_id
    `,
    [specificationId, DEVIATION_APPROVED],
  )) as Array<Record<string, unknown>>

  const map = new Map<
    number,
    { total: number; pending: number; approved: number }
  >()
  for (const row of rows) {
    map.set(Number(row.specificationItemId), {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
    })
  }
  return map
}

export async function countDeviationsPerItemRef(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<Map<string, DeviationCounts>> {
  const rows = (await db.query(
    `
      SELECT
        deviation.specification_item_id AS itemId,
        CAST(0 AS int) AS isSpecificationLocal,
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN deviation.decision = @2 THEN 1 ELSE 0 END) AS rejected
      FROM deviations deviation
      INNER JOIN current_requirement_applications specification_item
        ON specification_item.id = deviation.specification_item_id
      WHERE specification_item.requirements_specification_id = @0
      GROUP BY deviation.specification_item_id

      UNION ALL

      SELECT
        deviation.specification_local_requirement_id AS itemId,
        CAST(1 AS int) AS isSpecificationLocal,
        COUNT(*) AS total,
        SUM(CASE WHEN deviation.decision IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN deviation.decision = @1 THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN deviation.decision = @2 THEN 1 ELSE 0 END) AS rejected
      FROM specification_local_requirement_deviations deviation
      INNER JOIN current_specification_local_requirements specification_local_requirement
        ON specification_local_requirement.id = deviation.specification_local_requirement_id
      WHERE specification_local_requirement.specification_id = @0
      GROUP BY deviation.specification_local_requirement_id
    `,
    [specificationId, DEVIATION_APPROVED, DEVIATION_REJECTED],
  )) as Array<Record<string, unknown>>

  const map = new Map<string, DeviationCounts>()

  for (const row of rows) {
    const key =
      toNumericFlag(row.isSpecificationLocal) === 1
        ? createSpecificationLocalItemRef(Number(row.itemId))
        : createLibraryItemRef(Number(row.itemId))
    map.set(key, {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
    })
  }

  return map
}

export async function requestReview(
  db: SqlServerDatabase,
  deviationId: number,
  options: { agreementId?: number } = {},
): Promise<void> {
  await db.transaction(async manager => {
    await assertDeviationMutationAllowed(
      manager,
      'library',
      deviationId,
      options.agreementId,
    )
    const now = new Date()
    const updatedRows = (await manager.query(
      `
      UPDATE deviations
      SET
        is_review_requested = 1,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 0
    `,
      [now, deviationId],
    )) as Array<Record<string, unknown>>

    if (updatedRows[0]) {
      return
    }

    const row = await findSqlServerDeviationState(manager, deviationId)
    if (!row) {
      throw notFoundError(`Deviation ${deviationId} not found`)
    }
    if (row.decision !== null) {
      throw conflictError(
        'Cannot request review for a deviation that already has a decision',
      )
    }
    throw conflictError('Review has already been requested for this deviation')
  })
}

export async function requestSpecificationLocalReview(
  db: SqlServerDatabase,
  deviationId: number,
  options: { agreementId?: number } = {},
): Promise<void> {
  await db.transaction(async manager => {
    await assertDeviationMutationAllowed(
      manager,
      'local',
      deviationId,
      options.agreementId,
    )
    const now = new Date()
    const updatedRows = (await manager.query(
      `
      UPDATE specification_local_requirement_deviations
      SET
        is_review_requested = 1,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 0
    `,
      [now, deviationId],
    )) as Array<Record<string, unknown>>

    if (updatedRows[0]) {
      return
    }

    const row = await findSqlServerSpecificationLocalDeviationState(
      manager,
      deviationId,
    )
    if (!row) {
      throw notFoundError(
        `Specification-local deviation ${deviationId} not found`,
      )
    }
    if (row.decision !== null) {
      throw conflictError(
        'Cannot request review for a deviation that already has a decision',
      )
    }
    throw conflictError('Review has already been requested for this deviation')
  })
}

export async function revertToDraft(
  db: SqlServerDatabase,
  deviationId: number,
  options: { agreementId?: number } = {},
): Promise<void> {
  await db.transaction(async manager => {
    await assertDeviationMutationAllowed(
      manager,
      'library',
      deviationId,
      options.agreementId,
    )
    const now = new Date()
    const updatedRows = (await manager.query(
      `
      UPDATE deviations
      SET
        is_review_requested = 0,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 1
    `,
      [now, deviationId],
    )) as Array<Record<string, unknown>>

    if (updatedRows[0]) {
      return
    }

    const row = await findSqlServerDeviationState(manager, deviationId)
    if (!row) {
      throw notFoundError(`Deviation ${deviationId} not found`)
    }
    if (row.decision !== null) {
      throw conflictError(
        'Cannot revert a deviation that already has a decision',
      )
    }
    throw conflictError('Deviation is already in draft state')
  })
}

export async function revertSpecificationLocalToDraft(
  db: SqlServerDatabase,
  deviationId: number,
  options: { agreementId?: number } = {},
): Promise<void> {
  await db.transaction(async manager => {
    await assertDeviationMutationAllowed(
      manager,
      'local',
      deviationId,
      options.agreementId,
    )
    const now = new Date()
    const updatedRows = (await manager.query(
      `
      UPDATE specification_local_requirement_deviations
      SET
        is_review_requested = 0,
        updated_at = @0
      OUTPUT INSERTED.id AS id
      WHERE
        id = @1
        AND decision IS NULL
        AND is_review_requested = 1
    `,
      [now, deviationId],
    )) as Array<Record<string, unknown>>

    if (updatedRows[0]) {
      return
    }

    const row = await findSqlServerSpecificationLocalDeviationState(
      manager,
      deviationId,
    )
    if (!row) {
      throw notFoundError(
        `Specification-local deviation ${deviationId} not found`,
      )
    }
    if (row.decision !== null) {
      throw conflictError(
        'Cannot revert a deviation that already has a decision',
      )
    }
    throw conflictError('Deviation is already in draft state')
  })
}
