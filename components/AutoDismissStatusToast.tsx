'use client'

import { CheckCircle2, TriangleAlert, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export const STATUS_TOAST_DURATION_MS = 5_000

export default function AutoDismissStatusToast({
  details = [],
  message,
  onDismiss,
  tone = 'success',
}: {
  details?: readonly string[]
  message: string
  onDismiss: () => void
  tone?: 'success' | 'warning'
}) {
  const t = useTranslations('common')
  const Icon = tone === 'warning' ? TriangleAlert : CheckCircle2
  const toastClasses =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
  const buttonClasses =
    tone === 'warning'
      ? 'text-amber-800 hover:bg-amber-100 focus-visible:ring-amber-600 dark:text-amber-200 dark:hover:bg-amber-900'
      : 'text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-600 dark:text-emerald-200 dark:hover:bg-emerald-900'
  const detailOccurrences = new Map<string, number>()
  const keyedDetails = details.map(detail => {
    const occurrence = (detailOccurrences.get(detail) ?? 0) + 1
    detailOccurrences.set(detail, occurrence)
    return { detail, key: JSON.stringify([detail, occurrence]) }
  })

  useEffect(() => {
    if (tone === 'warning') return
    const timeoutId = window.setTimeout(onDismiss, STATUS_TOAST_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [onDismiss, tone])

  return (
    <div className="fixed inset-x-4 bottom-4 z-80 ml-auto max-w-xl sm:left-auto sm:right-4">
      <div
        aria-atomic="true"
        aria-live="polite"
        className={`flex items-start gap-3 rounded-xl border p-4 text-sm shadow-lg ${toastClasses}`}
        role="status"
        {...devMarker({
          context: 'status feedback',
          name: 'Timed status toast',
          priority: 430,
        })}
      >
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p>{message}</p>
          {details.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {keyedDetails.map(({ detail, key }) => (
                <li key={key}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          aria-label={t('close')}
          className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 ${buttonClasses}`}
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
