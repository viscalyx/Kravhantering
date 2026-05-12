import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { getSession, isSignedIn } from '@/lib/auth/session'
import PrivacyClient from './privacy-client'

type PageParams = Promise<{ locale: string }>

function resolveLocale(requestedLocale: string): 'sv' | 'en' {
  return routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
}

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'privacyDataExport' })
  return { title: t('title') }
}

export default async function PrivacyPage() {
  const session = await getSession()
  const currentUser = isSignedIn(session)
    ? {
        hsaId: session.hsaId,
        name: session.name,
        ...(session.email ? { email: session.email } : {}),
      }
    : null

  return <PrivacyClient currentUser={currentUser} />
}
