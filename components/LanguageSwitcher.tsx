'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/routing'

export default function LanguageSwitcher() {
  const t = useTranslations('language')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const otherLocale = locale === 'sv' ? 'en' : 'sv'

  const switchLocale = () => {
    router.replace(pathname, { locale: otherLocale })
  }

  return (
    <button
      aria-label={t('switchTo')}
      className="flex items-center gap-1 p-2 rounded-xl text-sm font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-all duration-200"
      data-developer-mode-name="button"
      data-developer-mode-value={t('switchTo')}
      onClick={switchLocale}
      title={t('switchTo')}
      type="button"
    >
      <Globe aria-hidden="true" className="h-4 w-4" />
      <span className="uppercase">{otherLocale}</span>
    </button>
  )
}
