import {
  type ListRequirementsOptions,
  listRequirements,
} from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import {
  internalError,
  isRequirementsServiceError,
  unauthorizedError,
} from '@/lib/requirements/errors'
import {
  assertRequirementListCursorMatches,
  decodeRequirementListCursor,
  encodeRequirementListCursor,
  fingerprintRequirementListQuery,
} from '@/lib/requirements/list-cursor'
import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  REQUIREMENT_SORT_FIELDS,
  type RequirementSortDirection,
  type RequirementSortField,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import {
  formatRequirementListItem,
  type RequirementListItem,
} from '@/lib/requirements/service'
import { STATUS_ARCHIVED } from '@/lib/requirements/status-constants.mjs'
import { resolveRequirementListVisibility } from '@/lib/requirements/visibility'

export const DEFAULT_REQUIREMENT_LIST_PAGE_LIMIT = 200
export const MAX_REQUIREMENT_LIST_PAGE_LIMIT = 200
export const REQUIREMENT_COMPLETE_RESULT_PAGE_SIZE = 200
export const MAX_COMPLETE_REQUIREMENT_LIST_PAGES = 10_000

export interface RequirementListPagination {
  count: number
  hasMore: boolean
  limit: number
  nextCursor: string | null
}

export interface RequirementListSearchMatch {
  matchedFields: string[]
}

export type RequirementListPageItem = RequirementListItem & {
  match?: RequirementListSearchMatch
}

export interface RequirementListQueryResult {
  pagination: RequirementListPagination
  requirements: RequirementListPageItem[]
}

export interface RequirementListQueryInput {
  capacityOperation?: 'list' | 'search'
  capacitySurface?: 'editor-preload' | 'mcp' | 'rest'
  cursor?: string
  excludeRequirementIds?: number[]
  filters?: FilterValues
  includeArchived?: boolean
  limit?: number
  locale?: 'en' | 'sv'
  requirementIds?: number[]
  search?: string
  sort?: RequirementSortState
}

export interface RequirementListQueryAuthorization {
  allowUnauthenticated?: boolean
  authorization?: AuthorizationService
  context?: RequestContext
}

export interface CompleteRequirementListTraversal {
  itemCount: number
  pageCount: number
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_REQUIREMENT_LIST_PAGE_LIMIT
  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_REQUIREMENT_LIST_PAGE_LIMIT), 1),
    MAX_REQUIREMENT_LIST_PAGE_LIMIT,
  )
}

function normalizeIds(values: number[] | undefined): number[] | undefined {
  if (!values?.length) return undefined
  const ids = [
    ...new Set(values.filter(value => Number.isInteger(value) && value > 0)),
  ].sort((left, right) => left - right)
  return ids.length ? ids : undefined
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/gu, ' ')
  return normalized || undefined
}

function normalizeBooleans(
  values: string[] | undefined,
): boolean[] | undefined {
  if (!values?.length) return undefined
  const normalized = [
    ...new Set(
      values.flatMap(value =>
        value === 'true' ? [true] : value === 'false' ? [false] : [],
      ),
    ),
  ].sort((left, right) => Number(left) - Number(right))
  return normalized.length ? normalized : undefined
}

export function normalizeRequirementListFilters(
  filters: FilterValues | undefined,
): FilterValues {
  return {
    areaIds: normalizeIds(filters?.areaIds),
    categoryIds: normalizeIds(filters?.categoryIds),
    descriptionSearch: normalizeText(filters?.descriptionSearch),
    needsReferenceIds: normalizeIds(filters?.needsReferenceIds),
    normReferenceIds: normalizeIds(filters?.normReferenceIds),
    priorityLevelIds: normalizeIds(filters?.priorityLevelIds),
    qualityCharacteristicIds: normalizeIds(filters?.qualityCharacteristicIds),
    requirementPackageIds: normalizeIds(filters?.requirementPackageIds),
    specificationItemStatusIds: normalizeIds(
      filters?.specificationItemStatusIds,
    ),
    statuses: normalizeIds(filters?.statuses),
    typeIds: normalizeIds(filters?.typeIds),
    uniqueIdSearch: normalizeText(filters?.uniqueIdSearch),
    verifiable: filters?.verifiable
      ? normalizeBooleans(filters.verifiable)?.map(String)
      : undefined,
  }
}

function normalizeSort(sort: RequirementSortState | undefined): {
  by: RequirementSortField
  direction: RequirementSortDirection
} {
  const normalized = sort ?? DEFAULT_REQUIREMENT_SORT
  return {
    by: REQUIREMENT_SORT_FIELDS.includes(normalized.by)
      ? normalized.by
      : DEFAULT_REQUIREMENT_SORT.by,
    direction:
      normalized.direction === 'desc' || normalized.direction === 'asc'
        ? normalized.direction
        : DEFAULT_REQUIREMENT_SORT.direction,
  }
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

function capacitySource(
  options: RequirementListQueryAuthorization | undefined,
): 'mcp' | 'rest' | 'server' {
  return options?.context?.source ?? 'server'
}

function capacityStatus(error: unknown): number {
  return isRequirementsServiceError(error) ? error.status : 500
}

export async function queryRequirementList(
  db: SqlServerDatabase,
  input: RequirementListQueryInput = {},
  authorizationOptions?: RequirementListQueryAuthorization,
): Promise<RequirementListQueryResult> {
  const startedAt = Date.now()

  try {
    await authorizeRequirementListQuery(authorizationOptions)

    const filters = normalizeRequirementListFilters(input.filters)
    const limit = normalizeLimit(input.limit)
    const locale = input.locale ?? 'en'
    const sort = normalizeSort(input.sort)
    const statuses = normalizeIds(filters.statuses)
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
      areaIds: normalizeIds(filters.areaIds),
      categoryIds: normalizeIds(filters.categoryIds),
      descriptionSearch: normalizeText(filters.descriptionSearch),
      excludeRequirementIds: normalizeIds(input.excludeRequirementIds),
      includeArchived,
      limit: limit + 1,
      locale,
      normReferenceIds: normalizeIds(filters.normReferenceIds),
      priorityLevelIds: normalizeIds(filters.priorityLevelIds),
      ...visibility,
      qualityCharacteristicIds: normalizeIds(filters.qualityCharacteristicIds),
      requirementIds: normalizeIds(input.requirementIds),
      requirementPackageIds: normalizeIds(filters.requirementPackageIds),
      search: normalizeText(input.search),
      sortBy: sort.by,
      sortDirection: sort.direction,
      statuses,
      typeIds: normalizeIds(filters.typeIds),
      uniqueIdSearch: normalizeText(filters.uniqueIdSearch),
      verifiable: normalizeBooleans(filters.verifiable),
    }
    const { limit: _pageLimit, ...queryIdentity } = query
    const queryFingerprint = fingerprintRequirementListQuery(queryIdentity)

    if (input.cursor) {
      const cursor = decodeRequirementListCursor(input.cursor)
      assertRequirementListCursorMatches(cursor, queryFingerprint)
      query.after = cursor.boundary
    }

    const rows = await listRequirements(db, query)
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const requirements = pageRows.map(row => {
      const requirement = formatRequirementListItem(row)
      return query.search
        ? {
            ...requirement,
            match: { matchedFields: row.matchedFields },
          }
        : requirement
    })
    const boundary = pageRows.at(-1)?.cursorBoundary
    const result: RequirementListQueryResult = {
      pagination: {
        count: requirements.length,
        hasMore,
        limit,
        nextCursor:
          hasMore && boundary
            ? encodeRequirementListCursor(boundary, queryFingerprint)
            : null,
      },
      requirements,
    }

    if (input.capacitySurface) {
      recordCapacityEvent({
        correlationId: authorizationOptions?.context?.correlationId,
        durationMs: Date.now() - startedAt,
        event: 'capacity.operation.completed',
        metrics: {
          continuation_available: result.pagination.hasMore,
          page_limit: result.pagination.limit,
          returned_count: result.pagination.count,
        },
        operation: `requirements.library_page.${input.capacityOperation ?? 'list'}`,
        outcome: 'success',
        requestId: authorizationOptions?.context?.requestId,
        source: capacitySource(authorizationOptions),
        statusCode: 200,
        surface: input.capacitySurface,
        toolName: authorizationOptions?.context?.toolName,
      })
    }
    return result
  } catch (error) {
    if (input.capacitySurface) {
      recordCapacityEvent({
        correlationId: authorizationOptions?.context?.correlationId,
        ...(isRequirementsServiceError(error) && error.code === 'invalid_cursor'
          ? { cursorFailureCategory: 'invalid_cursor' as const }
          : {}),
        durationMs: Date.now() - startedAt,
        event: 'capacity.operation.failed',
        level: capacityStatus(error) < 500 ? 'warn' : 'error',
        operation: `requirements.library_page.${input.capacityOperation ?? 'list'}`,
        outcome: 'failure',
        requestId: authorizationOptions?.context?.requestId,
        source: capacitySource(authorizationOptions),
        statusCode: capacityStatus(error),
        surface: input.capacitySurface,
        toolName: authorizationOptions?.context?.toolName,
      })
    }
    throw error
  }
}

export async function traverseCompleteRequirementList(
  db: SqlServerDatabase,
  input: Omit<RequirementListQueryInput, 'cursor' | 'limit'>,
  authorizationOptions: RequirementListQueryAuthorization,
  visitPage: (
    requirements: RequirementListPageItem[],
    pageNumber: number,
  ) => Promise<void> | void,
): Promise<CompleteRequirementListTraversal> {
  const seenCursors = new Set<string>()
  const seenRequirementIds = new Set<number>()
  let cursor: string | undefined
  let itemCount = 0

  for (
    let pageNumber = 1;
    pageNumber <= MAX_COMPLETE_REQUIREMENT_LIST_PAGES;
    pageNumber += 1
  ) {
    const page = await queryRequirementList(
      db,
      {
        ...input,
        cursor,
        limit: REQUIREMENT_COMPLETE_RESULT_PAGE_SIZE,
      },
      authorizationOptions,
    )
    if (page.pagination.count !== page.requirements.length) {
      throw internalError('Requirement traversal returned a bad count', {
        reason: 'complete_result_count_mismatch',
      })
    }
    if (page.pagination.hasMore && page.requirements.length === 0) {
      throw internalError('Requirement traversal did not make progress', {
        reason: 'complete_result_empty_page',
      })
    }
    for (const requirement of page.requirements) {
      if (seenRequirementIds.has(requirement.id)) {
        throw internalError(
          'Requirement traversal returned a duplicate stable identifier',
          { reason: 'complete_result_duplicate_requirement' },
        )
      }
      seenRequirementIds.add(requirement.id)
    }

    await visitPage(page.requirements, pageNumber)
    itemCount += page.requirements.length
    if (!page.pagination.hasMore) {
      return { itemCount, pageCount: pageNumber }
    }

    const nextCursor = page.pagination.nextCursor
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw internalError(
        'Requirement traversal returned a cyclic continuation',
        { reason: 'complete_result_cursor_cycle' },
      )
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  throw internalError('Requirement traversal exceeded its page bound', {
    reason: 'complete_result_page_bound',
  })
}
