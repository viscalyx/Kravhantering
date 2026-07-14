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
import { canAccessAdminCenter } from '@/lib/auth/roles'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { devMarker } from '@/lib/developer-mode-markers'
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
  const [query, session] = await Promise.all([searchParams, getSession()])
  const currentUserRoles = isSignedIn(session) ? session.roles : []
  if (!canAccessAdminCenter(currentUserRoles)) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <section
          className="container-custom rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
          {...devMarker({
            context: 'admin center',
            name: 'access denied',
            priority: 360,
            value: 'missing Admin or PrivacyOfficer role',
          })}
        >
          <h1 className="text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50">
            {t('accessDenied.title')}
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
            {t('accessDenied.description')}
          </p>
        </section>
      </div>
    )
  }

  const canViewActionAuditLog = currentUserRoles.includes('Admin')
  const actionAuditLog =
    canViewActionAuditLog &&
    firstSearchParamValue(query.tab) === 'actionAuditLog'
      ? {
          query,
          result: await listActionAuditEvents(
            await getRequestSqlServerDataSource(),
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
            <div className="h-40 rounded-4xl border border-secondary-200/70 bg-secondary-100/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
            <div className="h-64 rounded-4xl border border-secondary-200/70 bg-white/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
          </div>
        </div>
      }
    >
      <AdminClient
        actionAuditLog={actionAuditLog}
        currentUserRoles={currentUserRoles}
      />
    </Suspense>
  )
}
