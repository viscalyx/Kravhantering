import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { loadRequirementsSpecificationsInitialData } from '@/lib/specifications/preload'
import RequirementsSpecificationsClient from './specifications-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specifications') }
}

export default async function RequirementsSpecificationsPage() {
  const initialData = await loadRequirementsSpecificationsInitialData()
  return <RequirementsSpecificationsClient initialData={initialData} />
}
