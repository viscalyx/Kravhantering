'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { devMarker } from '@/lib/developer-mode-markers'

interface DetailRecoveryProps {
  message: string
  onRetry?: () => Promise<void>
  pending: boolean
  resource: 'detail' | 'statuses'
}

export default function DetailRecovery({
  message,
  onRetry,
  pending,
  resource,
}: DetailRecoveryProps) {
  const t = useTranslations('requirement.detailRecovery')
  return (
    <div
      className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      {...devMarker({
        context: 'requirement detail',
        name: 'recovery panel',
        value: resource,
      })}
    >
      <p className="flex items-start gap-2" role="alert">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
        {message}
      </p>
      {onRetry && (
        <button
          aria-disabled={pending}
          className="mt-2 inline-flex min-h-6 min-w-6 items-center gap-2 rounded border border-amber-700 px-3 py-1 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-60 dark:border-amber-300 dark:hover:bg-amber-900"
          onClick={() => {
            if (!pending) void onRetry()
          }}
          title={pending ? t('retrying') : undefined}
          type="button"
          {...devMarker({
            context: 'requirement detail',
            name: 'button',
            value: `retry ${resource}`,
          })}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {pending ? t('retrying') : t('retry')}
        </button>
      )}
    </div>
  )
}
