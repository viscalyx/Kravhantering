'use client'

// Throwaway review control for #1354; never part of the production UI.
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export const PROTOTYPE_VARIANTS = ['before', 'A', 'B', 'C'] as const
export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number]

export default function PrototypeSwitcher({
  current,
}: {
  current: PrototypeVariant
}) {
  const t = useTranslations('prototype1354')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const select = useCallback(
    (variant: PrototypeVariant) => {
      const next = new URLSearchParams(params.toString())
      next.set('variant', variant)
      router.replace(`${pathname}?${next}` as Route, { scroll: false })
    },
    [params, pathname, router],
  )
  const cycle = useCallback(
    (direction: number) => {
      const index = PROTOTYPE_VARIANTS.indexOf(current)
      select(
        PROTOTYPE_VARIANTS[
          (index + direction + PROTOTYPE_VARIANTS.length) %
            PROTOTYPE_VARIANTS.length
        ],
      )
    },
    [current, select],
  )
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      cycle(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [cycle])
  if (process.env.NODE_ENV === 'production') return null
  const buttonClass =
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
  return (
    <nav
      aria-label={t('switcher')}
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-violet-400 bg-violet-950 p-2 text-white shadow-xl"
      {...devMarker({
        context: 'areas',
        name: 'prototype switcher',
        value: current,
      })}
    >
      <button
        aria-label={t('previous')}
        className={buttonClass}
        onClick={() => cycle(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      {PROTOTYPE_VARIANTS.map(variant => (
        <button
          aria-pressed={current === variant}
          className={`${buttonClass} ${current === variant ? 'bg-white text-violet-950' : 'hover:bg-violet-800'}`}
          key={variant}
          onClick={() => select(variant)}
          type="button"
        >
          {variant === 'before' ? t('before') : variant}
        </button>
      ))}
      <span className="px-2 text-xs" role="status">
        {t(`names.${current}`)}
      </span>
      <button
        aria-label={t('next')}
        className={buttonClass}
        onClick={() => cycle(1)}
        type="button"
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  )
}
