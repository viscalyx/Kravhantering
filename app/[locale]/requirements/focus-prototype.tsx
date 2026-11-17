'use client'

// THROWAWAY: Today vs desired keyboard focus on /requirements?variant=.
// Real shared buttons, navigation shell, FormModal and ConfirmModal; no writes.
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FormModal from '@/components/FormModal'
import { devMarker } from '@/lib/developer-mode-markers'
import './focus-prototype.css'

export default function FocusPrototype() {
  const t = useTranslations('focusPrototype')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const variant = params.get('variant') === 'desired' ? 'desired' : 'today'
  const { confirm } = useConfirmModal()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState('—')
  const [state, setState] = useState({
    focused: '—',
    outline: '—',
    shadow: '—',
    forced: false,
    dark: false,
  })
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.documentElement.dataset.focusPrototype = variant
    const forced = matchMedia('(forced-colors: active)')
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = document.activeElement
        const css = el instanceof HTMLElement ? getComputedStyle(el) : null
        setState({
          focused:
            el?.getAttribute('aria-label') ||
            el?.textContent?.trim().slice(0, 70) ||
            '—',
          outline: css
            ? `${css.outlineWidth} ${css.outlineStyle} ${css.outlineColor}`
            : '—',
          shadow: css?.boxShadow || '—',
          forced: forced.matches,
          dark: document.documentElement.classList.contains('dark'),
        })
      })
    }
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    document.addEventListener('focusin', update)
    forced.addEventListener('change', update)
    update()
    return () => {
      delete document.documentElement.dataset.focusPrototype
      document.removeEventListener('focusin', update)
      forced.removeEventListener('change', update)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [variant])

  useEffect(() => {
    const cycle = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable], [role="dialog"]',
        )
      )
        return
      event.preventDefault()
      const next = new URLSearchParams(params.toString())
      next.set('variant', variant === 'today' ? 'desired' : 'today')
      router.replace(`${pathname}?${next}` as Route, { scroll: false })
    }
    document.addEventListener('keydown', cycle)
    return () => document.removeEventListener('keydown', cycle)
  }, [params, pathname, router, variant])

  function switchVariant() {
    const next = new URLSearchParams(params.toString())
    next.set('variant', variant === 'today' ? 'desired' : 'today')
    router.replace(`${pathname}?${next}` as Route, { scroll: false })
  }

  if (process.env.NODE_ENV === 'production') return null

  return (
    <section
      className="mx-auto max-w-5xl space-y-6 px-6 pt-10 pb-32"
      {...devMarker({ name: 'section', value: 'Focus comparison prototype' })}
    >
      <header className="space-y-3">
        <p className="text-sm font-semibold tracking-wide text-secondary-600 dark:text-secondary-300">
          {t('prototype')}
        </p>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="max-w-3xl text-secondary-700 dark:text-secondary-200">
          {t('intro')}
        </p>
      </header>
      <div className="rounded-2xl border border-secondary-300 bg-secondary-50 p-5 dark:border-secondary-600 dark:bg-secondary-900">
        <h2 className="text-xl font-bold">{t(variant)}</h2>
        <p className="mt-2">
          {t(variant === 'today' ? 'todayDescription' : 'desiredDescription')}
        </p>
      </div>
      <section
        aria-label={t('controls')}
        className="space-y-5 rounded-2xl border p-6"
      >
        <h2 className="text-xl font-semibold">{t('controls')}</h2>
        <p>{t('instructions')}</p>
        <div className="flex flex-wrap gap-5">
          <button
            className="btn-primary"
            data-prototype-control="primary"
            onClick={() => setResult(t('saved'))}
            type="button"
          >
            {t('save')}
          </button>
          <button
            className="btn-secondary"
            data-prototype-control="secondary"
            onClick={() => setResult(t('cancelled'))}
            type="button"
          >
            {t('cancel')}
          </button>
          <button
            className="btn-destructive"
            data-prototype-control="destructive"
            onClick={async () => {
              const accepted = await confirm({
                title: t('deleteTitle'),
                message: t('deleteMessage'),
                confirmText: t('delete'),
                cancelText: t('cancel'),
                variant: 'danger',
                icon: 'caution',
              })
              setResult(t(accepted ? 'deleted' : 'cancelled'))
            }}
            type="button"
          >
            {t('delete')}
          </button>
        </div>
        <div className="border-t pt-5">
          <button
            className="btn-secondary"
            data-prototype-control="modal"
            onClick={() => setOpen(true)}
            ref={trigger}
            type="button"
          >
            {t('openModal')}
          </button>
          <p className="mt-4 text-sm">{t('navigation')}</p>
        </div>
        <p role="status">
          {t('result')}: {result}
        </p>
      </section>
      <section
        aria-label={t('state')}
        className="space-y-3 rounded-2xl border p-6"
      >
        <h2 className="text-xl font-semibold">{t('state')}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt>{t('appearance')}</dt>
          <dd>{t(state.dark ? 'dark' : 'light')}</dd>
          <dt>{t('forced')}</dt>
          <dd>{t(state.forced ? 'active' : 'inactive')}</dd>
          <dt>{t('focused')}</dt>
          <dd>{state.focused}</dd>
          <dt>outline</dt>
          <dd className="break-all font-mono">{state.outline}</dd>
          <dt>box-shadow</dt>
          <dd className="max-h-20 overflow-auto break-all font-mono">
            {state.shadow}
          </dd>
        </dl>
        <p className="text-sm text-secondary-600 dark:text-secondary-300">
          {t('emulation')}
        </p>
      </section>
      <nav
        aria-label={t('switcher')}
        className="focus-prototype-switcher fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border bg-white px-4 py-3 text-secondary-900 shadow-xl dark:bg-secondary-900 dark:text-white"
      >
        <button
          aria-label={t('switch')}
          className="min-h-8 min-w-8 rounded-full border"
          onClick={switchVariant}
          type="button"
        >
          ←
        </button>
        <span className="whitespace-nowrap font-semibold">{t(variant)}</span>
        <button
          aria-label={t('switch')}
          className="min-h-8 min-w-8 rounded-full border"
          onClick={switchVariant}
          type="button"
        >
          →
        </button>
      </nav>
      <FormModal
        developerModeValue="Focus prototype form dialog"
        onClose={() => setOpen(false)}
        open={open}
        returnFocusRef={trigger}
        title={t('modalTitle')}
        titleId="focus-prototype-modal"
      >
        <p className="mb-6">{t('modalDescription')}</p>
        <div className="flex flex-wrap gap-5">
          <button
            className="btn-secondary"
            onClick={() => setOpen(false)}
            type="button"
          >
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setResult(t('saved'))
              setOpen(false)
            }}
            type="button"
          >
            {t('save')}
          </button>
        </div>
      </FormModal>
    </section>
  )
}
