'use client'

import { useTranslations } from 'next-intl'
import { devMarker } from '@/lib/developer-mode-markers'

interface SuggestionData {
  content: string
  createdAt: string
  createdBy: string | null
  id: number
  isReviewRequested: number
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: string | null
  resolvedBy: string | null
}

interface SuggestionPillProps {
  developerModeContext?: string
  muted?: boolean
  step?: 'draft' | 'review_requested' | 'resolved'
  suggestion: SuggestionData
}

export default function SuggestionPill({
  developerModeContext,
  muted,
  step,
  suggestion,
}: SuggestionPillProps) {
  const t = useTranslations('improvementSuggestion')
  const isResolved = suggestion.resolution !== null
  const isActioned = suggestion.resolution === 1
  const effectiveStep =
    step ??
    (isResolved
      ? 'resolved'
      : suggestion.isReviewRequested === 1
        ? 'review_requested'
        : 'draft')

  const pendingColorClass =
    effectiveStep === 'review_requested'
      ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30'
      : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30'

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        muted
          ? 'border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800/50 opacity-75'
          : isResolved
            ? isActioned
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30'
              : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
            : pendingColorClass
      }`}
      {...devMarker({
        context: developerModeContext,
        name: 'suggestion pill',
        priority: 350,
        value: isResolved ? (isActioned ? 'resolved' : 'dismissed') : 'pending',
      })}
    >
      <p className="font-medium text-secondary-900 dark:text-secondary-100 mb-1">
        {t('suggestionSubmitted')}
      </p>
      <p className="text-secondary-700 dark:text-secondary-300 mb-1">
        {suggestion.content}
      </p>
      <p className="text-xs text-secondary-500 dark:text-secondary-400">
        {suggestion.createdBy && <span>{suggestion.createdBy}</span>}
        {suggestion.createdBy && suggestion.createdAt && <span> · </span>}
        {suggestion.createdAt && (
          <span>{new Date(suggestion.createdAt).toLocaleDateString()}</span>
        )}
      </p>

      {isResolved && (
        <div className="mt-2 pt-2 border-t border-secondary-200 dark:border-secondary-700">
          <p className="font-medium text-secondary-900 dark:text-secondary-100 mb-1">
            {t('resolutionHeading')}{' '}
            <span
              className={
                isActioned
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }
            >
              {isActioned ? t('statusResolved') : t('statusDismissed')}
            </span>
          </p>
          {suggestion.resolutionMotivation && (
            <p className="text-secondary-700 dark:text-secondary-300 mb-1">
              {suggestion.resolutionMotivation}
            </p>
          )}
          <p className="text-xs text-secondary-500 dark:text-secondary-400">
            {suggestion.resolvedBy && <span>{suggestion.resolvedBy}</span>}
            {suggestion.resolvedBy && suggestion.resolvedAt && <span> · </span>}
            {suggestion.resolvedAt && (
              <span>
                {new Date(suggestion.resolvedAt).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
