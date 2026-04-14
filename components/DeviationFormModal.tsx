'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

interface DeviationFormModalProps {
  initialCreatedBy?: string
  initialMotivation?: string
  loading?: boolean
  onClose: () => void
  onSubmit: (motivation: string, createdBy: string) => void
  open: boolean
  riskLevel?: { color: string | null; name: string | null } | null
  title?: string
}

export default function DeviationFormModal({
  initialCreatedBy,
  initialMotivation,
  loading,
  onClose,
  onSubmit,
  open,
  riskLevel,
  title,
}: DeviationFormModalProps) {
  const td = useTranslations('deviation')
  const tc = useTranslations('common')
  const [motivation, setMotivation] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Reset fields when opening
  useEffect(() => {
    if (open) {
      setMotivation(initialMotivation ?? '')
      setCreatedBy(initialCreatedBy ?? '')
      setOpenHelp(new Set())
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [open, initialMotivation, initialCreatedBy])

  const toggleHelp = (field: string) => {
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const handleSubmit = useCallback(() => {
    if (!motivation.trim()) return
    onSubmit(motivation.trim(), createdBy.trim())
  }, [motivation, createdBy, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    },
    [onClose],
  )

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key="deviation-form-backdrop"
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            aria-labelledby="deviation-form-title"
            aria-modal="true"
            className="relative z-50 w-full max-w-md rounded-xl bg-white dark:bg-secondary-900 shadow-2xl"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'deviation-form',
            })}
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            transition={{ duration: 0.15 }}
          >
            <div className="p-5 space-y-4">
              <h2
                className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                id="deviation-form-title"
              >
                {title ?? td('requestDeviation')}
              </h2>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                  {td('riskLevel')}:
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800 px-2.5 py-0.5 text-xs font-medium text-secondary-700 dark:text-secondary-300">
                  {riskLevel?.color && (
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: riskLevel.color }}
                    />
                  )}
                  {riskLevel?.name ?? '—'}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="deviation-motivation"
                  >
                    {td('motivation')} *
                  </label>
                  <button
                    aria-controls="help-motivation"
                    aria-expanded={openHelp.has('motivation')}
                    aria-label={`${tc('help')}: ${td('motivation')}`}
                    className="inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => toggleHelp('motivation')}
                    type="button"
                  >
                    <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
                <AnimatedHelpPanel
                  id="help-motivation"
                  isOpen={openHelp.has('motivation')}
                >
                  {td('motivationHelp')}
                </AnimatedHelpPanel>
                <textarea
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm"
                  id="deviation-motivation"
                  onChange={e => setMotivation(e.target.value)}
                  placeholder={td('motivationPlaceholder')}
                  ref={textareaRef}
                  rows={4}
                  value={motivation}
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="deviation-createdBy"
                  >
                    {td('createdByLabel')}
                  </label>
                  <button
                    aria-controls="help-createdBy"
                    aria-expanded={openHelp.has('createdBy')}
                    aria-label={`${tc('help')}: ${td('createdByLabel')}`}
                    className="inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => toggleHelp('createdBy')}
                    type="button"
                  >
                    <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
                <AnimatedHelpPanel
                  id="help-createdBy"
                  isOpen={openHelp.has('createdBy')}
                >
                  {td('createdByHelp')}
                </AnimatedHelpPanel>
                <input
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm"
                  id="deviation-createdBy"
                  onChange={e => setCreatedBy(e.target.value)}
                  placeholder={td('createdByPlaceholder')}
                  type="text"
                  value={createdBy}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  className="btn-secondary text-sm px-4 py-2"
                  disabled={loading}
                  onClick={onClose}
                  type="button"
                >
                  {tc('cancel')}
                </button>
                <button
                  className="btn-primary text-sm px-4 py-2"
                  disabled={!motivation.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading
                    ? tc('saving')
                    : initialMotivation
                      ? tc('save')
                      : td('newDeviation')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
