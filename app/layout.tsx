import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ThemeProvider } from 'next-themes'
import '@/app/globals.css'
import ThemeRootSync from '@/components/ThemeRootSync'
import { getRequestNonce, THEME_STORAGE_KEY } from '@/lib/theme'

// Configured per-environment via `.env*` (see .env.example). Required at
// module load time — we deliberately do not provide a fallback so that a
// missing value fails loudly at build/boot rather than silently emitting
// wrong absolute URLs in metadata.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
if (!SITE_URL) {
  throw new Error(
    'NEXT_PUBLIC_SITE_URL is not set. Add it to your .env file (see .env.example).',
  )
}

export const metadata: Metadata = {
  title: {
    default: 'Kravhantering',
    template: '%s | Kravhantering',
  },
  description:
    'En webbapplikation för kravhantering som stödjer företagets kravmodell och kravprocess',
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: '/logo-small.png',
  },
  openGraph: {
    type: 'website',
    locale: 'sv_SE',
    url: SITE_URL,
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
  // The app is internal/auth-gated. Disallow indexing site-wide; aligned
  // with `app/robots.ts` (issue #108).
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const nonce = getRequestNonce([
    headersList.get('x-nonce'),
    headersList.get('x-middleware-request-x-nonce'),
  ])

  return (
    <html data-scroll-behavior="smooth" lang="sv" suppressHydrationWarning>
      <head>
        <meta content="light dark" name="color-scheme" />
      </head>
      <body className="min-h-screen bg-white dark:bg-secondary-950 text-secondary-900 dark:text-secondary-100 antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          nonce={nonce}
          storageKey={THEME_STORAGE_KEY}
        >
          <ThemeRootSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
