import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  archiveNormReference,
  createNormReference,
  deleteNormReference,
  getNormReferenceById,
  getNormReferenceUsage,
  type NormReferenceCreateData,
  type NormReferenceRow,
  type NormReferenceUpdateData,
  type NormReferenceUsage,
  reactivateNormReference,
  updateNormReference,
} from '@/lib/dal/norm-references'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

export type DeleteNormReferenceWithAuditResult =
  | { status: 'deleted' }
  | { status: 'in_use'; usage: NormReferenceUsage }
  | { status: 'not_found' }

function asSqlServerDatabase(executor: unknown): SqlServerDatabase {
  return executor as SqlServerDatabase
}

export async function createNormReferenceWithAudit(
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
