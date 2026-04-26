'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { writeStoredLocale } from '@/lib/locale-preference'

export default function LanguageSwitcher() {
  const t = useTranslations('language')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const otherLocale = locale === 'sv' ? 'en' : 'sv'

  const switchLocale = () => {
    writeStoredLocale(otherLocale)
    router.replace(pathname, { locale: otherLocale })
  }

  return (
    <button
      aria-label={t('switchTo')}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl p-2 text-sm font-medium text-secondary-700 transition-all duration-200 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800"
      {...devMarker({ name: 'button', value: t('switchTo') })}
      onClick={switchLocale}
      title={t('switchTo')}
      type="button"
    >
      <Globe aria-hidden="true" className="h-4 w-4" />
      <span className="uppercase">{otherLocale}</span>
    </button>
  )
}
