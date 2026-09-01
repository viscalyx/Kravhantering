import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import StatisticsPrototype from './statistics-prototype'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('statisticsPrototype')
  return { title: t('pageTitle') }
}

export default function StatisticsPrototypePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return <StatisticsPrototype />
}
