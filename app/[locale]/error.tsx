'use client'

import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import ErrorRecoveryPanel from '@/components/ErrorRecoveryPanel'
import { normalizeAppLocale } from '@/lib/error-boundary-recovery'

interface ErrorBoundaryProps {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}

export default function LocaleError({
  error,
  reset,
  unstable_retry,
}: ErrorBoundaryProps) {
  const pathname = usePathname()
  const locale = normalizeAppLocale(useLocale())
  const t = useTranslations('errorBoundary')

  return (
    <ErrorRecoveryPanel
      copy={{
        description: t('description'),
        eyebrow: t('eyebrow'),
        goToAdmin: t('goToAdmin'),
        goToCatalog: t('goToCatalog'),
        referenceLabel: t('referenceLabel'),
        retry: t('retry'),
        title: t('title'),
      }}
      error={error}
      locale={locale}
      onRetry={unstable_retry ?? reset}
      pathname={pathname}
      surface="locale"
    />
  )
}
