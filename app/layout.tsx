import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ThemeProvider } from 'next-themes'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Kravhantering',
    template: '%s | Kravhantering',
  },
  description:
    'En webbapplikation för kravhantering som stödjer företagets kravmodell och kravprocess',
  metadataBase: new URL('https://kravhantering.viscalyx.org'),
  icons: {
    icon: '/logo-small.png',
  },
  openGraph: {
    type: 'website',
    locale: 'sv_SE',
    url: 'https://kravhantering.viscalyx.org',
    siteName: 'Kravhantering',
    title: 'Kravhantering',
    description:
      'En webbapplikation för kravhantering som stödjer företagets kravmodell och kravprocess',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kravhantering',
    description:
      'En webbapplikation för kravhantering som stödjer företagets kravmodell och kravprocess',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="sv" suppressHydrationWarning>
      <body className="min-h-screen bg-white dark:bg-secondary-950 text-secondary-900 dark:text-secondary-100 antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          nonce={nonce}
          storageKey="theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
