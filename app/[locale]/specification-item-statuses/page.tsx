import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import SpecificationItemStatusesClient from './specification-item-statuses-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specificationItemStatuses') }
}

export default function SpecificationItemStatusesPage() {
  return <SpecificationItemStatusesClient />
}
