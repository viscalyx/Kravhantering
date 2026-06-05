import type {
  DataSubjectExportDelivery,
  DataSubjectExportV1,
} from '@/lib/privacy/data-subject-export-types'

type ExportFilenameLocale = 'en' | 'sv'

function dateStamp(generatedAt: string): string {
  const date = new Date(generatedAt)
  if (Number.isNaN(date.getTime())) {
    return generatedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'export'
  }
  return date.toISOString().slice(0, 10)
}

function filenameStem(locale: string | undefined): string {
  return locale === 'sv' ? 'personuppgiftsutdrag' : 'data-subject-access-export'
}

export function dataSubjectExportFilename(
  payload: DataSubjectExportV1,
  delivery: DataSubjectExportDelivery,
  locale: ExportFilenameLocale | string = 'en',
): string {
  const extension = delivery === 'pdf' ? 'pdf' : 'json'
  return `${[
    filenameStem(locale),
    payload.subject.targetFingerprint.slice(0, 16),
    dateStamp(payload.generatedAt),
  ].join('-')}.${extension}`
}
