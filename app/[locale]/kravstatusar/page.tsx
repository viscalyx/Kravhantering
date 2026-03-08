import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import KravstatusarClient from './kravstatusar-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('statuses') }
}

export default function KravstatusarPage() {
  return <KravstatusarClient />
}
