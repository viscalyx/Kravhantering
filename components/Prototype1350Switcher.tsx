'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export const prototype1350Variants = ['baseline', 'A', 'B', 'C', 'D'] as const
export type Prototype1350Variant = (typeof prototype1350Variants)[number]

export default function Prototype1350Switcher({
  current,
}: {
  current: Prototype1350Variant
}) {
  const t = useTranslations('prototype1350')
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const select = useCallback(
    (value: Prototype1350Variant) => {
      const query = new URLSearchParams(search.toString())
      query.set('variant', value)
      router.replace(`${pathname}?${query}` as Route, { scroll: false })
    },
    [router, pathname, search],
  )
  const cycle = useCallback(
    (direction: number) => {
      const index = prototype1350Variants.indexOf(current)
      select(
        prototype1350Variants[
          (index + direction + prototype1350Variants.length) %
            prototype1350Variants.length
        ],
      )
    },
    [current, select],
  )
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target.closest(
          'input, textarea, select, [contenteditable], [role="slider"], [role="combobox"], [data-prototype-hsa], [data-prototype-view-switcher]',
        )
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cycle])
  if (process.env.NODE_ENV === 'production') return null
  return (
    <nav
      aria-label={t('switcher')}
      {...devMarker({
        context: 'prototype 1350',
        name: 'variant switcher',
        value: current,
      })}
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[96vw] -translate-x-1/2 items-center gap-1 rounded-2xl border border-indigo-300 bg-indigo-950 p-2 text-white shadow-xl"
    >
      <button
        aria-label={t('previous')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-indigo-800 focus-visible:outline-2"
        onClick={() => cycle(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={16} />
      </button>
      {prototype1350Variants.map(key => (
        <button
          aria-pressed={current === key}
          className={`min-h-9 rounded-lg px-3 text-xs focus-visible:outline-2 ${current === key ? 'bg-white text-indigo-950' : 'hover:bg-indigo-800'}`}
          key={key}
          onClick={() => select(key)}
          type="button"
        >
          <span className="font-bold">{key === 'baseline' ? '0' : key}</span>
          <span className="ml-2 hidden sm:inline">
            {t(`variants.${key}.name`)}
          </span>
        </button>
      ))}
      <button
        aria-label={t('next')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-indigo-800 focus-visible:outline-2"
        onClick={() => cycle(1)}
        type="button"
      >
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </nav>
  )
}
