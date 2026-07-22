import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import type { ActionAuditLogSearchParams } from '@/lib/audit/action-audit-query'
import { canAccessAdminCenter } from '@/lib/auth/roles'
import { getSession, isSignedIn } from '@/lib/auth/session'
import AdminAccessDenied from './admin-access-denied'
import { resolveAdminTab } from './admin-tabs'

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
  const [query, session] = await Promise.all([searchParams, getSession()])
  const currentUserRoles = isSignedIn(session) ? session.roles : []
  if (!canAccessAdminCenter(currentUserRoles)) {
    return AdminAccessDenied({ locale })
  }

  const tabSearchParams = new URLSearchParams()
  const requestedTab = Array.isArray(query.tab) ? query.tab[0] : query.tab
  if (requestedTab) tabSearchParams.set('tab', requestedTab)
  const { tab } = resolveAdminTab(tabSearchParams, currentUserRoles)
  redirect(`/${locale}/admin?tab=${tab}`)
}
