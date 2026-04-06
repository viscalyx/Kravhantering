import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import PackageItemStatusesClient from './package-item-statuses-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('packageItemStatuses') }
}

export default function PackageItemStatusesPage() {
  return <PackageItemStatusesClient />
}
