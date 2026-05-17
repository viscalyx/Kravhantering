import { listAreas, type RequirementAreaRow } from '@/lib/dal/requirement-areas'
import {
  listCategories,
  type RequirementCategoryRow,
} from '@/lib/dal/requirement-categories'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import {
  listStatuses,
  listTransitions,
  type RequirementStatusRecord,
  type RequirementStatusTransitionDetail,
} from '@/lib/dal/requirement-statuses'
import {
  listQualityCharacteristics,
  listTypes,
  type QualityCharacteristicRow,
  type RequirementTypeWithQualityCharacteristics,
} from '@/lib/dal/requirement-types'
import {
  approveArchiving,
  cancelArchiving,
  countRequirements,
  createRequirement,
  deleteDraftVersion,
  editRequirement,
  getRequirementById,
  getRequirementByUniqueId,
  getVersionHistory,
  initiateArchiving,
  listRequirements,
  reactivateRequirement,
  restoreVersion,
  transitionStatus,
} from '@/lib/dal/requirements'
import { listRiskLevels } from '@/lib/dal/risk-levels'
import { listSpecificationItemStatuses } from '@/lib/dal/specification-item-statuses'
import type { UiSettingsLoader } from '@/lib/dal/ui-settings'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  conflictError,
  isRequirementsServiceError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { isRequirementPublishedStatus } from '@/lib/requirements/lifecycle'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import {
  type HighRiskMutationAuditDetail,
  recordHighRiskMutationSucceededWithExecutor,
} from '@/lib/requirements/security-audit'
import type {
  CatalogKind,
  GetRequirementInput,
  ManageRequirementInput,
  QueryCatalogInput,
  RequirementRefInput,
  RequirementsService,
  TransitionRequirementInput,
} from '@/lib/requirements/service'
import {
  authorize,
  clampLimit,
  clampOffset,
  createServiceMessage,
  getVersionDisplayName,
  withLogging,
} from '@/lib/requirements/service-shared'
import type {
  RequirementDetail,
  RequirementVersionDetail,
} from '@/lib/requirements/types'
import { getCatalogTitle } from '@/lib/ui-terminology'

interface RequirementWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
  uiSettings: UiSettingsLoader
}

export function formatRequirementListItem(
  item: Awaited<ReturnType<typeof listRequirements>>[number],
) {
  return {
    area: item.areaName
      ? {
          id: item.requirementAreaId,
          name: item.areaName,
        }
      : null,
    createdAt: item.createdAt,
    hasPendingVersion:
      item.maxVersion > item.versionNumber &&
      item.pendingVersionStatusId != null,
    id: item.id,
    isArchived: item.isArchived,
    pendingVersionStatusColor:
      item.maxVersion > item.versionNumber
        ? item.pendingVersionStatusColor
        : null,
    pendingVersionStatusIconName:
      item.maxVersion > item.versionNumber
        ? item.pendingVersionStatusIconName
        : null,
    pendingVersionStatusId:
      item.maxVersion > item.versionNumber ? item.pendingVersionStatusId : null,
    normReferenceIds: item.normReferenceIds
      ? item.normReferenceIds.split(',').filter(Boolean)
      : [],
    normReferenceUris: item.normReferenceUris
      ? item.normReferenceUris.split(',')
      : [],
    requirementPackages: item.requirementPackages,
    suggestionCount: item.suggestionCount,
    uniqueId: item.uniqueId,
    version: {
      acceptanceCriteria: item.acceptanceCriteria,
      archiveInitiatedAt: item.archiveInitiatedAt,
      categoryId: item.requirementCategoryId,
      categoryNameEn: item.categoryNameEn,
      categoryNameSv: item.categoryNameSv,
      description: item.description,
      id: item.versionId,
      revisionToken: item.revisionToken,
      requiresTesting: item.requiresTesting,
      riskLevelId: item.riskLevelId,
      riskLevelNameEn: item.riskLevelNameEn,
      riskLevelNameSv: item.riskLevelNameSv,
      riskLevelColor: item.riskLevelColor,
      riskLevelIconName: item.riskLevelIconName,
      riskLevelSortOrder: item.riskLevelSortOrder ?? null,
      status: item.status,
      statusColor: item.statusColor,
      statusIconName: item.statusIconName,
      statusNameEn: item.statusNameEn,
      statusNameSv: item.statusNameSv,
      qualityCharacteristicId: item.qualityCharacteristicId,
      qualityCharacteristicNameEn: item.qualityCharacteristicNameEn,
      qualityCharacteristicNameSv: item.qualityCharacteristicNameSv,
      typeId: item.requirementTypeId,
      typeNameEn: item.typeNameEn,
      typeNameSv: item.typeNameSv,
      versionCreatedAt: item.versionCreatedAt,
      versionNumber: item.versionNumber,
    },
  }
}

export type RequirementListItem = ReturnType<typeof formatRequirementListItem>

export function formatRequirementDetail(
  requirement: NonNullable<Awaited<ReturnType<typeof getRequirementById>>>,
): RequirementDetail {
  return {
    area: requirement.area
      ? {
          id: requirement.area.id,
          name: requirement.area.name,
          ownerId: requirement.area.ownerId,
          prefix: requirement.area.prefix,
        }
      : null,
    createdAt: requirement.createdAt,
    id: requirement.id,
    isArchived: requirement.isArchived,
    specificationCount: requirement.specificationCount,
    uniqueId: requirement.uniqueId,
    versions: requirement.versions.map(version => ({
      acceptanceCriteria: version.acceptanceCriteria,
      archiveInitiatedAt: version.archiveInitiatedAt,
      archivedAt: version.archivedAt,
      category: version.category
        ? {
            id: version.category.id,
            nameEn: version.category.nameEn,
            nameSv: version.category.nameSv,
          }
        : null,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      description: version.description,
      editedAt: version.editedAt,
      id: version.id,
      ownerName: version.createdBy ?? null,
      publishedAt: version.publishedAt,
      requiresTesting: version.requiresTesting,
      revisionToken: version.revisionToken,
      verificationMethod: version.verificationMethod,
      status: version.status,
      statusColor: version.statusColor,
      statusIconName: version.statusIconName,
      statusNameEn: version.statusNameEn,
      statusNameSv: version.statusNameSv,
      type: version.type
        ? {
            id: version.type.id,
            nameEn: version.type.nameEn,
            nameSv: version.type.nameSv,
          }
        : null,
      qualityCharacteristic: version.qualityCharacteristic
        ? {
            id: version.qualityCharacteristic.id,
            nameEn: version.qualityCharacteristic.nameEn,
            nameSv: version.qualityCharacteristic.nameSv,
          }
        : null,
      riskLevel: version.riskLevel
        ? {
            id: version.riskLevel.id,
            nameEn: version.riskLevel.nameEn,
            nameSv: version.riskLevel.nameSv,
            color: version.riskLevel.color,
            iconName: version.riskLevel.iconName,
            sortOrder: version.riskLevel.sortOrder,
          }
        : null,
      versionNormReferences: version.versionNormReferences.map(vnr => ({
        normReference: {
          id: vnr.normReference?.id ?? vnr.normReferenceId,
          issuer: vnr.normReference?.issuer ?? '',
          name: vnr.normReference?.name ?? '',
          normReferenceId: vnr.normReference?.normReferenceId ?? '',
          reference: vnr.normReference?.reference ?? '',
          type: vnr.normReference?.type ?? '',
          uri: vnr.normReference?.uri ?? null,
          version: vnr.normReference?.version ?? null,
        },
      })),
      versionNumber: version.versionNumber,
      versionRequirementPackages: version.versionRequirementPackages.map(
        versionRequirementPackage => ({
          requirementPackage: {
            descriptionEn:
              versionRequirementPackage.requirementPackage?.descriptionEn ??
              null,
            descriptionSv:
              versionRequirementPackage.requirementPackage?.descriptionSv ??
              null,
            id:
              versionRequirementPackage.requirementPackage?.id ??
              versionRequirementPackage.requirementPackageId,
            nameEn:
              versionRequirementPackage.requirementPackage?.nameEn ?? null,
            nameSv:
              versionRequirementPackage.requirementPackage?.nameSv ?? null,
            ownerId:
              versionRequirementPackage.requirementPackage?.ownerId ?? null,
          },
        }),
      ),
    })),
  }
}

export function buildRequirementViewUri(
  ref: RequirementRefInput,
  versionNumber?: number,
): string {
  const stableRef = ref.uniqueId ?? String(ref.id)
  const suffix = versionNumber != null ? `?version=${versionNumber}` : ''
  return `ui://requirements/requirement-detail/${encodeURIComponent(stableRef)}${suffix}`
}

async function resolveRequirement(
  db: SqlServerDatabase,
  ref: RequirementRefInput,
) {
  if (ref.uniqueId) {
    return getRequirementByUniqueId(db, ref.uniqueId)
  }

  if (ref.id != null) {
    return getRequirementById(db, ref.id)
  }

  throw validationError('Requirement reference is missing', {
    id: ref.id,
    uniqueId: ref.uniqueId,
  })
}

async function resolveRequirementId(
  db: SqlServerDatabase,
  ref: RequirementRefInput,
) {
  const requirement = await resolveRequirement(db, ref)

  if (!requirement) {
    throw notFoundError('Requirement not found', {
      id: ref.id,
      uniqueId: ref.uniqueId,
    })
  }

  return requirement.id
}

function getLatestOverallVersion(
  requirement: RequirementDetail,
): RequirementVersionDetail | null {
  return requirement.versions[0] ?? null
}

function isPublishedVersion(version: RequirementVersionDetail) {
  return isRequirementPublishedStatus(version.status)
}

interface RequirementAuditExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

async function getRequirementUniqueIdForAudit(
  executor: RequirementAuditExecutor,
  requirementId: number,
): Promise<string | undefined> {
  const rows = (await executor.query(
    'SELECT TOP (1) unique_id AS uniqueId FROM requirements WHERE id = @0',
    [requirementId],
  )) as Array<Record<string, unknown>>
  const uniqueId = rows[0]?.uniqueId
  return uniqueId == null ? undefined : String(uniqueId)
}

async function recordRequirementMutationAudit(
  executor: RequirementAuditExecutor,
  context: Parameters<typeof recordHighRiskMutationSucceededWithExecutor>[1],
  detail: HighRiskMutationAuditDetail,
): Promise<void> {
  await recordHighRiskMutationSucceededWithExecutor(executor, context, detail)
}

function getLatestPublishedVersion(
  requirement: RequirementDetail,
): RequirementVersionDetail | null {
  return requirement.versions.find(isPublishedVersion) ?? null
}

function withSelectedVersions(
  requirement: RequirementDetail,
  versions: RequirementVersionDetail[],
): RequirementDetail {
  return {
    ...requirement,
    versions,
  }
}

export function createRequirementWorkflow({
  authorization,
  db,
  logger,
  uiSettings,
}: RequirementWorkflowDependencies): Pick<
  RequirementsService,
  | 'getRequirement'
  | 'manageRequirement'
  | 'queryCatalog'
  | 'transitionRequirement'
> {
  return {
    async queryCatalog(context, input: QueryCatalogInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'
      const catalog: CatalogKind = input.catalog ?? 'requirements'

      await authorize(
        authorization,
        { kind: 'query_catalog', catalog },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.query_catalog',
        { catalog },
        async () => {
          const terminology = await uiSettings.getTerminology()

          if (catalog === 'requirements') {
            const limit = clampLimit(input.limit)
            const offset = clampOffset(input.offset)
            const query = {
              areaIds: input.areaIds,
              categoryIds: input.categoryIds,
              descriptionSearch: input.descriptionSearch,
              includeArchived: input.includeArchived,
              limit,
              locale,
              offset,
              requiresTesting: input.requiresTesting,
              riskLevelIds: input.riskLevelIds,
              sortBy: input.sortBy,
              sortDirection: input.sortDirection,
              statuses: input.statuses,
              qualityCharacteristicIds: input.qualityCharacteristicIds,
              normReferenceIds: input.normReferenceIds,
              typeIds: input.typeIds,
              uniqueIdSearch: input.uniqueIdSearch,
              requirementPackageIds: input.requirementPackageIds,
            }
            const [rows, total] = await Promise.all([
              listRequirements(db, query),
              countRequirements(db, query),
            ])
            const items = rows.map(formatRequirementListItem)
            const hasMore = offset + items.length < total

            return {
              catalog,
              items,
              message: createServiceMessage(
                getCatalogTitle('requirements', locale, terminology),
                items.map(item => {
                  const statusName =
                    locale === 'sv'
                      ? (item.version.statusNameSv ?? 'Okand')
                      : (item.version.statusNameEn ?? 'Unknown')
                  return `${item.uniqueId}: ${item.version.description} (${statusName}, v${item.version.versionNumber})`
                }),
                responseFormat,
              ),
              pagination: {
                count: items.length,
                hasMore,
                limit,
                nextOffset: hasMore ? offset + items.length : null,
                offset,
                total,
              },
            }
          }

          if (catalog === 'areas') {
            const areas = await listAreas(db)
            return {
              catalog,
              items: areas,
              message: createServiceMessage(
                getCatalogTitle('areas', locale, terminology),
                areas.map(
                  (area: RequirementAreaRow) => `${area.prefix}: ${area.name}`,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'categories') {
            const categories = await listCategories(db)
            return {
              catalog,
              items: categories,
              message: createServiceMessage(
                getCatalogTitle('categories', locale, terminology),
                categories.map((category: RequirementCategoryRow) =>
                  locale === 'sv' ? category.nameSv : category.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'types') {
            const types = await listTypes(db)
            return {
              catalog,
              items: types,
              message: createServiceMessage(
                getCatalogTitle('types', locale, terminology),
                types.map((type: RequirementTypeWithQualityCharacteristics) =>
                  locale === 'sv' ? type.nameSv : type.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'quality_characteristics') {
            const qualityCharacteristics = await listQualityCharacteristics(
              db,
              input.typeId,
            )
            return {
              catalog,
              items: qualityCharacteristics,
              message: createServiceMessage(
                getCatalogTitle('quality_characteristics', locale, terminology),
                qualityCharacteristics.map(
                  (category: QualityCharacteristicRow) =>
                    locale === 'sv' ? category.nameSv : category.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'risk_levels') {
            const levels = await listRiskLevels(db)
            return {
              catalog,
              items: levels,
              message: createServiceMessage(
                getCatalogTitle('risk_levels', locale, terminology),
                levels.map(level =>
                  locale === 'sv' ? level.nameSv : level.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'specification_item_statuses') {
            const statuses = await listSpecificationItemStatuses(db)
            return {
              catalog,
              items: statuses,
              message: createServiceMessage(
                getCatalogTitle(
                  'specification_item_statuses',
                  locale,
                  terminology,
                ),
                statuses.map(status =>
                  locale === 'sv' ? status.nameSv : status.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'statuses') {
            const statuses = await listStatuses(db)
            return {
              catalog,
              items: statuses,
              message: createServiceMessage(
                getCatalogTitle('statuses', locale, terminology),
                statuses.map((status: RequirementStatusRecord) =>
                  locale === 'sv' ? status.nameSv : status.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'requirement_packages') {
            const requirementPackages = await listRequirementPackages(db)
            return {
              catalog,
              items: requirementPackages,
              message: createServiceMessage(
                getCatalogTitle('requirement_packages', locale, terminology),
                requirementPackages.map(requirementPackage =>
                  locale === 'sv'
                    ? requirementPackage.nameSv
                    : requirementPackage.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          const transitions = await listTransitions(db)
          return {
            catalog,
            items: transitions,
            message: createServiceMessage(
              getCatalogTitle('transitions', locale, terminology),
              transitions.map(
                (transition: RequirementStatusTransitionDetail) => {
                  const fromName =
                    locale === 'sv'
                      ? transition.fromStatus.nameSv
                      : transition.fromStatus.nameEn
                  const toName =
                    locale === 'sv'
                      ? transition.toStatus.nameSv
                      : transition.toStatus.nameEn
                  return `${fromName} -> ${toName}`
                },
              ),
              responseFormat,
            ),
            pagination: null,
          }
        },
      )
    },

    async getRequirement(context, input: GetRequirementInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'get_requirement',
          id: input.id,
          uniqueId: input.uniqueId,
          versionNumber: input.versionNumber,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.get_requirement',
        {
          requirement_id: input.id,
          requirement_unique_id: input.uniqueId,
          version_number: input.versionNumber,
          view: input.view,
        },
        async () => {
          const requirement = await resolveRequirement(db, input)
          if (!requirement) {
            throw notFoundError('Requirement not found', {
              id: input.id,
              uniqueId: input.uniqueId,
            })
          }

          const detail = formatRequirementDetail(requirement)
          const view = input.view ?? 'detail'
          const latestPublishedVersion = getLatestPublishedVersion(detail)

          if (view === 'version' && input.versionNumber == null) {
            throw notFoundError(
              'A requirement version number must be provided',
              {
                uniqueId: detail.uniqueId,
              },
            )
          }

          const requestedVersion =
            view === 'version'
              ? detail.versions.find(
                  v => v.versionNumber === input.versionNumber,
                )
              : undefined

          if (view === 'version' && !requestedVersion) {
            throw notFoundError('Requirement version not found', {
              uniqueId: detail.uniqueId,
              versionNumber: input.versionNumber,
            })
          }

          if (view === 'detail' && !latestPublishedVersion) {
            throw notFoundError(
              'No published version exists for this requirement',
              {
                id: detail.id,
                uniqueId: detail.uniqueId,
              },
            )
          }

          const historyFallbackVersion =
            latestPublishedVersion ??
            getLatestOverallVersion(detail) ??
            undefined
          const targetVersion =
            view === 'detail'
              ? (latestPublishedVersion ?? undefined)
              : view === 'version'
                ? requestedVersion
                : historyFallbackVersion
          const selectedVersions =
            view === 'history'
              ? detail.versions
              : targetVersion
                ? [targetVersion]
                : []
          const responseRequirement = withSelectedVersions(
            detail,
            selectedVersions,
          )
          const versions =
            view === 'history' ? responseRequirement.versions : undefined
          const version = view === 'version' ? requestedVersion : undefined
          const requirementResourceUri = `requirements://requirement/${encodeURIComponent(responseRequirement.uniqueId)}${targetVersion?.versionNumber != null ? `?version=${targetVersion.versionNumber}` : ''}`
          const requirementViewUri = buildRequirementViewUri(
            {
              uniqueId: responseRequirement.uniqueId,
              id: responseRequirement.id,
            },
            targetVersion?.versionNumber,
          )

          const lines =
            view === 'history'
              ? responseRequirement.versions.map(v => {
                  const status = getVersionDisplayName(
                    {
                      nameEn: v.statusNameEn,
                      nameSv: v.statusNameSv,
                    },
                    locale,
                  )
                  return `v${v.versionNumber}: ${status}`
                })
              : [
                  `${responseRequirement.uniqueId}: ${targetVersion?.description ?? 'No description'}`,
                  `Status: ${getVersionDisplayName(
                    {
                      nameEn: targetVersion?.statusNameEn,
                      nameSv: targetVersion?.statusNameSv,
                    },
                    locale,
                  )}`,
                ]

          return {
            message: createServiceMessage(
              view === 'history' ? 'Requirement History' : 'Requirement Detail',
              lines,
              responseFormat,
            ),
            requirement: responseRequirement,
            requirementResourceUri,
            requirementViewUri,
            version,
            versions,
          }
        },
      )
    },

    async manageRequirement(context, input: ManageRequirementInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'manage_requirement',
          id: input.id,
          uniqueId: input.uniqueId,
          operation: input.operation,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.manage_requirement',
        {
          operation: input.operation,
          requirement_id: input.id,
          requirement_unique_id: input.uniqueId,
          version_number: input.versionNumber,
        },
        async () => {
          if (input.operation === 'create') {
            const payload = input.requirement
            const description = payload?.description?.trim()
            if (!payload?.areaId || !description) {
              throw validationError(
                'Create operation requires requirement.areaId and requirement.description',
              )
            }

            const actor = requireHumanActorSnapshot(context)
            const created = await createRequirement(
              db,
              {
                acceptanceCriteria: payload.acceptanceCriteria,
                createdBy: actor.displayName,
                createdByHsaId: actor.hsaId,
                description,
                normReferenceIds: payload.normReferenceIds,
                requirementAreaId: payload.areaId,
                requirementCategoryId: payload.categoryId,
                qualityCharacteristicId: payload.qualityCharacteristicId,
                requirementTypeId: payload.typeId,
                requiresTesting: payload.requiresTesting,
                riskLevelId: payload.riskLevelId,
                verificationMethod: payload.verificationMethod,
                requirementPackageIds: payload.requirementPackageIds,
              },
              {
                audit: (executor, result) =>
                  recordRequirementMutationAudit(executor, context, {
                    action: 'requirement.create',
                    operation: input.operation,
                    requirementId: result.requirement.id,
                    requirementUniqueId: result.requirement.uniqueId,
                    versionNumber: result.version.versionNumber,
                  }),
              },
            )

            const detail = formatRequirementDetail(
              (await getRequirementById(db, created.requirement.id)) ??
                (() => {
                  throw notFoundError(
                    'Created requirement could not be reloaded',
                  )
                })(),
            )
            return {
              detail,
              message: createServiceMessage(
                'Requirement Created',
                [
                  `${detail.uniqueId}: ${detail.versions[0]?.description ?? ''}`,
                  `Status: ${getVersionDisplayName(
                    detail.versions[0]
                      ? {
                          nameEn: detail.versions[0].statusNameEn,
                          nameSv: detail.versions[0].statusNameSv,
                        }
                      : null,
                    locale,
                  )}`,
                ],
                responseFormat,
              ),
              operation: input.operation,
              result: {
                requirement: created.requirement,
                version: created.version,
              },
            }
          }

          const requirementId = await resolveRequirementId(db, input)

          if (input.operation === 'edit') {
            const payload = input.requirement
            const description = payload?.description?.trim()
            if (!payload || !description) {
              throw validationError(
                'Edit operation requires requirement.description',
              )
            }
            if (
              payload.baseVersionId == null ||
              payload.baseRevisionToken == null
            ) {
              throw validationError(
                'Edit operation requires requirement.baseVersionId and requirement.baseRevisionToken',
                { reason: 'missing_edit_precondition' },
              )
            }
            const actor = requireHumanActorSnapshot(context)
            let version: Awaited<ReturnType<typeof editRequirement>>
            try {
              version = await editRequirement(
                db,
                requirementId,
                {
                  acceptanceCriteria: payload.acceptanceCriteria,
                  baseRevisionToken: payload.baseRevisionToken,
                  baseVersionId: payload.baseVersionId,
                  createdBy: actor.displayName,
                  createdByHsaId: actor.hsaId,
                  description,
                  normReferenceIds: payload.normReferenceIds,
                  requirementAreaId: payload.areaId,
                  requirementCategoryId: payload.categoryId,
                  qualityCharacteristicId: payload.qualityCharacteristicId,
                  requirementTypeId: payload.typeId,
                  requiresTesting: payload.requiresTesting,
                  riskLevelId: payload.riskLevelId,
                  verificationMethod: payload.verificationMethod,
                  requirementPackageIds: payload.requirementPackageIds,
                },
                {
                  audit: async (executor, result) => {
                    const requirementUniqueId =
                      await getRequirementUniqueIdForAudit(
                        executor,
                        requirementId,
                      )
                    await recordRequirementMutationAudit(executor, context, {
                      action: 'requirement.edit',
                      operation: input.operation,
                      requirementId,
                      requirementUniqueId,
                      versionNumber: result.versionNumber,
                    })
                  },
                },
              )
            } catch (error) {
              if (
                isRequirementsServiceError(error) &&
                error.code === 'conflict' &&
                error.details?.reason === 'stale_requirement_edit'
              ) {
                const latest = await getRequirementById(db, requirementId)
                throw conflictError(error.message, {
                  ...error.details,
                  latest: latest ? formatRequirementDetail(latest) : null,
                })
              }
              throw error
            }
            const detail = formatRequirementDetail(
              (await getRequirementById(db, requirementId)) ??
                (() => {
                  throw notFoundError(
                    'Edited requirement could not be reloaded',
                  )
                })(),
            )
            return {
              detail,
              message: createServiceMessage(
                'Requirement Updated',
                [
                  `${detail.uniqueId}: ${detail.versions[0]?.description ?? ''}`,
                ],
                responseFormat,
              ),
              operation: input.operation,
              result: version,
            }
          }

          if (input.operation === 'archive') {
            await initiateArchiving(db, requirementId, {
              audit: async executor => {
                const requirementUniqueId =
                  await getRequirementUniqueIdForAudit(executor, requirementId)
                await recordRequirementMutationAudit(executor, context, {
                  action: 'requirement.archiving.initiated',
                  operation: input.operation,
                  requirementId,
                  requirementUniqueId,
                })
              },
            })
            const detail = formatRequirementDetail(
              (await getRequirementById(db, requirementId)) ??
                (() => {
                  throw notFoundError(
                    'Requirement could not be reloaded after initiating archiving',
                  )
                })(),
            )
            return {
              detail,
              message: createServiceMessage(
                'Archiving Review Initiated',
                [detail.uniqueId],
                responseFormat,
              ),
              operation: input.operation,
              result: { ok: true },
            }
          }

          if (input.operation === 'approve_archiving') {
            await approveArchiving(db, requirementId, {
              audit: async executor => {
                const requirementUniqueId =
                  await getRequirementUniqueIdForAudit(executor, requirementId)
                await recordRequirementMutationAudit(executor, context, {
                  action: 'requirement.archiving.approved',
                  operation: input.operation,
                  requirementId,
                  requirementUniqueId,
                })
              },
            })
            const detail = formatRequirementDetail(
              (await getRequirementById(db, requirementId)) ??
                (() => {
                  throw notFoundError(
                    'Requirement could not be reloaded after approving archiving',
                  )
                })(),
            )
            return {
              detail,
              message: createServiceMessage(
                'Requirement Archived',
                [detail.uniqueId],
                responseFormat,
              ),
              operation: input.operation,
              result: { ok: true },
            }
          }

          if (input.operation === 'cancel_archiving') {
            await cancelArchiving(db, requirementId, {
              audit: async executor => {
                const requirementUniqueId =
                  await getRequirementUniqueIdForAudit(executor, requirementId)
                await recordRequirementMutationAudit(executor, context, {
                  action: 'requirement.archiving.cancelled',
                  operation: input.operation,
                  requirementId,
                  requirementUniqueId,
                })
              },
            })
            const detail = formatRequirementDetail(
              (await getRequirementById(db, requirementId)) ??
                (() => {
                  throw notFoundError(
                    'Requirement could not be reloaded after cancelling archiving',
                  )
                })(),
            )
            return {
              detail,
              message: createServiceMessage(
                'Archiving Cancelled',
                [detail.uniqueId],
                responseFormat,
              ),
              operation: input.operation,
              result: { ok: true },
            }
          }

          if (input.operation === 'delete_draft') {
            const result = await deleteDraftVersion(db, requirementId, {
              audit: async (executor, deleteResult) => {
                const requirementUniqueId =
                  deleteResult.deletedUniqueId ??
                  (await getRequirementUniqueIdForAudit(
                    executor,
                    requirementId,
                  )) ??
                  input.uniqueId
                await recordRequirementMutationAudit(executor, context, {
                  action: 'requirement.draft.deleted',
                  deleted: deleteResult.deleted,
                  operation: input.operation,
                  requirementId,
                  requirementUniqueId,
                })
              },
            })
            const detail = await getRequirementById(db, requirementId)
            return {
              detail: detail ? formatRequirementDetail(detail) : undefined,
              message: createServiceMessage(
                'Draft Deleted',
                [
                  result.deleted === 'requirement'
                    ? 'Requirement removed'
                    : 'Draft version removed',
                ],
                responseFormat,
              ),
              operation: input.operation,
              result,
            }
          }

          if (input.operation === 'reactivate') {
            const actor = requireHumanActorSnapshot(context)
            await reactivateRequirement(
              db,
              requirementId,
              actor.displayName,
              actor.hsaId,
              {
                audit: async executor => {
                  const requirementUniqueId =
                    await getRequirementUniqueIdForAudit(
                      executor,
                      requirementId,
                    )
                  await recordRequirementMutationAudit(executor, context, {
                    action: 'requirement.reactivated',
                    operation: input.operation,
                    requirementId,
                    requirementUniqueId,
                  })
                },
              },
            )
            const detail = formatRequirementDetail(
              (await getRequirementById(db, requirementId)) ??
                (() => {
                  throw notFoundError(
                    'Reactivated requirement could not be reloaded',
                  )
                })(),
            )
            return {
              detail,
              message: createServiceMessage(
                'Requirement Reactivated',
                [detail.uniqueId],
                responseFormat,
              ),
              operation: input.operation,
              result: { ok: true },
            }
          }

          if (
            input.versionNumber == null ||
            !Number.isInteger(input.versionNumber) ||
            input.versionNumber < 1
          ) {
            throw validationError('Missing or invalid versionNumber', {
              requirementId,
              versionNumber: input.versionNumber,
            })
          }

          const history = await getVersionHistory(db, requirementId)
          const version = history.find(
            item => item.versionNumber === input.versionNumber,
          )

          if (!version) {
            throw notFoundError('Requirement version not found', {
              requirementId,
              versionNumber: input.versionNumber,
            })
          }

          const actor = requireHumanActorSnapshot(context)
          const restored = await restoreVersion(
            db,
            requirementId,
            version.id,
            actor.displayName,
            actor.hsaId,
            {
              audit: async (executor, result) => {
                const requirementUniqueId =
                  await getRequirementUniqueIdForAudit(executor, requirementId)
                await recordRequirementMutationAudit(executor, context, {
                  action: 'requirement.version.restored',
                  operation: input.operation,
                  requirementId,
                  requirementUniqueId,
                  restoredVersionNumber: result.versionNumber,
                  versionNumber: input.versionNumber,
                })
              },
            },
          )

          const detail = formatRequirementDetail(
            (await getRequirementById(db, requirementId)) ??
              (() => {
                throw notFoundError(
                  'Restored requirement could not be reloaded',
                )
              })(),
          )

          return {
            detail,
            message: createServiceMessage(
              'Requirement Version Restored',
              [`${detail.uniqueId}: v${restored.versionNumber}`],
              responseFormat,
            ),
            operation: input.operation,
            result: restored,
          }
        },
      )
    },

    async transitionRequirement(context, input: TransitionRequirementInput) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'transition_requirement',
          id: input.id,
          uniqueId: input.uniqueId,
          toStatusId: input.toStatusId,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.transition_requirement',
        {
          requirement_id: input.id,
          requirement_unique_id: input.uniqueId,
          to_status_id: input.toStatusId,
        },
        async () => {
          const requirementId = await resolveRequirementId(db, input)
          await transitionStatus(db, requirementId, input.toStatusId, {
            audit: async (executor, result) => {
              const requirementUniqueId = await getRequirementUniqueIdForAudit(
                executor,
                requirementId,
              )
              await recordRequirementMutationAudit(executor, context, {
                action: 'requirement.transition',
                operation: 'transition',
                requirementId,
                requirementUniqueId,
                toStatusId: input.toStatusId,
                versionNumber: result.versionNumber,
              })
            },
          })
          const detail = formatRequirementDetail(
            (await getRequirementById(db, requirementId)) ??
              (() => {
                throw notFoundError(
                  'Transitioned requirement could not be reloaded',
                )
              })(),
          )
          const version = detail.versions[0]

          return {
            detail,
            message: createServiceMessage(
              'Requirement Transitioned',
              [
                `${detail.uniqueId}: ${version?.description ?? ''}`,
                `Status: ${getVersionDisplayName(
                  version
                    ? {
                        nameEn: version.statusNameEn,
                        nameSv: version.statusNameSv,
                      }
                    : null,
                  locale,
                )}`,
              ],
              responseFormat,
            ),
            version,
          }
        },
      )
    },
  }
}
