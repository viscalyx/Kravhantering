import type {
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'

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
