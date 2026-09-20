'use client'

// Throwaway UI review control. Never rendered in a production build.
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect } from 'react'
import { usePathname, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

export const prototypeVariants = ['before', 'A', 'B', 'C', 'D'] as const
export type PrototypeVariant = (typeof prototypeVariants)[number]

export default function PrototypeSwitcher({
  current,
}: {
  current: PrototypeVariant
}) {
  const t = useTranslations('packagePrototype')
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const select = useCallback(
    (variant: PrototypeVariant) => {
      const next = new URLSearchParams(params.toString())
      next.set('variant', variant)
      router.replace(`${pathname}?${next}`, { scroll: false })
    },
    [params, pathname, router],
  )
  const cycle = useCallback(
    (direction: number) => {
      select(
        prototypeVariants[
          (prototypeVariants.indexOf(current) +
            direction +
            prototypeVariants.length) %
            prototypeVariants.length
        ],
      )
    },
    [current, select],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        target.closest(
          'input, textarea, select, [contenteditable], [role="dialog"], [role="tablist"]',
        )
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])

  if (process.env.NODE_ENV === 'production') return null
  return (
    <nav
      aria-label={t('switcher')}
      className="fixed bottom-4 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-secondary-600 bg-secondary-950 p-2 text-white shadow-xl"
      {...devMarker({
        context: 'package prototype',
        name: 'variant switcher',
        value: current,
      })}
    >
      <button
        aria-label={t('previous')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-secondary-700 focus-visible:outline-2 focus-visible:outline-white"
        onClick={() => cycle(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={18} />
      </button>
      <div className="flex justify-center gap-1">
        {prototypeVariants.map(key => (
          <button
            aria-label={t(`variant.${key}`)}
            aria-pressed={key === current}
            className={`min-h-9 min-w-6 rounded-xl px-2 sm:px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-white ${key === current ? 'bg-white text-secondary-950' : 'text-secondary-200 hover:bg-secondary-700'}`}
            key={key}
            onClick={() => select(key)}
            type="button"
          >
            <span className="hidden sm:inline">{t(`variant.${key}`)}</span>
            <span className="sm:hidden">
              {key === 'before' ? t('variant.before') : key}
            </span>
          </button>
        ))}
      </div>
      <button
        aria-label={t('next')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-secondary-700 focus-visible:outline-2 focus-visible:outline-white"
        onClick={() => cycle(1)}
        type="button"
      >
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </nav>
  )
}
