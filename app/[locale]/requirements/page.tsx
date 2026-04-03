import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getRequirementListColumnDefaults } from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { normalizeRequirementListColumnDefaults } from '@/lib/requirements/list-view'
import RequirementsClient from './requirements-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

export default async function RequirementsPage() {
  let initialColumnDefaults = normalizeRequirementListColumnDefaults(null)

  try {
    const { env } = await getCloudflareContext({ async: true })
    initialColumnDefaults = await getRequirementListColumnDefaults(
      getDb(env.DB),
    )
  } catch {
    // Fallback to the in-code defaults when DB-backed UI settings are unavailable.
  }

  return <RequirementsClient initialColumnDefaults={initialColumnDefaults} />
}
