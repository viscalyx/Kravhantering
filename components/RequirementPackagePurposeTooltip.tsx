'use client'

import {
  cloneElement,
  type FocusEventHandler,
  isValidElement,
  type MouseEventHandler,
  type ReactElement,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

interface ComponentProps {
  children: ReactNode
  disabled?: boolean
  maxWidth?: number
  purposeAndScope?: string | null
  wrapperClassName?: string
}

interface DescribedElementProps {
  'aria-describedby'?: string
  onBlur?: FocusEventHandler<Element>
  onFocus?: FocusEventHandler<Element>
  onMouseEnter?: MouseEventHandler<Element>
  onMouseLeave?: MouseEventHandler<Element>
}

interface TooltipPosition {
  bottom?: number
  left: number
  maxWidth: number
  top?: number
}

const HOVER_OPEN_DELAY_MS = 1000
const HOVER_CLOSE_DELAY_MS = 150

function describedByWithTooltip(
  existing: string | undefined,
  tooltipId: string,
): string {
  return [existing, tooltipId].filter(Boolean).join(' ')
}

function composeEventHandler<Event>(
  existing: ((event: Event) => void) | undefined,
  next: (event: Event) => void,
): (event: Event) => void {
  return event => {
    existing?.(event)
    next(event)
  }
}

export default function RequirementPackagePurposeTooltip({
  children,
  disabled = false,
  maxWidth = 360,
  purposeAndScope,
  wrapperClassName = 'inline-flex min-w-0 shrink-0',
}: ComponentProps) {
  const tooltipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const [supportsPopover, setSupportsPopover] = useState(false)
  const text = disabled ? undefined : purposeAndScope?.trim()

  const updatePosition = useCallback(() => {
    if (!rootRef.current || typeof window === 'undefined') return

    const rect = rootRef.current.getBoundingClientRect()
    const viewportMargin = 16
    const gap = 8
    const resolvedMaxWidth = Math.min(maxWidth, window.innerWidth - 32)
    const center = rect.left + rect.width / 2
    const left = Math.min(
      Math.max(center, viewportMargin + resolvedMaxWidth / 2),
      window.innerWidth - viewportMargin - resolvedMaxWidth / 2,
    )

    if (rect.bottom > window.innerHeight * 0.72) {
      setPosition({
        bottom: window.innerHeight - rect.top + gap,
        left,
        maxWidth: resolvedMaxWidth,
      })
      return
    }

    setPosition({
      left,
      maxWidth: resolvedMaxWidth,
      top: rect.bottom + gap,
    })
  }, [maxWidth])

  const clearHoverOpenTimer = useCallback(() => {
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current)
      hoverOpenTimerRef.current = null
    }
  }, [])

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])

  const openTooltip = useCallback(() => {
    clearHoverOpenTimer()
    clearHoverCloseTimer()
    if (!text) return
    updatePosition()
    setIsOpen(true)
  }, [clearHoverCloseTimer, clearHoverOpenTimer, text, updatePosition])

  const scheduleTooltipOpen = useCallback(() => {
    clearHoverOpenTimer()
    clearHoverCloseTimer()
    if (!text) return

    hoverOpenTimerRef.current = setTimeout(() => {
      hoverOpenTimerRef.current = null
      updatePosition()
      setIsOpen(true)
    }, HOVER_OPEN_DELAY_MS)
  }, [clearHoverCloseTimer, clearHoverOpenTimer, text, updatePosition])

  const closeTooltip = useCallback(() => {
    clearHoverOpenTimer()
    clearHoverCloseTimer()
    setIsOpen(false)
  }, [clearHoverCloseTimer, clearHoverOpenTimer])

  useEffect(() => {
    if (!text) closeTooltip()
  }, [closeTooltip, text])

  const scheduleTooltipClose = useCallback(() => {
    clearHoverOpenTimer()
    clearHoverCloseTimer()
    if (rootRef.current?.contains(document.activeElement)) return
    hoverCloseTimerRef.current = setTimeout(closeTooltip, HOVER_CLOSE_DELAY_MS)
  }, [clearHoverCloseTimer, clearHoverOpenTimer, closeTooltip])

  const handleFocus = useCallback(
    (event: ReactFocusEvent<Element>) => {
      if (event.currentTarget.matches(':focus-visible')) {
        openTooltip()
        return
      }
      closeTooltip()
    },
    [closeTooltip, openTooltip],
  )

  useEffect(() => {
    if (!isOpen) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTooltip()
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [closeTooltip, isOpen])

  useEffect(() => {
    setSupportsPopover(typeof HTMLElement.prototype.showPopover === 'function')
  }, [])

  useEffect(
    () => () => {
      clearHoverOpenTimer()
      clearHoverCloseTimer()
    },
    [clearHoverCloseTimer, clearHoverOpenTimer],
  )

  useEffect(() => {
    if (!isOpen) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    const tooltip = tooltipRef.current
    if (
      !isOpen ||
      !position ||
      !supportsPopover ||
      !tooltip ||
      typeof tooltip.showPopover !== 'function'
    ) {
      return
    }

    try {
      tooltip.showPopover()
    } catch {
      return
    }

    return () => {
      try {
        tooltip.hidePopover()
      } catch {
        // The tooltip may already have left the top layer during unmount.
      }
    }
  }, [isOpen, position, supportsPopover])

  const describedChildren = (() => {
    if (!text || !isValidElement<DescribedElementProps>(children)) {
      return children
    }

    const child = children as ReactElement<DescribedElementProps>
    return cloneElement(child, {
      'aria-describedby': isOpen
        ? describedByWithTooltip(child.props['aria-describedby'], tooltipId)
        : child.props['aria-describedby'],
      onBlur: composeEventHandler(child.props.onBlur, closeTooltip),
      onFocus: composeEventHandler(child.props.onFocus, handleFocus),
      onMouseEnter: composeEventHandler(
        child.props.onMouseEnter,
        scheduleTooltipOpen,
      ),
      onMouseLeave: composeEventHandler(
        child.props.onMouseLeave,
        scheduleTooltipClose,
      ),
    })
  })()

  return (
    <span className={wrapperClassName} ref={rootRef}>
      {describedChildren}
      {text && isOpen && position
        ? createPortal(
            <span
              className="fixed z-90 m-0 whitespace-pre-wrap wrap-break-word rounded-lg border border-secondary-200 bg-white px-3 py-2 text-left text-xs leading-5 text-secondary-700 shadow-lg dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
              id={tooltipId}
              onMouseEnter={clearHoverCloseTimer}
              onMouseLeave={scheduleTooltipClose}
              popover={supportsPopover ? 'manual' : undefined}
              ref={tooltipRef}
              role="tooltip"
              style={{
                bottom: position.bottom,
                left: position.left,
                maxWidth: position.maxWidth,
                right: 'auto',
                top: position.top,
                transform: 'translateX(-50%)',
              }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
