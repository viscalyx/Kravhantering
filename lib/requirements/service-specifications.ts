import {
  getPublishedVersionIdForRequirement,
  getSpecificationBySlug,
  linkRequirementsToSpecificationAtomically,
  listSpecificationItems,
  listSpecifications,
  unlinkRequirementsFromSpecification,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import type { AuthorizationService } from '@/lib/requirements/auth'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import { recordHighRiskMutationSucceeded } from '@/lib/requirements/security-audit'
import type {
  AddToSpecificationInput,
  GetSpecificationItemsInput,
  ListSpecificationsInput,
  RemoveFromSpecificationInput,
  RequirementsService,
  SpecificationRefInput,
} from '@/lib/requirements/service'
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

export function createSpecificationWorkflow({
  authorization,
  db,
  logger,
}: SpecificationWorkflowDependencies): Pick<
  RequirementsService,
  | 'addToSpecification'
  | 'getSpecificationItems'
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
                needsReferenceId: input.needsReferenceId,
                needsReferenceText: input.needsReferenceText,
              },
            )
          }
          if (addedCount > 0) {
            recordHighRiskMutationSucceeded(context, {
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
          recordHighRiskMutationSucceeded(context, {
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
