'use client'

import {
  BookOpen,
  ClipboardList,
  FileStack,
  FolderTree,
  Info,
  LibraryBig,
  MessageCircleQuestionMark,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthMenu from '@/components/AuthMenu'
import { useHelp } from '@/components/HelpPanel'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import { useModalFocus } from '@/hooks/useModalFocus'
import { Link, usePathname } from '@/i18n/routing'
import type { BuildMetadata } from '@/lib/build-metadata'
import { devMarker } from '@/lib/developer-mode-markers'
import { dispatchGlobalNavigationLayoutEvent } from '@/lib/navigation-layout-events'

type StewardshipTab = 'packages' | 'questions' | 'norms' | 'rfi'
export type StewardshipTabParam =
  | Exclude<StewardshipTab, 'rfi'>
  | 'information-requests'

const NAV_RAIL_STORAGE_KEY = 'requirements.navigationRail.expanded.v1'
const STEWARDSHIP_STORAGE_KEY = 'requirements.stewardship.tab'
const NAV_RAIL_COLLAPSED_WIDTH = '4.5rem'
const NAV_RAIL_EXPANDED_WIDTH = '16.5rem'
const mobileDrawerToggleButtonClassName =
  'fixed left-3 top-3 z-50 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-secondary-200/80 bg-white/92 text-secondary-700 shadow-lg backdrop-blur-xl transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white md:hidden dark:border-secondary-800 dark:bg-secondary-950/92 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950'

const workNavItems = [
  {
    href: '/requirements',
    icon: LibraryBig,
    id: 'catalog',
    isActive: (pathname: string) =>
      pathname.startsWith('/requirements') &&
      !pathname.startsWith('/requirements/stewardship'),
    labelKey: 'catalog',
  },
  {
    href: '/specifications',
    icon: FileStack,
    id: 'specifications',
    isActive: (pathname: string) => pathname.startsWith('/specifications'),
    labelKey: 'specifications',
  },
] satisfies NavigationLinkDefinition[]

const stewardshipNavItems = [
  {
    href: getStewardshipHref('packages'),
    icon: Package,
    id: 'requirement-packages',
    isActive: (pathname: string, activeTab: StewardshipTab) =>
      pathname.startsWith('/requirements/stewardship') &&
      activeTab === 'packages',
    labelKey: 'requirementPackages',
    stewardshipTab: 'packages',
  },
  {
    href: getStewardshipHref('questions'),
    icon: ClipboardList,
    id: 'requirement-selection-questions',
    isActive: (pathname: string, activeTab: StewardshipTab) =>
      pathname.startsWith('/requirements/stewardship') &&
      activeTab === 'questions',
    labelKey: 'requirementSelectionQuestions',
    stewardshipTab: 'questions',
  },
  {
    href: getStewardshipHref('rfi'),
    icon: MessageCircleQuestionMark,
    id: 'rfi-questions',
    isActive: (pathname: string, activeTab: StewardshipTab) =>
      pathname.startsWith('/requirements/stewardship') && activeTab === 'rfi',
    labelKey: 'rfiQuestions',
    stewardshipTab: 'rfi',
  },
  {
    href: getStewardshipHref('norms'),
    icon: BookOpen,
    id: 'norm-library',
    isActive: (pathname: string, activeTab: StewardshipTab) =>
      pathname.startsWith('/requirements/stewardship') && activeTab === 'norms',
    labelKey: 'normLibrary',
    stewardshipTab: 'norms',
  },
] satisfies NavigationLinkDefinition[]

interface NavigationLinkDefinition {
  href: string
  icon: typeof LibraryBig
  id: string
  isActive: (pathname: string, activeTab: StewardshipTab) => boolean
  labelKey: string
  stewardshipTab?: StewardshipTab
}

interface AuthMeResponse {
  authenticated: boolean
  roles?: string[]
}

interface RequirementAreasResponse {
  areas?: Array<{
    permissions?: {
      canManageAssignments?: boolean
    }
  }>
}

interface ComponentProps {
  buildMetadata?: BuildMetadata | null
}

function stewardshipTabFromValue(value: string | null): StewardshipTab | null {
  if (value === 'information-requests') return 'rfi'
  return value === 'packages' || value === 'questions' || value === 'norms'
    ? value
    : null
}

function getStewardshipHref(tab: StewardshipTab) {
  const tabParam: StewardshipTabParam =
    tab === 'rfi' ? 'information-requests' : tab
  return `/requirements/stewardship?tab=${tabParam}`
}

function readStoredRailExpanded() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(NAV_RAIL_STORAGE_KEY) === 'expanded'
}

function writeStoredRailExpanded(expanded: boolean) {
  localStorage.setItem(
    NAV_RAIL_STORAGE_KEY,
    expanded ? 'expanded' : 'collapsed',
  )
}

function rememberStewardshipTab(tab: StewardshipTab) {
  localStorage.setItem(STEWARDSHIP_STORAGE_KEY, tab)
}

function getActiveStewardshipTab(
  pathname: string,
  searchParams: URLSearchParams,
): StewardshipTab {
  return pathname.startsWith('/requirements/stewardship')
    ? (stewardshipTabFromValue(searchParams.get('tab')) ?? 'packages')
    : 'packages'
}

function getNavigationLinkClassName(active: boolean, expanded: boolean) {
  return `group inline-flex min-h-11 w-full min-w-11 items-center rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950 ${
    expanded ? 'justify-start gap-3 px-3 py-2' : 'justify-center px-0 py-2'
  } ${
    active
      ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/80 dark:text-primary-300'
      : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'
  }`
}

function NavigationSection({
  children,
  expanded,
  hideCollapsedDivider = false,
  label,
}: {
  children: React.ReactNode
  expanded: boolean
  hideCollapsedDivider?: boolean
  label: string
}) {
  return (
    <section aria-label={label} className="space-y-2">
      {expanded ? (
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
          {label}
        </p>
      ) : hideCollapsedDivider ? null : (
        <div
          aria-hidden="true"
          className="mx-auto h-px w-8 bg-secondary-200 dark:bg-secondary-800"
          data-testid="navigation-group-divider"
        />
      )}
      <div className="space-y-1">{children}</div>
    </section>
  )
}

export default function Navigation({ buildMetadata = null }: ComponentProps) {
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const ta = useTranslations('admin')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [canOpenRequirementAreas, setCanOpenRequirementAreas] = useState(false)
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLDivElement>(null)
  const mobileDrawerReturnFocusRef = useRef<HTMLButtonElement>(null)
  const {
    toggle: toggleHelp,
    content: helpContent,
    isOpen: helpOpen,
  } = useHelp()
  const activeStewardshipTab = useMemo(
    () => getActiveStewardshipTab(pathname, searchParams),
    [pathname, searchParams],
  )
  const buildVersionTitle = buildMetadata
    ? tc('buildVersionTooltip', { version: buildMetadata.version })
    : undefined

  const closeMobileDrawer = useCallback(() => {
    setMobileOpen(false)
  }, [])

  const openMobileDrawer = useCallback((trigger: HTMLButtonElement) => {
    mobileDrawerReturnFocusRef.current = trigger
    setMobileOpen(true)
  }, [])

  const { handleKeyDown: handleMobileDrawerKeyDown } = useModalFocus({
    initialFocusRef: mobileCloseButtonRef,
    modalRef: mobileDrawerRef,
    onClose: closeMobileDrawer,
    open: mobileOpen,
    returnFocusRef: mobileDrawerReturnFocusRef,
  })

  useEffect(() => {
    if (readStoredRailExpanded()) {
      setDesktopExpanded(true)
    }
  }, [])

  useEffect(() => {
    const width = desktopExpanded
      ? NAV_RAIL_EXPANDED_WIDTH
      : NAV_RAIL_COLLAPSED_WIDTH
    document.documentElement.style.setProperty('--global-nav-width', width)
    if (typeof window !== 'undefined') {
      writeStoredRailExpanded(desktopExpanded)
      dispatchGlobalNavigationLayoutEvent()
    }
  }, [desktopExpanded])

  useEffect(() => {
    let cancelled = false

    const loadAreaNavigationVisibility = async () => {
      try {
        const [authResponse, areasResponse] = await Promise.all([
          fetch('/api/auth/me', { credentials: 'same-origin' }),
          fetch('/api/requirement-areas', { credentials: 'same-origin' }),
        ])
        const auth = authResponse.ok
          ? ((await authResponse.json()) as AuthMeResponse)
          : null
        const areas = areasResponse.ok
          ? ((await areasResponse.json()) as RequirementAreasResponse)
          : null
        const isAdmin = auth?.roles?.includes('Admin') === true
        const managesArea =
          areas?.areas?.some(
            area => area.permissions?.canManageAssignments === true,
          ) === true

        if (!cancelled && (isAdmin || managesArea)) {
          setCanOpenRequirementAreas(true)
        }
      } catch {
        // Keep the default hidden state when navigation eligibility cannot load.
      }
    }

    void loadAreaNavigationVisibility()

    return () => {
      cancelled = true
    }
  }, [])

  const toggleDesktopRail = () => {
    setDesktopExpanded(expanded => !expanded)
  }

  const renderNavigationLink = (
    item: NavigationLinkDefinition,
    expanded: boolean,
    onNavigate?: () => void,
  ) => {
    const label = t(item.labelKey)
    const isActive = item.isActive(pathname, activeStewardshipTab)
    const Icon = item.icon
    return (
      <Link
        aria-current={isActive ? 'page' : undefined}
        aria-label={expanded ? undefined : label}
        className={getNavigationLinkClassName(isActive, expanded)}
        href={item.href}
        key={item.id}
        onClick={() => {
          if (item.stewardshipTab) {
            rememberStewardshipTab(item.stewardshipTab)
          }
          onNavigate?.()
        }}
        title={label}
        {...devMarker({
          context: 'navigation',
          name: 'nav link',
          value: item.id,
        })}
      >
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
        {expanded ? (
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        ) : null}
      </Link>
    )
  }

  const renderRequirementAreasLink = (
    expanded: boolean,
    onNavigate?: () => void,
  ) => {
    if (!canOpenRequirementAreas) return null
    const label = t('areas')
    const isActive = pathname.startsWith('/requirement-areas')
    return (
      <Link
        aria-current={isActive ? 'page' : undefined}
        aria-label={expanded ? undefined : label}
        className={getNavigationLinkClassName(isActive, expanded)}
        href="/requirement-areas"
        onClick={onNavigate}
        title={label}
        {...devMarker({
          context: 'navigation',
          name: 'nav link',
          value: 'requirement-areas',
        })}
      >
        <FolderTree aria-hidden="true" className="h-5 w-5 shrink-0" />
        {expanded ? (
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        ) : null}
      </Link>
    )
  }

  const renderHelpButton = (expanded: boolean, onClick?: () => void) => {
    if (helpContent === null) return null
    const label = tc('help')
    return (
      <button
        aria-label={expanded ? undefined : label}
        aria-pressed={helpOpen}
        className={getNavigationLinkClassName(helpOpen, expanded)}
        onClick={() => {
          toggleHelp()
          onClick?.()
        }}
        title={label}
        type="button"
        {...devMarker({
          context: 'navigation',
          name: 'button',
          value: `help toggle ${helpOpen ? 'open' : 'closed'}`,
        })}
      >
        <Info aria-hidden="true" className="h-5 w-5 shrink-0" />
        {expanded ? (
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        ) : null}
      </button>
    )
  }

  const renderSettingsLink = (expanded: boolean, onNavigate?: () => void) => {
    const label = ta('settings')
    const isActive = pathname.startsWith('/admin')
    return (
      <Link
        aria-current={isActive ? 'page' : undefined}
        aria-label={expanded ? undefined : label}
        className={getNavigationLinkClassName(isActive, expanded)}
        href="/admin"
        onClick={onNavigate}
        title={label}
        {...devMarker({
          context: 'navigation',
          name: 'link',
          value: 'settings',
        })}
      >
        <Settings2 aria-hidden="true" className="h-5 w-5 shrink-0" />
        {expanded ? (
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        ) : null}
      </Link>
    )
  }

  const renderRailContents = (
    expanded: boolean,
    {
      closeOnNavigate = false,
      mobile = false,
    }: { closeOnNavigate?: boolean; mobile?: boolean } = {},
  ) => {
    const close = closeOnNavigate ? closeMobileDrawer : undefined
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        <NavigationSection
          expanded={expanded}
          hideCollapsedDivider
          label={t('work')}
        >
          {workNavItems.map(item =>
            renderNavigationLink(item, expanded, close),
          )}
        </NavigationSection>
        <NavigationSection expanded={expanded} label={t('stewardship')}>
          {renderRequirementAreasLink(expanded, close)}
          {stewardshipNavItems.map(item =>
            renderNavigationLink(item, expanded, close),
          )}
        </NavigationSection>
        <NavigationSection expanded={expanded} label={t('utilities')}>
          {renderHelpButton(expanded, mobile ? close : undefined)}
          {renderSettingsLink(expanded, close)}
          <LanguageSwitcher expanded={expanded} variant="rail" />
          <ThemeToggle expanded={expanded} variant="rail" />
          <AuthMenu expanded={expanded} variant={mobile ? 'mobile' : 'rail'} />
        </NavigationSection>
      </div>
    )
  }

  return (
    <>
      <nav
        aria-label={t('mainNavigation')}
        className="fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-secondary-200/80 bg-white/92 shadow-[12px_0_40px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-[width] duration-200 md:flex dark:border-secondary-800 dark:bg-secondary-950/92"
        data-global-navigation-rail="desktop"
        style={{
          width: desktopExpanded
            ? NAV_RAIL_EXPANDED_WIDTH
            : NAV_RAIL_COLLAPSED_WIDTH,
        }}
        {...devMarker({
          name: 'navigation',
          priority: 320,
          value: 'global side rail',
        })}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-secondary-200/70 px-3 py-4 dark:border-secondary-800">
          <button
            aria-label={desktopExpanded ? t('collapseRail') : t('expandRail')}
            className="inline-flex min-h-11 w-12 min-w-11 items-center justify-center rounded-xl text-secondary-700 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950"
            onClick={toggleDesktopRail}
            title={desktopExpanded ? t('collapseRail') : t('expandRail')}
            type="button"
            {...devMarker({
              context: 'navigation',
              name: 'button',
              value: desktopExpanded ? 'collapse rail' : 'expand rail',
            })}
          >
            {desktopExpanded ? (
              <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
            ) : (
              <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
          <Link
            aria-label={tc('appName')}
            className={`inline-flex min-h-11 min-w-11 items-center rounded-xl font-bold text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-primary-300 dark:hover:bg-primary-950/60 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950 ${
              desktopExpanded
                ? 'justify-start gap-3 px-3'
                : 'justify-center px-0'
            }`}
            href="/requirements"
            title={buildVersionTitle}
            {...devMarker({
              context: 'navigation',
              name: 'link',
              value: 'app title',
            })}
          >
            <Logo className="h-8 w-8 shrink-0" />
            {desktopExpanded ? (
              <span className="min-w-0 truncate text-base tracking-tight">
                {tc('appName')}
              </span>
            ) : null}
          </Link>
        </div>
        {renderRailContents(desktopExpanded)}
      </nav>

      {!mobileOpen ? (
        <button
          aria-expanded={mobileOpen}
          aria-label={t('openMenu')}
          className={mobileDrawerToggleButtonClassName}
          onClick={event => openMobileDrawer(event.currentTarget)}
          ref={mobileDrawerReturnFocusRef}
          title={t('openMenu')}
          type="button"
          {...devMarker({
            context: 'navigation',
            name: 'button',
            value: 'open mobile drawer',
          })}
        >
          <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : null}

      {mobileOpen ? (
        <div
          aria-label={t('mainMenu')}
          aria-modal="true"
          className="fixed inset-0 z-50 md:hidden"
          onKeyDown={handleMobileDrawerKeyDown}
          ref={mobileDrawerRef}
          role="dialog"
        >
          <button
            aria-label={t('closeMenu')}
            className="absolute inset-0 h-full w-full bg-secondary-950/35 backdrop-blur-sm"
            onClick={closeMobileDrawer}
            tabIndex={-1}
            type="button"
          />
          <button
            aria-expanded={mobileOpen}
            aria-label={t('closeMenu')}
            className={mobileDrawerToggleButtonClassName}
            onClick={closeMobileDrawer}
            ref={mobileCloseButtonRef}
            title={t('closeMenu')}
            type="button"
            {...devMarker({
              context: 'navigation',
              name: 'button',
              value: 'close mobile drawer',
            })}
          >
            <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="relative flex h-full w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-secondary-200 bg-white shadow-2xl dark:border-secondary-800 dark:bg-secondary-950">
            <div className="flex shrink-0 items-center border-b border-secondary-200/70 py-3 pl-16 pr-4 dark:border-secondary-800">
              <Link
                className="inline-flex min-h-11 min-w-0 items-center gap-3 rounded-xl pr-3 font-bold text-primary-700 dark:text-primary-300"
                href="/requirements"
                onClick={closeMobileDrawer}
                title={buildVersionTitle}
                {...devMarker({
                  context: 'navigation',
                  name: 'link',
                  value: 'app title',
                })}
              >
                <Logo className="h-8 w-8 shrink-0" />
                <span className="min-w-0 truncate text-base tracking-tight">
                  {tc('appName')}
                </span>
              </Link>
            </div>
            <nav
              aria-label={t('mainNavigation')}
              className="flex min-h-0 flex-1 flex-col"
              data-global-navigation-rail="mobile-drawer"
              {...devMarker({
                name: 'navigation',
                priority: 320,
                value: 'mobile drawer',
              })}
            >
              {renderRailContents(true, {
                closeOnNavigate: true,
                mobile: true,
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  )
}
