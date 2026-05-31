import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import StewardshipClient from './stewardship-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('stewardship') }
}

export default function RequirementsStewardshipPage() {
  return <StewardshipClient />
}
