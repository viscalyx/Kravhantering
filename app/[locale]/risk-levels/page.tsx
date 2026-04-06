import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RiskLevelsClient from './risk-levels-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('riskLevels') }
}

export default function RiskLevelsPage() {
  return <RiskLevelsClient />
}
