'use client'

import {
  Archive,
  CircleDot,
  ClipboardCheck,
  FileText,
  KeyRound,
  LayoutPanelTop,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  Tags,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { lazy, useEffect, useState } from 'react'
import type { ActionAuditLogInitialState } from '@/components/admin/ActionAuditLogView'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import AdminLazyPanel from './admin-lazy-panel'

const AccessReviewPanel = lazy(() => import('./panels/access-review-panel'))
const ActionAuditLogPanel = lazy(
  () => import('./panels/action-audit-log-panel'),
)
const AiSettingsPanel = lazy(() => import('./panels/ai-settings-panel'))
const ArchivingPanel = lazy(() => import('./panels/archiving-panel'))
const ColumnsPanel = lazy(() => import('./panels/columns-panel'))
const IdentitySettingsPanel = lazy(() => import('./panels/identity-panel'))
const PrivacyErasurePanel = lazy(() => import('./panels/privacy-panel'))
const StatusesAndWorkflowsPanel = lazy(
  () => import('./panels/statuses-and-workflows-panel'),
)
const TaxonomyPanel = lazy(() => import('./panels/taxonomy-panel'))

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

export type AdminTab =
  | 'accessReview'
  | 'actionAuditLog'
  | 'ai'
  | 'archiving'
  | 'columns'
  | 'identity'
  | 'privacy'
  | 'statusesAndWorkflows'
  | 'taxonomy'

type TabFallbackReason = 'unauthorized' | 'unavailable'

const ADMIN_ROLE = 'Admin'
const PRIVACY_OFFICER_ROLE = 'PrivacyOfficer'
const EMPTY_USER_ROLES: string[] = []

export const adminTabs: ReadonlyArray<{ icon: LucideIcon; id: AdminTab }> = [
  { icon: LayoutPanelTop, id: 'columns' },
  { icon: KeyRound, id: 'identity' },
  { icon: Sparkles, id: 'ai' },
  { icon: Tags, id: 'taxonomy' },
  { icon: CircleDot, id: 'statusesAndWorkflows' },
  { icon: ClipboardCheck, id: 'accessReview' },
  { icon: Archive, id: 'archiving' },
  { icon: ShieldCheck, id: 'privacy' },
  { icon: FileText, id: 'actionAuditLog' },
]

const ADMIN_TAB_DEVELOPER_MODE_VALUES: Record<AdminTab, string> = {
  accessReview: 'access review',
  actionAuditLog: 'action log',
  ai: 'ai',
  archiving: 'archiving',
  columns: 'columns',
  identity: 'identity',
  privacy: 'privacy',
  statusesAndWorkflows: 'statuses and workflows',
  taxonomy: 'taxonomy',
}

const ADMIN_TAB_QUERY_KEY = 'tab'

export function canAccessAdminTab(
  tab: AdminTab,
  roles: readonly string[],
): boolean {
  const isAdmin = roles.includes(ADMIN_ROLE)
  const isPrivacyOfficer = roles.includes(PRIVACY_OFFICER_ROLE)

  if (tab === 'accessReview') return isAdmin || isPrivacyOfficer
  if (tab === 'archiving' || tab === 'privacy') return isPrivacyOfficer
  return isAdmin
}

export function firstAuthorizedAdminTab(
  roles: readonly string[],
): AdminTab | undefined {
  return adminTabs.find(tab => canAccessAdminTab(tab.id, roles))?.id
}

function isAdminTab(value: string): value is AdminTab {
  return adminTabs.some(tab => tab.id === value)
}

function resolveAdminTab(
  searchParams: URLSearchParams,
  roles: readonly string[],
): { reason?: TabFallbackReason; tab: AdminTab } {
  const fallback = firstAuthorizedAdminTab(roles) ?? adminTabs[0].id
  const requestedTab = searchParams.get(ADMIN_TAB_QUERY_KEY)

  if (requestedTab === null) return { tab: fallback }
  if (!isAdminTab(requestedTab)) {
    return { reason: 'unavailable', tab: fallback }
  }
  if (!canAccessAdminTab(requestedTab, roles)) {
    return { reason: 'unauthorized', tab: fallback }
  }

  return { tab: requestedTab }
}

function getAdminTabHref(
  tab: AdminTab,
  searchParams: URLSearchParams,
  roles: readonly string[],
) {
  const query = Object.fromEntries(searchParams.entries())
  const firstAuthorizedTab = firstAuthorizedAdminTab(roles)

  if (firstAuthorizedTab === undefined || tab === firstAuthorizedTab) {
    delete query[ADMIN_TAB_QUERY_KEY]
  } else {
    query[ADMIN_TAB_QUERY_KEY] = tab
  }

  return Object.keys(query).length > 0
    ? { pathname: '/admin', query }
    : '/admin'
}

function adminTabLabel(
  tab: AdminTab,
  t: ReturnType<typeof useTranslations<'admin'>>,
): string {
  if (tab === 'privacy') return t('privacy.title')
  if (tab === 'accessReview') return t('accessReview.title')
  if (tab === 'identity') return t('identity.title')
  if (tab === 'ai') return t('ai.title')
  if (tab === 'archiving') return t('archiving.title')
  if (tab === 'actionAuditLog') return t('auditLog.title')
  return t(tab)
}

function panelHelp(activeTab: AdminTab): HelpContent {
  if (activeTab === 'privacy') return ADMIN_PRIVACY_HELP
  if (activeTab === 'accessReview') return ADMIN_ACCESS_REVIEW_HELP
  if (activeTab === 'identity') return ADMIN_IDENTITY_HELP
  if (activeTab === 'ai') return ADMIN_AI_HELP
  return ADMIN_HELP
}

export default function AdminClient({
  actionAuditLog,
  currentUserRoles = EMPTY_USER_ROLES,
}: {
  actionAuditLog?: ActionAuditLogInitialState
  currentUserRoles?: string[]
}) {
  const ta = useTranslations('admin')
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialResolution = resolveAdminTab(
    new URLSearchParams(searchParams),
    currentUserRoles,
  )
  const [activeTab, setActiveTab] = useState<AdminTab>(initialResolution.tab)
  const [fallbackReason, setFallbackReason] = useState<
    TabFallbackReason | undefined
  >(initialResolution.reason)
  const authorizedTabs = adminTabs.filter(tab =>
    canAccessAdminTab(tab.id, currentUserRoles),
  )
  const activeTabLabel = adminTabLabel(activeTab, ta)
  const canRenderActiveTab = canAccessAdminTab(activeTab, currentUserRoles)

  useHelpContent(panelHelp(activeTab))

  useEffect(() => {
    const resolution = resolveAdminTab(
      new URLSearchParams(searchParams),
      currentUserRoles,
    )
    setActiveTab(resolution.tab)
    setFallbackReason(resolution.reason)

    if (resolution.reason) {
      router.replace(
        getAdminTabHref(
          resolution.tab,
          new URLSearchParams(searchParams),
          currentUserRoles,
        ),
        { scroll: false },
      )
    }
  }, [currentUserRoles, router, searchParams])

  const selectTab = (tab: AdminTab) => {
    if (!canAccessAdminTab(tab, currentUserRoles)) return

    setFallbackReason(undefined)
    setActiveTab(tab)
    router.replace(
      getAdminTabHref(tab, new URLSearchParams(searchParams), currentUserRoles),
      { scroll: false },
    )
  }

  const panel = (() => {
    if (!canRenderActiveTab) return null

    switch (activeTab) {
      case 'columns':
        return <ColumnsPanel />
      case 'identity':
        return <IdentitySettingsPanel />
      case 'ai':
        return <AiSettingsPanel />
      case 'taxonomy':
        return <TaxonomyPanel />
      case 'statusesAndWorkflows':
        return <StatusesAndWorkflowsPanel />
      case 'accessReview':
        return <AccessReviewPanel canManage />
      case 'archiving':
        return <ArchivingPanel />
      case 'privacy':
        return <PrivacyErasurePanel />
      case 'actionAuditLog':
        return <ActionAuditLogPanel initialState={actionAuditLog} />
    }
  })()

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
              className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-secondary-200/80 bg-white/80 p-1 dark:border-secondary-700/70 dark:bg-secondary-900/70 xl:w-max xl:shrink-0"
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
