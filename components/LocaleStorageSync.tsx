'use client'

import { useLocale } from 'next-intl'
import { useEffect } from 'react'
import { usePathname, useRouter } from '@/i18n/routing'
import {
  type AppLocale,
  isAppLocale,
  LOCALE_STORAGE_KEY,
  writeStoredLocale,
} from '@/lib/locale-preference'

/**
 * Persists the current locale in localStorage and listens for cross-tab
 * `storage` events so that switching the locale in one tab is mirrored in
 * other open tabs.
 *
 * Mounted inside `app/[locale]/layout.tsx` so it always sees the active
 * route locale via `useLocale()`.
 */
export default function LocaleStorageSync() {
  const rawLocale = useLocale()
  const locale: AppLocale | null = isAppLocale(rawLocale) ? rawLocale : null
  const router = useRouter()
  const pathname = usePathname()

  // Keep localStorage in sync with the URL (covers direct navigation that
  // bypasses the LanguageSwitcher button). Skip writes when the active
  // locale is not part of AppLocale so localStorage never holds garbage.
  useEffect(() => {
    if (locale === null) return
    writeStoredLocale(locale)
  }, [locale])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOCALE_STORAGE_KEY) return
      const next = event.newValue
      if (!isAppLocale(next) || next === locale) return
      router.replace(pathname, { locale: next })
    }

    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [locale, pathname, router])

  return null
}
