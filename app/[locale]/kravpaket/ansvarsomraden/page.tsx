import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import AnsvarsomradenClient from './ansvarsomraden-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('responsibilityAreas') }
}

export default function AnsvarsomradenPage() {
  return <AnsvarsomradenClient />
}
