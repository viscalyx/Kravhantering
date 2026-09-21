'use client'

// THROWAWAY #1355: review controls, never enabled in a production build.
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import type { QuestionPrototypeVariant } from '@/app/[locale]/requirements/stewardship/question-layout.prototype'
import { devMarker } from '@/lib/developer-mode-markers'

const variants: QuestionPrototypeVariant[] = ['original', 'A', 'B', 'C']
const buttonClass =
  'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-secondary-600 px-2 text-sm text-white hover:bg-secondary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

interface Props {
  longText: boolean
  onLongText: () => void
  onReset: () => void
  onVariant: (variant: QuestionPrototypeVariant) => void
  state: unknown
  variant: QuestionPrototypeVariant
}

export default function QuestionLayoutPrototypeSwitcher({
  variant,
  state,
  onVariant,
  onLongText,
  longText,
  onReset,
}: Props) {
  const t = useTranslations('questionLayoutPrototype')
  const [review, setReview] = useState(false)
  const [metrics, setMetrics] = useState<unknown>(null)

  useEffect(() => {
    const cycle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return
      const target = event.target as HTMLElement
      if (
        target.closest(
          'input, textarea, select, [contenteditable], [role="dialog"], [data-question-drag-handle], [data-prototype-review]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      onVariant(
        variants[
          (variants.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : 3)) % 4
        ],
      )
    }
    window.addEventListener('keydown', cycle)
    return () => window.removeEventListener('keydown', cycle)
  }, [variant, onVariant])

  const measure = () => {
    const bottom =
      document
        .querySelector('[data-prototype-switcher]')
        ?.getBoundingClientRect().top ?? window.innerHeight
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-question-id]'),
    )
    const measured = rows.map(row => {
      const rect = row.getBoundingClientRect()
      return {
        id: row.dataset.questionId,
        height: Math.round(rect.height * 10) / 10,
        fullyVisibleAboveSwitcher: rect.top >= 0 && rect.bottom <= bottom,
        expanded:
          row
            .querySelector('[data-prototype-disclosure]')
            ?.getAttribute('aria-expanded') === 'true',
      }
    })
    setMetrics({
      viewport: [window.innerWidth, window.innerHeight],
      measuredAt: new Date().toISOString(),
      visibleRows: measured.filter(row => row.fullyVisibleAboveSwitcher).length,
      rows: measured,
    })
  }

  if (process.env.NODE_ENV === 'production') return null

  return (
    <>
      <div
        className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        role="status"
        {...devMarker({
          context: 'requirementSelectionQuestions',
          name: 'prototype notice',
        })}
      >
        <strong>{t('notice')}</strong>
        <span>{t('memory')}</span>
        <span>{t(`names.${variant}`)}</span>
      </div>
      <div
        className="fixed bottom-4 left-1/2 z-90 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-secondary-600 bg-secondary-950 px-3 py-2 text-white shadow-xl"
        data-prototype-switcher
        {...devMarker({
          context: 'requirementSelectionQuestions',
          name: 'prototype variant switcher',
          value: variant,
        })}
      >
        <button
          aria-label={t('previous')}
          className={buttonClass}
          onClick={() =>
            onVariant(variants[(variants.indexOf(variant) + 3) % 4])
          }
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={16} />
        </button>
        <span className="min-w-36 text-center text-sm" role="status">
          {variant} · {t(`names.${variant}`)}
        </span>
        <button
          aria-label={t('next')}
          className={buttonClass}
          onClick={() =>
            onVariant(variants[(variants.indexOf(variant) + 1) % 4])
          }
          type="button"
        >
          <ArrowRight aria-hidden="true" size={16} />
        </button>
        <button
          aria-controls="prototype-review"
          aria-expanded={review}
          className={buttonClass}
          onClick={() => {
            setReview(!review)
            measure()
          }}
          type="button"
        >
          {t('review')}
        </button>
      </div>
      {review && (
        <aside
          aria-label={t('review')}
          className="fixed bottom-24 right-4 top-20 z-90 w-[min(31rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-secondary-300 bg-white p-5 text-secondary-900 shadow-xl dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100"
          data-prototype-review
          id="prototype-review"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('review')}</h2>
            <button
              aria-label={t('close')}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-secondary-300 dark:border-secondary-600"
              onClick={() => setReview(false)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <p className="mt-3 text-sm">{t(`descriptions.${variant}`)}</p>
          <ol className="my-4 list-decimal space-y-2 pl-5 text-sm">
            {['density', 'content', 'controls', 'themes', 'drag'].map(key => (
              <li key={key}>{t(`checks.${key}`)}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              aria-pressed={longText}
              className="min-h-9 rounded border border-secondary-300 px-3 text-sm dark:border-secondary-600"
              onClick={onLongText}
              type="button"
            >
              {t('longText')}
            </button>
            <button
              className="min-h-9 rounded border border-secondary-300 px-3 text-sm dark:border-secondary-600"
              onClick={() => {
                onReset()
                setMetrics(null)
              }}
              type="button"
            >
              {t('reset')}
            </button>
            <button
              className="min-h-9 rounded border border-secondary-300 px-3 text-sm dark:border-secondary-600"
              onClick={measure}
              type="button"
            >
              {t('measure')}
            </button>
          </div>
          <p className="mt-3 text-xs">{t('measurementHint')}</p>
          <h3 className="mt-4 font-semibold">{t('state')}</h3>
          <pre className="mt-2 overflow-auto rounded bg-secondary-100 p-3 text-xs dark:bg-secondary-950">
            {JSON.stringify({ variant, longText, state, metrics }, null, 2)}
          </pre>
        </aside>
      )}
    </>
  )
}
