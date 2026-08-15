'use client'

import { Download } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  DetailPrefetchIntentController,
  type DetailPrefetchIntentTarget,
  type DetailPrefetchTarget,
  REQUIREMENT_DETAIL_PREFETCH_ENABLED,
  REQUIREMENT_DETAIL_PREFETCH_SYNTHETIC_LATENCY_MS,
  REQUIREMENT_DETAIL_PREFETCH_VALIDATION_ENABLED,
  type RequirementDetailPrefetchEvent,
} from '@/lib/requirements/detail-prefetch'

const PREFETCH_EVENT_NAME = 'krav:requirement-detail-prefetch'

export function useRequirementDetailPrefetchIntent(
  enabled = REQUIREMENT_DETAIL_PREFETCH_ENABLED,
) {
  const [pending, setPending] = useState<DetailPrefetchIntentTarget[]>([])
  const controllerRef = useRef<DetailPrefetchIntentController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new DetailPrefetchIntentController({
      onPendingChange: setPending,
    })
  }

  useEffect(
    () => () => {
      controllerRef.current?.dispose()
    },
    [],
  )

  const schedule = useCallback(
    (target: DetailPrefetchIntentTarget, prefetch: () => void) => {
      if (!enabled) return
      controllerRef.current?.schedule(target, prefetch)
    },
    [enabled],
  )
  const cancel = useCallback(
    (target: DetailPrefetchIntentTarget) => {
      if (!enabled) return
      controllerRef.current?.cancel(target)
    },
    [enabled],
  )
  const activate = useCallback(
    (target: DetailPrefetchTarget) => {
      if (!enabled) return
      controllerRef.current?.activate(target)
    },
    [enabled],
  )

  return { activate, cancel, pending, schedule }
}

export function RequirementDetailPrefetchValidation({
  pending,
}: {
  pending: DetailPrefetchIntentTarget[]
}) {
  const eventsRef = useRef<RequirementDetailPrefetchEvent[]>([])
  const [eventCount, setEventCount] = useState(0)

  useEffect(() => {
    if (!REQUIREMENT_DETAIL_PREFETCH_VALIDATION_ENABLED) return
    const collect = (event: Event) => {
      const detail = (event as CustomEvent<RequirementDetailPrefetchEvent>)
        .detail
      eventsRef.current.push(detail)
      setEventCount(eventsRef.current.length)
    }
    window.addEventListener(PREFETCH_EVENT_NAME, collect)
    return () => window.removeEventListener(PREFETCH_EVENT_NAME, collect)
  }, [])

  const exportEvents = useCallback(() => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        events: eventsRef.current,
        syntheticLatencyMs: REQUIREMENT_DETAIL_PREFETCH_SYNTHETIC_LATENCY_MS,
      },
      null,
      2,
    )
    const url = URL.createObjectURL(
      new Blob([payload], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.download = `requirement-detail-prefetch-${Date.now()}.json`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  if (!REQUIREMENT_DETAIL_PREFETCH_VALIDATION_ENABLED) return null

  return (
    <>
      {pending.length > 0 ? (
        <div
          {...devMarker({
            context: 'requirement detail prefetch validation',
            name: 'status',
            value: 'intent threshold waiting',
          })}
          className="pointer-events-none fixed bottom-20 left-4 z-70 rounded-full border border-amber-400/70 bg-amber-50/95 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-lg backdrop-blur-sm dark:border-amber-500/60 dark:bg-amber-950/95 dark:text-amber-100"
          data-prefetch-intent-indicator="true"
        >
          Intent threshold · 150 ms
        </div>
      ) : null}
      <div
        {...devMarker({
          name: 'validation tools',
          value: 'requirement detail prefetch',
        })}
        className="fixed bottom-4 left-4 z-70 flex items-center gap-2 rounded-xl border border-secondary-300/80 bg-white/95 p-2 text-xs text-secondary-800 shadow-lg backdrop-blur-sm dark:border-secondary-700 dark:bg-secondary-900/95 dark:text-secondary-100"
      >
        <span>
          Prefetch events: {eventCount} · synthetic +
          {REQUIREMENT_DETAIL_PREFETCH_SYNTHETIC_LATENCY_MS} ms
        </span>
        <button
          {...devMarker({
            context: 'requirement detail prefetch validation',
            name: 'button',
            value: 'export events',
          })}
          aria-label="Export prefetch validation events"
          className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-secondary-300 p-1 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:hover:bg-secondary-800"
          onClick={exportEvents}
          type="button"
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  )
}
