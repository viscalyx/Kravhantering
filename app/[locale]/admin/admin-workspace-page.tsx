import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  Suspense,
} from 'react'
import type { ActionAuditLogInitialState } from '@/components/admin/ActionAuditLogView'
import { listActionAuditEvents } from '@/lib/audit/action-audit'
import {
  type ActionAuditLogSearchParams,
  actionAuditLogFiltersFromSearchParams,
} from '@/lib/audit/action-audit-query'
import { canAccessAdminCenter } from '@/lib/auth/roles'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { getRequestSqlServerDataSource } from '@/lib/db'
import AdminAccessDenied from './admin-access-denied'
import AdminClient from './admin-client'
import {
  type AdminTab,
  canAccessAdminTab,
  firstAuthorizedAdminTab,
} from './admin-tabs'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<ActionAuditLogSearchParams>

interface AdminWorkspacePageProps {
  children: ReactElement<{ initialState?: ActionAuditLogInitialState }>
  params: PageParams
  searchParams?: SearchParams
  tab: AdminTab
}

function loadingFallback(label: string): ReactNode {
  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8" role="status">
      <span className="sr-only">{label}</span>
      <div className="container-custom space-y-6">
        <div className="h-40 rounded-4xl border border-secondary-200/70 bg-secondary-100/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
        <div className="h-64 rounded-4xl border border-secondary-200/70 bg-white/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
      </div>
    </div>
  )
}

export default async function AdminWorkspacePage({
  children,
  params,
  searchParams,
  tab,
}: AdminWorkspacePageProps) {
  const [{ locale }, session] = await Promise.all([params, getSession()])
  const currentUserRoles = isSignedIn(session) ? session.roles : []

  if (!canAccessAdminCenter(currentUserRoles)) {
    return AdminAccessDenied({ locale })
  }

  if (!canAccessAdminTab(tab, currentUserRoles)) {
    const fallbackTab = firstAuthorizedAdminTab(currentUserRoles)
    if (fallbackTab === undefined) {
      return AdminAccessDenied({ locale })
    }
    if (fallbackTab === 'columns') {
      redirect(`/${locale}/admin`)
    }
    redirect(`/${locale}/admin?tab=${fallbackTab}`)
  }

  let panel = children
  if (tab === 'actionAuditLog') {
    const query = searchParams ? await searchParams : {}
    const actionAuditLog = {
      query,
      result: await listActionAuditEvents(
        await getRequestSqlServerDataSource(),
        actionAuditLogFiltersFromSearchParams(query),
      ),
    }
    panel = cloneElement(children, { initialState: actionAuditLog })
  }

  const t = await getTranslations({ locale, namespace: 'admin' })

  return (
    <Suspense fallback={loadingFallback(t('loading'))}>
      <AdminClient currentUserRoles={currentUserRoles} selectedTab={tab}>
        {panel}
      </AdminClient>
    </Suspense>
  )
}
