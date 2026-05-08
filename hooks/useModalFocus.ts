import { useCallback, useEffect, useRef } from 'react'

/* ---------- Types ---------- */

interface UseModalFocusOptions {
  /** When true, Escape is suppressed (e.g. during async save). */
  closeDisabled?: boolean
  /** Ref to the element that should receive focus when the modal opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** Ref to the modal container for focus-trap cycling. */
  modalRef: React.RefObject<HTMLElement | null>
  /** Called when the user presses Escape (unless `closeDisabled`). */
  onClose: () => void
  /** Whether the modal is currently visible. */
  open: boolean
}

interface UseModalFocusReturn {
  /** Attach to the dialog container's `onKeyDown`. */
  handleKeyDown: (e: React.KeyboardEvent) => void
}

/* ---------- Focusable selector ---------- */

const FOCUSABLE =
  'a[href], input:not([disabled]), textarea:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'

/* ---------- Hook ---------- */

/**
 * Shared focus-management hook for portal modals.
 *
 * Handles:
 * 1. **Capture** — saves `document.activeElement` on open
 * 2. **Initial focus** — moves focus to `initialFocusRef` via `requestAnimationFrame`
 * 3. **Focus trap** — cycles Tab / Shift+Tab among focusable descendants
 * 4. **Escape** — calls `onClose` (skipped when `closeDisabled`)
 * 5. **Restore** — returns focus to the captured element on close
 */
export function useModalFocus({
  closeDisabled,
  modalRef,
  initialFocusRef,
  onClose,
  open,
}: UseModalFocusOptions): UseModalFocusReturn {
  const previousFocusRef = useRef<Element | null>(null)
  const rafIdRef = useRef<number | null>(null)

  /* Capture → initial focus, and restore on close */
  useEffect(() => {
    const cancelScheduledFocus = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }

    if (open) {
      previousFocusRef.current = document.activeElement
      cancelScheduledFocus()
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        initialFocusRef?.current?.focus()
      })

      // Restore focus when the modal closes or the component unmounts
      return () => {
        cancelScheduledFocus()
        if (previousFocusRef.current instanceof HTMLElement) {
          previousFocusRef.current.focus()
          previousFocusRef.current = null
        }
      }
    }

    return () => {
      cancelScheduledFocus()
    }
  }, [open, initialFocusRef])

  /* Keyboard handler: Escape + focus trap */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!closeDisabled) {
          onClose()
        }
        return
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable =
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [closeDisabled, modalRef, onClose],
  )

  return { handleKeyDown }
}
