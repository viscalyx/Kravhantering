import { recordRequirementSelectionCleanupAudit } from '@/lib/audit/requirement-selection-cleanup-audit'
import { listPriorityLevels } from '@/lib/dal/priority-levels'
import { listAreas, type RequirementAreaRow } from '@/lib/dal/requirement-areas'
import {
  listCategories,
  type RequirementCategoryRow,
} from '@/lib/dal/requirement-categories'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import { cleanupRequirementSelectionRequirementLinksWithoutPublishedVersion } from '@/lib/dal/requirement-selection-questions'
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
} from '@/lib/dal/requirement-types'
import {
  approveArchiving,
  cancelArchiving,
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
import { listSpecificationItemStatuses } from '@/lib/dal/specification-item-statuses'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  type RequestContext,
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
  compareMcpSearchMatches,
  findMcpSearchMatch,
  type McpSearchMatch,
} from '@/lib/requirements/mcp-search'
import {
  recordSensitiveMutationSucceededWithExecutor,
  type SensitiveMutationAuditDetail,
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
  createServiceMessage,
  getVersionDisplayName,
  withLogging,
} from '@/lib/requirements/service-shared'
import type {
  RequirementDetail,
  RequirementVersionDetail,
} from '@/lib/requirements/types'
import { resolveRequirementListVisibility } from '@/lib/requirements/visibility'

interface RequirementWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

type McpLookupCatalogKind = Exclude<CatalogKind, 'requirements'>

type McpLookupCatalogRow = Record<string, unknown> & {
  match?: McpSearchMatch
}

function lookupSortValue(row: Record<string, unknown>): string {
  const candidate =
    row.name ?? row.nameSv ?? row.nameEn ?? row.code ?? row.id ?? ''
  return String(candidate)
}

function compareLookupRows(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  return (
    lookupSortValue(left).localeCompare(lookupSortValue(right), 'sv') ||
    String(left.id ?? '').localeCompare(String(right.id ?? ''), 'sv')
  )
}

async function listMcpLookupCatalogRows(
  db: SqlServerDatabase,
  catalog: McpLookupCatalogKind,
  input: QueryCatalogInput,
): Promise<Record<string, unknown>[]> {
  if (catalog === 'areas') {
    return (await listAreas(db)) as unknown as Record<string, unknown>[]
  }
  if (catalog === 'categories') {
    return (await listCategories(db)) as unknown as Record<string, unknown>[]
  }
  if (catalog === 'types') {
    return (await listTypes(db)) as unknown as Record<string, unknown>[]
  }
  if (catalog === 'quality_characteristics') {
    return (await listQualityCharacteristics(
      db,
      input.typeId,
    )) as unknown as Record<string, unknown>[]
  }
  if (catalog === 'priority_levels') {
    return (await listPriorityLevels(db)) as unknown as Record<
      string,
      unknown
    >[]
  }
  if (catalog === 'requirement_packages') {
    return (await listRequirementPackages(db)) as unknown as Record<
      string,
      unknown
    >[]
  }
  if (catalog === 'specification_item_statuses') {
    return (await listSpecificationItemStatuses(db)) as unknown as Record<
      string,
      unknown
    >[]
  }
  if (catalog === 'statuses') {
    return (await listStatuses(db)) as unknown as Record<string, unknown>[]
  }
  return (await listTransitions(db)) as unknown as Record<string, unknown>[]
}

function lookupSearchFields(
  catalog: McpLookupCatalogKind,
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (catalog === 'areas') {
    const area = row as unknown as RequirementAreaRow
    return {
      description: area.description,
      id: area.id,
      name: area.name,
      ownerHsaId: area.ownerHsaId,
      prefix: area.prefix,
    }
  }
  if (catalog === 'priority_levels') {
    return {
      assessmentCriteriaEn: row.assessmentCriteriaEn,
      assessmentCriteriaSv: row.assessmentCriteriaSv,
      code: row.code,
      descriptionEn: row.descriptionEn,
      descriptionSv: row.descriptionSv,
      id: row.id,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
    }
  }
  if (catalog === 'requirement_packages') {
    return {
      id: row.id,
      leadDisplayName: row.leadDisplayName,
      name: row.name,
      purposeAndScope: row.purposeAndScope,
    }
  }
  if (catalog === 'types') {
    const qualityCharacteristics = Array.isArray(row.qualityCharacteristics)
      ? (row.qualityCharacteristics as Array<Record<string, unknown>>)
      : []
    return {
      id: row.id,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      qualityCharacteristicNamesEn: qualityCharacteristics
        .map(item => item.nameEn)
        .join(' '),
      qualityCharacteristicNamesSv: qualityCharacteristics
        .map(item => item.nameSv)
        .join(' '),
    }
  }
  if (catalog === 'categories') {
    const category = row as unknown as RequirementCategoryRow
    return {
      id: category.id,
      nameEn: category.nameEn,
      nameSv: category.nameSv,
    }
  }
  if (catalog === 'quality_characteristics') {
    const qualityCharacteristic = row as unknown as QualityCharacteristicRow
    return {
      chapterId: qualityCharacteristic.chapterId,
      id: qualityCharacteristic.id,
      nameEn: qualityCharacteristic.nameEn,
      nameSv: qualityCharacteristic.nameSv,
    }
  }
  if (catalog === 'specification_item_statuses') {
    return {
      descriptionEn: row.descriptionEn,
      descriptionSv: row.descriptionSv,
      id: row.id,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
    }
  }
  if (catalog === 'statuses') {
    const status = row as unknown as RequirementStatusRecord
    return {
      id: status.id,
      nameEn: status.nameEn,
      nameSv: status.nameSv,
    }
  }
  if (catalog === 'transitions') {
    const transition = row as unknown as RequirementStatusTransitionDetail
    return {
      fromStatusId: transition.fromStatusId,
      fromStatusNameEn: transition.fromStatus.nameEn,
      fromStatusNameSv: transition.fromStatus.nameSv,
      id: transition.id,
      toStatusId: transition.toStatusId,
      toStatusNameEn: transition.toStatus.nameEn,
      toStatusNameSv: transition.toStatus.nameSv,
    }
  }
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameSv: row.nameSv,
  }
}

function requirementSearchFields(
  row: RequirementListItem,
): Record<string, unknown> {
  return {
    id: row.id,
    uniqueId: row.uniqueId,
    'version.acceptanceCriteria': row.version.acceptanceCriteria,
    'version.description': row.version.description,
  }
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
      verifiable: item.verifiable,
      priorityLevelId: item.priorityLevelId,
      priorityLevelNameEn: item.priorityLevelNameEn,
      priorityLevelNameSv: item.priorityLevelNameSv,
      priorityLevelColor: item.priorityLevelColor,
      priorityLevelIconName: item.priorityLevelIconName,
      priorityLevelSortOrder: item.priorityLevelSortOrder ?? null,
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
          ownerHsaId: requirement.area.ownerHsaId,
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
      verifiable: version.verifiable,
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
      priorityLevel: version.priorityLevel
        ? {
            id: version.priorityLevel.id,
            nameEn: version.priorityLevel.nameEn,
            nameSv: version.priorityLevel.nameSv,
            color: version.priorityLevel.color,
            iconName: version.priorityLevel.iconName,
            sortOrder: version.priorityLevel.sortOrder,
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
        versionRequirementPackage => {
          const requirementPackage =
            versionRequirementPackage.requirementPackage as
              | (typeof versionRequirementPackage.requirementPackage & {
                  name?: string | null
                  purposeAndScope?: string | null
                })
              | null
              | undefined
          return {
            requirementPackage: {
              id:
                requirementPackage?.id ??
                versionRequirementPackage.requirementPackageId,
              name: requirementPackage?.name ?? null,
              ownerId: null,
              purposeAndScope: requirementPackage?.purposeAndScope ?? null,
            },
          }
        },
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
  context: Parameters<typeof recordSensitiveMutationSucceededWithExecutor>[1],
  detail: SensitiveMutationAuditDetail,
): Promise<void> {
  await recordSensitiveMutationSucceededWithExecutor(executor, context, detail)
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

async function resolveCatalogRequirementVisibility(
  db: SqlServerDatabase,
  context: RequestContext,
) {
  return resolveRequirementListVisibility(db, context)
}

export function createRequirementWorkflow({
  authorization,
  db,
  logger,
}: RequirementWorkflowDependencies): Pick<
  RequirementsService,
  | 'getRequirement'
  | 'manageRequirement'
  | 'queryCatalog'
  | 'transitionRequirement'
> {
  return {
    async queryCatalog(context, input: QueryCatalogInput) {
      const locale = input.locale ?? 'en'
      const catalog = input.catalog
      const operation = input.operation
      if (!catalog) {
        throw validationError('Catalog is required')
      }
      if (!operation) {
        throw validationError('Catalog operation is required')
      }

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
          if (catalog === 'requirements') {
            const query = {
              areaIds: input.areaIds,
              categoryIds: input.categoryIds,
              includeArchived: input.includeArchived,
              locale,
              verifiable: input.verifiable,
              priorityLevelIds: input.priorityLevelIds,
              sortBy: input.sortBy,
              sortDirection: input.sortDirection,
              statuses: input.statuses,
              qualityCharacteristicIds: input.qualityCharacteristicIds,
              normReferenceIds: input.normReferenceIds,
              typeIds: input.typeIds,
              requirementPackageIds: input.requirementPackageIds,
              ...(await resolveCatalogRequirementVisibility(db, context)),
            }
            const rows = (await listRequirements(db, query)).map(
              formatRequirementListItem,
            )

            if (operation === 'list') {
              return { result: rows }
            }

            const search = input.search?.trim()
            if (!search) {
              throw validationError('Search text is required')
            }

            const result = rows.flatMap(
              (row): Array<RequirementListItem & { match: McpSearchMatch }> => {
                const match = findMcpSearchMatch(
                  requirementSearchFields(row),
                  search,
                )
                return match ? [{ ...row, match }] : []
              },
            )
            return { result }
          }

          const rows = (
            await listMcpLookupCatalogRows(db, catalog, input)
          ).sort(compareLookupRows)

          if (operation === 'list') {
            return { result: rows }
          }

          const search = input.search?.trim()
          if (!search) {
            throw validationError('Search text is required')
          }

          const result = rows
            .flatMap(
              (row): Array<McpLookupCatalogRow & { match: McpSearchMatch }> => {
                const match = findMcpSearchMatch(
                  lookupSearchFields(catalog, row),
                  search,
                )
                return match ? [{ ...row, match }] : []
              },
            )
            .sort(
              (left, right) =>
                compareMcpSearchMatches(left.match, right.match) ||
                compareLookupRows(left, right),
            )

          return { result }
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
          view: input.view,
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
          areaId: input.requirement?.areaId,
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
                verifiable: payload.verifiable,
                priorityLevelId: payload.priorityLevelId,
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
                  verifiable: payload.verifiable,
                  priorityLevelId: payload.priorityLevelId,
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
                const cleanup =
                  await cleanupRequirementSelectionRequirementLinksWithoutPublishedVersion(
                    executor,
                    [requirementId],
                  )
                await recordRequirementSelectionCleanupAudit(
                  executor,
                  context,
                  {
                    cleanup,
                    originAction: 'requirement.archiving.approved',
                    originTargetId: requirementId,
                    originTargetKind: 'requirement',
                  },
                )
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
                const deletedDraft = deleteResult.deleted.find(
                  item => item.type === 'draftRequirementVersion',
                )
                const requirementUniqueId =
                  deletedDraft?.requirementUniqueId ?? input.uniqueId
                await recordRequirementMutationAudit(executor, context, {
                  action: 'requirement.draft.deleted',
                  deletedTypes: deleteResult.deleted.map(item => item.type),
                  deletedVersionNumber: deletedDraft?.versionNumber,
                  operation: input.operation,
                  requirementId,
                  requirementUniqueId,
                })
              },
            })
            const requirementDeleted = result.deleted.some(
              item => item.type === 'requirement',
            )
            const detail = await getRequirementById(db, requirementId)
            return {
              detail: detail ? formatRequirementDetail(detail) : undefined,
              message: createServiceMessage(
                'Draft Deleted',
                [
                  requirementDeleted
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
              const cleanup =
                await cleanupRequirementSelectionRequirementLinksWithoutPublishedVersion(
                  executor,
                  [requirementId],
                )
              await recordRequirementSelectionCleanupAudit(executor, context, {
                cleanup,
                originAction: 'requirement.transition',
                originTargetId: requirementId,
                originTargetKind: 'requirement',
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
