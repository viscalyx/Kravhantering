'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  prototypeEnabled,
  usePrototypeState,
  variants,
} from '@/app/[locale]/requirements/_prototype-1348/state'
import { devMarker } from '@/lib/developer-mode-markers'

// Throwaway developer tool: all measurements and action feedback stay in memory.
export default function PrototypeSwitcher() {
  const state = usePrototypeState()
  const t = useTranslations('prototype1348')
  const [measurement, setMeasurement] = useState({
    detail: 0,
    card: 0,
    suggestions: 0,
    width: 0,
    height: 0,
    key: '',
    requirement: '',
    theme: '',
    navigationWidth: '',
    steps: [] as string[],
  })
  const [baselines, setBaselines] = useState<Record<string, number>>({})
  const [lastAction, setLastAction] = useState('')

  function setParam(name: string, value: string) {
    const url = new URL(window.location.href)
    url.searchParams.set(name, value)
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }
  function cycle(offset: number) {
    setParam(
      'variant',
      variants[
        (variants.indexOf(state.variant) + offset + variants.length) %
          variants.length
      ],
    )
  }

  useEffect(() => {
    if (!prototypeEnabled) return
    document.documentElement.dataset.detailPrototype = state.variant
    document.documentElement.dataset.prototypeWidth = state.layout
    return () => {
      delete document.documentElement.dataset.detailPrototype
      delete document.documentElement.dataset.prototypeWidth
    }
  }, [state.variant, state.layout])

  useEffect(() => {
    if (!prototypeEnabled) return
    const measure = () => {
      const detail = document.querySelector<HTMLElement>(
        '[data-prototype-detail]',
      )
      const card = detail?.querySelector<HTMLElement>('.prototype-detail-card')
      const suggestions = detail?.querySelector<HTMLElement>(
        '[data-prototype-suggestions]',
      )
      const key = [
        location.pathname,
        detail?.dataset.prototypeDetail,
        state.text,
        state.sections,
        state.layout,
        innerWidth,
        innerHeight,
        Math.round(detail?.getBoundingClientRect().width ?? 0),
      ].join('|')
      const next = {
        detail: Math.round(detail?.getBoundingClientRect().height ?? 0),
        card: Math.round(card?.getBoundingClientRect().height ?? 0),
        suggestions: Math.round(
          suggestions?.getBoundingClientRect().height ?? 0,
        ),
        width: innerWidth,
        height: innerHeight,
        key,
        requirement: detail?.dataset.prototypeDetail ?? '',
        theme: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
        navigationWidth: getComputedStyle(
          document.documentElement,
        ).getPropertyValue('--global-nav-width'),
        steps: Array.from(
          detail?.querySelectorAll(
            '[data-prototype-stepper] > div:not(.absolute)',
          ) ?? [],
        ).map(
          element =>
            `${element.textContent?.trim()}${element.getAttribute('aria-current') === 'step' ? ' (current)' : ''}`,
        ),
      }
      setMeasurement(previous =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      )
    }
    measure()
    const timer = window.setInterval(measure, 400)
    return () => window.clearInterval(timer)
  }, [state.text, state.sections, state.layout])

  useEffect(() => {
    if (!prototypeEnabled) return
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable], [role="tablist"], [role="slider"], [role="menu"], [role="dialog"]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const url = new URL(window.location.href)
      const index = variants.indexOf(state.variant)
      const offset = event.key === 'ArrowLeft' ? -1 : 1
      url.searchParams.set(
        'variant',
        variants[(index + offset + variants.length) % variants.length],
      )
      window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    }
    const onAction = (event: Event) =>
      setLastAction((event as CustomEvent<string>).detail)
    document.addEventListener('keydown', onKey)
    window.addEventListener('prototype-1348-action', onAction)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('prototype-1348-action', onAction)
    }
  }, [state.variant])

  if (!prototypeEnabled) return null
  const baseline = baselines[measurement.key]
  return (
    <aside
      aria-label={t('title')}
      className="prototype-bar"
      {...devMarker({
        context: 'prototype 1348',
        name: 'prototype controls',
        value: 'variant switcher',
        priority: 500,
      })}
    >
      <div className="prototype-bar-row">
        <strong>{t('title')}</strong>
        <button
          aria-label={t('previous')}
          onClick={() => cycle(-1)}
          type="button"
        >
          ←
        </button>
        <label>
          <span className="sr-only">{t('variant')}</span>
          <select
            aria-label={t('variant')}
            onChange={event => setParam('variant', event.target.value)}
            value={state.variant}
          >
            {variants.map(variant => (
              <option key={variant} value={variant}>
                {variant}: {t(`variants.${variant}`)}
              </option>
            ))}
          </select>
        </label>
        <button aria-label={t('next')} onClick={() => cycle(1)} type="button">
          →
        </button>
        <span>
          {measurement.detail
            ? `${measurement.detail} px`
            : t('openRequirement')}
          {baseline != null && measurement.detail > 0
            ? ` · ${baseline - measurement.detail} px ${t('saved')}`
            : ''}
        </span>
      </div>
      {lastAction && <p role="status">{lastAction}</p>}
      <details>
        <summary>{t('controls')}</summary>
        <p className="my-2">{t(`descriptions.${state.variant}`)}</p>
        <div className="prototype-bar-row">
          <label>
            {t('text')}
            <select
              aria-label={t('text')}
              onChange={event => setParam('text', event.target.value)}
              value={state.text}
            >
              <option value="live">{t('live')}</option>
              <option value="long">{t('long')}</option>
            </select>
          </label>
          <label>
            {t('sections')}
            <select
              aria-label={t('sections')}
              onChange={event => setParam('sections', event.target.value)}
              value={state.sections}
            >
              <option value="live">{t('live')}</option>
              <option value="empty">{t('empty')}</option>
              <option value="populated">{t('populated')}</option>
            </select>
          </label>
          <label>
            {t('width')}
            <select
              aria-label={t('width')}
              onChange={event => setParam('detailWidth', event.target.value)}
              value={state.layout}
            >
              <option value="full">{t('full')}</option>
              <option value="split">{t('split')}</option>
            </select>
          </label>
          <button
            disabled={state.variant !== 'baseline' || !measurement.detail}
            onClick={() =>
              setBaselines(previous => ({
                ...previous,
                [measurement.key]: measurement.detail,
              }))
            }
            type="button"
          >
            {t('capture')}
          </button>
          <a
            href="/sv/requirements/prototype-1348-review/index.html"
            rel="noreferrer"
            target="_blank"
          >
            {t('guide')}
          </a>
        </div>
        <p className="mt-2">{t('readOnly')}</p>
        <p>{lastAction ? t('readOnly') : t('noAction')}</p>
        <pre>
          {JSON.stringify(
            {
              ...state,
              viewport: [measurement.width, measurement.height],
              requirement: measurement.requirement,
              theme: measurement.theme,
              navigationWidth: measurement.navigationWidth,
              detailHeight: measurement.detail,
              cardHeight: measurement.card,
              suggestionsHeight: measurement.suggestions,
              baselineHeight: baseline ?? null,
              steps: measurement.steps,
              lastAction,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </aside>
  )
}
