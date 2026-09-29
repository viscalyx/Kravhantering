import type { AppLocale } from '@/lib/locale-preference'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'

/**
 * The destination metadata of a reference data file. A requirements
 * specification destination names the specification, so that the user and the
 * AI assistant can tell which specification the snapshot belongs to.
 */
export type RequirementImportReferenceDataFileDestination =
  | { kind: 'requirements_library' }
  | { kind: 'requirements_specification'; id: number; name: string }

/**
 * A reference data file: a snapshot of the import reference data for one
 * destination, attached to the AI request template. `referenceData` is the
 * same object that the import instruction embeds for the same destination and
 * locale.
 */
export interface RequirementImportReferenceDataFile {
  destination: RequirementImportReferenceDataFileDestination
  generatedAt: string
  locale: AppLocale
  referenceData: Readonly<Record<string, unknown>>
  schemaVersion: string
}

export interface BuildRequirementImportReferenceDataFileOptions {
  destination: RequirementImportReferenceDataFileDestination
  generatedAt: Date
  locale: AppLocale
  referenceData: Readonly<Record<string, unknown>>
}

export function buildRequirementImportReferenceDataFile({
  destination,
  generatedAt,
  locale,
  referenceData,
}: BuildRequirementImportReferenceDataFileOptions): RequirementImportReferenceDataFile {
  return {
    generatedAt: generatedAt.toISOString(),
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    locale,
    destination,
    referenceData,
  }
}

/** Serializes the file as minified JSON without a byte order mark. */
export function serializeRequirementImportReferenceDataFile(
  file: RequirementImportReferenceDataFile,
): string {
  return JSON.stringify(file)
}
