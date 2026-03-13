'use client'

import { ClipboardList, Menu, Package, Settings2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import Logo from '@/components/Logo'
import ThemePicker from '@/components/ThemePicker'
import ThemeToggle from '@/components/ThemeToggle'
import { Link, usePathname } from '@/i18n/routing'

const primaryNavItems = [
  { href: '/kravkatalog' as const, labelKey: 'catalog', icon: ClipboardList },
  { href: '/kravpaket' as const, labelKey: 'packages', icon: Package },
]

export default function Navigation() {
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const ta = useTranslations('admin')
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdminActive = pathname.startsWith('/admin')

  return (
    <nav
      aria-label="Huvudnavigation"
      className="sticky top-0 z-50 bg-white/60 dark:bg-secondary-950/60 backdrop-blur-custom border-b border-secondary-200/60 dark:border-secondary-700/40"
    >
      <div className="container-custom flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        <Link
          className="flex items-center gap-2.5 font-bold text-lg text-primary-700 dark:text-primary-300"
          href="/kravkatalog"
        >
          <Logo className="h-8 w-8" />
          <span className="hidden sm:inline tracking-tight">
            {tc('appName')}
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {primaryNavItems.map(item => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 shadow-sm'
                    : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
                }`}
                href={item.href}
                key={item.href}
              >
                <item.icon aria-hidden="true" className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemePicker />
          <ThemeToggle />
          <Link
            aria-label={ta('settings')}
            className={`inline-flex items-center justify-center rounded-full p-2 text-secondary-700 transition-all duration-200 dark:text-secondary-300 ${
              isAdminActive
                ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/80 dark:text-primary-300'
                : 'hover:bg-secondary-100 dark:hover:bg-secondary-800'
            }`}
            href="/admin"
            title={ta('settings')}
          >
            <Settings2 aria-hidden="true" className="h-5 w-5" />
          </Link>

          {/* Mobile menu button */}
          <button
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Stäng meny' : 'Öppna meny'}
            className="md:hidden p-2 rounded-xl text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800"
            onClick={() => setMobileOpen(!mobileOpen)}
            type="button"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white/90 dark:bg-secondary-950/90 backdrop-blur-custom px-4 pb-4 animate-slide-down">
          {primaryNavItems.map(item => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                className={`flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300'
                    : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
                }`}
                href={item.href}
                key={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon aria-hidden="true" className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
