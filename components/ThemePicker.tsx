'use client'

import { Check, Palette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { applyDocumentThemeChange } from '@/lib/theme/apply-document-theme-change'

const THEMES = [
  {
    id: 'default',
    primary: '#4f46e5',
    secondary: '#64748b',
  },
  {
    id: 'navy',
    primary: '#24406c',
    secondary: '#63c3d1',
  },
  {
    id: 'purple',
    primary: '#614789',
    secondary: '#a79cc6',
  },
  {
    id: 'magenta',
    primary: '#9d1458',
    secondary: '#f39b9b',
  },
  {
    id: 'forest',
    primary: '#1a7251',
    secondary: '#6ebd8f',
  },
  {
    id: 'sunset',
    primary: '#e25046',
    secondary: '#f9b44f',
  },
  {
    id: 'ocean',
    primary: '#24406c',
    secondary: '#1a7251',
  },
  {
    id: 'berry',
    primary: '#9d1458',
    secondary: '#614789',
  },
  {
    id: 'autumn',
    primary: '#e25046',
    secondary: '#f28c5c',
  },
  {
    id: 'nordic',
    primary: '#24406c',
    secondary: '#97adda',
  },
] as const

type ThemeId = (typeof THEMES)[number]['id']

function syncColorThemeAttribute(id: ThemeId) {
  const root = document.documentElement
  const current = root.getAttribute('data-theme')

  if ((id === 'default' && current === null) || current === id) {
    return
  }

  applyDocumentThemeChange(() => {
    if (id === 'default') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', id)
    }
  })
}

function applyColorTheme(id: ThemeId) {
  if (id === 'default') {
    localStorage.removeItem('colorTheme')
  } else {
    localStorage.setItem('colorTheme', id)
  }

  syncColorThemeAttribute(id)
}

export default function ThemePicker() {
  const t = useTranslations('theme')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ThemeId>('default')
  const ref = useRef<HTMLDivElement>(null)

  // Restore saved theme on mount
  useEffect(() => {
    const stored = localStorage.getItem('colorTheme') as ThemeId | null
    if (stored && THEMES.some(th => th.id === stored)) {
      setActive(stored)
      syncColorThemeAttribute(stored)
    }
  }, [])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Close on Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const select = (id: ThemeId) => {
    setActive(id)
    applyColorTheme(id)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t('pickColor')}
        className="p-2 rounded-xl text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-all duration-200"
        data-developer-mode-name="button"
        data-developer-mode-value={t('pickColor')}
        onClick={() => setOpen(!open)}
        title={t('pickColor')}
        type="button"
      >
        <Palette aria-hidden="true" className="h-5 w-5" />
      </button>

      {open && (
        <div
          aria-label={t('pickColor')}
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-secondary-200/60 dark:border-secondary-700/40 bg-white dark:bg-secondary-900 shadow-lg p-3 animate-fade-in-up z-50"
          role="listbox"
        >
          <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider mb-2 px-1">
            {t('pickColor')}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {THEMES.map(theme => {
              const isActive = active === theme.id
              return (
                <button
                  aria-selected={isActive}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-950/60 ring-1 ring-primary-400/50 dark:ring-primary-500/40'
                      : 'hover:bg-secondary-50 dark:hover:bg-secondary-800'
                  } text-secondary-800 dark:text-secondary-200`}
                  key={theme.id}
                  onClick={() => select(theme.id)}
                  role="option"
                  type="button"
                >
                  <span className="flex items-center gap-0.5 shrink-0">
                    <span
                      aria-hidden="true"
                      className="block w-4 h-4 rounded-full border border-black/10 dark:border-white/10"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <span
                      aria-hidden="true"
                      className="block w-4 h-4 rounded-full border border-black/10 dark:border-white/10 -ml-1.5"
                      style={{ backgroundColor: theme.secondary }}
                    />
                  </span>
                  <span className="truncate">{t(`themes.${theme.id}`)}</span>
                  {isActive && (
                    <Check
                      aria-hidden="true"
                      className="h-3.5 w-3.5 ml-auto shrink-0 text-primary-600 dark:text-primary-400"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
