const STATUS_REVIEW = 2

export interface ResolveStatusLabelInput {
  archiveInitiatedAt: string | null | undefined
  status: number | null | undefined
  statusNameEn: string | null | undefined
  statusNameSv: string | null | undefined
}

export type StatusLabelLocale = 'sv' | 'en'

export type StatusLabelTranslator = (key: 'Arkiveringsgranskning') => string

/**
 * Resolves the user-facing status label for a requirement version.
 *
 * When a version is in Review *and* archiving has been initiated
 * (`archive_initiated_at` is set), the UI surfaces the distinct label
 * "Arkiveringsgranskning" / "Archiving Review" instead of the generic
 * "Granskning" / "Review" so users can tell publication review apart
 * from archiving review.
 *
 * The DB row is unchanged (`requirement_status_id` is still 2 and
 * `requirement_statuses.name_sv` is still "Granskning"); the override
 * is presentation-only.
 */
export function resolveStatusLabel(
  input: ResolveStatusLabelInput,
  locale: StatusLabelLocale,
  t: StatusLabelTranslator,
): string {
  if (input.status === STATUS_REVIEW && input.archiveInitiatedAt != null) {
    return t('Arkiveringsgranskning')
  }
  const fallback = locale === 'sv' ? input.statusNameSv : input.statusNameEn
  return fallback ?? '—'
}
