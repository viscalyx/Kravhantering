import type { ApplicationSettings } from '@/lib/application-settings'

export const REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES = 10 * 1024 * 1024
export const REQUIREMENT_IMPORT_CONTENT_MAX_BYTES = 8 * 1024 * 1024
export const REQUIREMENT_IMPORT_CONCURRENCY_PER_NODE = 2
export const REQUIREMENT_IMPORT_DATABASE_BATCH_SIZE = 50

export interface RequirementImportBudget {
  maxJsonDepth: number
  maxNestedItems: number
  maxProposedNeedsReferences: number
  maxProposedNormReferences: number
  maxRows: number
}

export type RequirementImportBudgetSettings = Pick<
  ApplicationSettings,
  | 'requirementImportMaxJsonDepth'
  | 'requirementImportMaxNestedItems'
  | 'requirementImportMaxProposedNeedsReferences'
  | 'requirementImportMaxProposedNormReferences'
  | 'requirementImportMaxRows'
>

export const DEFAULT_REQUIREMENT_IMPORT_BUDGET: RequirementImportBudget =
  Object.freeze({
    maxJsonDepth: 8,
    maxNestedItems: 200,
    maxProposedNeedsReferences: 500,
    maxProposedNormReferences: 500,
    maxRows: 500,
  })

export const REQUIREMENT_IMPORT_BUDGET_CEILING =
  DEFAULT_REQUIREMENT_IMPORT_BUDGET

export type RequirementImportBudgetIssueCode =
  | 'import_json_depth_cap_exceeded'
  | 'import_nested_collection_cap_exceeded'
  | 'import_proposed_needs_reference_count_cap_exceeded'
  | 'import_proposed_norm_reference_count_cap_exceeded'
  | 'import_row_count_cap_exceeded'

export interface RequirementImportBudgetIssue {
  actual: number
  code: RequirementImportBudgetIssueCode
  limit: number
  path: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getJsonDepth(value: unknown): number {
  if (Array.isArray(value)) {
    return (
      1 +
      value.reduce<number>(
        (depth, item) => Math.max(depth, getJsonDepth(item)),
        0,
      )
    )
  }
  if (isRecord(value)) {
    return (
      1 +
      Object.values(value).reduce<number>(
        (depth, item) => Math.max(depth, getJsonDepth(item)),
        0,
      )
    )
  }
  return 0
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function findLargestNestedRowCollection(value: unknown): {
  length: number
  path: string
} {
  const record = isRecord(value) ? value : {}
  const usesReviewRows =
    !Array.isArray(record.requirements) && Array.isArray(record.rows)
  const rows: unknown[] = Array.isArray(record.requirements)
    ? record.requirements
    : Array.isArray(record.rows)
      ? record.rows
      : []
  const rowCollectionPath = usesReviewRows ? '/rows' : '/requirements'
  let largest = { length: 0, path: '' }

  function visit(item: unknown, path: string): void {
    if (Array.isArray(item)) {
      if (item.length > largest.length) {
        largest = { length: item.length, path }
      }
      for (const [index, nested] of item.entries()) {
        visit(nested, `${path}/${index}`)
      }
      return
    }
    if (!isRecord(item)) return
    for (const [key, nested] of Object.entries(item)) {
      visit(nested, `${path}/${key}`)
    }
  }

  for (const [index, row] of rows.entries()) {
    if (!isRecord(row)) continue
    for (const [key, nested] of Object.entries(row)) {
      visit(nested, `${rowCollectionPath}/${index}/${key}`)
    }
  }
  return largest
}

export function validateImportContentBudget(
  value: unknown,
  budget: RequirementImportBudget,
): RequirementImportBudgetIssue[] {
  const issues: RequirementImportBudgetIssue[] = []
  const record = isRecord(value) ? value : {}
  const rows = Array.isArray(record.requirements)
    ? record.requirements
    : Array.isArray(record.rows)
      ? record.rows
      : []
  if (rows.length > budget.maxRows) {
    issues.push({
      actual: rows.length,
      code: 'import_row_count_cap_exceeded',
      limit: budget.maxRows,
      path: Array.isArray(record.rows) ? '/rows' : '/requirements',
    })
  }

  const proposedNormReferenceCount = arrayLength(record.proposedNormReferences)
  if (proposedNormReferenceCount > budget.maxProposedNormReferences) {
    issues.push({
      actual: proposedNormReferenceCount,
      code: 'import_proposed_norm_reference_count_cap_exceeded',
      limit: budget.maxProposedNormReferences,
      path: '/proposedNormReferences',
    })
  }

  const proposedNeedsReferenceCount = arrayLength(
    record.proposedNeedsReferences,
  )
  if (proposedNeedsReferenceCount > budget.maxProposedNeedsReferences) {
    issues.push({
      actual: proposedNeedsReferenceCount,
      code: 'import_proposed_needs_reference_count_cap_exceeded',
      limit: budget.maxProposedNeedsReferences,
      path: '/proposedNeedsReferences',
    })
  }

  const largestNestedCollection = findLargestNestedRowCollection(value)
  if (largestNestedCollection.length > budget.maxNestedItems) {
    issues.push({
      actual: largestNestedCollection.length,
      code: 'import_nested_collection_cap_exceeded',
      limit: budget.maxNestedItems,
      path: largestNestedCollection.path,
    })
  }

  const depth = getJsonDepth(value)
  if (depth > budget.maxJsonDepth) {
    issues.push({
      actual: depth,
      code: 'import_json_depth_cap_exceeded',
      limit: budget.maxJsonDepth,
      path: '',
    })
  }
  return issues
}

export function requirementImportBudgetFromSettings(
  settings: RequirementImportBudgetSettings,
): RequirementImportBudget {
  return Object.freeze({
    maxJsonDepth: settings.requirementImportMaxJsonDepth,
    maxNestedItems: settings.requirementImportMaxNestedItems,
    maxProposedNeedsReferences:
      settings.requirementImportMaxProposedNeedsReferences,
    maxProposedNormReferences:
      settings.requirementImportMaxProposedNormReferences,
    maxRows: settings.requirementImportMaxRows,
  })
}

export function requirementImportBudgetFingerprint(
  budget: RequirementImportBudget,
): string {
  return [
    'requirement-import-budget.v1',
    budget.maxRows,
    budget.maxProposedNormReferences,
    budget.maxProposedNeedsReferences,
    budget.maxNestedItems,
    budget.maxJsonDepth,
  ].join(':')
}
