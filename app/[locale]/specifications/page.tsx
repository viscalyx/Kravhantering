import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { loadRequirementsSpecificationsInitialData } from '@/lib/specifications/preload'
import RequirementsSpecificationsClient from './specifications-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specifications') }
}

type Params = Promise<{ locale: string }>

function resolveLocale(requestedLocale: string): 'sv' | 'en' {
  return routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
}

export default async function RequirementsSpecificationsPage({
  params,
}: {
  params: Params
}) {
  const { locale: requestedLocale } = await params
  const initialData = await loadRequirementsSpecificationsInitialData(
    resolveLocale(requestedLocale),
  )
  return <RequirementsSpecificationsClient initialData={initialData} />
}
