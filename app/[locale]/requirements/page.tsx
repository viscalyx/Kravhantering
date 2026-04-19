import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getRequirementListColumnDefaults } from '@/lib/dal/ui-settings'
import { getRequestDatabase } from '@/lib/db'
import RequirementsClient from './requirements-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

export default async function RequirementsPage() {
  const initialColumnDefaults = await getRequirementListColumnDefaults(
    await getRequestDatabase(),
  )

  return <RequirementsClient initialColumnDefaults={initialColumnDefaults} />
}
