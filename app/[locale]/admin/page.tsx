import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  getRequirementListColumnDefaults,
  getUiTerminology,
} from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { normalizeRequirementListColumnDefaults } from '@/lib/requirements/list-view'
import { createRequirementsLogger } from '@/lib/requirements/logging'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
} from '@/lib/ui-terminology'
import AdminClient from './admin-client'

const logger = createRequirementsLogger()

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
  } catch (error) {
    logger.error('admin_page.ui_settings_load_failed', {
      error:
        error instanceof Error
          ? error.message
          : 'Unknown admin page load error',
      operation:
        'getCloudflareContext -> getDb -> getUiTerminology/buildUiTerminologyPayload -> getRequirementListColumnDefaults',
    })
    // Fallback to in-code defaults when request-scoped DB access is unavailable.
  }

  return (
    <AdminClient
      initialColumnDefaults={initialColumnDefaults}
      initialTerminology={initialTerminology}
    />
  )
}
