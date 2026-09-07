'use client'

import { Coins, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { AiFinancialMeasurement } from '@/lib/ai/financial-contracts'
import { devMarker } from '@/lib/developer-mode-markers'
import { useFinancialStatus } from './financial-status-context'

export function FinancialAmount({
  measurement,
}: {
  measurement: AiFinancialMeasurement
}) {
  const locale = useLocale()
  const t = useTranslations('admin.aiConnections.financial')
  return measurement.state === 'available' && measurement.amount !== null
    ? `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(measurement.amount))} ${measurement.currency}`
    : t(`measurement.${measurement.state}`)
}

interface FinancialSummaryProps {
  connectionId: string
  expanded: boolean
  onToggle(): void
}

function ScopeSummary({
  scope,
  connectionId,
  expanded,
  onToggle,
}: FinancialSummaryProps & { scope: 'organization' | 'credential' }) {
  const t = useTranslations('admin.aiConnections.financial')
  const { status, busy } = useFinancialStatus()
  const result =
    scope === 'organization'
      ? (status?.results.find(item => item.operation.scope === 'account') ??
        status?.results.find(item => item.operation.scope === 'organization'))
      : status?.results.find(item => item.operation.scope === 'credential')
  const measurements = result?.snapshot?.measurements ?? []
  const totalField =
    scope === 'organization' && result?.operation.scope === 'account'
      ? 'purchased_credits'
      : 'spending_limit'
  const remainingField =
    result?.operation.scope === 'account'
      ? 'credit_balance'
      : 'remaining_allowance'
  const total = measurements.find(item => item.field === totalField)
  const remaining = measurements.find(
    item =>
      item.field === remainingField && (!total || item.period === total.period),
  )
  return (
    <div
      className="min-w-0 text-xs text-secondary-600 dark:text-secondary-300"
      {...devMarker({
        name:
          scope === 'organization'
            ? 'AI organization credit summary'
            : 'AI credential allowance summary',
        context: 'AI connection registry',
      })}
    >
      <button
        aria-controls={`ai-connection-${connectionId}`}
        aria-expanded={expanded}
        className="relative z-20 mb-1 block min-h-6 text-left text-xs font-semibold uppercase tracking-wide text-secondary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-secondary-400"
        onClick={onToggle}
        title={t(`summary.${scope}.help`)}
        type="button"
        {...devMarker({
          name:
            scope === 'organization'
              ? 'AI organization credit explanation'
              : 'AI credential allowance explanation',
          context: 'AI connection registry',
        })}
      >
        {t(`summary.${scope}.title`)}
      </button>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-1 rounded-full border border-secondary-200 bg-secondary-100 px-2 py-0.5 font-semibold text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
          <Coins aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <p
            aria-busy={busy}
            aria-label={t(`summary.${scope}.title`)}
            className="min-w-0"
            role="status"
          >
            {busy ? (
              t('summary.loading')
            ) : !status ? (
              t('summary.state.temporary_error')
            ) : !result || status.capabilities.support === 'none' ? (
              t('summary.state.unsupported')
            ) : !result.snapshot ? (
              t(`summary.state.${result.state}`)
            ) : (
              <>
                <span className="whitespace-nowrap">
                  {total ? (
                    <FinancialAmount measurement={total} />
                  ) : (
                    t('measurement.unavailable')
                  )}
                </span>
                {' / '}
                <span className="whitespace-nowrap">
                  {remaining ? (
                    <FinancialAmount measurement={remaining} />
                  ) : (
                    t('measurement.unavailable')
                  )}
                </span>
                {total && total.period !== 'lifetime'
                  ? ` (${t(`summary.period.${total.period}`)})`
                  : null}
                {result.state === 'stale' ? ` (${t('summary.stale')})` : null}
              </>
            )}
          </p>
        </div>
        {scope === 'credential' ? <SummaryRefresh /> : null}
      </div>
    </div>
  )
}

function SummaryRefresh() {
  const t = useTranslations('admin.aiConnections.financial')
  const { busy, load } = useFinancialStatus()
  return (
    <button
      aria-label={t('refresh')}
      className="relative z-20 inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded text-secondary-600 hover:bg-secondary-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 dark:text-secondary-300 dark:hover:bg-secondary-800"
      disabled={busy}
      onClick={() => void load()}
      title={t('refresh')}
      type="button"
      {...devMarker({
        name: 'Refresh AI financial summary',
        context: 'AI connection registry',
      })}
    >
      <RefreshCw
        aria-hidden="true"
        className={`h-3.5 w-3.5 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
      />
    </button>
  )
}

export default function FinancialStatusSummary(props: FinancialSummaryProps) {
  return (
    <>
      <ScopeSummary {...props} scope="organization" />
      <ScopeSummary {...props} scope="credential" />
    </>
  )
}
