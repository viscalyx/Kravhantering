import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import ActionAuditLogView, {
  type ActionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'
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

function auditLogLabels(
  t: Awaited<ReturnType<typeof getTranslations>>,
): ActionAuditLogLabels {
  return {
    action: t('action'),
    actor: t('actor'),
    actorHsaId: t('actorHsaId'),
    allDecisions: t('allDecisions'),
    allowed: t('allowed'),
    clear: t('clear'),
    clientIp: t('clientIp'),
    decision: t('decision'),
    denied: t('denied'),
    description: t('description'),
    empty: t('empty'),
    exportCsv: t('exportCsv'),
    eyebrow: t('eyebrow'),
    filter: t('filter'),
    from: t('from'),
    next: t('next'),
    occurredAt: t('occurredAt'),
    pagination: values => t('pagination', values),
    previous: t('previous'),
    requestId: t('requestId'),
    target: t('target'),
    targetId: t('targetId'),
    targetKind: t('targetKind'),
    title: t('title'),
    to: t('to'),
  }
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
    <main className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <ActionAuditLogView
          basePath={`/${locale}/admin/audit-log`}
          labels={auditLogLabels(t)}
          locale={locale}
          query={query}
          result={result}
        />
      </div>
    </main>
  )
}
