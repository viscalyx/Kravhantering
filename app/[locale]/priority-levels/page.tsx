import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import PriorityLevelsClient from './priority-levels-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('priorityLevels') }
}

export default function PriorityLevelsPage() {
  return <PriorityLevelsClient />
}
