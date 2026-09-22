'use client'

// THROWAWAY review tool; deliberately independent of the product design.
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export default function PrototypeSwitcher({
  current,
  examples,
  onReset,
  onToggleExamples,
  state,
  variants,
}: {
  current: string
  examples: boolean
  onReset: () => void
  onToggleExamples: () => void
  state: unknown
  variants: Array<{ key: string; name: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [measurements, setMeasurements] = useState<unknown>(null)
  const [blockedWrites, setBlockedWrites] = useState(0)
  const change = useCallback(
    (key: string) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set('variant', key)
      router.replace(`${pathname}?${next}` as Route, { scroll: false })
      setMeasurements(null)
    },
    [pathname, router, searchParams],
  )
  const cycle = useCallback(
    (offset: number) => {
      const index = variants.findIndex(item => item.key === current)
      change(variants[(index + offset + variants.length) % variants.length].key)
    },
    [change, current, variants],
  )

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable], [role="dialog"], [role="slider"]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      cycle(event.key === 'ArrowRight' ? 1 : -1)
    }
    const blocked = () => setBlockedWrites(count => count + 1)
    window.addEventListener('keydown', keydown)
    window.addEventListener('prototype-1357-write-blocked', blocked)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('prototype-1357-write-blocked', blocked)
    }
  }, [cycle])

  if (process.env.NODE_ENV === 'production') return null
  const button =
    'min-h-8 rounded-lg border border-white/30 px-3 py-1 text-xs text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-100 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl border border-white/30 bg-slate-950 p-3 text-white shadow-xl"
      data-prototype-switcher=""
      {...devMarker({
        context: 'rfiQuestions',
        name: 'prototype review controls',
      })}
    >
      {open && (
        <div className="mb-3 max-h-[55vh] w-170 max-w-full overflow-auto border-b border-white/30 pb-3">
          <p className="mb-2 text-sm">
            Which layout best preserves readable questions, version, status and
            actions?
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button className={button} onClick={onToggleExamples} type="button">
              {examples
                ? 'Remove examples'
                : 'Add long-text / archived examples'}
            </button>
            <button className={button} onClick={onReset} type="button">
              Reset data and filters
            </button>
            <button
              className={button}
              onClick={() => {
                const switcherTop =
                  document
                    .querySelector('[data-prototype-switcher]')
                    ?.getBoundingClientRect().top ?? innerHeight
                const grid = document.querySelector('[data-rfi-filters]')
                const rows = [
                  ...document.querySelectorAll('[data-rfi-row]'),
                ].map(row => {
                  const box = row.getBoundingClientRect()
                  return {
                    id: row.getAttribute('data-rfi-row'),
                    height: Math.round(box.height),
                    fullyVisible: box.top >= 0 && box.bottom <= switcherTop,
                  }
                })
                setMeasurements({
                  viewport: [innerWidth, innerHeight],
                  gridColumns: grid
                    ? getComputedStyle(grid).gridTemplateColumns
                    : null,
                  visibleRows: rows.filter(row => row.fullyVisible).length,
                  rows,
                  note: 'Snapshot excludes rows covered by this panel. Close panel and use capture command for comparisons.',
                })
              }}
              type="button"
            >
              Measure rows
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/10 p-2 text-xs">
            {JSON.stringify(
              {
                variant: current,
                examples,
                blockedWrites,
                state,
                measurements,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-semibold">
          THROWAWAY #1357 · writes blocked
        </span>
        <button
          aria-label="Previous variant"
          className={button}
          onClick={() => cycle(-1)}
          type="button"
        >
          ←
        </button>
        <select
          aria-label="Prototype variant"
          className="min-h-8 max-w-full rounded-lg border border-white/30 bg-slate-950 px-2 text-xs text-white"
          onChange={event => change(event.target.value)}
          value={current}
        >
          {variants.map(item => (
            <option key={item.key} value={item.key}>
              {item.key} · {item.name}
            </option>
          ))}
        </select>
        <button
          aria-label="Next variant"
          className={button}
          onClick={() => cycle(1)}
          type="button"
        >
          →
        </button>
        <button
          aria-expanded={open}
          className={button}
          onClick={() => setOpen(value => !value)}
          type="button"
        >
          {open ? 'Close review' : 'Review and state'}
        </button>
      </div>
    </aside>
  )
}
