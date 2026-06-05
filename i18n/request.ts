import { getRequestConfig } from 'next-intl/server'
import { routing } from '@/i18n/routing'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !routing.locales.includes(locale as 'sv' | 'en')) {
    locale = routing.defaultLocale
  }

  const baseMessages = (await import(`@/messages/${locale}.json`)).default

  return {
    locale,
    messages: baseMessages,
  }
})
