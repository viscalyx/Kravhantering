'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const t = useTranslations('theme')
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const cycle = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const current = mounted ? theme : 'system'
  const label =
    current === 'light'
      ? t('light')
      : current === 'dark'
        ? t('dark')
        : t('auto')

  return (
    <button
      aria-label={`${t('toggle')} (${label})`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-secondary-700 transition-all duration-200 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800"
      data-developer-mode-name="button"
      data-developer-mode-value={`${t('toggle')} (${label})`}
      onClick={cycle}
      title={`${t('toggle')} (${label})`}
      type="button"
    >
      {current === 'dark' ? (
        <Moon aria-hidden="true" className="h-5 w-5" />
      ) : current === 'light' ? (
        <Sun aria-hidden="true" className="h-5 w-5" />
      ) : (
        <Monitor aria-hidden="true" className="h-5 w-5" />
      )}
    </button>
  )
}
