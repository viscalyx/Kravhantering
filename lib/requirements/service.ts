import { getAreaById, listAreas } from '@/lib/dal/requirement-areas'
import { listCategories } from '@/lib/dal/requirement-categories'
import {
  getOrCreatePackageNeedsReference,
  getPackageBySlug,
  getPublishedVersionIdForRequirement,
  linkRequirementsToPackage,
  listPackageItems,
  listPackages,
  unlinkRequirementsFromPackage,
} from '@/lib/dal/requirement-packages'
import { replaceReferencesForVersion } from '@/lib/dal/requirement-references'
import { listStatuses, listTransitions } from '@/lib/dal/requirement-statuses'
import {
  listQualityCharacteristics,
  listTypes,
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
import {
  createUiSettingsLoader,
  type UiSettingsLoader,
} from '@/lib/dal/ui-settings'
import { listScenarios } from '@/lib/dal/usage-scenarios'
import type { Database } from '@/lib/db'
import {
  AllowAllAuthorizationService,
  type AuthorizationService,
  type RequestContext,
  type RequirementsAction,
} from '@/lib/requirements/auth'
import {
  internalError,
  isRequirementsServiceError,
  notFoundError,
} from '@/lib/requirements/errors'
import type {
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'
import {
  createRequirementsLogger,
  type RequirementsLogger,
} from '@/lib/requirements/logging'
import type {
  RequirementDetail,
  RequirementVersionDetail,
} from '@/lib/requirements/types'
import { getCatalogTitle } from '@/lib/ui-terminology'

export type {
  RequirementDetail,
  RequirementVersionDetail,
} from '@/lib/requirements/types'

export type ResponseFormat = 'json' | 'markdown'
export type ResponseLocale = 'en' | 'sv'
export type CatalogKind =
  | 'requirements'
  | 'areas'
  | 'categories'
  | 'types'
  | 'quality_characteristics'
  | 'statuses'
  | 'scenarios'
  | 'transitions'

export interface RequirementReferenceInput {
  id?: number
  name: string
  owner?: string
  uri?: string
}

export interface RequirementMutationInput {
  acceptanceCriteria?: string
  areaId?: number
  categoryId?: number
  createdBy?: string
  description?: string
  qualityCharacteristicId?: number
  references?: RequirementReferenceInput[]
  requiresTesting?: boolean
  scenarioIds?: number[]
  typeId?: number
  verificationMethod?: string | null
}

export interface RequirementRefInput {
  id?: number
  uniqueId?: string
}

export interface QueryCatalogInput {
  areaIds?: number[]
  catalog?: CatalogKind
  categoryIds?: number[]
  descriptionSearch?: string
  includeArchived?: boolean
  limit?: number
  locale?: ResponseLocale
  offset?: number
  qualityCharacteristicIds?: number[]
  requiresTesting?: boolean[]
  responseFormat?: ResponseFormat
  sortBy?: RequirementSortField
  sortDirection?: RequirementSortDirection
  statuses?: number[]
  typeId?: number
  typeIds?: number[]
  uniqueIdSearch?: string
  usageScenarioIds?: number[]
}

export interface GetRequirementInput extends RequirementRefInput {
  locale?: ResponseLocale
  responseFormat?: ResponseFormat
  versionNumber?: number
  view?: 'detail' | 'history' | 'version'
}

export interface ManageRequirementInput extends RequirementRefInput {
  locale?: ResponseLocale
  operation:
    | 'archive'
    | 'approve_archiving'
    | 'cancel_archiving'
    | 'create'
    | 'delete_draft'
    | 'edit'
    | 'reactivate'
    | 'restore_version'
  requirement?: RequirementMutationInput
  responseFormat?: ResponseFormat
  versionNumber?: number
}

export interface TransitionRequirementInput extends RequirementRefInput {
  locale?: ResponseLocale
  responseFormat?: ResponseFormat
  toStatusId: number
}

export interface PackageRefInput {
  packageId?: number
  packageSlug?: string
}

export interface ListPackagesInput {
  locale?: ResponseLocale
  nameSearch?: string
  responseFormat?: ResponseFormat
}

export interface GetPackageItemsInput extends PackageRefInput {
  descriptionSearch?: string
  locale?: ResponseLocale
  responseFormat?: ResponseFormat
}

export interface AddToPackageInput extends PackageRefInput {
  locale?: ResponseLocale
  needsReferenceText?: string | null
  requirementIds: number[]
  responseFormat?: ResponseFormat
}

export interface RemoveFromPackageInput extends PackageRefInput {
  locale?: ResponseLocale
  requirementIds: number[]
  responseFormat?: ResponseFormat
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200
const PUBLISHED_REQUIREMENT_STATUS_ID = 3

function clampLimit(limit?: number) {
  if (limit == null) {
    return DEFAULT_PAGE_SIZE
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE)
}

function clampOffset(offset?: number) {
  if (offset == null || Number.isNaN(offset)) {
    return 0
  }

  return Math.max(Math.trunc(offset), 0)
}

function localizeName(
  value: { nameEn?: string | null; nameSv?: string | null } | null | undefined,
  locale: ResponseLocale,
) {
  if (!value) {
    return null
  }

  return locale === 'sv' ? (value.nameSv ?? null) : (value.nameEn ?? null)
}

function createServiceMessage(
  title: string,
  lines: string[],
  responseFormat: ResponseFormat,
) {
  if (responseFormat === 'json') {
    return JSON.stringify({ title, lines }, null, 2)
  }

  return [`## ${title}`, ...lines].join('\n')
}

function getVersionDisplayName(
  status: { nameEn?: string | null; nameSv?: string | null } | null | undefined,
  locale: ResponseLocale,
) {
  return localizeName(status, locale) ?? (locale === 'sv' ? 'Okand' : 'Unknown')
}

function getRequirementWord(locale: ResponseLocale, count: number) {
  if (locale === 'sv') {
    return 'krav'
  }

  return count === 1 ? 'requirement' : 'requirements'
}

function getPackageWord(locale: ResponseLocale, count: number) {
  if (locale === 'sv') {
    return 'kravpaket'
  }

  return count === 1 ? 'package' : 'packages'
}

function getPackageServiceTitle(
  kind: 'add' | 'items' | 'list' | 'remove',
  locale: ResponseLocale,
) {
  if (locale === 'sv') {
    switch (kind) {
      case 'add':
        return 'Krav tillagda i paket'
      case 'items':
        return 'Krav i paket'
      case 'remove':
        return 'Krav borttagna fran paket'
      default:
        return 'Kravpaket'
    }
  }

  switch (kind) {
    case 'add':
      return 'Requirements Added to Package'
    case 'items':
      return 'Package Requirements'
    case 'remove':
      return 'Requirements Removed from Package'
    default:
      return 'Requirement Packages'
  }
}

function formatRequirementListItem(
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
    pendingVersionStatusId:
      item.maxVersion > item.versionNumber ? item.pendingVersionStatusId : null,
    uniqueId: item.uniqueId,
    version: {
      acceptanceCriteria: item.acceptanceCriteria,
      categoryId: item.requirementCategoryId,
      categoryNameEn: item.categoryNameEn,
      categoryNameSv: item.categoryNameSv,
      description: item.description,
      id: item.versionId,
      requiresTesting: item.requiresTesting,
      status: item.status,
      statusColor: item.statusColor,
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

function formatRequirementDetail(
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
      references: version.references.map(reference => ({
        id: reference.id,
        name: reference.name,
        owner: reference.owner,
        uri: reference.uri,
      })),
      requiresTesting: version.requiresTesting,
      verificationMethod: version.verificationMethod,
      status: version.status,
      statusColor: version.statusColor,
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
      versionNumber: version.versionNumber,
      versionScenarios: version.versionScenarios.map(versionScenario => ({
        scenario: {
          descriptionEn: versionScenario.scenario?.descriptionEn ?? null,
          descriptionSv: versionScenario.scenario?.descriptionSv ?? null,
          id: versionScenario.scenario?.id ?? versionScenario.usageScenarioId,
          nameEn: versionScenario.scenario?.nameEn ?? null,
          nameSv: versionScenario.scenario?.nameSv ?? null,
          ownerId: versionScenario.scenario?.ownerId ?? null,
        },
      })),
    })),
  }
}

export function buildRequirementViewUri(
  ref: RequirementRefInput,
  versionNumber?: number,
) {
  const stableRef = ref.uniqueId ?? String(ref.id)
  const suffix = versionNumber != null ? `?version=${versionNumber}` : ''
  return `ui://requirements/requirement-detail/${encodeURIComponent(stableRef)}${suffix}`
}

export interface ListPackagesOutput {
  message: string
  packages: {
    businessNeedsReference: string | null
    id: number
    implementationType: { nameSv: string; nameEn: string } | null
    itemCount: number
    name: string
    responsibilityArea: { nameSv: string; nameEn: string } | null
    uniqueId: string
  }[]
}

export interface GetPackageItemsOutput {
  items: {
    id: number
    uniqueId: string
    area: string | null
    category: string | null
    description: string | null
    needsReference: string | null
    status: string | null
    type: string | null
  }[]
  message: string
  packageId: number
}

export interface AddToPackageOutput {
  addedCount: number
  message: string
  skippedCount: number
  skippedIds: number[]
}

export interface RemoveFromPackageOutput {
  message: string
  removedCount: number
}

export interface RequirementsService {
  addToPackage(
    context: RequestContext,
    input: AddToPackageInput,
  ): Promise<AddToPackageOutput>
  getPackageItems(
    context: RequestContext,
    input: GetPackageItemsInput,
  ): Promise<GetPackageItemsOutput>
  getRequirement(
    context: RequestContext,
    input: GetRequirementInput,
  ): Promise<{
    message: string
    requirement: RequirementDetail
    requirementResourceUri: string
    requirementViewUri: string
    version?: RequirementVersionDetail
    versions?: RequirementDetail['versions']
  }>
  listPackages(
    context: RequestContext,
    input: ListPackagesInput,
  ): Promise<ListPackagesOutput>
  manageRequirement(
    context: RequestContext,
    input: ManageRequirementInput,
  ): Promise<{
    detail?: RequirementDetail
    message: string
    operation: ManageRequirementInput['operation']
    result: unknown
  }>
  queryCatalog(
    context: RequestContext,
    input: QueryCatalogInput,
  ): Promise<{
    catalog: CatalogKind
    items: unknown[]
    message: string
    pagination: {
      count: number
      hasMore: boolean
      limit: number
      nextOffset: number | null
      offset: number
      total: number
    } | null
  }>
  removeFromPackage(
    context: RequestContext,
    input: RemoveFromPackageInput,
  ): Promise<RemoveFromPackageOutput>
  transitionRequirement(
    context: RequestContext,
    input: TransitionRequirementInput,
  ): Promise<{
    detail: RequirementDetail
    message: string
    version: RequirementVersionDetail
  }>
}

async function resolveRequirement(db: Database, ref: RequirementRefInput) {
  if (ref.uniqueId) {
    return getRequirementByUniqueId(db, ref.uniqueId)
  }

  if (ref.id != null) {
    return getRequirementById(db, ref.id)
  }

  throw internalError('Requirement reference is missing')
}

async function resolveRequirementId(db: Database, ref: RequirementRefInput) {
  const requirement = await resolveRequirement(db, ref)

  if (!requirement) {
    throw notFoundError('Requirement not found', {
      id: ref.id,
      uniqueId: ref.uniqueId,
    })
  }

  return requirement.id
}

async function syncReferences(
  db: Database,
  versionId: number,
  references: RequirementReferenceInput[] | undefined,
) {
  await replaceReferencesForVersion(db, versionId, references ?? [])
}

async function ensureAreaExists(db: Database, areaId: number | undefined) {
  if (areaId == null) {
    return null
  }

  const area = await getAreaById(db, areaId)
  if (!area) {
    throw notFoundError('Requirement area not found', { areaId })
  }

  return area
}

async function resolvePackageIdOrThrow(db: Database, input: PackageRefInput) {
  const packageId =
    input.packageId != null
      ? input.packageId
      : input.packageSlug
        ? (await getPackageBySlug(db, input.packageSlug))?.id
        : undefined

  if (packageId == null) {
    throw notFoundError('Package not found.', {
      packageId: input.packageId,
      packageSlug: input.packageSlug,
    })
  }

  return packageId
}

function getPackageReferenceLabel(input: PackageRefInput, packageId: number) {
  return input.packageSlug ?? String(packageId)
}

function getLatestOverallVersion(
  requirement: RequirementDetail,
): RequirementVersionDetail | null {
  return requirement.versions[0] ?? null
}

function isPublishedVersion(version: RequirementVersionDetail) {
  return version.status === PUBLISHED_REQUIREMENT_STATUS_ID
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

async function authorize(
  authorization: AuthorizationService,
  action: RequirementsAction,
  context: RequestContext,
) {
  await authorization.assertAuthorized(action, context)
}

async function withLogging<T>(
  logger: RequirementsLogger,
  context: RequestContext,
  event: string,
  metadata: Record<string, string | number | boolean | null | undefined>,
  operation: () => Promise<T>,
) {
  const startedAt = Date.now()

  try {
    const result = await operation()
    logger.info(event, {
      actor_id: context.actor.id,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      duration_ms: Date.now() - startedAt,
      ...metadata,
    })
    return result
  } catch (error) {
    logger.error(`${event}.failed`, {
      actor_id: context.actor.id,
      request_id: context.requestId,
      source: context.source,
      tool_name: context.toolName,
      duration_ms: Date.now() - startedAt,
      error:
        error instanceof Error ? error.message : 'Unknown requirements error',
      ...metadata,
    })
    throw error
  }
}

export function createRequirementsService(
  db: Database,
  {
    authorization = new AllowAllAuthorizationService(),
    logger = createRequirementsLogger(),
    uiSettings = createUiSettingsLoader(db),
  }: {
    authorization?: AuthorizationService
    logger?: RequirementsLogger
    uiSettings?: UiSettingsLoader
  } = {},
): RequirementsService {
  return {
    async queryCatalog(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'
      const catalog = input.catalog ?? 'requirements'

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
              sortBy: input.sortBy,
              sortDirection: input.sortDirection,
              statuses: input.statuses,
              qualityCharacteristicIds: input.qualityCharacteristicIds,
              typeIds: input.typeIds,
              uniqueIdSearch: input.uniqueIdSearch,
              usageScenarioIds: input.usageScenarioIds,
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
                areas.map(area => `${area.prefix}: ${area.name}`),
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
                categories.map(category =>
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
                types.map(type =>
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
                qualityCharacteristics.map(category =>
                  locale === 'sv' ? category.nameSv : category.nameEn,
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
                statuses.map(status =>
                  locale === 'sv' ? status.nameSv : status.nameEn,
                ),
                responseFormat,
              ),
              pagination: null,
            }
          }

          if (catalog === 'scenarios') {
            const scenarios = await listScenarios(db)
            return {
              catalog,
              items: scenarios,
              message: createServiceMessage(
                getCatalogTitle('scenarios', locale, terminology),
                scenarios.map(scenario =>
                  locale === 'sv' ? scenario.nameSv : scenario.nameEn,
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
              transitions.map(transition => {
                const fromName =
                  locale === 'sv'
                    ? transition.fromStatus.nameSv
                    : transition.fromStatus.nameEn
                const toName =
                  locale === 'sv'
                    ? transition.toStatus.nameSv
                    : transition.toStatus.nameEn
                return `${fromName} -> ${toName}`
              }),
              responseFormat,
            ),
            pagination: null,
          }
        },
      )
    },

    async getRequirement(context, input) {
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

    async manageRequirement(context, input) {
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
            if (!payload?.areaId || !payload.description) {
              throw internalError(
                'Create operation requires requirement.areaId and requirement.description',
              )
            }

            await ensureAreaExists(db, payload.areaId)
            const created = await createRequirement(db, {
              acceptanceCriteria: payload.acceptanceCriteria,
              createdBy: payload.createdBy ?? context.actor.id ?? undefined,
              description: payload.description,
              requirementAreaId: payload.areaId,
              requirementCategoryId: payload.categoryId,
              qualityCharacteristicId: payload.qualityCharacteristicId,
              requirementTypeId: payload.typeId,
              requiresTesting: payload.requiresTesting,
              verificationMethod: payload.verificationMethod,
              scenarioIds: payload.scenarioIds,
            })
            await syncReferences(db, created.version.id, payload.references)

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
            if (!payload?.description) {
              throw internalError(
                'Edit operation requires requirement.description',
              )
            }

            await ensureAreaExists(db, payload.areaId)
            const version = await editRequirement(db, requirementId, {
              acceptanceCriteria: payload.acceptanceCriteria,
              createdBy: payload.createdBy ?? context.actor.id ?? undefined,
              description: payload.description,
              requirementAreaId: payload.areaId,
              requirementCategoryId: payload.categoryId,
              qualityCharacteristicId: payload.qualityCharacteristicId,
              requirementTypeId: payload.typeId,
              requiresTesting: payload.requiresTesting,
              verificationMethod: payload.verificationMethod,
              scenarioIds: payload.scenarioIds,
            })
            await syncReferences(db, version.id, payload.references)
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
            await initiateArchiving(
              db,
              requirementId,
              context.actor.id ?? undefined,
            )
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
            await approveArchiving(
              db,
              requirementId,
              context.actor.id ?? undefined,
            )
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
            await cancelArchiving(
              db,
              requirementId,
              context.actor.id ?? undefined,
            )
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
            const result = await deleteDraftVersion(db, requirementId)
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
            await reactivateRequirement(
              db,
              requirementId,
              context.actor.id ?? undefined,
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

          const restored = await restoreVersion(
            db,
            requirementId,
            version.id,
            context.actor.id ?? undefined,
          )

          if (input.requirement?.references) {
            await syncReferences(db, restored.id, input.requirement.references)
          }

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

    async transitionRequirement(context, input) {
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
          await transitionStatus(
            db,
            requirementId,
            input.toStatusId,
            context.actor.id ?? undefined,
          )
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

    async listPackages(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'list_packages',
          nameSearch: input.nameSearch,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.list_packages',
        {
          name_search: input.nameSearch,
        },
        async () => {
          let packages = await listPackages(db)
          if (input.nameSearch) {
            const q = input.nameSearch.toLowerCase()
            packages = packages.filter(p => p.name.toLowerCase().includes(q))
          }

          const summary =
            locale === 'sv'
              ? packages.length === 0
                ? 'Inga kravpaket hittades.'
                : `Hittade ${packages.length} ${getPackageWord(locale, packages.length)}.`
              : packages.length === 0
                ? 'No packages found.'
                : `Found ${packages.length} ${getPackageWord(locale, packages.length)}.`

          return {
            message: createServiceMessage(
              getPackageServiceTitle('list', locale),
              [summary],
              responseFormat,
            ),
            packages: packages.map(p => ({
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
            })),
          }
        },
      )
    },

    async getPackageItems(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'get_package_items',
          packageId: input.packageId,
          packageSlug: input.packageSlug,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.get_package_items',
        {
          description_search: input.descriptionSearch,
          package_id: input.packageId,
          package_slug: input.packageSlug,
        },
        async () => {
          const packageId = await resolvePackageIdOrThrow(db, input)
          let items = await listPackageItems(db, packageId)
          if (input.descriptionSearch) {
            const q = input.descriptionSearch.toLowerCase()
            items = items.filter(item =>
              item.version.description?.toLowerCase().includes(q),
            )
          }

          const ref = getPackageReferenceLabel(input, packageId)
          const summary =
            locale === 'sv'
              ? `Hittade ${items.length} ${getRequirementWord(locale, items.length)} i paket ${ref}.`
              : `Found ${items.length} ${getRequirementWord(locale, items.length)} in package ${ref}.`

          return {
            items: items.map(item => ({
              area: item.area?.name ?? null,
              category: localizeName(
                {
                  nameEn: item.version.categoryNameEn,
                  nameSv: item.version.categoryNameSv,
                },
                locale,
              ),
              description: item.version.description,
              id: item.id,
              needsReference: item.needsReference,
              status: localizeName(
                {
                  nameEn: item.version.statusNameEn,
                  nameSv: item.version.statusNameSv,
                },
                locale,
              ),
              type: localizeName(
                {
                  nameEn: item.version.typeNameEn,
                  nameSv: item.version.typeNameSv,
                },
                locale,
              ),
              uniqueId: item.uniqueId,
            })),
            message: createServiceMessage(
              getPackageServiceTitle('items', locale),
              [summary],
              responseFormat,
            ),
            packageId,
          }
        },
      )
    },

    async addToPackage(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'add_to_package',
          packageId: input.packageId,
          packageSlug: input.packageSlug,
          requirementIds: input.requirementIds,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.add_to_package',
        {
          package_id: input.packageId,
          package_slug: input.packageSlug,
          requirement_count: input.requirementIds.length,
        },
        async () => {
          const packageId = await resolvePackageIdOrThrow(db, input)
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
            let needsReferenceId: number | null = null
            if (input.needsReferenceText) {
              needsReferenceId = await getOrCreatePackageNeedsReference(
                db,
                packageId,
                input.needsReferenceText,
              )
            }
            addedCount = await linkRequirementsToPackage(
              db,
              packageId,
              succeeded.map(r => ({
                needsReferenceId,
                requirementId: r.id,
                requirementVersionId: r.versionId,
              })),
            )
          }

          const ref = getPackageReferenceLabel(input, packageId)
          const skippedIds = skipped.map(r => r.id)
          const lines: string[] = [
            locale === 'sv'
              ? `Lade till ${addedCount} ${getRequirementWord(locale, addedCount)} i paket ${ref}.`
              : `Added ${addedCount} ${getRequirementWord(locale, addedCount)} to package ${ref}.`,
          ]
          if (skippedIds.length > 0) {
            lines.push(
              locale === 'sv'
                ? `Hoppade over ${skippedIds.length} ${getRequirementWord(locale, skippedIds.length)} utan publicerad version: ${skippedIds.join(', ')}.`
                : `Skipped ${skippedIds.length} ${getRequirementWord(locale, skippedIds.length)} with no published version: ${skippedIds.join(', ')}.`,
            )
          }
          return {
            addedCount,
            message: createServiceMessage(
              getPackageServiceTitle('add', locale),
              lines,
              responseFormat,
            ),
            skippedCount: skippedIds.length,
            skippedIds,
          }
        },
      )
    },

    async removeFromPackage(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'remove_from_package',
          packageId: input.packageId,
          packageSlug: input.packageSlug,
          requirementIds: input.requirementIds,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.remove_from_package',
        {
          package_id: input.packageId,
          package_slug: input.packageSlug,
          requirement_count: input.requirementIds.length,
        },
        async () => {
          const packageId = await resolvePackageIdOrThrow(db, input)
          const removedCount = await unlinkRequirementsFromPackage(
            db,
            packageId,
            input.requirementIds,
          )
          const ref = getPackageReferenceLabel(input, packageId)
          const summary =
            locale === 'sv'
              ? `Tog bort ${removedCount} ${getRequirementWord(locale, removedCount)} fran paket ${ref}.`
              : `Removed ${removedCount} ${getRequirementWord(locale, removedCount)} from package ${ref}.`
          return {
            message: createServiceMessage(
              getPackageServiceTitle('remove', locale),
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

export type RequirementsServiceFactory = ReturnType<
  typeof createRequirementsService
>

export function toResponseFormat(format?: string): ResponseFormat {
  return format === 'json' ? 'json' : 'markdown'
}

export function toResponseLocale(locale?: string): ResponseLocale {
  return locale === 'sv' ? 'sv' : 'en'
}

export function toHttpErrorPayload(error: unknown) {
  if (isRequirementsServiceError(error)) {
    return {
      body: {
        code: error.code,
        details: error.details,
        error: error.message,
      },
      status: error.status,
    }
  }

  const normalized = internalError(
    error instanceof Error ? error.message : 'An internal error occurred',
  )
  return {
    body: {
      code: normalized.code,
      details: normalized.details,
      error: normalized.message,
    },
    status: normalized.status,
  }
}
