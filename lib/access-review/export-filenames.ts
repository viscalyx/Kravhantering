import type {
  AccessReviewDelivery,
  AccessReviewExportV1,
} from '@/lib/access-review/types'

type ExportFilenameLocale = 'en' | 'sv'

function dateStamp(generatedAt: string): string {
  const date = new Date(generatedAt)
  if (Number.isNaN(date.getTime())) {
    return generatedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'export'
  }
  return date.toISOString().slice(0, 10)
}

function filenameStem(locale: string | undefined): string {
  return locale === 'sv' ? 'behorighetsoversyn' : 'access-review'
}

export function accessReviewExportFilename(
  payload: AccessReviewExportV1,
  delivery: AccessReviewDelivery,
  locale: ExportFilenameLocale | string = 'en',
): string {
  const extension = delivery === 'pdf' ? 'pdf' : 'json'
  return `${[
    filenameStem(locale),
    String(payload.run.id).padStart(4, '0'),
    dateStamp(payload.generatedAt),
  ].join('-')}.${extension}`
}
