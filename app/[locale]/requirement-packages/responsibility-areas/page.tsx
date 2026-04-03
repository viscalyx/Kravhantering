import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ResponsibilityAreasClient from './responsibility-areas-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('responsibilityAreas') }
}

export default function ResponsibilityAreasPage() {
  return <ResponsibilityAreasClient />
}
