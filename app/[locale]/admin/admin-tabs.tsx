import {
  Archive,
  CircleDot,
  ClipboardCheck,
  FileText,
  KeyRound,
  LayoutPanelTop,
  type LucideIcon,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
} from 'lucide-react'

export type AdminTab =
  | 'accessReview'
  | 'actionAuditLog'
  | 'settings'
  | 'archiving'
  | 'columns'
  | 'identity'
  | 'privacy'
  | 'statusesAndWorkflows'
  | 'taxonomy'

export type TabFallbackReason = 'unauthorized' | 'unavailable'

export const ADMIN_TAB_FALLBACK_QUERY_KEY = '_adminFallback'

const ADMIN_ROLE = 'Admin'
const PRIVACY_OFFICER_ROLE = 'PrivacyOfficer'

export const adminTabs: ReadonlyArray<{ icon: LucideIcon; id: AdminTab }> = [
  { icon: LayoutPanelTop, id: 'columns' },
  { icon: KeyRound, id: 'identity' },
  { icon: SlidersHorizontal, id: 'settings' },
  { icon: Tags, id: 'taxonomy' },
  { icon: CircleDot, id: 'statusesAndWorkflows' },
  { icon: ClipboardCheck, id: 'accessReview' },
  { icon: Archive, id: 'archiving' },
  { icon: ShieldCheck, id: 'privacy' },
  { icon: FileText, id: 'actionAuditLog' },
]

export const ADMIN_TAB_DEVELOPER_MODE_VALUES: Record<AdminTab, string> = {
  accessReview: 'access review',
  actionAuditLog: 'action log',
  settings: 'settings',
  archiving: 'archiving',
  columns: 'columns',
  identity: 'identity',
  privacy: 'privacy',
  statusesAndWorkflows: 'statuses and workflows',
  taxonomy: 'taxonomy',
}

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

export function resolveAdminTab(
  searchParams: URLSearchParams,
  roles: readonly string[],
): { reason?: TabFallbackReason; tab: AdminTab } {
  const fallback = firstAuthorizedAdminTab(roles) ?? adminTabs[0].id
  const requestedTab = searchParams.get('tab')

  if (requestedTab === null) return { tab: fallback }
  if (!isAdminTab(requestedTab)) {
    return { reason: 'unavailable', tab: fallback }
  }
  if (!canAccessAdminTab(requestedTab, roles)) {
    return { reason: 'unauthorized', tab: fallback }
  }

  return { tab: requestedTab }
}

export function adminTabFallbackReason(
  searchParams: URLSearchParams,
): TabFallbackReason | undefined {
  const reason = searchParams.get(ADMIN_TAB_FALLBACK_QUERY_KEY)
  return reason === 'unauthorized' || reason === 'unavailable'
    ? reason
    : undefined
}

export function getAdminTabFallbackCleanupHref(searchParams: URLSearchParams) {
  const query = Object.fromEntries(searchParams.entries())
  delete query[ADMIN_TAB_FALLBACK_QUERY_KEY]

  return Object.keys(query).length > 0
    ? { pathname: '/admin', query }
    : '/admin'
}

export function getAdminTabHref(
  tab: AdminTab,
  searchParams: URLSearchParams,
  roles: readonly string[],
) {
  const query = Object.fromEntries(searchParams.entries())
  const firstAuthorizedTab = firstAuthorizedAdminTab(roles)

  delete query[ADMIN_TAB_FALLBACK_QUERY_KEY]

  if (firstAuthorizedTab === undefined || tab === firstAuthorizedTab) {
    delete query.tab
  } else {
    query.tab = tab
  }

  return Object.keys(query).length > 0
    ? { pathname: '/admin', query }
    : '/admin'
}
