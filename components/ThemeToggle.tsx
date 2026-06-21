'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface ComponentProps {
  expanded?: boolean
  variant?: 'header' | 'rail'
}

export default function ThemeToggle({
  expanded = false,
  variant = 'header',
}: ComponentProps) {
  const t = useTranslations('theme')
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const cycle = () => {
    if (typeof theme === 'undefined') return

    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const current = mounted && typeof theme !== 'undefined' ? theme : 'system'
  const developerLabel =
    current === 'light' ? 'light' : current === 'dark' ? 'dark' : 'auto'
  const label =
    developerLabel === 'light'
      ? t('light')
      : developerLabel === 'dark'
        ? t('dark')
        : t('auto')
  const buttonLabel = `${t('toggle')} (${label})`

  const isRail = variant === 'rail'

  return (
    <button
      aria-label={buttonLabel}
      className={
        isRail
          ? 'inline-flex min-h-11 w-full min-w-11 items-center justify-center gap-3 rounded-xl px-3 py-2 text-secondary-700 transition-all duration-200 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950'
          : 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-secondary-700 transition-all duration-200 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950'
      }
      {...devMarker({ name: 'button', value: developerLabel })}
      onClick={cycle}
      title={buttonLabel}
      type="button"
    >
      {current === 'dark' ? (
        <Moon aria-hidden="true" className="h-5 w-5" />
      ) : current === 'light' ? (
        <Sun aria-hidden="true" className="h-5 w-5" />
      ) : (
        <Monitor aria-hidden="true" className="h-5 w-5" />
      )}
      {isRail && expanded ? (
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {buttonLabel}
        </span>
      ) : null}
    </button>
  )
}
