'use client'

import {
  ChevronDown,
  ClipboardList,
  FileStack,
  FolderCog,
  HelpCircle,
  LibraryBig,
  LoaderCircle,
  Menu,
  Package,
  Settings2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import AuthMenu from '@/components/AuthMenu'
import { useHelp } from '@/components/HelpPanel'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import { Link, usePathname, useRouter } from '@/i18n/routing'
import type { BuildMetadata } from '@/lib/build-metadata'
import { devMarker } from '@/lib/developer-mode-markers'

type StewardshipTab = 'packages' | 'questions'

const STEWARDSHIP_STORAGE_KEY = 'requirements.stewardship.tab'

const primaryNavItems = [
  {
    href: '/requirements' as const,
    labelKey: 'catalog',
    icon: LibraryBig,
    isActive: (pathname: string) =>
      pathname.startsWith('/requirements') &&
      !pathname.startsWith('/requirements/stewardship'),
  },
  {
    href: '/requirements/stewardship' as const,
    labelKey: 'stewardship',
    icon: FolderCog,
    isActive: (pathname: string) =>
      pathname.startsWith('/requirements/stewardship'),
  },
  {
    href: '/specifications' as const,
    labelKey: 'specifications',
    icon: FileStack,
    isActive: (pathname: string) => pathname.startsWith('/specifications'),
  },
]

const stewardshipSubItems = [
  {
    icon: Package,
    labelKey: 'requirementPackages',
    tab: 'packages',
  },
  {
    icon: ClipboardList,
    labelKey: 'requirementSelectionQuestions',
    tab: 'questions',
  },
] satisfies {
  icon: typeof Package
  labelKey: string
  tab: StewardshipTab
}[]

interface ComponentProps {
  buildMetadata?: BuildMetadata | null
}

function stewardshipTabFromValue(value: string | null): StewardshipTab | null {
  return value === 'packages' || value === 'questions' ? value : null
}

function getStewardshipHref(tab: StewardshipTab) {
  return `/requirements/stewardship?tab=${tab}`
}

function getRememberedStewardshipTab(): StewardshipTab {
  return (
    stewardshipTabFromValue(localStorage.getItem(STEWARDSHIP_STORAGE_KEY)) ??
    'packages'
  )
}

export default function Navigation({ buildMetadata = null }: ComponentProps) {
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const ta = useTranslations('admin')
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopStewardshipOpen, setDesktopStewardshipOpen] = useState(() =>
    pathname.startsWith('/requirements/stewardship'),
  )
  const [mobileStewardshipOpen, setMobileStewardshipOpen] = useState(() =>
    pathname.startsWith('/requirements/stewardship'),
  )
  const [rememberedStewardshipTab, setRememberedStewardshipTab] =
    useState<StewardshipTab>('packages')
  const [pendingStewardshipTarget, setPendingStewardshipTarget] =
    useState<StewardshipTab | null>(null)
  const [
    showStewardshipTransitionSpinner,
    setShowStewardshipTransitionSpinner,
  ] = useState(false)
  const isAdminActive = pathname.startsWith('/admin')
  const isStewardshipPath = pathname.startsWith('/requirements/stewardship')
  const queryStewardshipTab = stewardshipTabFromValue(searchParams.get('tab'))
  const activeStewardshipTab =
    queryStewardshipTab ??
    (isStewardshipPath ? 'packages' : rememberedStewardshipTab)
  const isDesktopStewardshipOpen = desktopStewardshipOpen
  const isMobileStewardshipOpen = mobileStewardshipOpen
  const {
    toggle: toggleHelp,
    content: helpContent,
    isOpen: helpOpen,
  } = useHelp()
  const buildVersionTitle = buildMetadata
    ? tc('buildVersionTooltip', { version: buildMetadata.version })
    : undefined
  const rememberStewardshipTab = (tab: StewardshipTab) => {
    localStorage.setItem(STEWARDSHIP_STORAGE_KEY, tab)
    setRememberedStewardshipTab(tab)
  }
  useEffect(() => {
    setRememberedStewardshipTab(getRememberedStewardshipTab())
  }, [])
  useEffect(() => {
    setDesktopStewardshipOpen(isStewardshipPath)
    setMobileStewardshipOpen(isStewardshipPath)
  }, [isStewardshipPath])
  useEffect(() => {
    if (
      pendingStewardshipTarget &&
      isStewardshipPath &&
      queryStewardshipTab === pendingStewardshipTarget
    ) {
      setPendingStewardshipTarget(null)
      setShowStewardshipTransitionSpinner(false)
    }
  }, [isStewardshipPath, pendingStewardshipTarget, queryStewardshipTab])
  useEffect(() => {
    if (!pendingStewardshipTarget) {
      setShowStewardshipTransitionSpinner(false)
      return undefined
    }
    setShowStewardshipTransitionSpinner(false)
    const spinnerTimeout = window.setTimeout(() => {
      setShowStewardshipTransitionSpinner(true)
    }, 2000)
    const cleanupTimeout = window.setTimeout(() => {
      setPendingStewardshipTarget(null)
      setShowStewardshipTransitionSpinner(false)
    }, 5000)
    return () => {
      window.clearTimeout(spinnerTimeout)
      window.clearTimeout(cleanupTimeout)
    }
  }, [pendingStewardshipTarget])

  const toggleDesktopStewardshipHome = () => {
    if (desktopStewardshipOpen) {
      setDesktopStewardshipOpen(false)
      return
    }
    const tab = getRememberedStewardshipTab()
    setRememberedStewardshipTab(tab)
    setPendingStewardshipTarget(tab)
    setDesktopStewardshipOpen(true)
    router.push(getStewardshipHref(tab))
  }
  const closeStewardshipSubnav = () => {
    setDesktopStewardshipOpen(false)
    setMobileStewardshipOpen(false)
  }
  const stewardshipSubLinks = (mode: 'desktop' | 'mobile') =>
    stewardshipSubItems.map(item => {
      const isActive = activeStewardshipTab === item.tab
      const href = getStewardshipHref(item.tab)
      const modeClassName =
        mode === 'mobile'
          ? 'w-full rounded-xl px-3.5 py-3'
          : 'rounded-full px-3 py-1.5'
      const activeClassName =
        mode === 'mobile'
          ? 'bg-primary-700 text-white shadow-sm dark:bg-primary-500 dark:text-secondary-950'
          : 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/80 dark:text-primary-300'
      return (
        <Link
          aria-current={isStewardshipPath && isActive ? 'page' : undefined}
          className={`inline-flex items-center gap-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950 ${
            mode === 'mobile' ? 'min-h-11' : 'min-h-10'
          } ${modeClassName} ${
            isActive
              ? activeClassName
              : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'
          }`}
          href={href}
          key={`${mode}-${item.tab}`}
          onClick={() => {
            rememberStewardshipTab(item.tab)
            if (mode === 'mobile') setMobileOpen(false)
          }}
        >
          <item.icon aria-hidden="true" className="h-4 w-4" key="icon" />
          {t(item.labelKey)}
        </Link>
      )
    })

  return (
    <nav
      aria-label="Huvudnavigation"
      className="sticky top-0 z-50 bg-white/60 dark:bg-secondary-950/60 backdrop-blur-custom border-b border-secondary-200/60 dark:border-secondary-700/40"
      {...devMarker({
        name: 'navigation',
        priority: 320,
        value: 'main navigation',
      })}
    >
      <div
        className="container-custom flex min-h-16 items-start justify-between px-4 py-3 sm:px-6 lg:px-8"
        key="navigation-bar"
      >
        <Link
          className="flex min-h-11 items-center gap-2.5 font-bold text-lg text-primary-700 dark:text-primary-300"
          {...devMarker({
            context: 'navigation',
            name: 'link',
            value: 'app title',
          })}
          href="/requirements"
          key="app-title"
          title={buildVersionTitle}
        >
          <span className="contents">
            <Logo className="h-8 w-8" key="logo" />
            <span className="hidden sm:inline tracking-tight" key="title">
              {tc('appName')}
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-start gap-1 md:flex" key="desktop-nav">
          {primaryNavItems.map(item => {
            const isActive = item.isActive(pathname)
            if (item.href === '/requirements/stewardship') {
              return (
                <div
                  className={`flex flex-col items-center transition-all duration-200 ${
                    isDesktopStewardshipOpen
                      ? 'stewardship-nav-stepped-shell'
                      : ''
                  }`}
                  {...devMarker({
                    context: 'navigation',
                    name: 'stewardship submenu',
                    value: 'inline row',
                  })}
                  key={`desktop-nav-${item.href}`}
                >
                  <button
                    aria-expanded={isDesktopStewardshipOpen}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950 ${
                      isDesktopStewardshipOpen
                        ? 'stewardship-nav-parent-shell'
                        : ''
                    } ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/80 dark:text-primary-300'
                        : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'
                    }`}
                    {...devMarker({
                      context: 'navigation',
                      name: 'stewardship disclosure',
                      value: isDesktopStewardshipOpen ? 'open' : 'closed',
                    })}
                    key="desktop-stewardship-disclosure"
                    onClick={toggleDesktopStewardshipHome}
                    type="button"
                  >
                    <item.icon
                      aria-hidden="true"
                      className="h-4 w-4"
                      key="icon"
                    />
                    {t(item.labelKey)}
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 transition-transform ${
                        isDesktopStewardshipOpen ? 'rotate-180' : ''
                      }`}
                      key="chevron"
                    />
                  </button>
                  {isDesktopStewardshipOpen && (
                    <div
                      className="stewardship-nav-submenu-shell mt-1 flex items-center gap-1 p-1 shadow-inner shadow-secondary-200/50 dark:shadow-black/20"
                      key="desktop-stewardship-subnav"
                    >
                      {stewardshipSubLinks('desktop')}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <Link
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 shadow-sm'
                    : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
                }`}
                key={`desktop-nav-${item.href}`}
                {...devMarker({ name: 'nav link', value: item.labelKey })}
                href={item.href}
                onClick={closeStewardshipSubnav}
              >
                <span className="contents">
                  <item.icon
                    aria-hidden="true"
                    className="h-4 w-4"
                    key="icon"
                  />
                  {t(item.labelKey)}
                </span>
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2" key="global-actions">
          <LanguageSwitcher key="language-switcher" />
          <ThemeToggle key="theme-toggle" />
          {helpContent !== null && (
            <button
              aria-label={tc('help')}
              aria-pressed={helpOpen}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-secondary-700 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950 ${
                helpOpen
                  ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/80 dark:text-primary-300'
                  : 'hover:bg-secondary-100 dark:hover:bg-secondary-800'
              }`}
              {...devMarker({
                context: 'navigation',
                name: 'button',
                value: `help toggle ${helpOpen ? 'open' : 'closed'}`,
              })}
              key="help-toggle"
              onClick={toggleHelp}
              title={tc('help')}
              type="button"
            >
              <HelpCircle aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
          <Link
            aria-label={ta('settings')}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-secondary-700 transition-all duration-200 dark:text-secondary-300 ${
              isAdminActive
                ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/80 dark:text-primary-300'
                : 'hover:bg-secondary-100 dark:hover:bg-secondary-800'
            }`}
            {...devMarker({ name: 'link', value: 'settings' })}
            href="/admin"
            key="settings"
            title={ta('settings')}
          >
            <Settings2 aria-hidden="true" className="h-5 w-5" />
          </Link>
          <div className="hidden md:flex" key="desktop-auth">
            <AuthMenu variant="desktop" />
          </div>

          {/* Mobile menu button */}
          <button
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
            className="md:hidden min-h-11 min-w-11 rounded-xl p-2 text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800"
            key="mobile-menu-toggle"
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

      {showStewardshipTransitionSpinner && (
        <div
          className="fixed inset-x-0 top-16 bottom-0 z-40 flex items-start justify-center bg-white/95 pt-16 text-secondary-700 backdrop-blur-sm dark:bg-secondary-950/95 dark:text-secondary-200"
          {...devMarker({
            context: 'navigation',
            name: 'transition mask',
            value: 'stewardship',
          })}
        >
          <div
            aria-live="polite"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary-700 dark:text-primary-300"
            role="status"
          >
            <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin" />
            <span className="sr-only">{tc('loading')}</span>
          </div>
        </div>
      )}

      {/* Mobile nav */}
      {mobileOpen && (
        <div
          className="md:hidden border-t bg-white/90 dark:bg-secondary-950/90 backdrop-blur-custom px-4 pb-4 animate-slide-down"
          key="mobile-nav"
        >
          {primaryNavItems.map(item => {
            const isActive = item.isActive(pathname)
            if (item.href === '/requirements/stewardship') {
              return (
                <div key={item.href}>
                  <button
                    aria-expanded={isMobileStewardshipOpen}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/80 dark:text-primary-300'
                        : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'
                    }`}
                    key="mobile-stewardship-disclosure"
                    onClick={() => setMobileStewardshipOpen(open => !open)}
                    type="button"
                  >
                    <item.icon
                      aria-hidden="true"
                      className="h-4 w-4"
                      key="icon"
                    />
                    <span className="min-w-0 flex-1" key="label">
                      {t(item.labelKey)}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 transition-transform ${
                        isMobileStewardshipOpen ? 'rotate-180' : ''
                      }`}
                      key="chevron"
                    />
                  </button>
                  {isMobileStewardshipOpen && (
                    <div
                      className="ml-5 mt-1 flex flex-col gap-1 border-l border-secondary-200 pl-3 dark:border-secondary-700"
                      key="mobile-stewardship-subnav"
                    >
                      {stewardshipSubLinks('mobile')}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <Link
                className={`flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300'
                    : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
                }`}
                href={item.href}
                key={item.href}
                onClick={() => {
                  setMobileOpen(false)
                  closeStewardshipSubnav()
                }}
              >
                <span className="contents">
                  <item.icon
                    aria-hidden="true"
                    className="h-4 w-4"
                    key="icon"
                  />
                  {t(item.labelKey)}
                </span>
              </Link>
            )
          })}
          <div
            className="mt-2 border-t border-secondary-200/60 pt-2 dark:border-secondary-700/40"
            key="mobile-auth"
          >
            <AuthMenu variant="mobile" />
          </div>
        </div>
      )}
    </nav>
  )
}
