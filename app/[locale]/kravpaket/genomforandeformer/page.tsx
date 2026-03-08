import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import GenomforandeformerClient from './genomforandeformer-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('implementationTypes') }
}

export default function GenomforandeformerPage() {
  return <GenomforandeformerClient />
}
