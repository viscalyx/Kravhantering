'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldHelpButton from '@/components/FieldHelpButton'
import { modalResizableTextareaRows4ClassName } from '@/components/modal-textarea-class'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { useModalFocus } from '@/hooks/useModalFocus'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

const textareaClassName = `w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-600 dark:bg-secondary-900 ${modalResizableTextareaRows4ClassName}`

const useClientLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

interface DeviationFormModalProps {
  affectedRequirementIds?: string[]
  initialMotivation?: string
  loading?: boolean
  onClose: () => void
  onSubmit: (motivation: string) => void
  open: boolean
  priorityLevel?: { color: string | null; name: string | null } | null
  title?: string
}

export default function DeviationFormModal({
  affectedRequirementIds = [],
  initialMotivation,
  loading,
  onClose,
  onSubmit,
  open,
  priorityLevel,
  title,
}: DeviationFormModalProps) {
  const td = useTranslations('deviation')
  const tc = useTranslations('common')
  const [motivation, setMotivation] = useState('')
  const [baselineSignature, setBaselineSignature] = useState(() =>
    createDirtySnapshot({ motivation: '' }),
  )
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  // Reset fields when opening
  useClientLayoutEffect(() => {
    if (open) {
      const nextMotivation = initialMotivation ?? ''
      setMotivation(nextMotivation)
      setBaselineSignature(createDirtySnapshot({ motivation: nextMotivation }))
      setOpenHelp(new Set())
    }
  }, [open, initialMotivation])

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

  const formDirty = baselineSignature !== createDirtySnapshot({ motivation })

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
    onSubmit(motivation.trim())
  }, [formDirty, motivation, onSubmit])

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="deviation-form-backdrop"
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            aria-labelledby="deviation-form-title"
            aria-modal="true"
            className="relative z-50 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'deviation-form',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            <div className="p-5 space-y-4">
              <h2
                className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                id="deviation-form-title"
              >
                {title ?? td('requestDeviation')}
              </h2>

              {affectedRequirementIds.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
                    {td('affectedRequirementIds')}
                  </p>
                  <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 font-mono text-xs text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                    {affectedRequirementIds.map(requirementId => (
                      <li key={requirementId}>{requirementId}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                  {td('priorityLevel')}:
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800 px-2.5 py-0.5 text-xs font-medium text-secondary-700 dark:text-secondary-300">
                  {priorityLevel?.color && (
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: priorityLevel.color }}
                    />
                  )}
                  {priorityLevel?.name ?? '—'}
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
                  <FieldHelpButton
                    controls="help-motivation"
                    expanded={openHelp.has('motivation')}
                    label={`${tc('help')}: ${td('motivation')}`}
                    onClick={() => toggleHelp('motivation')}
                  />
                </div>
                <AnimatedHelpPanel
                  id="help-motivation"
                  isOpen={openHelp.has('motivation')}
                >
                  {td('motivationHelp')}
                </AnimatedHelpPanel>
                <textarea
                  className={textareaClassName}
                  id="deviation-motivation"
                  onChange={e => setMotivation(e.target.value)}
                  placeholder={td('motivationPlaceholder')}
                  ref={textareaRef}
                  rows={4}
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
                  {loading
                    ? tc('saving')
                    : initialMotivation
                      ? tc('save')
                      : td('newDeviation')}
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
