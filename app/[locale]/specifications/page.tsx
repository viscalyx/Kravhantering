import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementsSpecificationsClient from './specifications-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specifications') }
}

export default function RequirementsSpecificationsPage() {
  return <RequirementsSpecificationsClient />
}
