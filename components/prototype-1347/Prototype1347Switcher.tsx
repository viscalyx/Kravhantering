'use client'

// THROWAWAY: compare three header structures on the existing requirements route.
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { type Prototype1347Variant, variants } from './variants'

interface ComponentProps {
  onReset: () => void
  state: object
  variant: Prototype1347Variant
}

export default function Prototype1347Switcher({
  variant,
  state,
  onReset,
}: ComponentProps) {
  const t = useTranslations('prototype1347')
  const [open, setOpen] = useState(false)
  const [measurements, setMeasurements] = useState<object>({})
  const measure = useCallback(() => {
    const root = document.querySelector('[data-prototype1347]')
    if (!root) return
    const scroll =
      root.querySelector('[data-requirements-scroll-container]') ??
      root.querySelector('.overflow-x-auto')
    const labels = Array.from(
      root.querySelectorAll<HTMLElement>('[data-requirement-header-label]'),
    )
    setMeasurements({
      viewport: `${window.innerWidth} × ${window.innerHeight}`,
      headers: labels.map(label => {
        const style = getComputedStyle(label)
        const range = document.createRange()
        range.selectNodeContents(label)
        const box = label.getBoundingClientRect()
        const textBoxes = Array.from(range.getClientRects())
        const lines = new Set(textBoxes.map(rect => Math.round(rect.top))).size
        return {
          column: label.dataset.requirementHeaderLabel,
          label: label.textContent,
          columnWidth: Math.round(
            label.closest('th')?.getBoundingClientRect().width ?? 0,
          ),
          labelWidth: Math.round(box.width),
          lines,
          clipped:
            label.scrollWidth > label.clientWidth + 1 ||
            (style.overflow === 'hidden' &&
              label.scrollHeight > label.clientHeight + 1),
        }
      }),
      horizontalScroll: scroll
        ? scroll.scrollWidth > scroll.clientWidth + 1
        : null,
      wrapping: root
        .querySelector('[data-prototype1347-wrap]')
        ?.getAttribute('aria-pressed'),
    })
  }, [])
  const select = useCallback((next: Prototype1347Variant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', url)
  }, [])
  const cycle = useCallback(
    (step: number) => {
      select(
        variants[
          (variants.indexOf(variant) + step + variants.length) % variants.length
        ],
      )
    },
    [select, variant],
  )
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        target.closest(
          'input,textarea,select,[contenteditable="true"],[data-column-resize-handle],[role="listbox"],[role="menu"]',
        ) ||
        (target.closest('button,a') &&
          !target.closest('[data-prototype1347-switcher]'))
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(event.key === 'ArrowRight' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [cycle])
  useEffect(() => {
    console.debug('Prototype #1347 state', { variant, ...state })
    const timer = window.setTimeout(measure, 250)
    const observer = new ResizeObserver(measure)
    const table = document.querySelector('[data-prototype1347]')
    if (table) observer.observe(table)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, variant, state])

  return (
    <aside
      data-prototype1347-switcher=""
      {...devMarker({ name: 'toolbar', value: 'prototype 1347 review' })}
    >
      {open && (
        <section
          aria-label={t('review')}
          className="fixed bottom-24 left-1/2 z-[100] max-h-[65vh] w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-2xl border border-secondary-300 bg-white p-5 text-secondary-900 shadow-2xl dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">{t('question')}</h2>
            <button
              aria-label={t('close')}
              className="min-h-8 min-w-8 rounded focus-visible:ring-2"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <p className="mt-2 text-sm">{t(`${variant}.description`)}</p>
          <p className="mt-2 text-sm font-medium">{t('scope')}</p>
          <ol className="my-4 list-decimal space-y-2 pl-5 text-sm">
            {['labels', 'controls', 'text', 'resize', 'settings', 'matrix'].map(
              key => (
                <li key={key}>{t(`checks.${key}`)}</li>
              ),
            )}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-8 rounded border px-3 text-sm dark:border-secondary-600"
              onClick={onReset}
              type="button"
            >
              {t('reset')}
            </button>
            <button
              className="min-h-8 rounded border px-3 text-sm dark:border-secondary-600"
              onClick={measure}
              type="button"
            >
              {t('measure')}
            </button>
          </div>
          <h3 className="mt-4 font-semibold">{t('state')}</h3>
          <pre
            className="mt-2 overflow-auto rounded-lg bg-secondary-100 p-3 text-xs dark:bg-secondary-950"
            data-prototype1347-state=""
          >
            {JSON.stringify({ variant, ...state, measurements }, null, 2)}
          </pre>
        </section>
      )}
      <fieldset
        aria-label={t('switcher')}
        className="fixed bottom-4 left-1/2 z-[100] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-indigo-300 bg-indigo-950 px-2 py-2 text-white shadow-2xl"
      >
        <span className="px-2 text-xs font-semibold">{t('badge')}</span>
        <button
          aria-label={t('previous')}
          className="min-h-8 min-w-8 rounded hover:bg-indigo-800 focus-visible:ring-2"
          onClick={() => cycle(-1)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        {variants.map(key => (
          <button
            aria-pressed={variant === key}
            className={`min-h-8 rounded-lg px-3 text-xs focus-visible:ring-2 ${key === variant ? 'bg-white font-semibold text-indigo-950' : 'hover:bg-indigo-800'}`}
            key={key}
            onClick={() => select(key)}
            type="button"
          >
            {t(`${key}.name`)}
          </button>
        ))}
        <button
          aria-label={t('next')}
          className="min-h-8 min-w-8 rounded hover:bg-indigo-800 focus-visible:ring-2"
          onClick={() => cycle(1)}
          type="button"
        >
          <ArrowRight aria-hidden="true" size={18} />
        </button>
        <button
          aria-expanded={open}
          className="min-h-8 rounded-lg border border-indigo-400 px-3 text-xs hover:bg-indigo-800 focus-visible:ring-2"
          onClick={() => setOpen(value => !value)}
          type="button"
        >
          {t('review')}
        </button>
      </fieldset>
    </aside>
  )
}
