import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { loadRequirementsSpecificationDetailInitialData } from '@/lib/specifications/preload'
import RequirementsSpecificationDetailClient from './requirements-specification-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specifications') }
}

type Params = Promise<{ locale: string; slug: string }>

function resolveLocale(requestedLocale: string): 'sv' | 'en' {
  return routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
}

export default async function RequirementsSpecificationDetailPage({
  params,
}: {
  params: Params
}) {
  const { locale: requestedLocale, slug } = await params
  const initialData = await loadRequirementsSpecificationDetailInitialData({
    locale: resolveLocale(requestedLocale),
    slug,
  })
  return (
    <RequirementsSpecificationDetailClient
      initialData={initialData}
      specificationSlug={slug}
    />
  )
}
