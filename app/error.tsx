'use client'

import { usePathname } from 'next/navigation'
import ErrorRecoveryPanel from '@/components/ErrorRecoveryPanel'
import {
  getErrorRecoveryCopy,
  getErrorRecoveryLocale,
} from '@/lib/error-boundary-recovery'

interface ErrorBoundaryProps {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}

export default function RootError({
  error,
  reset,
  unstable_retry,
}: ErrorBoundaryProps) {
  const pathname = usePathname()
  const locale = getErrorRecoveryLocale(pathname)
  const copy = getErrorRecoveryCopy(locale)

  return (
    <main className="min-h-screen bg-white text-secondary-900 dark:bg-secondary-950 dark:text-secondary-100">
      <ErrorRecoveryPanel
        className="min-h-screen"
        copy={copy}
        error={error}
        locale={locale}
        onRetry={unstable_retry ?? reset}
        pathname={pathname}
        surface="root"
      />
    </main>
  )
}
