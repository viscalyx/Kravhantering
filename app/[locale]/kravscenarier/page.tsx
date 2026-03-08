import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import KravscenarierClient from './kravscenarier-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('scenarios') }
}

export default function KravscenarierPage() {
  return <KravscenarierClient />
}
