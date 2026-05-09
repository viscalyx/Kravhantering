'use client'

import { AlertTriangle, Home, RefreshCw, Settings2 } from 'lucide-react'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  type ErrorBoundaryCopy,
  getErrorRecoveryTargets,
} from '@/lib/error-boundary-recovery'
import type { AppLocale } from '@/lib/locale-preference'

interface ComponentProps {
  className?: string
  copy: ErrorBoundaryCopy
  error: Error & { digest?: string }
  locale: AppLocale
  onRetry: () => void
  pathname: string | null
  surface: string
}

function getTargetLabel(
  copy: ErrorBoundaryCopy,
  kind: ReturnType<typeof getErrorRecoveryTargets>['primary']['kind'],
) {
  return kind === 'admin' ? copy.goToAdmin : copy.goToCatalog
}

function getTargetIcon(
  kind: ReturnType<typeof getErrorRecoveryTargets>['primary']['kind'],
) {
  return kind === 'admin' ? Settings2 : Home
}

export default function ErrorRecoveryPanel({
  className = '',
  copy,
  error,
  locale,
  onRetry,
  pathname,
  surface,
}: ComponentProps) {
  const targets = getErrorRecoveryTargets({ locale, pathname })
  const primaryLabel = getTargetLabel(copy, targets.primary.kind)
  const secondaryLabel = getTargetLabel(copy, targets.secondary.kind)
  const PrimaryIcon = getTargetIcon(targets.primary.kind)
  const SecondaryIcon = getTargetIcon(targets.secondary.kind)

  return (
    <section
      aria-labelledby="error-boundary-title"
      className={`section-padding flex min-h-[calc(100vh-9rem)] items-center justify-center ${className}`}
      role="alert"
      {...devMarker({
        context: 'error boundary',
        name: 'error recovery',
        priority: 340,
        value: surface,
      })}
    >
      <div className="w-full max-w-2xl rounded-lg border border-red-200/80 bg-white p-6 shadow-sm dark:border-red-900/60 dark:bg-secondary-900 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/70 dark:text-red-300">
            <AlertTriangle aria-hidden="true" className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {copy.eyebrow}
            </p>
            <h1
              className="mt-2 text-2xl font-semibold text-secondary-950 dark:text-secondary-50 sm:text-3xl"
              id="error-boundary-title"
            >
              {copy.title}
            </h1>
            <p className="mt-3 text-base leading-7 text-secondary-700 dark:text-secondary-300">
              {copy.description}
            </p>

            {error.digest ? (
              <p className="mt-4 text-sm text-secondary-600 dark:text-secondary-400">
                {copy.referenceLabel}:{' '}
                <code className="rounded-md bg-secondary-100 px-2 py-1 font-mono text-xs text-secondary-800 dark:bg-secondary-800 dark:text-secondary-200">
                  {error.digest}
                </code>
              </p>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus-visible:ring-offset-secondary-900"
                onClick={onRetry}
                type="button"
                {...devMarker({
                  context: 'error boundary',
                  name: 'button',
                  value: 'retry',
                })}
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                {copy.retry}
              </button>
              <a
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-900 transition-colors hover:bg-secondary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100 dark:hover:bg-secondary-800 dark:focus-visible:ring-offset-secondary-900"
                href={targets.primary.href}
                {...devMarker({
                  context: 'error boundary',
                  name: 'link',
                  value: `${targets.primary.kind} recovery`,
                })}
              >
                <PrimaryIcon aria-hidden="true" className="h-4 w-4" />
                {primaryLabel}
              </a>
              <a
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-offset-secondary-900"
                href={targets.secondary.href}
                {...devMarker({
                  context: 'error boundary',
                  name: 'link',
                  value: `${targets.secondary.kind} recovery`,
                })}
              >
                <SecondaryIcon aria-hidden="true" className="h-4 w-4" />
                {secondaryLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
