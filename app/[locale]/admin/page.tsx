import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  getRequirementListColumnDefaults,
  getUiTerminology,
} from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { normalizeRequirementListColumnDefaults } from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
} from '@/lib/ui-terminology'
import AdminClient from './admin-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('title') }
}

export default async function AdminPage() {
  let initialTerminology = buildUiTerminologyPayload(getDefaultUiTerminology())
  let initialColumnDefaults = normalizeRequirementListColumnDefaults(null)

  try {
    const { env } = await getCloudflareContext({ async: true })
    const db = getDb(env.DB)
    initialTerminology = buildUiTerminologyPayload(await getUiTerminology(db))
    initialColumnDefaults = await getRequirementListColumnDefaults(db)
  } catch {
    // Fallback to in-code defaults when request-scoped DB access is unavailable.
  }

  return (
    <AdminClient
      initialColumnDefaults={initialColumnDefaults}
      initialTerminology={initialTerminology}
    />
  )
}
