import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  type CreatedSpecificationRecord,
  createSpecificationWithExecutor,
  deleteSpecificationWithExecutor,
  type SpecificationCreateData,
  type SpecificationRecord,
  type SpecificationUpdateData,
  type SqlExecutor,
  updateSpecificationWithExecutor,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getErrorMessage } from '@/lib/http/safe-errors'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  conflictError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'

const SPECIFICATION_CODE_UNIQUE_CONSTRAINT =
  'uq_requirements_specifications_specification_code'

export type AuditedSpecificationUpdateData = Pick<
  SpecificationUpdateData,
  | 'businessNeedsReference'
  | 'name'
  | 'specificationCode'
  | 'specificationGovernanceObjectTypeId'
  | 'specificationImplementationTypeId'
  | 'specificationLifecycleStatusId'
>

export type UpdateSpecificationWithAuditResult =
  | { specification: SpecificationRecord; status: 'updated' }
  | { status: 'not_found' }

export type DeleteSpecificationWithAuditResult =
  | { status: 'deleted' }
  | { status: 'not_found' }

interface SpecificationAuditSnapshot {
  id: number
  specificationCode: string
  specificationLifecycleStatusId: number
}

function isNamedSpecificationCodeDuplicate(error: unknown): boolean {
  const candidates = [error]
  if (error && typeof error === 'object' && 'driverError' in error) {
    candidates.push((error as { driverError?: unknown }).driverError)
  }

  return candidates.some(candidate => {
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
        .includes(SPECIFICATION_CODE_UNIQUE_CONSTRAINT)
    )
  })
}

function specificationCodeConflict(): Error {
  return conflictError('Specification code is already taken', {
    reason: 'specification_code_taken',
  })
}

async function withSpecificationCodeConflictMapping<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  try {
    return await mutation()
  } catch (error) {
    if (isNamedSpecificationCodeDuplicate(error)) {
      throw specificationCodeConflict()
    }
    throw error
  }
}

async function lockSpecificationSnapshot(
  executor: SqlExecutor,
  id: number,
): Promise<SpecificationAuditSnapshot | null> {
  const rows = await executor.query<SpecificationAuditSnapshot[]>(
    `
      SELECT TOP (1)
        id AS id,
        specification_code AS specificationCode,
        specification_lifecycle_status_id AS specificationLifecycleStatusId
      FROM requirements_specifications WITH (UPDLOCK, HOLDLOCK)
      WHERE id = @0
    `,
    [id],
  )
  return rows[0] ?? null
}

export function isSpecificationCodeTakenConflict(error: unknown): boolean {
  return (
    isRequirementsServiceError(error) &&
    error.code === 'conflict' &&
    error.details?.reason === 'specification_code_taken'
  )
}

export async function createSpecificationWithAudit(
  db: SqlServerDatabase,
  data: SpecificationCreateData,
  context: RequestContext,
): Promise<CreatedSpecificationRecord> {
  return withSpecificationCodeConflictMapping(() =>
    db.transaction(async manager => {
      const specification = await createSpecificationWithExecutor(manager, data)
      await recordAllowedActionAuditEvent(manager, context, {
        action: 'specification.create',
        details: {
          specificationLifecycleStatusId: data.specificationLifecycleStatusId,
        },
        targetId: specification.id,
        targetKind: 'RequirementsSpecification',
        targetUniqueId: specification.specificationCode,
      })
      return specification
    }),
  )
}

export async function updateSpecificationWithAudit(
  db: SqlServerDatabase,
  id: number,
  data: AuditedSpecificationUpdateData,
  context: RequestContext,
): Promise<UpdateSpecificationWithAuditResult> {
  return withSpecificationCodeConflictMapping(() =>
    db.transaction(async manager => {
      const snapshot = await lockSpecificationSnapshot(manager, id)
      if (!snapshot) return { status: 'not_found' }

      const specification = await updateSpecificationWithExecutor(
        manager,
        id,
        data,
      )
      if (!specification) {
        throw new Error('Locked requirements specification disappeared')
      }

      const lifecycleChanged =
        data.specificationLifecycleStatusId !== undefined &&
        data.specificationLifecycleStatusId !==
          snapshot.specificationLifecycleStatusId
      await recordAllowedActionAuditEvent(manager, context, {
        action: 'specification.update',
        details: {
          changedFields: Object.keys(data).sort(),
          ...(lifecycleChanged
            ? {
                newSpecificationLifecycleStatusId:
                  data.specificationLifecycleStatusId,
                previousSpecificationLifecycleStatusId:
                  snapshot.specificationLifecycleStatusId,
              }
            : {}),
        },
        targetId: snapshot.id,
        targetKind: 'RequirementsSpecification',
        targetUniqueId: specification.specificationCode,
      })
      return { specification, status: 'updated' }
    }),
  )
}

export async function deleteSpecificationWithAudit(
  db: SqlServerDatabase,
  id: number,
  context: RequestContext,
): Promise<DeleteSpecificationWithAuditResult> {
  return db.transaction(async manager => {
    const snapshot = await lockSpecificationSnapshot(manager, id)
    if (!snapshot) return { status: 'not_found' }

    await deleteSpecificationWithExecutor(manager, id)
    await recordAllowedActionAuditEvent(manager, context, {
      action: 'specification.delete',
      details: {
        specificationLifecycleStatusId: snapshot.specificationLifecycleStatusId,
      },
      targetId: snapshot.id,
      targetKind: 'RequirementsSpecification',
      targetUniqueId: snapshot.specificationCode,
    })
    return { status: 'deleted' }
  })
}
