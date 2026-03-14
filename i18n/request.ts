import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getRequestConfig } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { getUiTerminology } from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { applyUiTerminologyMessages, type UiLocale } from '@/lib/ui-terminology'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !routing.locales.includes(locale as 'sv' | 'en')) {
    locale = routing.defaultLocale
  }

  const baseMessages = (await import(`@/messages/${locale}.json`)).default

  try {
    const { env } = await getCloudflareContext({ async: true })
    const terminology = await getUiTerminology(getDb(env.DB))

    return {
      locale,
      messages: applyUiTerminologyMessages(
        baseMessages,
        locale as UiLocale,
        terminology,
      ),
    }
  } catch {
    // Fallback to the static locale bundle when request-scoped DB access is unavailable.
  }

  return {
    locale,
    messages: baseMessages,
  }
})
