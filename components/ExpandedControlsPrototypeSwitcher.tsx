'use client'

// THROWAWAY review controls, shared by every #1356 layout.
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import type { ControlsPrototypeVariant } from '@/app/[locale]/requirements/stewardship/expanded-controls.prototype'
import { devMarker } from '@/lib/developer-mode-markers'

const variants: ControlsPrototypeVariant[] = ['original', 'A', 'B', 'C', 'D']
const buttonClass =
  'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-secondary-500 px-3 text-sm hover:bg-secondary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
interface Props {
  onScenario: (scenario: string) => void
  onVariant: (variant: ControlsPrototypeVariant) => void
  scenario: string
  state: unknown
  variant: ControlsPrototypeVariant
}

export default function ExpandedControlsPrototypeSwitcher({
  variant,
  onVariant,
  scenario,
  onScenario,
  state,
}: Props) {
  const t = useTranslations('expandedControlsPrototype')
  const [review, setReview] = useState(false)
  const [blocked, setBlocked] = useState<unknown[]>([])
  const [metrics, setMetrics] = useState<unknown>(null)
  const measure = useCallback(() => {
    setMetrics({
      viewport: [innerWidth, innerHeight],
      theme: document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light',
      questions: Array.from(
        document.querySelectorAll('[data-prototype-expanded]'),
      ).map(el => ({
        height: Math.round(el.getBoundingClientRect().height),
        answers: Array.from(el.querySelectorAll('.prototype-answer-row')).map(
          row => ({
            height: Math.round(row.getBoundingClientRect().height),
            actions: Array.from(
              row.querySelectorAll(
                '.prototype-answer-actions button, .prototype-d-edit',
              ),
            ).map(button => ({
              label: button.textContent?.trim(),
              width: Math.round(button.getBoundingClientRect().width),
              height: Math.round(button.getBoundingClientRect().height),
            })),
          }),
        ),
      })),
    })
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure rendered geometry after variant or review state changes.
  useEffect(() => {
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [measure, variant, state])
  useEffect(() => {
    const block = (event: Event) =>
      setBlocked(current => [...current, (event as CustomEvent).detail])
    window.addEventListener('prototype-1356-blocked', block)
    return () => window.removeEventListener('prototype-1356-blocked', block)
  }, [])
  useEffect(() => {
    const cycle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target as HTMLElement).closest(
          'input, textarea, select, button, [contenteditable], [role="dialog"], [data-prototype-review]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      onVariant(
        variants[
          (variants.indexOf(variant) +
            (event.key === 'ArrowRight' ? 1 : variants.length - 1)) %
            variants.length
        ],
      )
    }
    window.addEventListener('keydown', cycle)
    return () => window.removeEventListener('keydown', cycle)
  }, [variant, onVariant])
  if (process.env.NODE_ENV === 'production') return null
  return (
    <>
      <div
        className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        role="status"
      >
        <strong>{t('notice')}</strong> · {t('memory')}
        <br />
        {variant} · {t(`names.${variant}`)} — {t(`descriptions.${variant}`)}
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
            onVariant(
              variants[
                (variants.indexOf(variant) + variants.length - 1) %
                  variants.length
              ],
            )
          }
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={16} />
        </button>
        <span className="min-w-32 text-center text-sm" role="status">
          {variant} · {t(`names.${variant}`)}
        </span>
        <button
          aria-label={t('next')}
          className={buttonClass}
          onClick={() =>
            onVariant(
              variants[(variants.indexOf(variant) + 1) % variants.length],
            )
          }
          type="button"
        >
          <ArrowRight aria-hidden="true" size={16} />
        </button>
        <button
          aria-controls="prototype-1356-review"
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
          className="fixed bottom-24 right-4 top-16 z-90 w-[min(34rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-secondary-300 bg-white p-5 text-secondary-900 shadow-xl dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100"
          data-prototype-review
          id="prototype-1356-review"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('review')}</h2>
            <button
              aria-label={t('close')}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border"
              onClick={() => setReview(false)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <p className="my-3 text-sm">{t('question')}</p>
          <div className="my-3 flex flex-wrap gap-2">
            {variants.map(key => (
              <button
                aria-pressed={variant === key}
                className="min-h-8 rounded border px-2 text-sm"
                key={key}
                onClick={() => onVariant(key)}
                type="button"
              >
                {key} · {t(`names.${key}`)}
              </button>
            ))}
          </div>
          <label className="grid gap-2 text-sm">
            {t('scenario')}
            <select
              className="min-h-9 rounded border bg-white p-2 dark:bg-secondary-900"
              onChange={event => onScenario(event.target.value)}
              value={scenario}
            >
              {['live', 'long', 'mixed', 'readonly'].map(key => (
                <option key={key} value={key}>
                  {t(`scenarios.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="my-2 text-xs">{t('scenarioHelp')}</p>
          <button
            className="my-2 min-h-9 rounded border px-3 text-sm"
            onClick={() => {
              onScenario('live')
              setBlocked([])
            }}
            type="button"
          >
            {t('reset')}
          </button>
          <h3 className="mt-3 font-semibold">{t('checklist')}</h3>
          <ol className="my-3 list-decimal space-y-2 pl-5 text-sm">
            {['scope', 'content', 'actions', 'access', 'compare'].map(key => (
              <li key={key}>{t(`checks.${key}`)}</li>
            ))}
          </ol>
          <button
            className="min-h-9 rounded border px-3 text-sm"
            onClick={measure}
            type="button"
          >
            {t('measure')}
          </button>
          <h3 className="mt-4 font-semibold">{t('state')}</h3>
          <pre
            className="mt-2 overflow-auto rounded bg-secondary-100 p-3 text-xs dark:bg-secondary-950"
            data-prototype-state
          >
            {JSON.stringify(
              { state, metrics, blockedWrites: blocked },
              null,
              2,
            )}
          </pre>
        </aside>
      )}
    </>
  )
}
