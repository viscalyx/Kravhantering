import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  archiveNormReference,
  createNormReference,
  deleteNormReference,
  getNormReferenceById,
  getNormReferenceUsage,
  MAX_GENERATED_NORM_REFERENCE_ID_ATTEMPTS,
  type NormReferenceCreateData,
  type NormReferenceRow,
  type NormReferenceUpdateData,
  type NormReferenceUsage,
  reactivateNormReference,
  updateNormReference,
} from '@/lib/dal/norm-references'
import type { SqlServerDatabase } from '@/lib/db'
import { getErrorMessage } from '@/lib/http/safe-errors'
import type { RequestContext } from '@/lib/requirements/auth'
import { conflictError } from '@/lib/requirements/errors'

export type DeleteNormReferenceWithAuditResult =
  | { status: 'deleted' }
  | { status: 'in_use'; usage: NormReferenceUsage }
  | { status: 'not_found' }

function asSqlServerDatabase(executor: unknown): SqlServerDatabase {
  return executor as SqlServerDatabase
}

const NORM_REFERENCE_ID_UNIQUE_CONSTRAINT =
  'uq_norm_references_norm_reference_id'

function isGeneratedNormReferenceId(data: NormReferenceCreateData): boolean {
  return !data.normReferenceId?.trim()
}

function hasNormReferenceIdDuplicateKeyError(error: unknown): boolean {
  const errors = [error]
  if (error && typeof error === 'object' && 'driverError' in error) {
    errors.push((error as { driverError?: unknown }).driverError)
  }

  return errors.some(candidate => {
    const number =
      candidate && typeof candidate === 'object' && 'number' in candidate
        ? (candidate as { number?: unknown }).number
        : undefined
    const isSqlServerDuplicate =
      number === 2601 ||
      number === 2627 ||
      number === '2601' ||
      number === '2627'

    return (
      isSqlServerDuplicate &&
      getErrorMessage(candidate)
        .toLowerCase()
        .includes(NORM_REFERENCE_ID_UNIQUE_CONSTRAINT)
    )
  })
}

async function createNormReferenceAndAudit(
  db: SqlServerDatabase,
  data: NormReferenceCreateData,
  context: RequestContext,
): Promise<NormReferenceRow> {
  return db.transaction(async manager => {
    const transactionDb = asSqlServerDatabase(manager)
    const normReference = await createNormReference(transactionDb, data)
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'norm_reference.create',
      details: { changedFields: Object.keys(data) },
      targetId: normReference.id,
      targetKind: 'norm_reference',
    })
    return normReference
  })
}

export async function createNormReferenceWithAudit(
  db: SqlServerDatabase,
  data: NormReferenceCreateData,
  context: RequestContext,
): Promise<NormReferenceRow> {
  const generatedId = isGeneratedNormReferenceId(data)

  for (
    let attempt = 1;
    attempt <= MAX_GENERATED_NORM_REFERENCE_ID_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await createNormReferenceAndAudit(db, data, context)
    } catch (error) {
      if (!hasNormReferenceIdDuplicateKeyError(error)) {
        throw error
      }

      if (!generatedId) {
        throw conflictError('Norm reference ID already exists', {
          reason: 'norm_reference_id_exists',
        })
      }

      if (attempt === MAX_GENERATED_NORM_REFERENCE_ID_ATTEMPTS) {
        throw conflictError(
          'Generated norm reference ID candidates are exhausted',
          {
            reason: 'norm_reference_id_generation_exhausted',
          },
        )
      }
    }
  }

  throw conflictError('Generated norm reference ID candidates are exhausted', {
    reason: 'norm_reference_id_generation_exhausted',
  })
}

export async function updateNormReferenceWithAudit(
  db: SqlServerDatabase,
  id: number,
  data: NormReferenceUpdateData,
  context: RequestContext,
): Promise<NormReferenceRow | undefined> {
  return db.transaction(async manager => {
    const transactionDb = asSqlServerDatabase(manager)
    const normReference = await updateNormReference(transactionDb, id, data)
    if (!normReference) return undefined
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'norm_reference.update',
      details: { changedFields: Object.keys(data) },
      targetId: id,
      targetKind: 'norm_reference',
    })
    return normReference
  })
}

export async function deleteNormReferenceWithAudit(
  db: SqlServerDatabase,
  id: number,
  context: RequestContext,
): Promise<DeleteNormReferenceWithAuditResult> {
  return db.transaction(async manager => {
    const transactionDb = asSqlServerDatabase(manager)
    const deletedCount = await deleteNormReference(transactionDb, id)
    if (deletedCount === 0) {
      const existing = await getNormReferenceById(transactionDb, id)
      if (!existing) {
        return { status: 'not_found' }
      }
      const usage = await getNormReferenceUsage(transactionDb, id)
      return { status: 'in_use', usage }
    }

    await recordAllowedActionAuditEvent(manager, context, {
      action: 'norm_reference.delete',
      targetId: id,
      targetKind: 'norm_reference',
    })
    return { status: 'deleted' }
  })
}

export async function archiveNormReferenceWithAudit(
  db: SqlServerDatabase,
  id: number,
  context: RequestContext,
): Promise<NormReferenceRow | undefined> {
  return db.transaction(async manager => {
    const normReference = await archiveNormReference(
      asSqlServerDatabase(manager),
      id,
    )
    if (!normReference) return undefined
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'norm_reference.archive',
      targetId: id,
      targetKind: 'norm_reference',
    })
    return normReference
  })
}

export async function reactivateNormReferenceWithAudit(
  db: SqlServerDatabase,
  id: number,
  context: RequestContext,
): Promise<NormReferenceRow | undefined> {
  return db.transaction(async manager => {
    const normReference = await reactivateNormReference(
      asSqlServerDatabase(manager),
      id,
    )
    if (!normReference) return undefined
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'norm_reference.reactivate',
      targetId: id,
      targetKind: 'norm_reference',
    })
    return normReference
  })
}
