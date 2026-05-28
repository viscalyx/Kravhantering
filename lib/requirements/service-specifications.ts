import {
  canAuthorArea,
  getAreaById,
  listAreasActorCanAuthor,
} from '@/lib/dal/requirement-areas'
import { getRequirementById } from '@/lib/dal/requirements'
import {
  getPublishedVersionIdForRequirement,
  getSpecificationBySlug,
  getSpecificationLocalRequirementDetail,
  graduateSpecificationLocalRequirementToLibrary,
  linkRequirementsToSpecificationAtomically,
  listSpecificationItems,
  listSpecifications,
  unlinkRequirementsFromSpecification,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  type RequestContext,
  type RequirementsAction,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  forbiddenError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import {
  recordAuthorizationDenied,
  recordHighRiskMutationSucceeded,
} from '@/lib/requirements/security-audit'
import type {
  AddToSpecificationInput,
  GetSpecificationItemsInput,
  GraduateSpecificationLocalRequirementInput,
  ListGraduationTargetAreasInput,
  ListSpecificationsInput,
  RemoveFromSpecificationInput,
  RequirementsService,
  SpecificationRefInput,
} from '@/lib/requirements/service'
import {
  buildRequirementViewUri,
  formatRequirementDetail,
} from '@/lib/requirements/service-requirements'
import {
  authorize,
  createServiceMessage,
  getRequirementWord,
  getSpecificationServiceTitle,
  getSpecificationWord,
  localizeName,
  translateServiceMessage,
  withLogging,
} from '@/lib/requirements/service-shared'

interface SpecificationWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

async function resolveSpecificationIdOrThrow(
  db: SqlServerDatabase,
  input: SpecificationRefInput,
) {
  if (input.specificationId == null && input.specificationSlug == null) {
    throw validationError('Missing specification reference', {
      specificationId: input.specificationId,
      specificationSlug: input.specificationSlug,
    })
  }

  const specificationId =
    input.specificationId != null
      ? input.specificationId
      : input.specificationSlug
        ? (await getSpecificationBySlug(db, input.specificationSlug))?.id
        : undefined

  if (specificationId == null) {
    throw notFoundError('Specification not found.', {
      specificationId: input.specificationId,
      specificationSlug: input.specificationSlug,
    })
  }

  return specificationId
}

function getSpecificationReferenceLabel(
  input: SpecificationRefInput,
  specificationId: number,
) {
  return input.specificationSlug ?? String(specificationId)
}

function isAdminActor(context: RequestContext): boolean {
  return context.actor.roles.includes('Admin')
}

async function assertGraduationTargetAreaAuthor(
  db: SqlServerDatabase,
  context: RequestContext,
  action: RequirementsAction,
  requirementAreaId: number,
): Promise<void> {
  const allowed = await canAuthorArea(
    db,
    requirementAreaId,
    context.actor.hsaId,
    isAdminActor(context),
  )
  if (allowed) {
    return
  }

  const error = forbiddenError(
    'Missing owner or co-author access to the target requirement area',
    {
      reason: 'target_area_author_required',
      requirementAreaId,
    },
  )
  await recordAuthorizationDenied(context, action, error)
  throw error
}

export function createSpecificationWorkflow({
  authorization,
  db,
  logger,
}: SpecificationWorkflowDependencies): Pick<
  RequirementsService,
  | 'addToSpecification'
  | 'getSpecificationItems'
  | 'graduateSpecificationLocalRequirement'
  | 'listGraduationTargetAreas'
  | 'listSpecifications'
  | 'removeFromSpecification'
> {
  return {
    async listSpecifications(context, input: ListSpecificationsInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'list_specifications',
          nameSearch: input.nameSearch,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.list_specifications',
        {
          name_search: input.nameSearch,
        },
        async () => {
          let specifications = await listSpecifications(db)
          if (input.nameSearch) {
            const q = input.nameSearch.toLowerCase()
            specifications = specifications.filter(p =>
              p.name.toLowerCase().includes(q),
            )
          }

          const summary =
            specifications.length === 0
              ? translateServiceMessage(
                  locale,
                  'requirements.specifications.summary.none',
                )
              : translateServiceMessage(
                  locale,
                  'requirements.specifications.summary.count',
                  {
                    count: specifications.length,
                    specificationWord: getSpecificationWord(
                      locale,
                      specifications.length,
                    ),
                  },
                )

          const outputSpecifications = specifications.map(p => {
            const base = {
              businessNeedsReference: p.businessNeedsReference,
              id: p.id,
              implementationType: p.implementationType
                ? {
                    nameEn: p.implementationType.nameEn,
                    nameSv: p.implementationType.nameSv,
                  }
                : null,
              itemCount: p.itemCount,
              name: p.name,
              responsibilityArea: p.responsibilityArea
                ? {
                    nameEn: p.responsibilityArea.nameEn,
                    nameSv: p.responsibilityArea.nameSv,
                  }
                : null,
              uniqueId: p.uniqueId,
            }

            if (!input.includeRestFields) {
              return base
            }

            return {
              ...base,
              createdAt: p.createdAt,
              implementationType: p.implementationType
                ? {
                    id: p.implementationType.id,
                    nameEn: p.implementationType.nameEn,
                    nameSv: p.implementationType.nameSv,
                  }
                : null,
              lifecycleStatus: p.lifecycleStatus
                ? {
                    id: p.lifecycleStatus.id,
                    nameEn: p.lifecycleStatus.nameEn,
                    nameSv: p.lifecycleStatus.nameSv,
                  }
                : null,
              requirementAreas: p.requirementAreas,
              responsibleDisplayName: p.responsibleDisplayName,
              responsibleHsaId: p.responsibleHsaId,
              canResponsibleGenerateAi: p.canResponsibleGenerateAi,
              responsibilityArea: p.responsibilityArea
                ? {
                    id: p.responsibilityArea.id,
                    nameEn: p.responsibilityArea.nameEn,
                    nameSv: p.responsibilityArea.nameSv,
                  }
                : null,
              specificationImplementationTypeId:
                p.specificationImplementationTypeId,
              specificationLifecycleStatusId: p.specificationLifecycleStatusId,
              specificationResponsibilityAreaId:
                p.specificationResponsibilityAreaId,
              updatedAt: p.updatedAt,
            }
          })

          return {
            message: createServiceMessage(
              getSpecificationServiceTitle('list', locale),
              [summary],
              responseFormat,
            ),
            specifications: outputSpecifications,
          }
        },
      )
    },

    async getSpecificationItems(context, input: GetSpecificationItemsInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'get_specification_items',
          specificationId: input.specificationId,
          specificationSlug: input.specificationSlug,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.get_specification_items',
        {
          description_search: input.descriptionSearch,
          specification_id: input.specificationId,
          specification_slug: input.specificationSlug,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(db, input)
          let items = await listSpecificationItems(db, specificationId)
          if (input.descriptionSearch) {
            const q = input.descriptionSearch.toLowerCase()
            items = items.filter(
              item =>
                item.version?.description?.toLowerCase().includes(q) ?? false,
            )
          }

          const ref = getSpecificationReferenceLabel(input, specificationId)
          const summary = translateServiceMessage(
            locale,
            'requirements.specifications.items.count',
            {
              count: items.length,
              reference: ref,
              requirementWord: getRequirementWord(locale, items.length),
            },
          )

          return {
            items: items.map(item => ({
              area: item.area?.name ?? null,
              category: localizeName(
                {
                  nameEn: item.version?.categoryNameEn ?? null,
                  nameSv: item.version?.categoryNameSv ?? null,
                },
                locale,
              ),
              description: item.version?.description ?? null,
              id: item.id,
              needsReference: item.needsReference ?? null,
              status: localizeName(
                {
                  nameEn: item.version?.statusNameEn ?? null,
                  nameSv: item.version?.statusNameSv ?? null,
                },
                locale,
              ),
              type: localizeName(
                {
                  nameEn: item.version?.typeNameEn ?? null,
                  nameSv: item.version?.typeNameSv ?? null,
                },
                locale,
              ),
              uniqueId: item.uniqueId,
            })),
            message: createServiceMessage(
              getSpecificationServiceTitle('items', locale),
              [summary],
              responseFormat,
            ),
            specificationId,
          }
        },
      )
    },

    async listGraduationTargetAreas(
      context,
      input: ListGraduationTargetAreasInput,
    ) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'
      const action: RequirementsAction = {
        kind: 'list_graduation_target_areas',
        localRequirementId: input.localRequirementId,
        specificationId: input.specificationId,
        specificationSlug: input.specificationSlug,
      }

      await authorize(authorization, action, context)

      return withLogging(
        logger,
        context,
        'requirements.list_graduation_target_areas',
        {
          local_requirement_id: input.localRequirementId,
          specification_id: input.specificationId,
          specification_slug: input.specificationSlug,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(db, input)
          const localRequirement = await getSpecificationLocalRequirementDetail(
            db,
            specificationId,
            input.localRequirementId,
          )
          if (!localRequirement) {
            throw notFoundError('Specification-local requirement not found', {
              localRequirementId: input.localRequirementId,
              specificationId,
            })
          }

          const areas = await listAreasActorCanAuthor(
            db,
            context.actor.hsaId,
            isAdminActor(context),
          )
          const summary = translateServiceMessage(
            locale,
            'requirements.specifications.graduationTargets.summary',
            { count: areas.length },
          )

          return {
            areas: areas.map(area => ({
              id: area.id,
              name: area.name,
              prefix: area.prefix,
            })),
            message: createServiceMessage(
              translateServiceMessage(
                locale,
                'requirements.specifications.graduationTargets.title',
              ),
              [summary],
              responseFormat,
            ),
          }
        },
      )
    },

    async graduateSpecificationLocalRequirement(
      context,
      input: GraduateSpecificationLocalRequirementInput,
    ) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'
      const action: RequirementsAction = {
        kind: 'graduate_specification_local_requirement',
        localRequirementId: input.localRequirementId,
        requirementAreaId: input.requirementAreaId,
        specificationId: input.specificationId,
        specificationSlug: input.specificationSlug,
      }

      await authorize(authorization, action, context)

      return withLogging(
        logger,
        context,
        'requirements.graduate_specification_local_requirement',
        {
          local_requirement_id: input.localRequirementId,
          requirement_area_id: input.requirementAreaId,
          specification_id: input.specificationId,
          specification_slug: input.specificationSlug,
        },
        async () => {
          const actor = requireHumanActorSnapshot(context)
          const specificationId = await resolveSpecificationIdOrThrow(db, input)
          const targetArea = await getAreaById(db, input.requirementAreaId)
          if (!targetArea) {
            throw notFoundError('Requirement area not found', {
              requirementAreaId: input.requirementAreaId,
            })
          }

          await assertGraduationTargetAreaAuthor(
            db,
            context,
            action,
            input.requirementAreaId,
          )

          const result = await graduateSpecificationLocalRequirementToLibrary(
            db,
            {
              actorDisplayName: actor.displayName,
              actorHsaId: actor.hsaId,
              specificationId,
              specificationLocalRequirementId: input.localRequirementId,
              targetRequirementAreaId: input.requirementAreaId,
            },
          )

          const requirement = await getRequirementById(
            db,
            result.requirement.id,
          )
          if (!requirement) {
            throw notFoundError('Graduated requirement not found', {
              requirementId: result.requirement.id,
            })
          }
          const detail = formatRequirementDetail(requirement)
          const requirementResourceUri = `requirements://requirement/${encodeURIComponent(detail.uniqueId)}?version=${result.version.versionNumber}`
          const requirementViewUri = buildRequirementViewUri(
            { uniqueId: detail.uniqueId },
            result.version.versionNumber,
          )
          const summary = translateServiceMessage(
            locale,
            'requirements.specifications.graduate.summary',
            {
              requirementUniqueId: detail.uniqueId,
              sourceUniqueId: result.sourceLocalRequirement.uniqueId,
              targetAreaName: targetArea.name,
            },
          )

          await recordHighRiskMutationSucceeded(context, {
            action: 'specification_local_requirement.graduated',
            locale,
            localRequirementId: input.localRequirementId,
            newRequirementId: detail.id,
            newRequirementUniqueId: detail.uniqueId,
            operation: 'graduate_specification_local_requirement',
            specificationId,
            specificationSlug: input.specificationSlug,
            targetRequirementAreaId: input.requirementAreaId,
          })

          return {
            detail,
            message: createServiceMessage(
              translateServiceMessage(
                locale,
                'requirements.specifications.graduate.title',
              ),
              [summary],
              responseFormat,
            ),
            requirementResourceUri,
            requirementViewUri,
            result,
          }
        },
      )
    },

    async addToSpecification(context, input: AddToSpecificationInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'add_to_specification',
          specificationId: input.specificationId,
          specificationSlug: input.specificationSlug,
          requirementIds: input.requirementIds,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.add_to_specification',
        {
          specification_id: input.specificationId,
          specification_slug: input.specificationSlug,
          requirement_count: input.requirementIds.length,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(db, input)
          const versionResults = await Promise.all(
            input.requirementIds.map(async id => ({
              id,
              versionId: await getPublishedVersionIdForRequirement(db, id),
            })),
          )
          const succeeded = versionResults.filter(r => r.versionId != null) as {
            id: number
            versionId: number
          }[]
          const skipped = versionResults.filter(r => r.versionId == null)

          let addedCount = 0
          if (succeeded.length > 0) {
            addedCount = await linkRequirementsToSpecificationAtomically(
              db,
              specificationId,
              {
                requirementIds: succeeded.map(r => r.id),
                needsReferenceDescription: input.needsReferenceDescription,
                needsReferenceId: input.needsReferenceId,
                needsReferenceText: input.needsReferenceText,
              },
            )
          }
          if (addedCount > 0) {
            await recordHighRiskMutationSucceeded(context, {
              action: 'specification.requirements.added',
              addedCount,
              locale,
              operation: 'add_to_specification',
              requirementCount: input.requirementIds.length,
              requirementIds: succeeded.map(r => r.id),
              specificationId,
              specificationSlug: input.specificationSlug,
            })
          }

          const ref = getSpecificationReferenceLabel(input, specificationId)
          const skippedIds = skipped.map(r => r.id)
          const lines: string[] = [
            translateServiceMessage(
              locale,
              'requirements.specifications.add.count',
              {
                count: addedCount,
                reference: ref,
                requirementWord: getRequirementWord(locale, addedCount),
              },
            ),
          ]
          if (skippedIds.length > 0) {
            lines.push(
              translateServiceMessage(
                locale,
                'requirements.specifications.add.skipped',
                {
                  count: skippedIds.length,
                  ids: skippedIds.join(', '),
                  requirementWord: getRequirementWord(
                    locale,
                    skippedIds.length,
                  ),
                },
              ),
            )
          }
          return {
            addedCount,
            message: createServiceMessage(
              getSpecificationServiceTitle('add', locale),
              lines,
              responseFormat,
            ),
            skippedCount: skippedIds.length,
            skippedIds,
          }
        },
      )
    },

    async removeFromSpecification(
      context,
      input: RemoveFromSpecificationInput,
    ) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'remove_from_specification',
          specificationId: input.specificationId,
          specificationSlug: input.specificationSlug,
          requirementIds: input.requirementIds,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.remove_from_specification',
        {
          specification_id: input.specificationId,
          specification_slug: input.specificationSlug,
          requirement_count: input.requirementIds.length,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(db, input)
          const removedCount = await unlinkRequirementsFromSpecification(
            db,
            specificationId,
            input.requirementIds,
          )
          await recordHighRiskMutationSucceeded(context, {
            action: 'specification.requirements.removed',
            operation: 'remove_from_specification',
            removedCount,
            requirementCount: input.requirementIds.length,
            specificationId,
            specificationSlug: input.specificationSlug,
          })
          const ref = getSpecificationReferenceLabel(input, specificationId)
          const summary = translateServiceMessage(
            locale,
            'requirements.specifications.remove.count',
            {
              count: removedCount,
              reference: ref,
              requirementWord: getRequirementWord(locale, removedCount),
            },
          )
          return {
            message: createServiceMessage(
              getSpecificationServiceTitle('remove', locale),
              [summary],
              responseFormat,
            ),
            removedCount,
          }
        },
      )
    },
  }
}
