'use client'

import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface DeviationData {
  createdAt: string
  createdBy: string | null
  decidedAt: string | null
  decidedBy: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  motivation: string
}

interface DeviationPillProps {
  developerModeContext?: string
  deviation: DeviationData
  muted?: boolean
}

function DeviationPillContent({
  deviation,
  developerModeContext,
  muted,
}: DeviationPillProps) {
  const t = useTranslations('deviation')
  const isDecided = deviation.decision !== null
  const isApproved = deviation.decision === 1

  // Non-color status cue (WCAG 1.4.1): every state pairs an icon with the
  // translated status text so color-blind users and AT can identify state.
  const statusChip = isDecided
    ? isApproved
      ? {
          Icon: CheckCircle2,
          label: t('statusApproved'),
          className:
            'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40',
        }
      : {
          Icon: XCircle,
          label: t('statusRejected'),
          className:
            'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40',
        }
    : {
        Icon: Clock,
        label: t('statusPending'),
        className:
          'text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40',
      }

  return (
    <div
      aria-label={t('deviationRequested')}
      className={`rounded-xl border px-4 py-3 text-sm ${
        muted
          ? 'border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800/50 opacity-75'
          : isDecided
            ? isApproved
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30'
              : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
            : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
      }`}
      role="status"
      {...devMarker({
        context: developerModeContext,
        name: 'deviation pill',
        priority: 350,
        value: isDecided ? (isApproved ? 'approved' : 'rejected') : 'pending',
      })}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="font-medium text-secondary-900 dark:text-secondary-100">
          {t('deviationRequested')}
        </p>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusChip.className}`}
        >
          <statusChip.Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
          />
          {statusChip.label}
        </span>
      </div>
      <p className="text-secondary-700 dark:text-secondary-300 mb-1">
        {deviation.motivation}
      </p>
      <p className="text-xs text-secondary-500 dark:text-secondary-400">
        {deviation.createdBy && <span>{deviation.createdBy}</span>}
        {deviation.createdBy && deviation.createdAt && <span> · </span>}
        {deviation.createdAt && (
          <span>{new Date(deviation.createdAt).toLocaleDateString()}</span>
        )}
      </p>

      {isDecided && (
        <div className="mt-2 pt-2 border-t border-secondary-200 dark:border-secondary-700">
          <p className="font-medium text-secondary-900 dark:text-secondary-100 mb-1">
            {t('decisionHeading')}{' '}
            <span
              className={
                isApproved
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }
            >
              {isApproved ? t('statusApproved') : t('statusRejected')}
            </span>
          </p>
          {deviation.decisionMotivation && (
            <p className="text-secondary-700 dark:text-secondary-300 mb-1">
              {deviation.decisionMotivation}
            </p>
          )}
          <p className="text-xs text-secondary-500 dark:text-secondary-400">
            {deviation.decidedBy && <span>{deviation.decidedBy}</span>}
            {deviation.decidedBy && deviation.decidedAt && <span> · </span>}
            {deviation.decidedAt && (
              <span>{new Date(deviation.decidedAt).toLocaleDateString()}</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

interface DeviationPillWithHistoryProps {
  developerModeContext?: string
  history: DeviationData[]
  latest: DeviationData
}

export default function DeviationPill({
  developerModeContext,
  history,
  latest,
}: DeviationPillWithHistoryProps) {
  const t = useTranslations('deviation')
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className="space-y-2">
      <DeviationPillContent
        developerModeContext={developerModeContext}
        deviation={latest}
      />
      {history.length > 0 && (
        <details
          onToggle={e => setHistoryOpen((e.target as HTMLDetailsElement).open)}
          open={historyOpen}
        >
          <summary className="cursor-pointer text-xs text-secondary-500 dark:text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-300 select-none">
            {t('historyLabel', { count: history.length })}
          </summary>
          <div className="mt-2 space-y-2">
            {history.map(d => (
              <DeviationPillContent
                developerModeContext={developerModeContext}
                deviation={d}
                key={d.id}
                muted
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
