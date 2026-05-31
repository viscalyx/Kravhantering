'use client'

import type { CSSProperties, ReactNode, RefObject } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { devMarker } from '@/lib/developer-mode-markers'

type FloatingActionPillVariant = 'default' | 'primary'

export interface FloatingActionRailItem {
  ariaLabel: string
  customStyle?: CSSProperties
  developerModeValue?: string
  disabled?: boolean
  hidden?: boolean
  icon: ReactNode
  id: string
  onClick: () => void
  tooltip?: string
  variant?: FloatingActionPillVariant
}

interface FloatingActionRailProps {
  anchorRef?: RefObject<HTMLElement | null>
  developerModeContext: string
  items: FloatingActionRailItem[]
}

interface FloatingActionRailPosition {
  left: number
  top: number
  visible: boolean
}

const FLOATING_ACTION_RAIL_MIN_TOP_OFFSET = 80
const FLOATING_ACTION_RAIL_TOP_OFFSET = 4
const FLOATING_ACTION_RAIL_WIDTH = 44
const POPOVER_VIEWPORT_MARGIN = 8
const HEADER_CLEARANCE = 12

const floatingPillBaseClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:-translate-y-px dark:focus-visible:ring-offset-secondary-950'

const floatingPillVariantClassNames: Record<FloatingActionPillVariant, string> =
  {
    default:
      'border-secondary-200/80 bg-white/90 text-secondary-500 hover:border-secondary-300 hover:text-secondary-700 hover:shadow-[0_14px_36px_-20px_rgba(15,23,42,0.5)] dark:border-secondary-700/80 dark:bg-secondary-900/80 dark:text-secondary-300 dark:hover:border-secondary-600 dark:hover:text-secondary-100',
    primary:
      'border-primary-600/80 bg-primary-700 text-white hover:border-primary-700 hover:bg-primary-800 hover:shadow-[0_14px_36px_-20px_rgba(67,56,202,0.55)] dark:border-primary-500/80 dark:bg-primary-600 dark:hover:border-primary-400 dark:hover:bg-primary-700',
  }

const useClientLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

const initialPosition: FloatingActionRailPosition = {
  left: POPOVER_VIEWPORT_MARGIN,
  top: FLOATING_ACTION_RAIL_MIN_TOP_OFFSET,
  visible: false,
}

function getFloatingPillClassName(
  variant: FloatingActionPillVariant = 'default',
) {
  return `${floatingPillBaseClassName} ${floatingPillVariantClassNames[variant]}`
}

function arePositionsEqual(
  left: FloatingActionRailPosition,
  right: FloatingActionRailPosition,
) {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.visible === right.visible
  )
}

function getStickyHeaderBottom() {
  if (typeof document === 'undefined') {
    return 0
  }

  const navigation = document.querySelector<HTMLElement>(
    '[data-developer-mode-name="navigation"], nav',
  )
  const rect = navigation?.getBoundingClientRect()
  if (!rect || rect.bottom <= 0) {
    return 0
  }

  return rect.bottom + HEADER_CLEARANCE
}

export default function FloatingActionRail({
  anchorRef,
  developerModeContext,
  items,
}: FloatingActionRailProps) {
  const [position, setPosition] =
    useState<FloatingActionRailPosition>(initialPosition)
  const frameRef = useRef<number | null>(null)
  const pendingRef = useRef(false)

  const visibleItems = items.filter(item => !item.hidden)

  const runUpdate = useCallback(() => {
    if (typeof window === 'undefined') {
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
    const expectsAnchor = anchorRef !== undefined
    const anchor = anchorRef?.current
    const rect = anchor?.getBoundingClientRect()
    const measuredAnchorRect =
      rect && (rect.width > 0 || rect.height > 0) ? rect : null
    const isJsdomEnvironment =
      typeof navigator !== 'undefined' &&
      navigator.userAgent.toLowerCase().includes('jsdom')

    const railLeft = measuredAnchorRect
      ? Math.max(
          POPOVER_VIEWPORT_MARGIN,
          Math.min(
            measuredAnchorRect.right + 12,
            viewportWidth -
              FLOATING_ACTION_RAIL_WIDTH -
              POPOVER_VIEWPORT_MARGIN,
          ),
        )
      : Math.max(
          POPOVER_VIEWPORT_MARGIN,
          viewportWidth - FLOATING_ACTION_RAIL_WIDTH - POPOVER_VIEWPORT_MARGIN,
        )
    const headerSafeTop = Math.max(
      FLOATING_ACTION_RAIL_MIN_TOP_OFFSET,
      getStickyHeaderBottom(),
    )
    const railTop = measuredAnchorRect
      ? Math.max(
          headerSafeTop,
          measuredAnchorRect.top + FLOATING_ACTION_RAIL_TOP_OFFSET,
        )
      : headerSafeTop

    const nextPosition = {
      left: railLeft,
      top: railTop,
      visible: measuredAnchorRect
        ? measuredAnchorRect.bottom > railTop &&
          measuredAnchorRect.top < viewportHeight - POPOVER_VIEWPORT_MARGIN
        : !expectsAnchor || isJsdomEnvironment,
    }

    setPosition(previous =>
      arePositionsEqual(previous, nextPosition) ? previous : nextPosition,
    )
  }, [anchorRef])

  const scheduleUpdate = useCallback(() => {
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
    scheduleUpdate()
    const delayedUpdateId = window.setTimeout(scheduleUpdate, 50)

    const anchor = anchorRef?.current
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => scheduleUpdate())
    if (anchor) {
      resizeObserver?.observe(anchor)
    }

    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)

    return () => {
      resizeObserver?.disconnect()
      window.clearTimeout(delayedUpdateId)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      if (
        frameRef.current !== null &&
        typeof globalThis.cancelAnimationFrame === 'function'
      ) {
        globalThis.cancelAnimationFrame(frameRef.current)
      }
      frameRef.current = null
      pendingRef.current = false
    }
  }, [anchorRef, runUpdate, scheduleUpdate])

  if (
    visibleItems.length === 0 ||
    !position.visible ||
    typeof document === 'undefined'
  ) {
    return null
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-30 motion-safe:transition-[top,left] motion-safe:duration-100 motion-safe:ease-linear motion-reduce:transition-none"
      style={{
        left: position.left,
        top: position.top,
        willChange: 'top, left',
      }}
    >
      <div
        className="pointer-events-auto flex flex-col gap-3"
        {...devMarker({
          context: developerModeContext,
          name: 'floating action rail',
          priority: 340,
        })}
        data-floating-action-rail="true"
        data-floating-action-rail-placement="fixed-right"
      >
        <div
          className="flex flex-col gap-3"
          data-floating-action-group="primary"
        >
          {visibleItems.map(item => {
            const variant = item.variant ?? 'default'
            return (
              <button
                aria-label={item.ariaLabel}
                className={`${getFloatingPillClassName(variant)}${
                  item.disabled ? ' cursor-not-allowed opacity-60' : ''
                }`}
                data-floating-action-id={item.id}
                data-floating-action-item="true"
                data-floating-action-variant={variant}
                disabled={item.disabled}
                key={item.id}
                onClick={item.onClick}
                style={item.customStyle}
                title={item.tooltip ?? item.ariaLabel}
                type="button"
                {...devMarker({
                  context: developerModeContext,
                  name: 'floating pill',
                  priority: 360,
                  value: item.developerModeValue,
                })}
              >
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center"
                >
                  {item.icon}
                </span>
                <span className="sr-only">{item.ariaLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
