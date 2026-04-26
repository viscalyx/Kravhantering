'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { type AppLocale, readStoredLocale } from '@/lib/locale-preference'

/**
 * Renders nothing visible. On mount, reads the user's stored locale
 * preference from `localStorage` and redirects to that locale's landing
 * page (`/<locale>/requirements`). Falls back to the default locale.
 *
 * Mounted from `app/page.tsx` — the unlocalized root entry point. Uses
 * `next/navigation` (not `@/i18n/routing`) so it does not depend on
 * `NextIntlClientProvider`, which only exists inside the `[locale]`
 * segment.
 */
interface ComponentProps {
  defaultLocale: AppLocale
}

export default function RootLocaleRedirect({ defaultLocale }: ComponentProps) {
  const router = useRouter()

  useEffect(() => {
    const stored = readStoredLocale()
    const target = stored ?? defaultLocale
    router.replace(`/${target}/requirements`)
  }, [defaultLocale, router])

  return null
}
