import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import DeveloperModeProvider from '@/components/DeveloperModeProvider'
import Footer from '@/components/Footer'
import { HelpProvider } from '@/components/HelpPanel'
import LocaleStorageSync from '@/components/LocaleStorageSync'
import Navigation from '@/components/Navigation'
import { routing } from '@/i18n/routing'
import '@/app/globals.css'

type Params = Promise<{ locale: string }>

function resolveLocale(locale: string) {
  return routing.locales.includes(locale as 'sv' | 'en')
    ? (locale as 'sv' | 'en')
    : routing.defaultLocale
}

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'common' })
  const appName = t('appName')
  const description = t('appDescription')

  return {
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description,
    openGraph: {
      title: appName,
      siteName: appName,
      description,
    },
    twitter: {
      title: appName,
      description,
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Params
}) {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)

  if (locale !== requestedLocale) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DeveloperModeProvider>
        <ConfirmModalProvider>
          <HelpProvider>
            <LocaleStorageSync />
            <div className="flex flex-col min-h-screen">
              <Navigation />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </HelpProvider>
        </ConfirmModalProvider>
      </DeveloperModeProvider>
    </NextIntlClientProvider>
  )
}
