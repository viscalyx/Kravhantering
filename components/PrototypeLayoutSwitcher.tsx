'use client'

// Throwaway review controls for #1351; never rendered in production.
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export const prototypeVariants = ['0', 'A', 'B', 'C'] as const
export type PrototypeVariant = (typeof prototypeVariants)[number]
export function useHeightPrototypeVariant(): PrototypeVariant | null {
  const params = useSearchParams()
  const value = params.get('variant')
  return process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PROTOTYPE_1351 === 'true'
    ? (prototypeVariants.find(key => key === value) ?? '0')
    : null
}

function choose(key: PrototypeVariant) {
  const url = new URL(window.location.href)
  url.searchParams.set('variant', key)
  window.history.replaceState(null, '', url)
}

export default function PrototypeLayoutSwitcher({
  variant,
}: {
  variant: PrototypeVariant
}) {
  const t = useTranslations('heightPrototype')
  const params = useSearchParams()
  const [hidden, setHidden] = useState(params.get('review') === 'clean')
  const [details, setDetails] = useState(false)
  const [state, setState] = useState('')
  useEffect(() => {
    document.documentElement.dataset.heightPrototype = variant
    function measure() {
      const shelf = document.querySelector<HTMLElement>('.prototype-tab-shelf')
      const workspace = document.querySelector(
        '[data-specification-detail-split-panel]',
      )
      if (shelf && workspace) {
        shelf.style.gridTemplateColumns =
          getComputedStyle(workspace).gridTemplateColumns
        for (const [index, side] of ['left', 'right'].entries()) {
          const group = shelf.children[index] as HTMLElement
          group.style.visibility = document.getElementById(
            `specification-${side}-panel`,
          )?.hidden
            ? 'hidden'
            : 'visible'
        }
      }

      const rect = (element: Element | null) => {
        if (!element) return null
        const r = element.getBoundingClientRect()
        return {
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
        }
      })
      const value = JSON.stringify(
        {
          variant,
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
        },
        null,
        2,
      )
      setState(previous => (previous === value ? previous : value))
    }
    measure()
    const timer = window.setInterval(measure, 500)
    console.info('[Prototype #1351]', variant)
    return () => {
      window.clearInterval(timer)
      delete document.documentElement.dataset.heightPrototype
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
        value: 'issue 1351 layout comparison',
      })}
    >
      {details && (
        <section className="prototype-inspector">
          <h2>{t('question')}</h2>
          <p>{t(`description${variant}`)}</p>
          <p>{t('readOnly')}</p>
          <p>{t('help')}</p>
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
        <button onClick={() => setHidden(true)} title={t('help')} type="button">
          {t('hide')}
        </button>
      </div>
    </aside>
  )
}
