import type {
  DataSubjectExportDelivery,
  DataSubjectExportV1,
} from '@/lib/privacy/data-subject-export-types'

function dateStamp(generatedAt: string): string {
  const date = new Date(generatedAt)
  if (Number.isNaN(date.getTime())) {
    return generatedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'export'
  }
  return date.toISOString().slice(0, 10)
}

export function dataSubjectExportFilename(
  payload: DataSubjectExportV1,
  delivery: DataSubjectExportDelivery,
): string {
  const extension = delivery === 'pdf' ? 'pdf' : 'json'
  return `${[
    'data-subject-export',
    payload.subject.targetFingerprint.slice(0, 16),
    dateStamp(payload.generatedAt),
  ].join('-')}.${extension}`
}
