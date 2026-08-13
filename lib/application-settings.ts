export const MIB = 1024 * 1024

export const APPLICATION_SETTING_CONSTRAINTS = Object.freeze({
  csvExportConcurrencyPerNode: { min: 1, max: 20 },
  csvExportMaxFileBytes: { min: MIB, max: 1024 * MIB, step: MIB },
  csvExportMaxItems: { min: 1, max: 5000 },
  csvExportTimeoutSeconds: { min: 10, max: 600 },
  pdfReportConcurrencyPerNode: { min: 1, max: 10 },
  pdfReportMaxFileBytes: { min: MIB, max: 512 * MIB, step: MIB },
  pdfReportMaxRequirements: { min: 1, max: 1000 },
  pdfReportTimeoutSeconds: { min: 10, max: 600 },
  pdfWorkerMemoryMib: { min: 128, max: 4096 },
  requirementImportMaxJsonDepth: { min: 4, max: 8 },
  requirementImportMaxNestedItems: { min: 0, max: 200 },
  requirementImportMaxProposedNeedsReferences: { min: 0, max: 500 },
  requirementImportMaxProposedNormReferences: { min: 0, max: 500 },
  requirementImportMaxRows: { min: 1, max: 500 },
})

export interface ApplicationSettings {
  csvExportConcurrencyPerNode: number
  csvExportMaxFileBytes: number
  csvExportMaxItems: number
  csvExportTimeoutSeconds: number
  pdfReportConcurrencyPerNode: number
  pdfReportMaxFileBytes: number
  pdfReportMaxRequirements: number
  pdfReportTimeoutSeconds: number
  pdfWorkerMemoryMib: number
  requirementImportMaxJsonDepth: number
  requirementImportMaxNestedItems: number
  requirementImportMaxProposedNeedsReferences: number
  requirementImportMaxProposedNormReferences: number
  requirementImportMaxRows: number
}

export type ApplicationSettingField = keyof ApplicationSettings

export interface AdminApplicationSettings extends ApplicationSettings {
  constraints: typeof APPLICATION_SETTING_CONSTRAINTS
  updatedAt: string
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = Object.freeze({
  csvExportConcurrencyPerNode: 5,
  csvExportMaxFileBytes: 100 * MIB,
  csvExportMaxItems: 1000,
  csvExportTimeoutSeconds: 120,
  pdfReportConcurrencyPerNode: 3,
  pdfReportMaxFileBytes: 50 * MIB,
  pdfReportMaxRequirements: 1000,
  pdfReportTimeoutSeconds: 180,
  pdfWorkerMemoryMib: 512,
  requirementImportMaxJsonDepth: 8,
  requirementImportMaxNestedItems: 200,
  requirementImportMaxProposedNeedsReferences: 500,
  requirementImportMaxProposedNormReferences: 500,
  requirementImportMaxRows: 500,
})

export function isValidApplicationSetting(
  field: ApplicationSettingField,
  value: unknown,
): value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false
  const constraint = APPLICATION_SETTING_CONSTRAINTS[field]
  if (!constraint) return false
  if (value < constraint.min || value > constraint.max) return false
  return 'step' in constraint ? value % constraint.step === 0 : true
}
