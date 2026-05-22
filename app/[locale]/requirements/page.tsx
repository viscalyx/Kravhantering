import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  formatUiSettingsLoadError,
  getRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS } from '@/lib/requirements/list-view'
import RequirementsClient from './requirements-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

function isMissingSqlServerConfigurationError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('SQLSERVER_DATABASE_URL or DATABASE_URL') ||
      error.message.includes('No SQL Server connection string is configured'))
  )
}

export default async function RequirementsPage() {
  let initialColumnDefaults = DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS

  try {
    initialColumnDefaults = await getRequirementListColumnDefaults(
      await getRequestSqlServerDataSource(),
    )
  } catch (error) {
    if (!isMissingSqlServerConfigurationError(error)) {
      console.error(
        'Failed to load requirement column defaults for requirements page',
        formatUiSettingsLoadError(error),
      )
    }
  }

  return <RequirementsClient initialColumnDefaults={initialColumnDefaults} />
}
