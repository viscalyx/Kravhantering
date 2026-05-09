'use client'

import { usePathname } from 'next/navigation'
import ErrorRecoveryPanel from '@/components/ErrorRecoveryPanel'
import {
  getErrorRecoveryCopy,
  getErrorRecoveryLocale,
} from '@/lib/error-boundary-recovery'
import '@/app/globals.css'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: GlobalErrorProps) {
  const pathname = usePathname()
  const locale = getErrorRecoveryLocale(pathname)
  const copy = getErrorRecoveryCopy(locale)

  return (
    <html data-scroll-behavior="smooth" lang={locale} suppressHydrationWarning>
      <head>
        <title>{copy.title}</title>
        <meta content="light dark" name="color-scheme" />
      </head>
      <body className="min-h-screen bg-white text-secondary-900 antialiased dark:bg-secondary-950 dark:text-secondary-100">
        <main>
          <ErrorRecoveryPanel
            className="min-h-screen"
            copy={copy}
            error={error}
            locale={locale}
            onRetry={unstable_retry ?? reset}
            pathname={pathname}
            surface="global"
          />
        </main>
      </body>
    </html>
  )
}
