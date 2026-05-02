import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
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
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="section-padding px-4 sm:px-6 lg:px-8"
        >
          <div className="container-custom space-y-6">
            <div className="h-40 rounded-[2rem] border border-secondary-200/70 bg-secondary-100/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
            <div className="h-64 rounded-[2rem] border border-secondary-200/70 bg-white/70 dark:border-secondary-700/60 dark:bg-secondary-900/70" />
          </div>
        </div>
      }
    >
      <AdminClient
        initialColumnDefaults={initialColumnDefaults}
        initialTerminology={buildUiTerminologyPayload(terminology)}
      />
    </Suspense>
  )
}
