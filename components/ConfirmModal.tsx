'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

/* ---------- Types ---------- */

type IconPreset = 'info' | 'warning' | 'caution'

interface ConfirmOptions {
  anchorEl?: HTMLElement | null
  cancelText?: string
  confirmText?: string
  defaultCancel?: boolean
  icon?: IconPreset | LucideIcon
  message: string
  showCancel?: boolean
  title?: string
  variant?: 'default' | 'danger'
}

interface ModalState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

interface ConfirmModalContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

/* ---------- Preset icons ---------- */

const ICON_PRESETS: Record<
  IconPreset,
  { Component: LucideIcon; className: string }
> = {
  info: { Component: Info, className: 'text-blue-500' },
  warning: { Component: AlertTriangle, className: 'text-amber-500' },
  caution: { Component: AlertCircle, className: 'text-red-500' },
}

/* ---------- Positioning ---------- */

const MARGIN = 16

function computePosition(
  anchorEl: HTMLElement | null | undefined,
  modalWidth: number,
  modalHeight: number,
) {
  if (!anchorEl || !anchorEl.isConnected) {
    return {
      top: Math.max(MARGIN, (window.innerHeight - modalHeight) / 2),
      left: Math.max(MARGIN, (window.innerWidth - modalWidth) / 2),
    }
  }

  const rect = anchorEl.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2

  let left = centerX - modalWidth / 2
  left = Math.max(
    MARGIN,
    Math.min(left, window.innerWidth - modalWidth - MARGIN),
  )

  const spaceBelow = window.innerHeight - rect.bottom
  let top: number
  if (spaceBelow >= modalHeight + MARGIN) {
    top = rect.bottom + 8
  } else if (rect.top >= modalHeight + MARGIN) {
    top = rect.top - modalHeight - 8
  } else {
    top = Math.max(MARGIN, (window.innerHeight - modalHeight) / 2)
  }
  top = Math.max(
    MARGIN,
    Math.min(top, window.innerHeight - modalHeight - MARGIN),
  )

  return { top, left }
}

/* ---------- Context ---------- */

const ConfirmModalContext = createContext<ConfirmModalContextValue | null>(null)

/* ---------- Provider ---------- */

export function ConfirmModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const tc = useTranslations('common')

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise(resolve => {
        setModal({ ...options, resolve })
      }),
    [],
  )

  const handleClose = useCallback(
    (value: boolean) => {
      modal?.resolve(value)
      setModal(null)
    },
    [modal],
  )

  return (
    <ConfirmModalContext.Provider value={{ confirm }}>
      {children}
      {typeof window !== 'undefined' &&
        createPortal(
          <ConfirmModalInner
            defaultCancelText={tc('cancel')}
            defaultConfirmText={tc('confirm')}
            modal={modal}
            onClose={handleClose}
          />,
          document.body,
        )}
    </ConfirmModalContext.Provider>
  )
}

/* ---------- Hook ---------- */

export function useConfirmModal() {
  const ctx = useContext(ConfirmModalContext)
  if (!ctx) {
    throw new Error('useConfirmModal must be used within ConfirmModalProvider')
  }
  return ctx
}

/* ---------- Modal inner component ---------- */

function ConfirmModalInner({
  modal,
  onClose,
  defaultConfirmText,
  defaultCancelText,
}: {
  modal: ModalState | null
  onClose: (value: boolean) => void
  defaultConfirmText: string
  defaultCancelText: string
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })

  const showCancel = modal?.showCancel !== false
  const variant = modal?.variant ?? 'default'
  const confirmText = modal?.confirmText ?? defaultConfirmText
  const cancelText = modal?.cancelText ?? defaultCancelText

  // Compute position after mount and on resize/scroll
  useEffect(() => {
    if (!modal) return

    const update = () => {
      const el = modalRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      setPos(computePosition(modal.anchorEl, width, height))
    }

    // Initial position after first paint
    requestAnimationFrame(update)

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [modal])

  // Auto-focus: danger or defaultCancel → cancel button; default → confirm button
  useEffect(() => {
    if (!modal) return
    requestAnimationFrame(() => {
      if ((variant === 'danger' || modal.defaultCancel) && showCancel) {
        cancelBtnRef.current?.focus()
      } else {
        confirmBtnRef.current?.focus()
      }
    })
  }, [modal, variant, showCancel])

  // Resolve icon
  let IconComponent: LucideIcon | null = null
  let iconClassName = 'text-secondary-600 dark:text-secondary-400'
  if (modal?.icon) {
    if (typeof modal.icon === 'string') {
      const preset = ICON_PRESETS[modal.icon]
      IconComponent = preset.Component
      iconClassName = preset.className
    } else {
      IconComponent = modal.icon
    }
  }

  const titleId = 'confirm-modal-title'
  const messageId = 'confirm-modal-message'

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-start justify-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key="confirm-backdrop"
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop — click to dismiss */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog element */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => onClose(false)}
          />

          {/* Dialog */}
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            aria-describedby={modal.title ? messageId : undefined}
            aria-labelledby={modal.title ? titleId : messageId}
            aria-modal="true"
            className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-secondary-900 shadow-2xl"
            data-developer-mode-name="dialog"
            data-developer-mode-priority="420"
            data-developer-mode-value={modal.title ?? undefined}
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                onClose(false)
              }
              // Focus trap between buttons
              if (e.key === 'Tab' && showCancel) {
                const isConfirm =
                  document.activeElement === confirmBtnRef.current
                const isCancel = document.activeElement === cancelBtnRef.current
                if (e.shiftKey && isCancel) {
                  e.preventDefault()
                  confirmBtnRef.current?.focus()
                } else if (e.shiftKey && isConfirm) {
                  e.preventDefault()
                  cancelBtnRef.current?.focus()
                } else if (!e.shiftKey && isConfirm) {
                  e.preventDefault()
                  cancelBtnRef.current?.focus()
                } else if (!e.shiftKey && isCancel) {
                  e.preventDefault()
                  confirmBtnRef.current?.focus()
                }
              }
            }}
            ref={modalRef}
            role="alertdialog"
            style={{ top: pos.top, left: pos.left }}
            transition={{ duration: 0.15 }}
          >
            <div className="p-5">
              {/* Header: icon + title */}
              <div className="flex items-start gap-3">
                {IconComponent && (
                  <IconComponent
                    aria-hidden="true"
                    className={`h-5 w-5 mt-0.5 shrink-0 ${iconClassName}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  {modal.title && (
                    <h2
                      className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                      id={titleId}
                    >
                      {modal.title}
                    </h2>
                  )}
                  <p
                    className={`text-sm text-secondary-700 dark:text-secondary-300 ${modal.title ? 'mt-1' : ''}`}
                    id={messageId}
                  >
                    {modal.message}
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 mt-5">
                {showCancel && (
                  <button
                    className="btn-secondary text-sm !py-2 !px-4"
                    onClick={() => onClose(false)}
                    ref={cancelBtnRef}
                    type="button"
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  className={
                    variant === 'danger'
                      ? 'text-sm font-medium py-2 px-4 rounded-xl text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:ring-offset-2 dark:focus:ring-offset-secondary-950'
                      : 'btn-primary text-sm !py-2 !px-4'
                  }
                  onClick={() => onClose(true)}
                  ref={confirmBtnRef}
                  type="button"
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
