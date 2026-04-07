'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { devMarker } from '@/lib/developer-mode-markers'

interface DeviationDecisionModalProps {
  loading?: boolean
  onClose: () => void
  onSubmit: (decision: 1 | 2, motivation: string, decidedBy: string) => void
  open: boolean
}

export default function DeviationDecisionModal({
  loading,
  onClose,
  onSubmit,
  open,
}: DeviationDecisionModalProps) {
  const td = useTranslations('deviation')
  const tc = useTranslations('common')
  const [decision, setDecision] = useState<1 | 2>(1)
  const [motivation, setMotivation] = useState('')
  const [decidedBy, setDecidedBy] = useState('')
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setDecision(1)
      setMotivation('')
      setDecidedBy('')
      setOpenHelp(new Set())
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [open])

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
    if (!motivation.trim() || !decidedBy.trim()) return
    onSubmit(decision, motivation.trim(), decidedBy.trim())
  }, [decision, motivation, decidedBy, onSubmit])

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
          key="deviation-decision-backdrop"
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
            aria-labelledby="deviation-decision-title"
            aria-modal="true"
            className="relative z-50 w-full max-w-md rounded-xl bg-white dark:bg-secondary-900 shadow-2xl"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'deviation-decision',
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
                id="deviation-decision-title"
              >
                {td('recordDecision')}
              </h2>

              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    checked={decision === 1}
                    name="deviationDecisionModal"
                    onChange={() => setDecision(1)}
                    type="radio"
                  />
                  {td('approve')}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    checked={decision === 2}
                    name="deviationDecisionModal"
                    onChange={() => setDecision(2)}
                    type="radio"
                  />
                  {td('reject')}
                </label>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="decision-motivation"
                  >
                    {td('decisionMotivation')} *
                  </label>
                  <button
                    aria-controls="help-decision-motivation"
                    aria-expanded={openHelp.has('motivation')}
                    aria-label={`${tc('help')}: ${td('decisionMotivation')}`}
                    className="inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => toggleHelp('motivation')}
                    type="button"
                  >
                    <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
                {openHelp.has('motivation') && (
                  <p
                    className="mt-1 mb-2 text-xs text-secondary-500 dark:text-secondary-400 whitespace-pre-line bg-secondary-50 dark:bg-secondary-800/50 rounded-lg px-3 py-2 border border-secondary-200 dark:border-secondary-700"
                    id="help-decision-motivation"
                  >
                    {td('decisionMotivationHelp')}
                  </p>
                )}
                <textarea
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm"
                  id="decision-motivation"
                  onChange={e => setMotivation(e.target.value)}
                  placeholder={td('decisionMotivationPlaceholder')}
                  ref={textareaRef}
                  rows={3}
                  value={motivation}
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="decision-decidedBy"
                  >
                    {td('decidedBy')} *
                  </label>
                  <button
                    aria-controls="help-decision-decidedBy"
                    aria-expanded={openHelp.has('decidedBy')}
                    aria-label={`${tc('help')}: ${td('decidedBy')}`}
                    className="inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => toggleHelp('decidedBy')}
                    type="button"
                  >
                    <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
                {openHelp.has('decidedBy') && (
                  <p
                    className="mt-1 mb-2 text-xs text-secondary-500 dark:text-secondary-400 whitespace-pre-line bg-secondary-50 dark:bg-secondary-800/50 rounded-lg px-3 py-2 border border-secondary-200 dark:border-secondary-700"
                    id="help-decision-decidedBy"
                  >
                    {td('decidedByHelp')}
                  </p>
                )}
                <input
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm"
                  id="decision-decidedBy"
                  onChange={e => setDecidedBy(e.target.value)}
                  placeholder={td('decidedByPlaceholder')}
                  type="text"
                  value={decidedBy}
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
                  disabled={!motivation.trim() || !decidedBy.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading ? tc('saving') : td('recordDecision')}
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
