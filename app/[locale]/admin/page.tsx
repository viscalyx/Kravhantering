import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { routing } from '@/i18n/routing'
import { listActionAuditEvents } from '@/lib/audit/action-audit'
import {
  type ActionAuditLogSearchParams,
  actionAuditLogFiltersFromSearchParams,
  firstSearchParamValue,
} from '@/lib/audit/action-audit-query'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { getRequirementListColumnDefaults } from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import AdminClient from './admin-client'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<ActionAuditLogSearchParams>

function resolveLocale(requestedLocale: string): 'sv' | 'en' {
  return routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
}

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('title') }
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'admin' })
  const db = await getRequestSqlServerDataSource()
  const [query, session, initialColumnDefaults] = await Promise.all([
    searchParams,
    getSession(),
    getRequirementListColumnDefaults(db),
  ])
  const currentUserRoles = isSignedIn(session) ? session.roles : []
  const canManageAccessReviews = currentUserRoles.includes('Admin')
  const actionAuditLog =
    canManageAccessReviews &&
    firstSearchParamValue(query.tab) === 'actionAuditLog'
      ? {
          query,
          result: await listActionAuditEvents(
            db,
            actionAuditLogFiltersFromSearchParams(query),
          ),
        }
      : undefined

  return (
    <Suspense
      fallback={
        <div className="section-padding px-4 sm:px-6 lg:px-8" role="status">
          <span className="sr-only">{t('loading')}</span>
          <div className="container-custom space-y-6">
            <div className="h-40 rounded-[2rem] border border-secondary-200/70 bg-secondary-100/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
            <div className="h-64 rounded-[2rem] border border-secondary-200/70 bg-white/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
          </div>
        </div>
      }
    >
      <AdminClient
        actionAuditLog={actionAuditLog}
        currentUserRoles={currentUserRoles}
        initialColumnDefaults={initialColumnDefaults}
      />
    </Suspense>
  )
}
