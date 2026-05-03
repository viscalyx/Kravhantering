import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import LifecycleStatusesClient from './lifecycle-statuses-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('lifecycleStatuses') }
}

export default function LifecycleStatusesPage() {
  return <LifecycleStatusesClient />
}
