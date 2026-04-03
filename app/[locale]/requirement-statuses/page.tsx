import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementStatusesClient from './requirement-statuses-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('statuses') }
}

export default function RequirementStatusesPage() {
  return <RequirementStatusesClient />
}
