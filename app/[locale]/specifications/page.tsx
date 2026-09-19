import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { loadRequirementsSpecificationsInitialData } from '@/lib/specifications/preload'
import Prototype1350 from './prototype-1350'
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
  searchParams,
}: {
  params: Params
  searchParams?: Promise<{ variant?: string }>
}) {
  const { locale: requestedLocale } = await params
  const initialData = await loadRequirementsSpecificationsInitialData(
    resolveLocale(requestedLocale),
  )
  const query = await searchParams
  if (process.env.NODE_ENV !== 'production' && query?.variant) {
    return <Prototype1350 initialData={initialData} />
  }
  return <RequirementsSpecificationsClient initialData={initialData} />
}
