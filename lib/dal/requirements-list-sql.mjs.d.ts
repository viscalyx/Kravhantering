import type {
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'

export const STATUS_DRAFT: number
export const STATUS_REVIEW: number
export const STATUS_PUBLISHED: number
export const STATUS_ARCHIVED: number

export interface ListRequirementsOptions {
  areaIds?: number[]
  categoryIds?: number[]
  descriptionSearch?: string
  includeArchived?: boolean
  limit?: number
  locale?: 'en' | 'sv'
  normReferenceIds?: number[]
  offset?: number
  qualityCharacteristicIds?: number[]
  requirementPackageIds?: number[]
  requiresTesting?: boolean[]
  riskLevelIds?: number[]
  sortBy?: RequirementSortField
  sortDirection?: RequirementSortDirection
  statuses?: number[]
  typeIds?: number[]
  uniqueIdSearch?: string
}

export interface RequirementListSql {
  parameters: unknown[]
  sqlText: string
}

export function escapeLike(value: unknown): string
export function buildRequirementListSql(
  opts?: ListRequirementsOptions,
): RequirementListSql
export function buildRequirementCountSql(
  opts?: ListRequirementsOptions,
): RequirementListSql
