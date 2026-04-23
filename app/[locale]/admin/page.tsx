import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import {
  getRequirementListColumnDefaults,
  getUiTerminology,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { buildUiTerminologyPayload } from '@/lib/ui-terminology'
import AdminClient from './admin-client'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale = routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'admin' })
  return { title: t('title') }
}

export default async function AdminPage() {
  const db = await getRequestSqlServerDataSource()
  const [terminology, initialColumnDefaults] = await Promise.all([
    getUiTerminology(db),
    getRequirementListColumnDefaults(db),
  ])

  return (
    <AdminClient
      initialColumnDefaults={initialColumnDefaults}
      initialTerminology={buildUiTerminologyPayload(terminology)}
    />
  )
}
