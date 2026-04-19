import { getRequestConfig } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import {
  formatUiSettingsLoadError,
  getUiTerminology,
} from '@/lib/dal/ui-settings'
import { getRequestDatabase } from '@/lib/db'
import { applyUiTerminologyMessages, type UiLocale } from '@/lib/ui-terminology'

function isEdgeRuntime() {
  return (
    typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime === 'string'
  )
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !routing.locales.includes(locale as 'sv' | 'en')) {
    locale = routing.defaultLocale
  }

  const baseMessages = (await import(`@/messages/${locale}.json`)).default

  if (isEdgeRuntime()) {
    throw new Error(
      'DB-backed UI terminology requires the Node.js runtime and is unavailable in the Edge runtime.',
    )
  }

  try {
    const terminology = await getUiTerminology(await getRequestDatabase())

    return {
      locale,
      messages: applyUiTerminologyMessages(
        baseMessages,
        locale as UiLocale,
        terminology,
      ),
    }
  } catch (error) {
    console.error(
      'Failed to load UI terminology for request config',
      formatUiSettingsLoadError(error),
    )

    return {
      locale,
      messages: baseMessages,
    }
  }
})
