import type { RequirementImportDestinationKind } from '@/lib/ai/requirement-prompt'
import type { AppLocale } from '@/lib/locale-preference'
import {
  type RequirementsServiceError,
  validationError,
} from '@/lib/requirements/errors'
import type { McpImportInstructionDestinationRef } from '@/lib/requirements/import-service'

/**
 * Query parsing shared by the import instruction, AI request template, and
 * reference data routes, so that they reject the same parameters with the
 * same reason.
 *
 * The reason keeps its instruction name on purpose: Spec #1559 requires the
 * template and reference data routes to give the same reasons as the
 * instruction route.
 */
export const MISSING_IMPORT_DESTINATION_REASON =
  'missing_import_instruction_destination'

export function importLocaleFromQuery(
  searchParams: URLSearchParams,
): AppLocale {
  return searchParams.get('locale') === 'sv' ? 'sv' : 'en'
}

function positiveIntegerQueryValue(
  searchParams: URLSearchParams,
  name: string,
): number | null {
  const rawValue = searchParams.get(name)
  if (rawValue == null) return null
  const value = Number(rawValue)
  return Number.isInteger(value) && value > 0 ? value : null
}

function missingDestination(message: string): RequirementsServiceError {
  return validationError(message, {
    reason: MISSING_IMPORT_DESTINATION_REASON,
  })
}

/** Reads `kind` alone, for responses that do not depend on one destination. */
export function importDestinationKindFromQuery(
  searchParams: URLSearchParams,
  missingMessage: string,
): RequirementImportDestinationKind {
  const kind = searchParams.get('kind')
  if (kind === 'requirements_library' || kind === 'requirements_specification')
    return kind
  throw missingDestination(missingMessage)
}

/**
 * Reads `kind` and, for `requirements_specification`, the positive integer
 * `specificationId`.
 */
export function importDestinationFromQuery(
  searchParams: URLSearchParams,
  missingMessage: string,
): McpImportInstructionDestinationRef {
  const kind = importDestinationKindFromQuery(searchParams, missingMessage)
  if (kind === 'requirements_library') return { kind }
  const specificationId = positiveIntegerQueryValue(
    searchParams,
    'specificationId',
  )
  if (specificationId == null) throw missingDestination(missingMessage)
  return { kind, specificationId }
}
