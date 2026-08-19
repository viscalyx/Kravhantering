import {
  canAuthorArea,
  getAreaById,
  listAreasActorCanAuthor,
} from '@/lib/dal/requirement-areas'
import { getRequirementById } from '@/lib/dal/requirements'
import {
  getPublishedVersionIdForRequirement,
  getSpecificationLocalRequirementDetail,
  graduateSpecificationLocalRequirementToLibrary,
  linkRequirementsToSpecificationAtomically,
  listSpecificationsForActorCatalog,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  ARRAY_INPUT_MAX_ITEMS,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'
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
import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
} from '@/lib/requirements/list-view'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import { createRequirementApplicationMutationWorkflow } from '@/lib/requirements/requirement-application-mutations'
import {
  recordAuthorizationDenied,
  recordSensitiveMutationSucceeded,
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
  resolveSpecificationIdOrThrow,
  translateServiceMessage,
  withLogging,
} from '@/lib/requirements/service-shared'
import { querySpecificationItemPage } from '@/lib/requirements/specification-item-page'
import {
  canReadAllSpecifications,
  specificationPermissions,
} from '@/lib/specifications/permissions'

interface SpecificationWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

interface RequirementPublishedVersionLookup {
  publishedVersionId: number | null
  requirementId: number
}

const specificationRequirementIdsSchema =
  uniquePositiveIntegerArraySchema().min(1)
const PUBLISHED_VERSION_LOOKUP_CONCURRENCY = 8

function assertValidSpecificationRequirementIds(
  requirementIds: number[],
): void {
  if (specificationRequirementIdsSchema.safeParse(requirementIds).success) {
    return
  }

  throw validationError(
    `Expected 1 to ${ARRAY_INPUT_MAX_ITEMS} unique positive requirement IDs`,
    {
      maxItems: ARRAY_INPUT_MAX_ITEMS,
      reason: 'invalid_requirement_ids',
    },
  )
}

async function resolveRequirementPublishedVersions(
  db: SqlServerDatabase,
  requirementIds: number[],
): Promise<RequirementPublishedVersionLookup[]> {
  const results = new Array<RequirementPublishedVersionLookup>(
    requirementIds.length,
  )
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < requirementIds.length) {
      const index = nextIndex
      nextIndex += 1
      const requirementId = requirementIds[index]
      if (requirementId === undefined) continue
      results[index] = {
        publishedVersionId: await getPublishedVersionIdForRequirement(
          db,
          requirementId,
        ),
        requirementId,
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          PUBLISHED_VERSION_LOOKUP_CONCURRENCY,
          requirementIds.length,
        ),
      },
      () => worker(),
    ),
  )
  return results
}

function getSpecificationReferenceLabel(
  input: SpecificationRefInput,
  specificationId: number,
) {
  return String(input.specificationId ?? specificationId)
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
  | 'mutateRequirementApplications'
  | 'removeFromSpecification'
> {
  const requirementApplicationMutations =
    createRequirementApplicationMutationWorkflow({
      authorization,
      db,
      logger,
    })

  return {
    async mutateRequirementApplications(context, input) {
      return requirementApplicationMutations.mutate(context, input)
    },
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
          const catalog = await listSpecificationsForActorCatalog(db, {
            actorHsaId: context.actor.hsaId,
            canReadAll: canReadAllSpecifications(context),
          })
          let specifications = catalog.specifications
          if (input.nameSearch) {
            const q = input.nameSearch.toLowerCase()
            specifications = specifications.filter(p =>
              p.name.toLowerCase().includes(q),
            )
          }
          const coAuthorIdsBySpecification =
            catalog.coAuthorHsaIdsBySpecification

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
              governanceObjectType: p.governanceObjectType
                ? {
                    nameEn: p.governanceObjectType.nameEn,
                    nameSv: p.governanceObjectType.nameSv,
                  }
                : null,
              specificationCode: p.specificationCode,
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
              permissions: specificationPermissions(context, {
                coAuthorHsaIds: coAuthorIdsBySpecification.get(p.id) ?? [],
                responsibleHsaId: p.responsibleHsaId,
              }),
              governanceObjectType: p.governanceObjectType
                ? {
                    id: p.governanceObjectType.id,
                    nameEn: p.governanceObjectType.nameEn,
                    nameSv: p.governanceObjectType.nameSv,
                  }
                : null,
              specificationImplementationTypeId:
                p.specificationImplementationTypeId,
              specificationLifecycleStatusId: p.specificationLifecycleStatusId,
              specificationGovernanceObjectTypeId:
                p.specificationGovernanceObjectTypeId,
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
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.get_specification_items',
        {
          capacity_surface: input.capacitySurface ?? context.source,
          description_search_supplied: Boolean(input.descriptionSearch),
          specification_id: input.specificationId,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(input)
          const filters: FilterValues = {
            areaIds: input.areaIds,
            categoryIds: input.categoryIds,
            descriptionSearch: input.descriptionSearch,
            needsReferenceIds: input.needsReferenceIds,
            normReferenceIds: input.normReferenceIds,
            priorityLevelIds: input.priorityLevelIds,
            qualityCharacteristicIds: input.qualityCharacteristicIds,
            requirementIds: input.probeRequirementIds,
            requirementPackageIds: input.requirementPackageIds,
            specificationItemStatusIds: input.specificationItemStatusIds,
            statuses: input.statuses,
            typeIds: input.typeIds,
            uniqueIdSearch: input.uniqueIdSearch,
            verifiable: input.verifiable,
          }
          const page = await querySpecificationItemPage(db, {
            cursor: input.cursor,
            filters,
            limit: input.limit,
            locale,
            sort: {
              by: input.sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
              direction:
                input.sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
            },
            specificationId,
          })

          const ref = getSpecificationReferenceLabel(input, specificationId)
          const summary = translateServiceMessage(
            locale,
            'requirements.specifications.items.count',
            {
              count: page.pagination.count,
              reference: ref,
              requirementWord: getRequirementWord(
                locale,
                page.pagination.count,
              ),
            },
          )

          return {
            items: page.items,
            message: createServiceMessage(
              getSpecificationServiceTitle('items', locale),
              [summary],
              responseFormat,
            ),
            pagination: page.pagination,
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
      }

      await authorize(authorization, action, context)

      return withLogging(
        logger,
        context,
        'requirements.list_graduation_target_areas',
        {
          local_requirement_id: input.localRequirementId,
          specification_id: input.specificationId,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(input)
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
        },
        async () => {
          const actor = requireHumanActorSnapshot(context)
          const specificationId = await resolveSpecificationIdOrThrow(input)
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

          await recordSensitiveMutationSucceeded(context, {
            action: 'specification_local_requirement.graduated',
            locale,
            localRequirementId: input.localRequirementId,
            newRequirementId: detail.id,
            newRequirementUniqueId: detail.uniqueId,
            operation: 'graduate_specification_local_requirement',
            specificationId,
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
      assertValidSpecificationRequirementIds(input.requirementIds)

      await authorize(
        authorization,
        {
          kind: 'add_to_specification',
          specificationId: input.specificationId,
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
          requirement_count: input.requirementIds.length,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(input)
          const publishedVersionLookups =
            await resolveRequirementPublishedVersions(db, input.requirementIds)
          const succeeded = publishedVersionLookups.filter(
            lookup => lookup.publishedVersionId != null,
          ) as {
            publishedVersionId: number
            requirementId: number
          }[]
          const skipped = publishedVersionLookups.filter(
            lookup => lookup.publishedVersionId == null,
          )

          let addedCount = 0
          if (succeeded.length > 0) {
            addedCount = await linkRequirementsToSpecificationAtomically(
              db,
              specificationId,
              {
                requirementIds: succeeded.map(result => result.requirementId),
                needsReferenceDescription: input.needsReferenceDescription,
                needsReferenceId: input.needsReferenceId,
                needsReferenceText: input.needsReferenceText,
              },
            )
          }
          if (addedCount > 0) {
            await recordSensitiveMutationSucceeded(context, {
              action: 'specification.requirements.added',
              addedCount,
              locale,
              operation: 'add_to_specification',
              requirementCount: input.requirementIds.length,
              requirementIds: succeeded.map(result => result.requirementId),
              specificationId,
            })
          }

          const ref = getSpecificationReferenceLabel(input, specificationId)
          const skippedIds = skipped.map(result => result.requirementId)
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
      assertValidSpecificationRequirementIds(input.requirementIds)

      const specificationId = await resolveSpecificationIdOrThrow(input)
      const outcome = await requirementApplicationMutations.mutate(context, {
        operation: 'remove',
        requirementIds: input.requirementIds,
        specificationId,
      })
      if (outcome.operation !== 'remove') {
        throw new Error('Unexpected requirement application mutation outcome')
      }
      const removedCount = outcome.removedCount
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
  }
}
