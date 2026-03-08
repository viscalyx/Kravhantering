import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import KravkatalogClient from './kravkatalog-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

export default function KravkatalogPage() {
  return <KravkatalogClient />
}
