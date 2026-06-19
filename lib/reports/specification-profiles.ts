import {
  PROGRESS_REPORT_SPECIFICATION_LIFECYCLE_STATUS_IDS,
  SPECIFICATION_LIFECYCLE_STATUS_MANAGEMENT_ID,
  SPECIFICATION_LIFECYCLE_STATUS_PROCUREMENT_ID,
} from '@/lib/specifications/lifecycle-status-constants'

export const SPECIFICATION_REPORT_PROFILES = [
  'procurement',
  'progress',
  'management',
] as const

export type SpecificationReportProfile =
  (typeof SPECIFICATION_REPORT_PROFILES)[number]

export const SPECIFICATION_CSV_PROFILES = ['procurement', 'full'] as const

export type SpecificationCsvProfile =
  (typeof SPECIFICATION_CSV_PROFILES)[number]

export function parseSpecificationReportProfile(
  value: string | null | undefined,
): SpecificationReportProfile | null {
  return SPECIFICATION_REPORT_PROFILES.includes(
    value as SpecificationReportProfile,
  )
    ? (value as SpecificationReportProfile)
    : null
}

export function parseSpecificationCsvProfile(
  value: string | null | undefined,
): SpecificationCsvProfile | null {
  return SPECIFICATION_CSV_PROFILES.includes(value as SpecificationCsvProfile)
    ? (value as SpecificationCsvProfile)
    : null
}

export function getSpecificationReportProfileForLifecycleStatus(
  lifecycleStatusId: number | null | undefined,
): SpecificationReportProfile | null {
  if (lifecycleStatusId === SPECIFICATION_LIFECYCLE_STATUS_PROCUREMENT_ID) {
    return 'procurement'
  }

  if (
    PROGRESS_REPORT_SPECIFICATION_LIFECYCLE_STATUS_IDS.includes(
      lifecycleStatusId as (typeof PROGRESS_REPORT_SPECIFICATION_LIFECYCLE_STATUS_IDS)[number],
    )
  ) {
    return 'progress'
  }

  if (lifecycleStatusId === SPECIFICATION_LIFECYCLE_STATUS_MANAGEMENT_ID) {
    return 'management'
  }

  return null
}

export function canExportProcurementCsvForLifecycleStatus(
  lifecycleStatusId: number | null | undefined,
): boolean {
  return lifecycleStatusId === SPECIFICATION_LIFECYCLE_STATUS_PROCUREMENT_ID
}
