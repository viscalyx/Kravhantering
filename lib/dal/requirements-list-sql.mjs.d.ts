import type {
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'

export interface ListRequirementsOptions {
  after?: {
    nullRank: number
    requirementId: number
    sortValue: number | string | null
  }
  areaIds?: number[]
  categoryIds?: number[]
  descriptionSearch?: string
  includeArchived?: boolean
  limit?: number
  locale?: 'en' | 'sv'
  normReferenceIds?: number[]
  priorityLevelIds?: number[]
  qualityCharacteristicIds?: number[]
  requirementPackageIds?: number[]
  search?: string
  sortBy?: RequirementSortField
  sortDirection?: RequirementSortDirection
  statuses?: number[]
  typeIds?: number[]
  uniqueIdSearch?: string
  verifiable?: boolean[]
}

export interface RequirementListSql {
  parameters: unknown[]
  sqlText: string
}

export const REQUIREMENT_LIST_TEXT_SORT_KEY_LENGTH: number
export function escapeLike(value: unknown): string
export function buildRequirementListSql(
  opts?: ListRequirementsOptions,
): RequirementListSql
