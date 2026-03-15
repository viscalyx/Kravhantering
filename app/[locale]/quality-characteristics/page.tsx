import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import QualityCharacteristicsClient from './quality-characteristics-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('qualityCharacteristics') }
}

export default function QualityCharacteristicsPage() {
  return <QualityCharacteristicsClient />
}
