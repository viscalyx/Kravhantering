import {
  countRequirements,
  type ListRequirementsOptions,
  listRequirements,
  STATUS_ARCHIVED,
} from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  createDefaultAuthorizationService,
  type RequestContext,
} from '@/lib/requirements/auth'
import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import {
  formatRequirementListItem,
  type RequirementListItem,
} from '@/lib/requirements/service'

export interface RequirementListPagination {
  count: number
  hasMore: boolean
  limit: number
  nextOffset: number | null
  offset: number
  total: number
}

export interface RequirementListQueryResult {
  pagination: RequirementListPagination
  requirements: RequirementListItem[]
}

export interface RequirementListQueryInput {
  filters?: FilterValues
  includeArchived?: boolean
  limit?: number
  locale?: 'en' | 'sv'
  offset?: number
  sort?: RequirementSortState
}

export interface RequirementListQueryAuthorization {
  authorization?: AuthorizationService
  context: RequestContext
}

const DEFAULT_LIMIT = 200
const MAX_PAGE_SIZE = 200

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE)
}

function clampOffset(offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0
  }

  return Math.max(Math.trunc(offset), 0)
}

async function authorizeRequirementListQuery(
  options?: RequirementListQueryAuthorization,
): Promise<void> {
  if (!options) return

  const authorization =
    options.authorization ?? createDefaultAuthorizationService()
  await authorization.assertAuthorized(
    { kind: 'query_catalog', catalog: 'requirements' },
    options.context,
  )
}

function toBooleans(values: string[] | undefined): boolean[] | undefined {
  if (!values || values.length === 0) return undefined
  const parsed = values
    .map(value => (value === 'true' ? true : value === 'false' ? false : null))
    .filter((value): value is boolean => value !== null)
  return parsed.length > 0 ? parsed : undefined
}

function toPositiveIntegerIds(values: number[] | undefined) {
  if (!values || values.length === 0) return undefined
  const ids = values.filter(value => Number.isInteger(value) && value > 0)
  return ids.length > 0 ? ids : undefined
}

export async function queryRequirementList(
  db: SqlServerDatabase,
  input: RequirementListQueryInput = {},
  authorizationOptions?: RequirementListQueryAuthorization,
): Promise<RequirementListQueryResult> {
  await authorizeRequirementListQuery(authorizationOptions)

  const filters = input.filters ?? {}
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT)
  const offset = clampOffset(input.offset ?? 0)
  const sort = input.sort ?? DEFAULT_REQUIREMENT_SORT
  const statuses = toPositiveIntegerIds(filters.statuses)
  const inferredIncludeArchived =
    !statuses?.length || statuses.includes(STATUS_ARCHIVED)
  const includeArchived = input.includeArchived ?? inferredIncludeArchived

  const query: ListRequirementsOptions = {
    areaIds: toPositiveIntegerIds(filters.areaIds),
    categoryIds: toPositiveIntegerIds(filters.categoryIds),
    descriptionSearch: filters.descriptionSearch,
    includeArchived,
    limit,
    locale: input.locale ?? 'en',
    normReferenceIds: toPositiveIntegerIds(filters.normReferenceIds),
    offset,
    qualityCharacteristicIds: toPositiveIntegerIds(
      filters.qualityCharacteristicIds,
    ),
    requirementPackageIds: toPositiveIntegerIds(filters.requirementPackageIds),
    requiresTesting: toBooleans(filters.requiresTesting),
    riskLevelIds: toPositiveIntegerIds(filters.riskLevelIds),
    sortBy: sort.by,
    sortDirection: sort.direction,
    statuses,
    typeIds: toPositiveIntegerIds(filters.typeIds),
    uniqueIdSearch: filters.uniqueIdSearch,
  }

  const [rows, total] = await Promise.all([
    listRequirements(db, query),
    countRequirements(db, query),
  ])
  const requirements = rows.map(formatRequirementListItem)
  const hasMore = offset + requirements.length < total

  return {
    pagination: {
      count: requirements.length,
      hasMore,
      limit,
      nextOffset: hasMore ? offset + requirements.length : null,
      offset,
      total,
    },
    requirements,
  }
}
