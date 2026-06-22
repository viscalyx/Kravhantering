'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { writeStoredLocale } from '@/lib/locale-preference'

interface ComponentProps {
  expanded?: boolean
  variant?: 'header' | 'rail'
}

export default function LanguageSwitcher({
  expanded = false,
  variant = 'header',
}: ComponentProps) {
  const t = useTranslations('language')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const otherLocale = locale === 'sv' ? 'en' : 'sv'

  const switchLocale = () => {
    writeStoredLocale(otherLocale)
    router.replace(pathname, { locale: otherLocale })
  }

  const isRail = variant === 'rail'

  return (
    <button
      aria-label={t('switchTo')}
      className={
        isRail
          ? 'flex min-h-11 w-full min-w-11 items-center justify-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950'
          : 'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl p-2 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'
      }
      {...devMarker({ name: 'button', value: t('switchTo') })}
      onClick={switchLocale}
      title={t('switchTo')}
      type="button"
    >
      <Globe
        aria-hidden="true"
        className={isRail ? 'h-5 w-5 shrink-0' : 'h-4 w-4 shrink-0'}
      />
      {isRail && expanded ? (
        <span className="min-w-0 flex-1 truncate text-left">
          {t('switchTo')}
        </span>
      ) : null}
      {!isRail ? <span className="uppercase">{otherLocale}</span> : null}
    </button>
  )
}
