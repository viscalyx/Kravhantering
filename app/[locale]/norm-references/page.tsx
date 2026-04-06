import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import NormReferencesClient from './norm-references-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('normReferences') }
}

export default function NormReferencesPage() {
  return <NormReferencesClient />
}
