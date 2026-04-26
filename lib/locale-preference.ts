// Locales are duplicated from `@/i18n/routing` so this helper has no
// dependency on next-intl's navigation module (which pulls in
// `next/navigation` and breaks plain-Node test contexts). Keep these
// in sync with `routing.locales` in `i18n/routing.ts`.
export const APP_LOCALES = ['sv', 'en'] as const

export const LOCALE_STORAGE_KEY = 'locale'

export type AppLocale = (typeof APP_LOCALES)[number]

export function isAppLocale(
  value: string | null | undefined,
): value is AppLocale {
  return (
    typeof value === 'string' &&
    (APP_LOCALES as readonly string[]).includes(value)
  )
}

export function readStoredLocale(
  storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined'
    ? null
    : window.localStorage,
): AppLocale | null {
  if (!storage) return null
  try {
    const value = storage.getItem(LOCALE_STORAGE_KEY)
    return isAppLocale(value) ? value : null
  } catch {
    // localStorage can throw (private mode, disabled storage, SecurityError).
    return null
  }
}

export function writeStoredLocale(
  locale: AppLocale,
  storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined'
    ? null
    : window.localStorage,
): void {
  if (!storage) return
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage failures; locale persistence is a best-effort UX feature.
  }
}
