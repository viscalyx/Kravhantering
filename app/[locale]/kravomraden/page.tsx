import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import KravomradenClient from './kravomraden-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('areas') }
}

export default function KravomradenPage() {
  return <KravomradenClient />
}
