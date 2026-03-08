'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

type Mode = 'light' | 'dark' | 'auto'

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyDarkClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

export default function ThemeToggle() {
  const t = useTranslations('theme')
  const [mode, setMode] = useState<Mode>('auto')

  const applyMode = useCallback((m: Mode) => {
    if (m === 'auto') {
      applyDarkClass(getSystemDark())
    } else {
      applyDarkClass(m === 'dark')
    }
  }, [])

  // Initialize from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const initial: Mode =
      stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : 'auto'
    setMode(initial)
    applyMode(initial)
  }, [applyMode])

  // Listen for OS preference changes while in auto mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (mode === 'auto') applyDarkClass(mq.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const cycle = () => {
    const next: Mode =
      mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light'
    setMode(next)
    applyMode(next)
    if (next === 'auto') {
      localStorage.removeItem('theme')
    } else {
      localStorage.setItem('theme', next)
    }
  }

  const label =
    mode === 'light' ? t('light') : mode === 'dark' ? t('dark') : t('auto')

  return (
    <button
      aria-label={`${t('toggle')} (${label})`}
      className="p-2 rounded-xl text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-all duration-200"
      onClick={cycle}
      title={`${t('toggle')} (${label})`}
      type="button"
    >
      {mode === 'dark' ? (
        <Moon aria-hidden="true" className="h-5 w-5" />
      ) : mode === 'light' ? (
        <Sun aria-hidden="true" className="h-5 w-5" />
      ) : (
        <Monitor aria-hidden="true" className="h-5 w-5" />
      )}
    </button>
  )
}
