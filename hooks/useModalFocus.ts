import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { registerModal } from '@/lib/modal-focus'

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
  /** Ref to the element that should receive focus when the modal closes. */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

interface UseModalFocusReturn {
  /** Attach to the dialog container's `onKeyDown`. */
  handleKeyDown: (e: React.KeyboardEvent) => void
}

/** Shared ownership for custom modal surfaces, including nested portals. */
export function useModalFocus(
  options: UseModalFocusOptions,
): UseModalFocusReturn {
  const latest = useRef(options)
  const registration = useRef<ReturnType<typeof registerModal> | null>(null)
  const { open, modalRef } = options

  useLayoutEffect(() => {
    latest.current = options
  }, [options])

  // A loading/error branch can replace the DOM node without changing `open`.
  useEffect(() => {
    const element = open ? modalRef.current : null
    if (registration.current?.element === element) return
    const previous = registration.current?.previous
    registration.current?.close()
    registration.current = element
      ? registerModal(element, () => latest.current, previous)
      : null
  })
  useEffect(
    () => () => {
      registration.current?.close()
      registration.current = null
    },
    [],
  )

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    registration.current?.handleKeyDown(event)
  }, [])

  return { handleKeyDown }
}
