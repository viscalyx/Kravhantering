import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import ActionAuditLogView, {
  actionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'
import ListWorkspace from '@/components/ListWorkspace'
import { routing } from '@/i18n/routing'
import { listActionAuditEvents } from '@/lib/audit/action-audit'
import {
  type ActionAuditLogSearchParams,
  actionAuditLogFiltersFromSearchParams,
} from '@/lib/audit/action-audit-query'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { getRequestSqlServerDataSource } from '@/lib/db'

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
  const t = await getTranslations({ locale, namespace: 'admin.auditLog' })
  return { title: t('title') }
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'admin.auditLog' })
  const session = await getSession()
  if (!isSignedIn(session) || !session.roles.includes('Admin')) {
    notFound()
  }

  const query = await searchParams
  const db = await getRequestSqlServerDataSource()
  const result = await listActionAuditEvents(
    db,
    actionAuditLogFiltersFromSearchParams(query),
  )

  return (
    <main className="section-padding">
      <ListWorkspace className="space-y-6" context="action audit log">
        <ActionAuditLogView
          basePath={`/${locale}/admin/audit-log`}
          labels={actionAuditLogLabels(t)}
          locale={locale}
          query={query}
          result={result}
        />
      </ListWorkspace>
    </main>
  )
}
