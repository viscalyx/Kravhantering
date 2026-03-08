import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import KravtyperClient from './kravtyper-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('types') }
}

export default function KravtyperPage() {
  return <KravtyperClient />
}
