import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
  type RequirementImportBudget,
} from '@/lib/requirements/import-budget'

export interface RequirementImportFileLike {
  size: number
  text(): Promise<string>
}

export class RequirementImportClientBudgetError extends Error {
  readonly code = 'import_content_bytes_exceeded'

  constructor() {
    super('Requirement import content exceeds the 8 MiB limit')
    this.name = 'RequirementImportClientBudgetError'
  }
}

export function assertRequirementImportTextSize(text: string): void {
  if (
    new TextEncoder().encode(text).byteLength >
    REQUIREMENT_IMPORT_CONTENT_MAX_BYTES
  ) {
    throw new RequirementImportClientBudgetError()
  }
}

export async function readRequirementImportFile(
  file: RequirementImportFileLike,
): Promise<string> {
  if (file.size > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES) {
    throw new RequirementImportClientBudgetError()
  }
  const text = await file.text()
  assertRequirementImportTextSize(text)
  return text
}

export function readRequirementImportBudgetFromJsonSchema(
  schema: unknown,
): RequirementImportBudget {
  return (
    parseRequirementImportBudgetFromJsonSchema(schema) ??
    DEFAULT_REQUIREMENT_IMPORT_BUDGET
  )
}

export function parseRequirementImportBudgetFromJsonSchema(
  schema: unknown,
): RequirementImportBudget | null {
  if (typeof schema !== 'object' || schema === null) {
    return null
  }
  const candidate = (schema as Record<string, unknown>)[
    'x-requirement-import-budget'
  ]
  if (typeof candidate !== 'object' || candidate === null) {
    return null
  }
  const budget = candidate as Record<string, unknown>
  const fields = [
    'maxJsonDepth',
    'maxNestedItems',
    'maxProposedNeedsReferences',
    'maxProposedNormReferences',
    'maxRows',
  ] as const
  if (
    fields.some(
      field =>
        !Number.isInteger(budget[field]) || (budget[field] as number) < 0,
    )
  ) {
    return null
  }
  return Object.freeze({
    maxJsonDepth: budget.maxJsonDepth as number,
    maxNestedItems: budget.maxNestedItems as number,
    maxProposedNeedsReferences: budget.maxProposedNeedsReferences as number,
    maxProposedNormReferences: budget.maxProposedNormReferences as number,
    maxRows: budget.maxRows as number,
  })
}
