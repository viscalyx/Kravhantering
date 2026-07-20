'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import AdminLazyPanel from './admin-lazy-panel'
import {
  ADMIN_TAB_DEVELOPER_MODE_VALUES,
  ADMIN_TAB_FALLBACK_QUERY_KEY,
  type AdminTab,
  adminTabFallbackReason,
  adminTabs,
  canAccessAdminTab,
  getAdminTabFallbackCleanupHref,
  getAdminTabHref,
  resolveAdminTab,
  type TabFallbackReason,
} from './admin-tabs'

const ADMIN_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'admin.columns.body',
      headingKey: 'admin.columns.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.identity.body',
      headingKey: 'admin.identity.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.taxonomy.body',
      headingKey: 'admin.taxonomy.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.statusesAndWorkflows.body',
      headingKey: 'admin.statusesAndWorkflows.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.privacy.body',
      headingKey: 'admin.privacy.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.accessReview.body',
      headingKey: 'admin.accessReview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.archiving.body',
      headingKey: 'admin.archiving.heading',
    },
  ],
  titleKey: 'admin.title',
}

const ADMIN_PRIVACY_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.overview.body',
      headingKey: 'adminPrivacy.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.permissions.body',
      headingKey: 'adminPrivacy.permissions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.search.body',
      headingKey: 'adminPrivacy.search.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.replacement.body',
      headingKey: 'adminPrivacy.replacement.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.preview.body',
      headingKey: 'adminPrivacy.preview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.actions.body',
      headingKey: 'adminPrivacy.actions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.execution.body',
      headingKey: 'adminPrivacy.execution.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.audit.body',
      headingKey: 'adminPrivacy.audit.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.caveats.body',
      headingKey: 'adminPrivacy.caveats.heading',
    },
  ],
  titleKey: 'adminPrivacy.title',
}

const ADMIN_IDENTITY_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'adminIdentity.overview.body',
      headingKey: 'adminIdentity.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminIdentity.prefixes.body',
      headingKey: 'adminIdentity.prefixes.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminIdentity.visibility.body',
      headingKey: 'adminIdentity.visibility.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminIdentity.defaultPrefix.body',
      headingKey: 'adminIdentity.defaultPrefix.heading',
    },
  ],
  titleKey: 'adminIdentity.title',
}

const ADMIN_AI_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'adminAi.overview.body',
      headingKey: 'adminAi.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.settings.body',
      headingKey: 'adminAi.settings.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.precedence.body',
      headingKey: 'adminAi.precedence.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.safetyRules.body',
      headingKey: 'adminAi.safetyRules.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.ruleTypes.body',
      headingKey: 'adminAi.ruleTypes.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.termGroups.body',
      headingKey: 'adminAi.termGroups.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.termColumns.body',
      headingKey: 'adminAi.termColumns.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAi.saving.body',
      headingKey: 'adminAi.saving.heading',
    },
  ],
  titleKey: 'adminAi.title',
}

const ADMIN_ACCESS_REVIEW_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.overview.body',
      headingKey: 'adminAccessReview.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.scope.body',
      headingKey: 'adminAccessReview.scope.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.decisions.body',
      headingKey: 'adminAccessReview.decisions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.evidence.body',
      headingKey: 'adminAccessReview.evidence.heading',
    },
  ],
  titleKey: 'adminAccessReview.title',
}

const EMPTY_USER_ROLES: string[] = []

function adminTabLabel(
  tab: AdminTab,
  t: ReturnType<typeof useTranslations<'admin'>>,
): string {
  if (tab === 'privacy') return t('privacy.title')
  if (tab === 'accessReview') return t('accessReview.title')
  if (tab === 'identity') return t('identity.title')
  if (tab === 'settings') return t('settings')
  if (tab === 'archiving') return t('archiving.title')
  if (tab === 'actionAuditLog') return t('auditLog.title')
  return t(tab)
}

function panelHelp(activeTab: AdminTab): HelpContent {
  if (activeTab === 'privacy') return ADMIN_PRIVACY_HELP
  if (activeTab === 'accessReview') return ADMIN_ACCESS_REVIEW_HELP
  if (activeTab === 'identity') return ADMIN_IDENTITY_HELP
  if (activeTab === 'settings') return ADMIN_AI_HELP
  return ADMIN_HELP
}

export default function AdminClient({
  children,
  currentUserRoles = EMPTY_USER_ROLES,
  renderPanel,
  selectedTab,
}: {
  children?: ReactNode
  currentUserRoles?: string[]
  renderPanel?: (activeTab: AdminTab) => ReactNode
  selectedTab?: AdminTab
}) {
  const ta = useTranslations('admin')
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialResolution = resolveAdminTab(
    new URLSearchParams(searchParams),
    currentUserRoles,
  )
  const initialFallbackReason =
    adminTabFallbackReason(new URLSearchParams(searchParams)) ??
    initialResolution.reason
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<AdminTab>(
    initialResolution.tab,
  )
  const [fallbackReason, setFallbackReason] = useState<
    TabFallbackReason | undefined
  >(initialFallbackReason)
  const activeTab = selectedTab ?? uncontrolledActiveTab
  const authorizedTabs = adminTabs.filter(tab =>
    canAccessAdminTab(tab.id, currentUserRoles),
  )
  const activeTabLabel = adminTabLabel(activeTab, ta)
  const canRenderActiveTab = canAccessAdminTab(activeTab, currentUserRoles)

  useHelpContent(panelHelp(activeTab))

  useEffect(() => {
    const currentSearchParams = new URLSearchParams(searchParams)
    const handedOffFallbackReason = adminTabFallbackReason(currentSearchParams)

    if (selectedTab !== undefined) {
      if (handedOffFallbackReason) {
        setFallbackReason(handedOffFallbackReason)
      }
      if (currentSearchParams.has(ADMIN_TAB_FALLBACK_QUERY_KEY)) {
        router.replace(getAdminTabFallbackCleanupHref(currentSearchParams), {
          scroll: false,
        })
      }
      return
    }

    const resolution = resolveAdminTab(currentSearchParams, currentUserRoles)
    setUncontrolledActiveTab(resolution.tab)
    setFallbackReason(handedOffFallbackReason ?? resolution.reason)

    if (
      resolution.reason ||
      currentSearchParams.has(ADMIN_TAB_FALLBACK_QUERY_KEY)
    ) {
      router.replace(
        getAdminTabHref(resolution.tab, currentSearchParams, currentUserRoles),
        { scroll: false },
      )
    }
  }, [currentUserRoles, router, searchParams, selectedTab])

  const selectTab = (tab: AdminTab) => {
    if (!canAccessAdminTab(tab, currentUserRoles)) return

    setFallbackReason(undefined)
    if (selectedTab === undefined) {
      setUncontrolledActiveTab(tab)
    }
    router.replace(
      getAdminTabHref(tab, new URLSearchParams(searchParams), currentUserRoles),
      { scroll: false },
    )
  }

  const panel = canRenderActiveTab
    ? (children ?? renderPanel?.(activeTab))
    : null

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <section className="overflow-hidden rounded-4xl border border-secondary-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(238,242,255,0.82))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)] backdrop-blur-md dark:border-secondary-700/60 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.86))]">
          <div className="space-y-4">
            <div className="space-y-2 xl:flex xl:flex-row xl:items-center xl:justify-between xl:gap-6">
              <h1 className="text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50 xl:shrink-0">
                {ta('title')}
              </h1>
              <p className="text-sm text-secondary-600 dark:text-secondary-300 xl:ml-auto xl:flex-1">
                {ta('description')}
              </p>
            </div>
            <div
              aria-label={ta('title')}
              className="flex max-w-full flex-wrap items-center gap-1 rounded-3xl border border-secondary-200/80 bg-white/80 p-1 dark:border-secondary-700/70 dark:bg-secondary-900/70"
              role="tablist"
              {...devMarker({
                name: 'navigation',
                priority: 320,
                value: 'admin center tabs',
              })}
            >
              {authorizedTabs.map(tab => {
                const label = adminTabLabel(tab.id, ta)

                return (
                  <button
                    aria-controls={`${tab.id}-panel`}
                    aria-selected={activeTab === tab.id}
                    className={`inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-700 text-white'
                        : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-200 dark:hover:bg-secondary-800'
                    }`}
                    id={`${tab.id}-tab`}
                    key={`admin-tab-${tab.id}`}
                    onClick={() => selectTab(tab.id)}
                    role="tab"
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    type="button"
                    {...devMarker({
                      context: 'admin center',
                      name: 'edge tab',
                      priority: 360,
                      value: ADMIN_TAB_DEVELOPER_MODE_VALUES[tab.id],
                    })}
                  >
                    <tab.icon aria-hidden="true" className="h-4 w-4" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {fallbackReason ? (
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
            {...devMarker({
              context: 'admin center',
              name: 'tab fallback notice',
              priority: 350,
              value: fallbackReason,
            })}
          >
            {ta(
              fallbackReason === 'unauthorized'
                ? 'tabAccessFallback'
                : 'tabUnavailableFallback',
              { tab: activeTabLabel },
            )}
          </div>
        ) : null}

        {panel ? (
          <AdminLazyPanel
            key={activeTab}
            tabId={activeTab}
            tabLabel={activeTabLabel}
          >
            {panel}
          </AdminLazyPanel>
        ) : null}
      </div>
    </div>
  )
}
