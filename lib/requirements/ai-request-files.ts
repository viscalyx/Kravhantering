import type { RequirementImportDestinationKind } from '@/lib/ai/requirement-prompt'
import type { AppLocale } from '@/lib/locale-preference'
import type {
  McpImportInstructionDestinationRef,
  RequirementsImportMode,
} from '@/lib/requirements/import-service'

/**
 * Client-side names and URLs for the two files that let an external AI
 * assistant draft requirements: the AI request template and the reference
 * data file.
 */
export type AiRequestFile = 'referenceData' | 'template'

/**
 * The destination of the AI request files. It is the import instruction's
 * destination, since both files use the same destinations as the instruction.
 * The import is type-only, so client code does not load the server module.
 */
export type AiRequestFileDestination = McpImportInstructionDestinationRef

const FILE_NAME_PREFIX: Record<
  AppLocale,
  Record<AiRequestFile, Record<RequirementImportDestinationKind, string>>
> = {
  en: {
    referenceData: {
      requirements_library:
        'requirement-import-reference-data-requirements-library',
      requirements_specification:
        'requirement-import-reference-data-requirements-specification',
    },
    template: {
      requirements_library:
        'requirement-import-ai-request-template-requirements-library',
      requirements_specification:
        'requirement-import-ai-request-template-requirements-specification',
    },
  },
  sv: {
    referenceData: {
      requirements_library: 'kravimport-referensdata-kravbibliotek',
      requirements_specification: 'kravimport-referensdata-kravunderlag',
    },
    template: {
      requirements_library: 'kravimport-ai-anropsmall-kravbibliotek',
      requirements_specification: 'kravimport-ai-anropsmall-kravunderlag',
    },
  },
}

const FILE_PATHS: Record<AiRequestFile, string> = {
  referenceData: '/api/requirements/import/reference-data',
  template: '/api/requirements/import/ai-request-template',
}

export function aiRequestFileName(
  file: AiRequestFile,
  locale: AppLocale,
  destination: AiRequestFileDestination,
): string {
  const prefix = FILE_NAME_PREFIX[locale][file][destination.kind]
  if (file === 'template') return `${prefix}.md`
  return destination.kind === 'requirements_specification'
    ? `${prefix}-${destination.specificationId}.json`
    : `${prefix}.json`
}

export function aiRequestFileUrl(
  file: AiRequestFile,
  locale: AppLocale,
  destination: AiRequestFileDestination,
): string {
  const params = new URLSearchParams({ locale, kind: destination.kind })
  // The template depends only on the destination kind.
  if (
    file === 'referenceData' &&
    destination.kind === 'requirements_specification'
  ) {
    params.set('specificationId', String(destination.specificationId))
  }
  return `${FILE_PATHS[file]}?${params}`
}

/** The import destination kind for an import dialog mode. */
export function importDestinationKindForMode(
  mode: RequirementsImportMode,
): RequirementImportDestinationKind {
  return mode === 'library'
    ? 'requirements_library'
    : 'requirements_specification'
}

/**
 * The destination of the AI request files for an import mode. Like the import
 * instruction, a requirements specification import needs the specification
 * id, so the files are unavailable (`null`) without it.
 */
export function resolveAiRequestFileDestination(
  mode: RequirementsImportMode,
  specificationId: number | null | undefined,
): AiRequestFileDestination | null {
  const kind = importDestinationKindForMode(mode)
  if (kind === 'requirements_library') return { kind }
  return specificationId != null ? { kind, specificationId } : null
}
