import {
  enrichSpecificationItemPage,
  listSpecificationItemPageCandidates,
} from '@/lib/dal/specification-item-page'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  REQUIREMENT_SORT_FIELDS,
  type RequirementRow,
  type RequirementSortDirection,
  type RequirementSortField,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import {
  assertSpecificationItemPageCursorMatches,
  decodeSpecificationItemPageCursor,
  encodeSpecificationItemPageCursor,
  fingerprintSpecificationItemPageQuery,
} from '@/lib/requirements/specification-item-page-cursor'

export const DEFAULT_SPECIFICATION_ITEM_PAGE_LIMIT = 50
export const MAX_SPECIFICATION_ITEM_PAGE_LIMIT = 100

export interface SpecificationItemPageInput {
  cursor?: string
  filters?: FilterValues
  limit?: number
  locale?: 'en' | 'sv'
  sort?: RequirementSortState
  specificationId: number
}

export interface SpecificationItemPageResult {
  items: RequirementRow[]
  pagination: {
    count: number
    hasMore: boolean
    limit: number
    nextCursor: string | null
  }
}

function normalizeIds(values: number[] | undefined): number[] | undefined {
  if (!values?.length) return undefined
  const ids = [
    ...new Set(values.filter(value => Number.isInteger(value) && value > 0)),
  ].sort((left, right) => left - right)
  return ids.length ? ids : undefined
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeBooleans(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  const normalized = [
    ...new Set(values.filter(value => value === 'true' || value === 'false')),
  ].sort()
  return normalized.length ? normalized : undefined
}

export function normalizeSpecificationItemFilters(
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
    verifiable: normalizeBooleans(filters?.verifiable),
  }
}

function normalizeLimit(value: number | undefined): number {
  if (value == null) return DEFAULT_SPECIFICATION_ITEM_PAGE_LIMIT
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SPECIFICATION_ITEM_PAGE_LIMIT
  ) {
    throw validationError('Expected limit to be an integer from 1 to 100')
  }
  return value
}

function normalizeSort(sort: RequirementSortState | undefined): {
  by: RequirementSortField
  direction: RequirementSortDirection
} {
  const value = sort ?? DEFAULT_REQUIREMENT_SORT
  if (!REQUIREMENT_SORT_FIELDS.includes(value.by)) {
    throw validationError('Expected a supported specification item sort field')
  }
  if (value.direction !== 'asc' && value.direction !== 'desc') {
    throw validationError('Expected sort direction to be asc or desc')
  }
  return value
}

export async function querySpecificationItemPage(
  db: SqlServerDatabase,
  input: SpecificationItemPageInput,
): Promise<SpecificationItemPageResult> {
  const filters = normalizeSpecificationItemFilters(input.filters)
  const limit = normalizeLimit(input.limit)
  const locale = input.locale ?? 'en'
  const sort = normalizeSort(input.sort)
  const queryFingerprint = fingerprintSpecificationItemPageQuery({
    filters,
    locale,
    sort,
    specificationId: input.specificationId,
  })
  const cursor = input.cursor
    ? decodeSpecificationItemPageCursor(input.cursor)
    : undefined
  if (cursor) {
    assertSpecificationItemPageCursorMatches(cursor, queryFingerprint)
  }

  const candidates = await listSpecificationItemPageCandidates(db, {
    after: cursor?.boundary,
    filters,
    limit: limit + 1,
    locale,
    sortBy: sort.by,
    sortDirection: sort.direction,
    specificationId: input.specificationId,
  })
  const hasMore = candidates.length > limit
  const selectedCandidates = hasMore ? candidates.slice(0, limit) : candidates
  const items = await enrichSpecificationItemPage(
    db,
    input.specificationId,
    selectedCandidates,
  )
  const boundary = selectedCandidates.at(-1)

  return {
    items,
    pagination: {
      count: items.length,
      hasMore,
      limit,
      nextCursor:
        hasMore && boundary
          ? encodeSpecificationItemPageCursor(boundary, queryFingerprint)
          : null,
    },
  }
}
