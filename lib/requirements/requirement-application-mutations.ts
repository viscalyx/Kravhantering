import {
  deleteLibrarySpecificationItemsByIds,
  deleteSpecificationLocalRequirementsByIds,
  findSpecificationIdentity,
  findSpecificationNeedsReferenceIdentity,
  getSpecificationItemById,
  getSpecificationLocalRequirementParentById,
  parseSpecificationItemRef,
  type SpecificationItemFieldUpdate,
  type SqlExecutor,
  unlinkRequirementsFromSpecification,
  updateSpecificationItemFields,
  updateSpecificationLocalRequirementFields,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import {
  conflictError,
  forbiddenError,
  isRequirementsServiceError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import {
  recordAuthorizationDeniedWithDatabase,
  recordSensitiveMutationActionAuditEvent,
  recordSensitiveMutationSecurityEvent,
  type SensitiveMutationAuditDetail,
} from '@/lib/requirements/security-audit'
import { authorize, withLogging } from '@/lib/requirements/service-shared'

export interface UpdateRequirementApplicationsInput {
  fields: SpecificationItemFieldUpdate
  itemRefs: string[]
  operation: 'update'
  specificationId: number
}

export interface RemoveRequirementApplicationsByItemRefsInput {
  itemRefs: string[]
  operation: 'remove'
  specificationId: number
}

export interface RemoveRequirementApplicationsByRequirementIdsInput {
  operation: 'remove'
  requirementIds: number[]
  specificationId: number
}

export type RequirementApplicationMutationInput =
  | RemoveRequirementApplicationsByItemRefsInput
  | RemoveRequirementApplicationsByRequirementIdsInput
  | UpdateRequirementApplicationsInput

export type RequirementApplicationMutationOutput =
  | {
      operation: 'remove'
      removedCount: number
      removedLibraryCount: number
      removedSpecificationLocalCount: number
    }
  | { operation: 'update'; updatedCount: number }

interface RequirementApplicationMutationDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

export interface RequirementApplicationMutationWorkflow {
  mutate(
    context: RequestContext,
    input: RequirementApplicationMutationInput,
  ): Promise<RequirementApplicationMutationOutput>
}

export function requirementApplicationMutationAction(
  input: RequirementApplicationMutationInput,
): Extract<RequirementsAction, { kind: 'manage_requirement_applications' }> {
  return {
    ...('itemRefs' in input ? { itemRefs: input.itemRefs } : {}),
    kind: 'manage_requirement_applications',
    operation: input.operation,
    ...('requirementIds' in input
      ? { requirementIds: input.requirementIds }
      : {}),
    specificationId: input.specificationId,
  }
}

export async function resolveRequirementApplicationMutationTarget(
  db: SqlExecutor,
  action: Extract<
    RequirementsAction,
    { kind: 'manage_requirement_applications' }
  >,
): Promise<number> {
  if (!action.itemRefs || action.itemRefs.length === 0) {
    const specification = await findSpecificationIdentity(
      db,
      action.specificationId,
    )
    if (!specification) {
      throw notFoundError('Requirements specification not found', {
        specificationId: action.specificationId,
      })
    }
    return specification.id
  }

  for (const itemRef of parseItemRefs(action.itemRefs)) {
    const child =
      itemRef.kind === 'library'
        ? await getSpecificationItemById(db, itemRef.id)
        : await getSpecificationLocalRequirementParentById(db, itemRef.id)
    if (!child) {
      throw notFoundError('Requirement application not found', {
        itemRef:
          itemRef.kind === 'library'
            ? `lib:${itemRef.id}`
            : `local:${itemRef.id}`,
      })
    }
    if (child.specificationId !== action.specificationId) {
      throw forbiddenError(
        'Requirement application belongs to another requirements specification',
        {
          reason: 'foreign_specification_child',
          specificationId: action.specificationId,
        },
      )
    }
  }

  return action.specificationId
}

type ParsedRequirementApplicationItemRef = Exclude<
  ReturnType<typeof parseSpecificationItemRef>,
  null
>

function parseItemRefs(
  itemRefs: readonly string[],
): ParsedRequirementApplicationItemRef[] {
  const parsedItemRefs = new Map<string, ParsedRequirementApplicationItemRef>()
  for (const itemRef of itemRefs) {
    const parsed = parseSpecificationItemRef(itemRef)
    if (!parsed) {
      throw validationError('Invalid itemRef', { itemRef })
    }
    parsedItemRefs.set(`${parsed.kind}:${parsed.id}`, parsed)
  }
  return [...parsedItemRefs.values()]
}

function mutationAuditDetail(
  input: RequirementApplicationMutationInput,
  count: number,
): SensitiveMutationAuditDetail {
  const targetCount =
    'itemRefs' in input ? input.itemRefs.length : input.requirementIds.length
  return input.operation === 'update'
    ? {
        action: 'specification.requirement_applications.updated',
        operation: 'update_requirement_applications',
        requirementCount: targetCount,
        specificationId: input.specificationId,
      }
    : {
        action: 'specification.requirements.removed',
        operation: 'remove_from_specification',
        removedCount: count,
        requirementCount: targetCount,
        specificationId: input.specificationId,
      }
}

export function createRequirementApplicationMutationWorkflow({
  authorization,
  db,
  logger,
}: RequirementApplicationMutationDependencies): RequirementApplicationMutationWorkflow {
  return {
    async mutate(context, input) {
      const action = requirementApplicationMutationAction(input)
      await authorize(authorization, action, context, db)

      if ('itemRefs' in input && input.itemRefs.length === 0) {
        throw validationError('At least one itemRef must be supplied')
      }
      if (
        input.operation === 'update' &&
        Object.keys(input.fields).length === 0
      ) {
        throw validationError('At least one application field must be supplied')
      }

      try {
        return await withLogging(
          logger,
          context,
          'requirements.manage_requirement_applications',
          {
            operation: input.operation,
            specification_id: input.specificationId,
            target_count:
              'itemRefs' in input
                ? input.itemRefs.length
                : input.requirementIds.length,
          },
          async () => {
            const result = await db.transaction(async manager => {
              await resolveRequirementApplicationMutationTarget(manager, action)

              if (input.operation === 'update') {
                const targets = parseItemRefs(input.itemRefs)
                if (
                  input.fields.needsReferenceId != null &&
                  !(await findSpecificationNeedsReferenceIdentity(
                    manager,
                    input.specificationId,
                    input.fields.needsReferenceId,
                  ))
                ) {
                  throw validationError(
                    'needsReferenceId does not belong to this requirements specification',
                  )
                }

                let updatedCount = 0
                for (const itemRef of targets) {
                  updatedCount +=
                    itemRef.kind === 'library'
                      ? await updateSpecificationItemFields(
                          manager,
                          itemRef.id,
                          input.fields,
                        )
                      : await updateSpecificationLocalRequirementFields(
                          manager,
                          itemRef.id,
                          input.fields,
                        )
                }
                if (updatedCount !== input.itemRefs.length) {
                  throw conflictError(
                    'Requirement applications changed during update',
                    { reason: 'requirement_applications_changed' },
                  )
                }

                const auditDetail = mutationAuditDetail(input, updatedCount)
                await recordSensitiveMutationActionAuditEvent(
                  manager,
                  context,
                  auditDetail,
                )
                return {
                  auditDetail,
                  output: {
                    operation: 'update' as const,
                    updatedCount,
                  },
                }
              }

              if ('requirementIds' in input) {
                const removedCount = await unlinkRequirementsFromSpecification(
                  manager,
                  input.specificationId,
                  input.requirementIds,
                )
                const auditDetail = mutationAuditDetail(input, removedCount)
                await recordSensitiveMutationActionAuditEvent(
                  manager,
                  context,
                  auditDetail,
                )
                return {
                  auditDetail,
                  output: {
                    operation: 'remove' as const,
                    removedCount,
                    removedLibraryCount: removedCount,
                    removedSpecificationLocalCount: 0,
                  },
                }
              }

              const targets = parseItemRefs(input.itemRefs)
              const libraryIds = targets.flatMap(itemRef =>
                itemRef.kind === 'library' ? [itemRef.id] : [],
              )
              const specificationLocalIds = targets.flatMap(itemRef =>
                itemRef.kind === 'specificationLocal' ? [itemRef.id] : [],
              )
              const removedLibraryCount =
                await deleteLibrarySpecificationItemsByIds(
                  manager,
                  input.specificationId,
                  libraryIds,
                )
              const removedSpecificationLocalCount =
                await deleteSpecificationLocalRequirementsByIds(
                  manager,
                  input.specificationId,
                  specificationLocalIds,
                )
              const removedCount =
                removedLibraryCount + removedSpecificationLocalCount
              if (removedCount !== input.itemRefs.length) {
                throw conflictError(
                  'Requirement applications changed during removal',
                  { reason: 'requirement_applications_changed' },
                )
              }
              const auditDetail = mutationAuditDetail(input, removedCount)
              await recordSensitiveMutationActionAuditEvent(
                manager,
                context,
                auditDetail,
              )
              return {
                auditDetail,
                output: {
                  operation: 'remove' as const,
                  removedCount,
                  removedLibraryCount,
                  removedSpecificationLocalCount,
                },
              }
            })

            recordSensitiveMutationSecurityEvent(context, result.auditDetail)
            return result.output
          },
        )
      } catch (error) {
        if (isRequirementsServiceError(error) && error.code === 'forbidden') {
          await recordAuthorizationDeniedWithDatabase(
            db,
            context,
            action,
            error,
          )
        }
        throw error
      }
    },
  }
}
