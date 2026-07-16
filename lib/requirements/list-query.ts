import {
  getRequirementListSeekAnchor,
  type ListRequirementsOptions,
  listRequirements,
} from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import {
  invalidCursorError,
  unauthorizedError,
} from '@/lib/requirements/errors'
import {
  assertRequirementListCursorMatches,
  decodeRequirementListCursor,
  encodeRequirementListCursor,
  hashRequirementListQuery,
} from '@/lib/requirements/list-cursor'
import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import {
  formatRequirementListItem,
  type RequirementListItem,
} from '@/lib/requirements/service'
import { STATUS_ARCHIVED } from '@/lib/requirements/status-constants.mjs'
import { resolveRequirementListVisibility } from '@/lib/requirements/visibility'

export interface RequirementListPagination {
  count: number
  hasMore: boolean
  limit: number
  nextCursor: string | null
}

export interface RequirementListQueryResult {
  pagination: RequirementListPagination
  requirements: RequirementListItem[]
}

export interface RequirementListQueryInput {
  cursor?: string
  excludeRequirementIds?: number[]
  filters?: FilterValues
  includeArchived?: boolean
  limit?: number
  locale?: 'en' | 'sv'
  requirementIds?: number[]
  sort?: RequirementSortState
}

export interface RequirementListQueryAuthorization {
  allowUnauthenticated?: boolean
  authorization?: AuthorizationService
  context?: RequestContext
}

const DEFAULT_LIMIT = 200
const MAX_PAGE_SIZE = 200

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE)
}

async function authorizeRequirementListQuery(
  options?: RequirementListQueryAuthorization,
): Promise<void> {
  if (options?.allowUnauthenticated === true) return

  if (!options) {
    throw unauthorizedError(
      'Authorization options are required for requirement list queries',
    )
  }

  if (!options.context) {
    throw unauthorizedError(
      'Authorization context is required for requirement list queries',
    )
  }

  if (!options.authorization) {
    throw unauthorizedError(
      'Authorization service is required for requirement list queries',
    )
  }

  await options.authorization.assertAuthorized(
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
  const sort = input.sort ?? DEFAULT_REQUIREMENT_SORT
  const statuses = toPositiveIntegerIds(filters.statuses)
  const inferredIncludeArchived =
    !statuses?.length || statuses.includes(STATUS_ARCHIVED)
  const includeArchived = input.includeArchived ?? inferredIncludeArchived
  const visibility =
    authorizationOptions?.allowUnauthenticated === true
      ? { publishedOnly: true }
      : authorizationOptions?.context
        ? await resolveRequirementListVisibility(
            db,
            authorizationOptions.context,
          )
        : {}

  const query: ListRequirementsOptions = {
    areaIds: toPositiveIntegerIds(filters.areaIds),
    categoryIds: toPositiveIntegerIds(filters.categoryIds),
    descriptionSearch: filters.descriptionSearch,
    excludeRequirementIds: toPositiveIntegerIds(input.excludeRequirementIds),
    includeArchived,
    limit: limit + 1,
    locale: input.locale ?? 'en',
    normReferenceIds: toPositiveIntegerIds(filters.normReferenceIds),
    ...visibility,
    qualityCharacteristicIds: toPositiveIntegerIds(
      filters.qualityCharacteristicIds,
    ),
    requirementIds: toPositiveIntegerIds(input.requirementIds),
    requirementPackageIds: toPositiveIntegerIds(filters.requirementPackageIds),
    verifiable: toBooleans(filters.verifiable),
    priorityLevelIds: toPositiveIntegerIds(filters.priorityLevelIds),
    sortBy: sort.by,
    sortDirection: sort.direction,
    statuses,
    typeIds: toPositiveIntegerIds(filters.typeIds),
    uniqueIdSearch: filters.uniqueIdSearch,
  }

  const queryHash = hashRequirementListQuery({
    ...query,
    limit,
  })
  if (input.cursor) {
    const cursor = decodeRequirementListCursor(input.cursor)
    assertRequirementListCursorMatches(cursor, queryHash)
    const anchor = await getRequirementListSeekAnchor(
      db,
      { ...query, limit: undefined },
      cursor.anchorRequirementId,
    )
    if (!anchor) {
      throw invalidCursorError()
    }
    query.after = anchor
  }

  const rows = await listRequirements(db, query)
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const requirements = pageRows.map(formatRequirementListItem)
  const lastRequirement = requirements.at(-1)

  return {
    pagination: {
      count: requirements.length,
      hasMore,
      limit,
      nextCursor:
        hasMore && lastRequirement
          ? encodeRequirementListCursor(lastRequirement.id, queryHash)
          : null,
    },
    requirements,
  }
}
