'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export default function PrototypeVariantSwitcher({
  variants,
  current,
}: {
  variants: { key: string; label: string }[]
  current: string
}) {
  const t = useTranslations('prototypeNormLayout')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const select = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('variant', key)
      router.replace(`${pathname}?${next}` as Route, { scroll: false })
    },
    [params, pathname, router],
  )
  const cycle = useCallback(
    (direction: number) => {
      select(
        variants[
          (variants.findIndex(v => v.key === current) +
            direction +
            variants.length) %
            variants.length
        ].key,
      )
    },
    [variants, current, select],
  )
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, select, [contenteditable], [role="dialog"], [role="slider"], [role="tablist"]',
        )
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(event.key === 'ArrowRight' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])
  if (process.env.NODE_ENV === 'production') return null
  return (
    <nav
      aria-label={t('switcher')}
      className="fixed bottom-16 left-1/2 z-50 flex w-[calc(100%-24px)] max-w-xl -translate-x-1/2 items-center justify-between gap-2 rounded-2xl border border-white/20 bg-secondary-950 px-3 py-2 text-white shadow-xl sm:bottom-4"
      {...devMarker({
        context: 'normReferences',
        name: 'prototype variant switcher',
      })}
    >
      <button
        aria-label={t('previous')}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 focus-visible:outline focus-visible:outline-2"
        onClick={() => cycle(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden size={18} />
      </button>
      <label className="min-w-0 text-xs">
        {t('prototype')}
        <select
          aria-label={t('variant')}
          className="mt-1 block min-h-8 w-full rounded bg-secondary-800 px-2 text-sm text-white"
          onChange={e => select(e.target.value)}
          value={current}
        >
          {variants.map(v => (
            <option key={v.key} value={v.key}>
              {v.key} · {v.label}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-label={t('next')}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 focus-visible:outline focus-visible:outline-2"
        onClick={() => cycle(1)}
        type="button"
      >
        <ArrowRight aria-hidden size={18} />
      </button>
    </nav>
  )
}
