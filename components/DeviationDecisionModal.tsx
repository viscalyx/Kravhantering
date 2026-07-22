'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldHelpButton from '@/components/FieldHelpButton'
import { modalResizableTextareaRows3ClassName } from '@/components/modal-textarea-class'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { useModalFocus } from '@/hooks/useModalFocus'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

const textareaClassName = `w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-900 ${modalResizableTextareaRows3ClassName}`

interface DeviationDecisionModalProps {
  loading?: boolean
  onClose: () => void
  onSubmit: (decision: 1 | 2, motivation: string) => void
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
  const [baselineSignature, setBaselineSignature] = useState(() =>
    createDirtySnapshot({ decision: 1, motivation: '' }),
  )
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  useEffect(() => {
    if (open) {
      setDecision(1)
      setMotivation('')
      setBaselineSignature(createDirtySnapshot({ decision: 1, motivation: '' }))
      setOpenHelp(new Set())
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

  const formDirty =
    baselineSignature !== createDirtySnapshot({ decision, motivation })

  const requestClose = useCallback(
    async (anchorEl?: HTMLElement | null) => {
      if (loading) return
      if (formDirty && !(await confirmDiscardChanges(anchorEl))) return
      onClose()
    },
    [confirmDiscardChanges, formDirty, loading, onClose],
  )

  const { handleKeyDown } = useModalFocus({
    closeDisabled: loading,
    modalRef,
    initialFocusRef: textareaRef,
    onClose: () => {
      void requestClose()
    },
    open,
  })

  const handleSubmit = useCallback(() => {
    if (!motivation.trim()) return
    if (!formDirty) return
    onSubmit(decision, motivation.trim())
  }, [decision, formDirty, motivation, onSubmit])

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="deviation-decision-backdrop"
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            aria-labelledby="deviation-decision-title"
            aria-modal="true"
            className="relative z-50 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'deviation-decision',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
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
                  <FieldHelpButton
                    controls="help-decision-motivation"
                    expanded={openHelp.has('motivation')}
                    label={`${tc('help')}: ${td('decisionMotivation')}`}
                    onClick={() => toggleHelp('motivation')}
                  />
                </div>
                <AnimatedHelpPanel
                  id="help-decision-motivation"
                  isOpen={openHelp.has('motivation')}
                >
                  {td('decisionMotivationHelp')}
                </AnimatedHelpPanel>
                <textarea
                  className={textareaClassName}
                  id="decision-motivation"
                  onChange={e => setMotivation(e.target.value)}
                  placeholder={td('decisionMotivationPlaceholder')}
                  ref={textareaRef}
                  rows={3}
                  value={motivation}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  className="btn-secondary text-sm px-4 py-2"
                  disabled={loading}
                  onClick={event => {
                    void requestClose(event.currentTarget)
                  }}
                  type="button"
                >
                  {tc('cancel')}
                </button>
                <DirtyStateButton
                  className="btn-primary text-sm px-4 py-2"
                  dirty={formDirty}
                  disabled={!motivation.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading ? tc('saving') : td('recordDecision')}
                </DirtyStateButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
