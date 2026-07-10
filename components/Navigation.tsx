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
import { useCallback, useEffect, useMemo, useState } from 'react'
import AuthMenu from '@/components/AuthMenu'
import { useHelp } from '@/components/HelpPanel'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import Logo from '@/components/Logo'
import {
  AppCollapsible,
  AppCollapsibleTrigger,
} from '@/components/primitives/AppCollapsible'
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppDialogTrigger,
} from '@/components/primitives/AppDialog'
import ThemeToggle from '@/components/ThemeToggle'
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
const NAV_RAIL_COLLAPSED_WIDTH = '5.25rem'
const NAV_RAIL_EXPANDED_WIDTH = '16.5rem'
const mobileDrawerToggleButtonClassName =
  'fixed left-3 top-3 z-50 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-secondary-950/10 bg-white/94 text-secondary-800 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-colors hover:bg-[#f6f5f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white md:hidden dark:border-white/10 dark:bg-[#111113]/94 dark:text-secondary-100 dark:hover:bg-[#1c1c20] dark:focus-visible:ring-violet-400/60 dark:focus-visible:ring-offset-[#111113]'

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

type DatabaseSchemaStatusValue = 'matches' | 'mismatch' | 'unknown'

interface DatabaseSchemaStatusResponse {
  expectedDatabaseSchemaVersion?: string | null
  observedDatabaseSchemaVersion?: string | null
  status: DatabaseSchemaStatusValue
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readOptionalString(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined
}

function parseDatabaseSchemaStatusResponse(
  value: unknown,
): DatabaseSchemaStatusResponse | null {
  if (!isRecord(value)) return null
  if (
    value.status !== 'matches' &&
    value.status !== 'mismatch' &&
    value.status !== 'unknown'
  ) {
    return null
  }

  return {
    expectedDatabaseSchemaVersion: readOptionalString(
      value.expectedDatabaseSchemaVersion,
    ),
    observedDatabaseSchemaVersion: readOptionalString(
      value.observedDatabaseSchemaVersion,
    ),
    status: value.status,
  }
}

function getNavigationLinkClassName(active: boolean, expanded: boolean) {
  return `group relative inline-flex min-h-11 w-full min-w-11 items-center rounded-md border text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-violet-400/60 dark:focus-visible:ring-offset-[#111113] ${
    expanded ? 'justify-start gap-3 px-3 py-2' : 'justify-center px-0 py-2'
  } ${
    active
      ? 'border-secondary-950 bg-secondary-950 text-white shadow-[0_12px_28px_-20px_rgba(0,0,0,0.75)] dark:border-white dark:bg-white dark:text-[#111113]'
      : 'border-transparent text-secondary-700 hover:border-secondary-950/10 hover:bg-white dark:text-secondary-300 dark:hover:border-white/10 dark:hover:bg-[#1c1c20]'
  }`
}

function getNavigationIconClassName(active: boolean) {
  return `flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
    active
      ? 'bg-white/[0.12] text-white dark:bg-[#111113]/10 dark:text-[#111113]'
      : 'bg-secondary-950/[0.03] text-secondary-600 group-hover:bg-violet-50 group-hover:text-violet-700 dark:bg-white/[0.04] dark:text-secondary-300 dark:group-hover:bg-violet-400/10 dark:group-hover:text-violet-200'
  }`
}

function NavigationItemContent({
  active,
  expanded,
  icon: Icon,
  label,
}: {
  active: boolean
  expanded: boolean
  icon: typeof LibraryBig
  label: string
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-opacity ${
          active ? 'bg-violet-300 opacity-100 dark:bg-violet-700' : 'opacity-0'
        }`}
      />
      <span className={getNavigationIconClassName(active)}>
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      </span>
      {expanded ? (
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      ) : null}
    </>
  )
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
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary-500 dark:text-secondary-500">
          {label}
        </p>
      ) : hideCollapsedDivider ? null : (
        <div
          aria-hidden="true"
          className="mx-auto h-px w-7 bg-secondary-950/10 dark:bg-white/10"
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
  const [databaseSchemaStatus, setDatabaseSchemaStatus] =
    useState<DatabaseSchemaStatusResponse | null>(null)
  const {
    toggle: toggleHelp,
    content: helpContent,
    isOpen: helpOpen,
  } = useHelp()
  const activeStewardshipTab = useMemo(
    () => getActiveStewardshipTab(pathname, searchParams),
    [pathname, searchParams],
  )
  const buildVersionTitle = useMemo(() => {
    if (!buildMetadata) return undefined

    const parts = [
      tc('buildVersionTooltip', {
        version: buildMetadata.version,
      }),
    ]

    if (databaseSchemaStatus?.status === 'matches') {
      parts.push(tc('databaseSchemaMatchesTooltip'))
    } else if (databaseSchemaStatus?.status === 'mismatch') {
      parts.push(tc('databaseSchemaMismatchTooltip'))
      if (databaseSchemaStatus.observedDatabaseSchemaVersion !== undefined) {
        parts.push(
          databaseSchemaStatus.observedDatabaseSchemaVersion
            ? tc('databaseSchemaAdminMismatchTooltip', {
                expectedDatabaseSchemaVersion:
                  databaseSchemaStatus.expectedDatabaseSchemaVersion ??
                  buildMetadata.expectedDatabaseSchemaVersion,
                observedDatabaseSchemaVersion:
                  databaseSchemaStatus.observedDatabaseSchemaVersion,
              })
            : tc('databaseSchemaAdminMissingTooltip', {
                expectedDatabaseSchemaVersion:
                  databaseSchemaStatus.expectedDatabaseSchemaVersion ??
                  buildMetadata.expectedDatabaseSchemaVersion,
              }),
        )
      }
    } else if (databaseSchemaStatus?.status === 'unknown') {
      parts.push(tc('databaseSchemaUnavailableTooltip'))
    }

    return parts.join('\n')
  }, [buildMetadata, databaseSchemaStatus, tc])

  const closeMobileDrawer = useCallback(() => {
    setMobileOpen(false)
  }, [])

  useEffect(() => {
    if (readStoredRailExpanded()) {
      setDesktopExpanded(true)
    }
  }, [])

  const loadDatabaseSchemaStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/database-schema-status', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      const payload = (await response.json()) as unknown
      const parsed = parseDatabaseSchemaStatusResponse(payload)
      setDatabaseSchemaStatus(parsed ?? { status: 'unknown' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setDatabaseSchemaStatus({ status: 'unknown' })
    }
  }, [])

  useEffect(() => {
    if (!buildMetadata) return undefined

    const controller = new AbortController()
    void loadDatabaseSchemaStatus(controller.signal)

    return () => {
      controller.abort()
    }
  }, [buildMetadata, loadDatabaseSchemaStatus])

  useEffect(() => {
    if (!buildMetadata) return undefined

    let focusRefreshController: AbortController | null = null

    const refreshOnFocus = () => {
      focusRefreshController?.abort()
      focusRefreshController = new AbortController()
      void loadDatabaseSchemaStatus(focusRefreshController.signal)
    }

    window.addEventListener('focus', refreshOnFocus)

    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      focusRefreshController?.abort()
    }
  }, [buildMetadata, loadDatabaseSchemaStatus])

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
        <NavigationItemContent
          active={isActive}
          expanded={expanded}
          icon={Icon}
          label={label}
        />
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
        <NavigationItemContent
          active={isActive}
          expanded={expanded}
          icon={FolderTree}
          label={label}
        />
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
        <NavigationItemContent
          active={helpOpen}
          expanded={expanded}
          icon={Info}
          label={label}
        />
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
        <NavigationItemContent
          active={isActive}
          expanded={expanded}
          icon={Settings2}
          label={label}
        />
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
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
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

  const mobileDrawerButtonClassName = mobileDrawerToggleButtonClassName

  const mobileDrawerPortalContent = (
    <>
      <AppDialogOverlay className="fixed inset-0 z-50 bg-secondary-950/35 backdrop-blur-sm md:hidden" />
      <AppDialogContent
        aria-describedby={undefined}
        className="fixed inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col border-r border-secondary-950/10 bg-[#fbfbfd] shadow-2xl outline-none md:hidden dark:border-white/10 dark:bg-[#111113]"
        {...devMarker({
          name: 'navigation',
          priority: 320,
          value: 'mobile drawer',
        })}
        data-global-navigation-rail="mobile-drawer"
      >
        <AppDialogTitle className="sr-only">{t('mainMenu')}</AppDialogTitle>
        <AppDialogClose>
          <button
            aria-label={t('closeMenu')}
            className={mobileDrawerButtonClassName}
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
        </AppDialogClose>
        <div className="flex shrink-0 items-center border-b border-secondary-950/10 py-3 pl-16 pr-4 dark:border-white/10">
          <Link
            className="inline-flex min-h-11 min-w-0 items-center gap-3 rounded-md border border-secondary-950/10 bg-white px-3 font-bold text-secondary-950 dark:border-white/10 dark:bg-[#1c1c20] dark:text-white"
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
        >
          {renderRailContents(true, {
            closeOnNavigate: true,
            mobile: true,
          })}
        </nav>
      </AppDialogContent>
    </>
  )

  const navigationShell = (
    <>
      <AppCollapsible onOpenChange={setDesktopExpanded} open={desktopExpanded}>
        <nav
          aria-label={t('mainNavigation')}
          className="fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-secondary-950/10 bg-[#fbfbfd]/95 shadow-[20px_0_50px_-38px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-[width] duration-200 md:flex dark:border-white/10 dark:bg-[#111113]/95"
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
          <div className="flex shrink-0 flex-col gap-3 border-b border-secondary-950/10 px-3 py-3 dark:border-white/10">
            <AppCollapsibleTrigger>
              <button
                aria-label={
                  desktopExpanded ? t('collapseRail') : t('expandRail')
                }
                className="inline-flex min-h-11 w-12 min-w-11 items-center justify-center rounded-md border border-transparent text-secondary-700 transition-colors hover:border-secondary-950/10 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:border-white/10 dark:hover:bg-[#1c1c20] dark:focus-visible:ring-violet-400/60 dark:focus-visible:ring-offset-[#111113]"
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
            </AppCollapsibleTrigger>
            <Link
              aria-label={tc('appName')}
              className={`inline-flex min-h-11 min-w-11 items-center rounded-md border border-secondary-950/10 bg-white font-bold text-secondary-950 shadow-[0_12px_28px_-24px_rgba(0,0,0,0.5)] transition-colors hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-[#1c1c20] dark:text-white dark:hover:border-violet-400/50 dark:focus-visible:ring-violet-400/60 dark:focus-visible:ring-offset-[#111113] ${
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
      </AppCollapsible>

      <AppDialog onOpenChange={setMobileOpen} open={mobileOpen}>
        <AppDialogTrigger>
          <button
            aria-label={t('openMenu')}
            className={mobileDrawerButtonClassName}
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
        </AppDialogTrigger>
        <AppDialogPortal>{mobileDrawerPortalContent}</AppDialogPortal>
      </AppDialog>
    </>
  )

  return navigationShell
}
