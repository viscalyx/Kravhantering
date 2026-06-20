'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode, RefObject } from 'react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '@/hooks/useModalFocus'
import { devMarker } from '@/lib/developer-mode-markers'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

interface FormModalProps {
  children: ReactNode
  closeDisabled?: boolean
  developerModeValue?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  maxWidthClassName?: string
  onClose: () => void
  open: boolean
  showHeader?: boolean
  title: string
  titleId: string
}

export default function FormModal({
  children,
  closeDisabled = false,
  developerModeValue,
  initialFocusRef,
  maxWidthClassName = 'max-w-2xl',
  onClose,
  open,
  showHeader = true,
  title,
  titleId,
}: FormModalProps) {
  const tc = useTranslations('common')
  const modalRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const { handleKeyDown } = useModalFocus({
    closeDisabled,
    initialFocusRef,
    modalRef,
    onClose,
    open,
  })

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return
    }

    const html = document.documentElement
    const { body } = document
    const previousBodyOverflow = body.style.overflow
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior

    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'contain'
    html.style.overscrollBehavior = 'contain'

    return () => {
      body.style.overflow = previousBodyOverflow
      html.style.overflow = previousHtmlOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior
    }
  }, [open])

  if (typeof document === 'undefined') {
    return null
  }

  const close = () => {
    if (!closeDisabled) {
      onClose()
    }
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key={`${titleId}-backdrop`}
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            aria-labelledby={titleId}
            aria-modal="true"
            className={`relative z-50 max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl dark:bg-secondary-900 ${maxWidthClassName}`}
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: developerModeValue ?? title,
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            {showHeader ? (
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-secondary-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-secondary-700 dark:bg-secondary-900/95">
                <h2
                  className="text-lg font-semibold text-secondary-900 dark:text-secondary-100"
                  id={titleId}
                >
                  {title}
                </h2>
                <button
                  aria-label={tc('close')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:hover:text-secondary-50 dark:focus-visible:ring-offset-secondary-950"
                  disabled={closeDisabled}
                  onClick={close}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <h2 className="sr-only" id={titleId}>
                {title}
              </h2>
            )}
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
