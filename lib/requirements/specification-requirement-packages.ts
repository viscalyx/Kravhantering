import {
  listSpecificationRequirementPackagePage,
  resolveSpecificationRequirementPackages,
  type SpecificationRequirementPackageRow,
} from '@/lib/dal/requirement-packages'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import {
  assertSpecificationRequirementPackageCursorMatches,
  decodeSpecificationRequirementPackageCursor,
  encodeSpecificationRequirementPackageCursor,
  fingerprintSpecificationRequirementPackageQuery,
} from '@/lib/requirements/specification-requirement-package-cursor'

export const DEFAULT_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT = 50
export const MAX_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT = 100
export const MAX_SPECIFICATION_REQUIREMENT_PACKAGE_INCLUDE_IDS = 200

export interface SpecificationRequirementPackagePageInput {
  cursor?: string
  includeIds?: number[]
  limit?: number
  search?: string
  specificationId: number
}

export interface SpecificationRequirementPackagePageResult {
  pagination: {
    count: number
    hasMore: boolean
    limit: number
    nextCursor: string | null
  }
  requirementPackages: SpecificationRequirementPackageRow[]
  selectedRequirementPackages: SpecificationRequirementPackageRow[]
}

function normalizeLimit(value: number | undefined): number {
  if (value == null) {
    return DEFAULT_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT
  }
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT
  ) {
    throw validationError('Expected limit to be an integer from 1 to 100')
  }
  return value
}

function normalizeIncludeIds(values: number[] | undefined): number[] {
  if (!values) return []
  if (
    values.length > MAX_SPECIFICATION_REQUIREMENT_PACKAGE_INCLUDE_IDS ||
    values.some(value => !Number.isInteger(value) || value < 1)
  ) {
    throw validationError(
      'Expected at most 200 unique positive requirement package IDs',
    )
  }
  const ids = [...new Set(values)].sort((left, right) => left - right)
  if (ids.length !== values.length) {
    throw validationError(
      'Expected at most 200 unique positive requirement package IDs',
    )
  }
  return ids
}

function normalizeSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/gu, ' ')
  return normalized || undefined
}

export async function querySpecificationRequirementPackagePage(
  db: SqlServerDatabase,
  input: SpecificationRequirementPackagePageInput,
): Promise<SpecificationRequirementPackagePageResult> {
  const includeIds = normalizeIncludeIds(input.includeIds)
  const limit = normalizeLimit(input.limit)
  const search = normalizeSearch(input.search)
  const queryFingerprint = fingerprintSpecificationRequirementPackageQuery({
    search,
    specificationId: input.specificationId,
  })
  const cursor = input.cursor
    ? decodeSpecificationRequirementPackageCursor(input.cursor)
    : undefined
  if (cursor) {
    assertSpecificationRequirementPackageCursorMatches(cursor, queryFingerprint)
  }

  const [rows, selectedRequirementPackages] = await Promise.all([
    listSpecificationRequirementPackagePage(db, input.specificationId, {
      after: cursor?.boundary,
      limit: limit + 1,
      search,
    }),
    resolveSpecificationRequirementPackages(
      db,
      input.specificationId,
      includeIds,
    ),
  ])
  const hasMore = rows.length > limit
  const requirementPackages = hasMore ? rows.slice(0, limit) : rows
  const boundary = requirementPackages.at(-1)

  return {
    pagination: {
      count: requirementPackages.length,
      hasMore,
      limit,
      nextCursor:
        hasMore && boundary
          ? encodeSpecificationRequirementPackageCursor(
              { id: boundary.id, name: boundary.name },
              queryFingerprint,
            )
          : null,
    },
    requirementPackages,
    selectedRequirementPackages,
  }
}
