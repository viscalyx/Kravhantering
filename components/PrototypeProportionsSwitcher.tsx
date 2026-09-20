'use client'

// Throwaway review controls for #1352; never rendered in production.
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export const prototypeVariants = ['0', 'A', 'B', 'C'] as const
export type PrototypeVariant = (typeof prototypeVariants)[number]
export function useProportionsPrototypeVariant(): PrototypeVariant | null {
  const params = useSearchParams()
  const value = params.get('variant')
  return process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PROTOTYPE_1352 === 'true'
    ? (prototypeVariants.find(key => key === value) ?? '0')
    : null
}

function choose(key: PrototypeVariant) {
  const url = new URL(window.location.href)
  url.searchParams.set('variant', key)
  url.searchParams.delete('header')
  url.searchParams.set(
    'previewReset',
    String(Number(url.searchParams.get('previewReset') ?? 0) + 1),
  )
  const specificationId = Number(
    location.pathname.match(/\/specifications\/(\d+)/)?.[1],
  )
  localStorage.setItem(
    'specification-panel-width-v1',
    JSON.stringify({
      specificationId,
      leftRatio: key === 'A' ? 0.6 : key === 'B' ? 0.55 : 0.5,
    }),
  )
  localStorage.setItem(
    'specification-panel-layout-v1',
    JSON.stringify({ specificationId, layout: 'both' }),
  )
  window.history.replaceState(null, '', url)
}

export default function PrototypeProportionsSwitcher({
  variant,
}: {
  variant: PrototypeVariant
}) {
  const t = useTranslations('proportionsPrototype')
  const params = useSearchParams()
  const [hidden, setHidden] = useState(params.get('review') === 'clean')
  const [details, setDetails] = useState(false)
  const [state, setState] = useState('')
  useEffect(() => {
    document.documentElement.dataset.proportionsPrototype = variant
    function measure() {
      const rect = (element: Element | null) => {
        if (!element) return null
        const r = element.getBoundingClientRect()
        return {
          x: Math.round(r.x),
          width: Math.round(r.width),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          height: Math.round(r.height),
        }
      }
      const panels = ['items', 'available'].map(name => {
        const panel = document.querySelector(
          `[data-specification-detail-list-panel="${name}"]`,
        )
        const bounds = rect(panel)
        const chrome = rect(
          panel?.querySelector('[data-sticky-table-chrome]') ?? null,
        )
        return {
          name,
          panel: bounds,
          header: chrome,
          listHeight: bounds && chrome ? bounds.bottom - chrome.bottom : null,
          scrollTop: panel?.scrollTop ?? null,
          horizontalOverflow: (() => {
            const el = panel?.querySelector(
              '[data-requirements-scroll-container]',
            )
            return el ? el.scrollWidth - el.clientWidth : null
          })(),
          columns: [
            ...(panel?.querySelectorAll('[data-sticky-table-header] th') ?? []),
          ].map(el => ({ label: el.textContent, bounds: rect(el) })),
          tabs: [...(panel?.querySelectorAll('[role=tab]') ?? [])].map(el => ({
            label: el.textContent,
            selected: el.getAttribute('aria-selected'),
            bounds: rect(el),
          })),
        }
      })
      const value = JSON.stringify(
        {
          variant,
          header: new URLSearchParams(location.search).get('header') ?? variant,
          viewport: `${innerWidth} × ${innerHeight}`,
          navigationWidth: document
            .querySelector('[data-global-navigation-rail="desktop"]')
            ?.getBoundingClientRect().width,
          theme: document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light',
          panels,
          footer: rect(document.querySelector('footer')),
          pageOverflow: document.documentElement.scrollHeight - innerHeight,
          applicationWrites: 'blocked',
          preferences: 'memory only; switching variants resets panel widths',
          sample:
            new URLSearchParams(location.search).get('sample') ??
            'current data',
          metadata: [
            ...document.querySelectorAll(
              '[data-specification-detail-header-metadata] dt',
            ),
          ].map(el => ({ label: el.textContent, bounds: rect(el) })),
        },
        null,
        2,
      )
      setState(previous => (previous === value ? previous : value))
      return value
    }
    console.info('[Prototype #1352 state]', measure())
    const timer = window.setInterval(measure, 500)
    console.info('[Prototype #1352]', variant)
    return () => {
      window.clearInterval(timer)
      delete document.documentElement.dataset.proportionsPrototype
    }
  }, [variant])
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target?.closest(
          'input, textarea, select, [contenteditable], [role="tab"], [role="separator"], [role="slider"]',
        )
      )
        return
      if (event.key.toLowerCase() === 'h') setHidden(value => !value)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const index = prototypeVariants.indexOf(variant)
        choose(
          prototypeVariants[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4],
        )
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [variant])
  if (hidden) return null
  const index = prototypeVariants.indexOf(variant)
  return (
    <aside
      className="prototype-review"
      {...devMarker({
        name: 'prototype controls',
        context: 'requirements specification detail',
        value: 'issue 1352 layout comparison',
      })}
    >
      {details && (
        <section className="prototype-inspector">
          <h2>{t('question')}</h2>
          <p>{t(`description${variant}`)}</p>
          <p>{t('readOnly')}</p>
          <p>{t('help')}</p>
          {variant !== '0' && (
            <div className="prototype-bar">
              <span>{t('header')}</span>
              {(['A', 'B', 'C'] as const).map(key => (
                <button
                  aria-pressed={(params.get('header') ?? variant) === key}
                  key={key}
                  onClick={() => {
                    const url = new URL(location.href)
                    url.searchParams.set('header', key)
                    window.history.replaceState(null, '', url)
                  }}
                  type="button"
                >
                  {key}
                </button>
              ))}
            </div>
          )}
          <pre>{state}</pre>
        </section>
      )}
      <div className="prototype-bar">
        <span className="prototype-tag">{t('tag')}</span>
        <button
          aria-label={t('previous')}
          onClick={() => choose(prototypeVariants[(index + 3) % 4])}
          type="button"
        >
          ←
        </button>
        {prototypeVariants.map(key => (
          <button
            aria-pressed={key === variant}
            key={key}
            onClick={() => choose(key)}
            type="button"
          >
            {key} · {t(`name${key}`)}
          </button>
        ))}
        <button
          aria-label={t('next')}
          onClick={() => choose(prototypeVariants[(index + 1) % 4])}
          type="button"
        >
          →
        </button>
        <button
          aria-expanded={details}
          onClick={() => setDetails(value => !value)}
          type="button"
        >
          {t('inspect')}
        </button>
        <button
          aria-pressed={params.get('sample') === 'long'}
          onClick={() => {
            const url = new URL(location.href)
            if (params.get('sample') === 'long')
              url.searchParams.delete('sample')
            else url.searchParams.set('sample', 'long')
            window.history.replaceState(null, '', url)
          }}
          type="button"
        >
          {t('sample')}
        </button>
        <button onClick={() => choose(variant)} type="button">
          {t('reset')}
        </button>
        <button onClick={() => setHidden(true)} title={t('help')} type="button">
          {t('hide')}
        </button>
      </div>
    </aside>
  )
}
