import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import DeveloperModeProvider from '@/components/DeveloperModeProvider'
import Footer from '@/components/Footer'
import Navigation from '@/components/Navigation'
import { routing } from '@/i18n/routing'
import '@/app/globals.css'

type Params = Promise<{ locale: string }>

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
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
  const { locale } = await params

  if (!routing.locales.includes(locale as 'sv' | 'en')) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <DeveloperModeProvider>
        <ConfirmModalProvider>
          <div className="flex flex-col min-h-screen">
            <Navigation />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ConfirmModalProvider>
      </DeveloperModeProvider>
    </NextIntlClientProvider>
  )
}
