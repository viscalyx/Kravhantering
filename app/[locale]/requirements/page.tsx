import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  type AiRequirementGenerationAvailability,
  DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
} from '@/lib/ai/generation-availability'
import {
  formatAiSettingsLoadError,
  getAiGenerationAvailability,
  resolveAiGenerationAvailability,
} from '@/lib/dal/ai-settings'
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
    (error.message.includes('DATABASE_URL, or DB_HOST/DB_PORT/DB_NAME') ||
      error.message.includes('No SQL Server connection string is configured'))
  )
}

export default async function RequirementsPage() {
  let initialColumnDefaults = DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS
  let aiGenerationAvailability: AiRequirementGenerationAvailability =
    resolveAiGenerationAvailability()

  try {
    const db = await getRequestSqlServerDataSource()
    ;[initialColumnDefaults, aiGenerationAvailability] = await Promise.all([
      getRequirementListColumnDefaults(db),
      getAiGenerationAvailability(db),
    ])
  } catch (error) {
    if (!isMissingSqlServerConfigurationError(error)) {
      console.error(
        'Failed to load requirement column defaults for requirements page',
        formatUiSettingsLoadError(error),
      )
      console.error(
        'Failed to load AI generation availability for requirements page',
        formatAiSettingsLoadError(error),
      )
    } else {
      aiGenerationAvailability = {
        ...DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
        disabledByEnvironment: aiGenerationAvailability.disabledByEnvironment,
        effectiveRequirementGenerationEnabled:
          !aiGenerationAvailability.disabledByEnvironment,
      }
    }
  }

  return (
    <RequirementsClient
      aiGenerationAvailability={aiGenerationAvailability}
      initialColumnDefaults={initialColumnDefaults}
    />
  )
}
