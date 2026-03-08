import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import KravpaketClient from './kravpaket-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('packages') }
}

export default function KravpaketPage() {
  return <KravpaketClient />
}
