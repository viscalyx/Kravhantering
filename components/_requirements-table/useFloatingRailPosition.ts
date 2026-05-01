'use client'

import { type RefObject, useCallback, useRef, useState } from 'react'
import {
  areFloatingActionRailPositionsEqual,
  FLOATING_ACTION_RAIL_MIN_TOP_OFFSET,
  FLOATING_ACTION_RAIL_TABLE_TOP_OFFSET,
  FLOATING_ACTION_RAIL_WIDTH,
  type FloatingActionRailPosition,
  POPOVER_VIEWPORT_MARGIN,
  useClientLayoutEffect,
} from './shared'

interface UseFloatingRailPositionParams {
  scrollContainerRef: RefObject<HTMLElement | null>
  scrollLayoutSignature: string
  shouldRenderInlineRail: boolean
  tableRef: RefObject<HTMLElement | null>
  tableRootRef: RefObject<HTMLElement | null>
}

interface UseFloatingRailPositionResult {
  floatingRailPosition: FloatingActionRailPosition
  scheduleFloatingRailUpdate: () => void
  showScrollTopAction: boolean
}

const INITIAL_POSITION: FloatingActionRailPosition = {
  left: POPOVER_VIEWPORT_MARGIN,
  top: FLOATING_ACTION_RAIL_MIN_TOP_OFFSET,
  visible: false,
}

/**
 * Floating-rail position state with a single rAF scheduler. All triggers
 * (ResizeObserver on container/table, window scroll/resize, layout-signature
 * changes) funnel through `scheduleUpdate`, so multiple events in one frame
 * coalesce into one position computation.
 */
export function useFloatingRailPosition({
  scrollContainerRef,
  scrollLayoutSignature,
  shouldRenderInlineRail,
  tableRef,
  tableRootRef,
}: UseFloatingRailPositionParams): UseFloatingRailPositionResult {
  const [floatingRailPosition, setFloatingRailPosition] =
    useState<FloatingActionRailPosition>(INITIAL_POSITION)
  const [showScrollTopAction, setShowScrollTopAction] = useState(false)
  const frameRef = useRef<number | null>(null)
  const pendingRef = useRef(false)
  const shouldRenderInlineRailRef = useRef(shouldRenderInlineRail)
  shouldRenderInlineRailRef.current = shouldRenderInlineRail

  const runUpdate = useCallback(() => {
    if (shouldRenderInlineRailRef.current) {
      setFloatingRailPosition(previous =>
        previous.visible ? { ...previous, visible: false } : previous,
      )
      setShowScrollTopAction(previous => (previous ? false : previous))
      return
    }

    const container = scrollContainerRef.current
    const tableRoot = tableRootRef.current

    if (!container || typeof window === 'undefined') {
      setFloatingRailPosition(previous =>
        previous.visible ? { ...previous, visible: false } : previous,
      )
      setShowScrollTopAction(previous => (previous ? false : previous))
      return
    }

    const viewportWidth = Math.max(
      window.innerWidth,
      document.documentElement.clientWidth,
    )
    const viewportHeight = Math.max(
      window.innerHeight,
      document.documentElement.clientHeight,
    )
    const containerRect = container.getBoundingClientRect()
    const tableRootRect = tableRoot?.getBoundingClientRect() ?? containerRect
    const hasMeasuredContainerRect =
      containerRect.width > 0 || containerRect.height > 0
    const hasMeasuredTableRootRect =
      tableRootRect.width > 0 || tableRootRect.height > 0
    const effectiveTableRect = hasMeasuredTableRootRect
      ? tableRootRect
      : containerRect
    const railLeft = hasMeasuredContainerRect
      ? Math.max(
          POPOVER_VIEWPORT_MARGIN,
          Math.min(
            containerRect.right + 12,
            viewportWidth -
              FLOATING_ACTION_RAIL_WIDTH -
              POPOVER_VIEWPORT_MARGIN,
          ),
        )
      : Math.max(
          POPOVER_VIEWPORT_MARGIN,
          viewportWidth - FLOATING_ACTION_RAIL_WIDTH - POPOVER_VIEWPORT_MARGIN,
        )
    const railTop = hasMeasuredContainerRect
      ? Math.max(
          FLOATING_ACTION_RAIL_MIN_TOP_OFFSET,
          effectiveTableRect.top + FLOATING_ACTION_RAIL_TABLE_TOP_OFFSET,
        )
      : FLOATING_ACTION_RAIL_MIN_TOP_OFFSET
    const nextRailPosition: FloatingActionRailPosition = {
      left: railLeft,
      top: railTop,
      visible: hasMeasuredContainerRect
        ? effectiveTableRect.bottom > railTop &&
          effectiveTableRect.top < viewportHeight - POPOVER_VIEWPORT_MARGIN
        : true,
    }
    const nextShowScrollTopAction = hasMeasuredContainerRect
      ? effectiveTableRect.top <
          railTop - FLOATING_ACTION_RAIL_TABLE_TOP_OFFSET &&
        effectiveTableRect.bottom > railTop
      : false

    setFloatingRailPosition(previous =>
      areFloatingActionRailPositionsEqual(previous, nextRailPosition)
        ? previous
        : nextRailPosition,
    )
    setShowScrollTopAction(previous =>
      previous === nextShowScrollTopAction ? previous : nextShowScrollTopAction,
    )
  }, [scrollContainerRef, tableRootRef])

  const scheduleFloatingRailUpdate = useCallback(() => {
    if (pendingRef.current) {
      return
    }

    if (typeof globalThis.requestAnimationFrame !== 'function') {
      runUpdate()
      return
    }

    pendingRef.current = true
    frameRef.current = globalThis.requestAnimationFrame(() => {
      pendingRef.current = false
      frameRef.current = null
      runUpdate()
    })
  }, [runUpdate])

  useClientLayoutEffect(() => {
    runUpdate()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => scheduleFloatingRailUpdate())

    if (scrollContainerRef.current) {
      resizeObserver?.observe(scrollContainerRef.current)
    }
    if (tableRef.current) {
      resizeObserver?.observe(tableRef.current)
    }

    const handleEvent = () => scheduleFloatingRailUpdate()
    window.addEventListener('resize', handleEvent)
    window.addEventListener('scroll', handleEvent, true)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleEvent)
      window.removeEventListener('scroll', handleEvent, true)
      if (
        frameRef.current !== null &&
        typeof globalThis.cancelAnimationFrame === 'function'
      ) {
        globalThis.cancelAnimationFrame(frameRef.current)
      }
      frameRef.current = null
      pendingRef.current = false
    }
  }, [
    runUpdate,
    scheduleFloatingRailUpdate,
    scrollContainerRef,
    scrollLayoutSignature,
    tableRef,
  ])

  // Recompute immediately when the inline/floating placement toggles so the
  // fixed rail state reflects the new mode without waiting for the next
  // scroll/resize event.
  useClientLayoutEffect(() => {
    scheduleFloatingRailUpdate()
  }, [scheduleFloatingRailUpdate, shouldRenderInlineRail])

  return {
    floatingRailPosition,
    scheduleFloatingRailUpdate,
    showScrollTopAction,
  }
}
