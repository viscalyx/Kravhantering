/**
 * Helpers that centralize per-locale field selection so callers don't have to
 * repeat `locale === 'sv'` checks. Adding a new locale only requires updating
 * these helpers in one place.
 */

export type SupportedLocale = 'en' | 'sv'

export function isSwedish(locale: string | undefined | null): boolean {
  return locale === 'sv'
}

export interface LocalizedNamed {
  name?: string | null
  nameEn?: string | null
  nameSv?: string | null
}

/**
 * Returns the localized display name for an item with `nameSv` / `nameEn`
 * fields. Falls back to the English value, then to a generic `name` field if
 * present, then to an empty string.
 */
export function localizedName(
  item: LocalizedNamed | null | undefined,
  locale: string | undefined | null,
): string {
  if (!item) return ''
  const swedish = isSwedish(locale)
  const primary = swedish ? item.nameSv : item.nameEn
  if (typeof primary === 'string' && primary.length > 0) return primary
  const secondary = swedish ? item.nameEn : item.nameSv
  if (typeof secondary === 'string' && secondary.length > 0) return secondary
  if (typeof item.name === 'string' && item.name.length > 0) return item.name
  return ''
}
