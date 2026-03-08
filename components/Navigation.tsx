'use client'

import {
  Briefcase,
  ChevronDown,
  CircleDot,
  ClipboardList,
  FolderTree,
  Layers,
  Menu,
  Package,
  ShieldCheck,
  Theater,
  Wrench,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import Logo from '@/components/Logo'
import ThemePicker from '@/components/ThemePicker'
import ThemeToggle from '@/components/ThemeToggle'
import { Link, usePathname } from '@/i18n/routing'

const primaryNavItems = [
  { href: '/kravkatalog' as const, labelKey: 'catalog', icon: ClipboardList },
  { href: '/kravpaket' as const, labelKey: 'packages', icon: Package },
]

const taxonomyNavItems = [
  { href: '/kravomraden' as const, labelKey: 'areas', icon: FolderTree },
  { href: '/kravtyper' as const, labelKey: 'types', icon: Layers },
  { href: '/kravscenarier' as const, labelKey: 'scenarios', icon: Theater },
  { href: '/kravstatusar' as const, labelKey: 'statuses', icon: CircleDot },
  { href: '/iso25010' as const, labelKey: 'iso25010', icon: ShieldCheck },
  {
    href: '/kravpaket/ansvarsomraden' as const,
    labelKey: 'responsibilityAreas',
    icon: Briefcase,
  },
  {
    href: '/kravpaket/genomforandeformer' as const,
    labelKey: 'implementationTypes',
    icon: Wrench,
  },
]

const allNavItems = [...primaryNavItems, ...taxonomyNavItems]

export default function Navigation() {
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [taxonomyOpen, setTaxonomyOpen] = useState(false)
  const taxonomyRef = useRef<HTMLDivElement>(null)

  const isTaxonomyActive = taxonomyNavItems.some(item =>
    pathname.startsWith(item.href),
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        taxonomyRef.current &&
        !taxonomyRef.current.contains(e.target as Node)
      ) {
        setTaxonomyOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

          {/* Taxonomy dropdown */}
          <div className="relative" ref={taxonomyRef}>
            <button
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                isTaxonomyActive
                  ? 'bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
              }`}
              onClick={() => setTaxonomyOpen(!taxonomyOpen)}
              type="button"
            >
              <Layers aria-hidden="true" className="h-4 w-4" />
              {t('taxonomy')}
              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  taxonomyOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {taxonomyOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 rounded-xl border border-secondary-200/60 dark:border-secondary-700/40 bg-white dark:bg-secondary-900 shadow-lg py-1 animate-fade-in-up">
                {taxonomyNavItems.map(item => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <Link
                      className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300'
                          : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
                      }`}
                      href={item.href}
                      key={item.href}
                      onClick={() => setTaxonomyOpen(false)}
                    >
                      <item.icon aria-hidden="true" className="h-4 w-4" />
                      {t(item.labelKey)}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemePicker />
          <ThemeToggle />

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
          {allNavItems.map(item => {
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
