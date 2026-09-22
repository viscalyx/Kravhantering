'use client'

// Throwaway UI-review controls; never rendered in production.
import { ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export default function PrototypeSwitcher({
  variant,
  onChange,
}: {
  variant: string
  onChange: (value: string) => void
}) {
  const t = useTranslations('adminLayoutPrototype')
  const variants = ['0', 'A', 'B', 'C']
  const cycle = (direction: number) => {
    onChange(
      variants[
        (variants.indexOf(variant) + direction + variants.length) %
          variants.length
      ],
    )
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="tablist"], [role="dialog"]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      cycle(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (process.env.NODE_ENV === 'production') return null
  return (
    <div
      className="flex items-center gap-1"
      {...devMarker({
        name: 'prototype switcher',
        value: 'admin layout',
        context: 'prototype',
      })}
    >
      <FlaskConical
        aria-hidden="true"
        className="mr-1 h-4 w-4 text-amber-300"
      />
      <button
        aria-label={t('previous')}
        className="flex h-8 w-8 items-center justify-center rounded hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
        onClick={() => cycle(-1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      {variants.map(key => (
        <button
          aria-pressed={key === variant}
          className={`min-h-8 rounded px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-white ${key === variant ? 'bg-white text-slate-950' : 'text-white hover:bg-white/15'}`}
          key={key}
          onClick={() => onChange(key)}
          type="button"
        >
          {t(`variants.${key}`)}
        </button>
      ))}
      <button
        aria-label={t('next')}
        className="flex h-8 w-8 items-center justify-center rounded hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
        onClick={() => cycle(1)}
        type="button"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
