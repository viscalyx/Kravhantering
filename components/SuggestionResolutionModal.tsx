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

interface SuggestionResolutionModalProps {
  loading?: boolean
  onClose: () => void
  onSubmit: (resolution: 1 | 2, motivation: string, resolvedBy: string) => void
  open: boolean
}

export default function SuggestionResolutionModal({
  loading,
  onClose,
  onSubmit,
  open,
}: SuggestionResolutionModalProps) {
  const tf = useTranslations('improvementSuggestion')
  const tc = useTranslations('common')
  const [resolution, setResolution] = useState<1 | 2>(1)
  const [motivation, setMotivation] = useState('')
  const [resolvedBy, setResolvedBy] = useState('')
  const [baselineSignature, setBaselineSignature] = useState(() =>
    createDirtySnapshot({ motivation: '', resolution: 1, resolvedBy: '' }),
  )
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  useEffect(() => {
    if (open) {
      setResolution(1)
      setMotivation('')
      setResolvedBy('')
      setBaselineSignature(
        createDirtySnapshot({ motivation: '', resolution: 1, resolvedBy: '' }),
      )
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
    baselineSignature !==
    createDirtySnapshot({ motivation, resolution, resolvedBy })

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
    if (!motivation.trim() || !resolvedBy.trim()) return
    if (!formDirty) return
    onSubmit(resolution, motivation.trim(), resolvedBy.trim())
  }, [formDirty, resolution, motivation, resolvedBy, onSubmit])

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="suggestion-resolution-backdrop"
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          <motion.div
            aria-labelledby="suggestion-resolution-title"
            aria-modal="true"
            className="relative z-50 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'suggestion-resolution',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            <div className="p-5 space-y-4">
              <h2
                className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                id="suggestion-resolution-title"
              >
                {tf('recordResolution')}
              </h2>

              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    checked={resolution === 1}
                    name="suggestionResolutionModal"
                    onChange={() => setResolution(1)}
                    type="radio"
                  />
                  {tf('resolve')}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    checked={resolution === 2}
                    name="suggestionResolutionModal"
                    onChange={() => setResolution(2)}
                    type="radio"
                  />
                  {tf('dismiss')}
                </label>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="resolution-motivation"
                  >
                    {tf('resolutionMotivation')} *
                  </label>
                  <FieldHelpButton
                    controls="help-resolution-motivation"
                    expanded={openHelp.has('motivation')}
                    label={`${tc('help')}: ${tf('resolutionMotivation')}`}
                    onClick={() => toggleHelp('motivation')}
                  />
                </div>
                <AnimatedHelpPanel
                  id="help-resolution-motivation"
                  isOpen={openHelp.has('motivation')}
                >
                  {tf('resolutionMotivationHelp')}
                </AnimatedHelpPanel>
                <textarea
                  className={textareaClassName}
                  id="resolution-motivation"
                  onChange={e => setMotivation(e.target.value)}
                  placeholder={tf('resolutionMotivationPlaceholder')}
                  ref={textareaRef}
                  rows={3}
                  value={motivation}
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="resolution-resolvedBy"
                  >
                    {tf('resolvedBy')} *
                  </label>
                  <FieldHelpButton
                    controls="help-resolution-resolvedBy"
                    expanded={openHelp.has('resolvedBy')}
                    label={`${tc('help')}: ${tf('resolvedBy')}`}
                    onClick={() => toggleHelp('resolvedBy')}
                  />
                </div>
                <AnimatedHelpPanel
                  id="help-resolution-resolvedBy"
                  isOpen={openHelp.has('resolvedBy')}
                >
                  {tf('resolvedByHelp')}
                </AnimatedHelpPanel>
                <input
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  id="resolution-resolvedBy"
                  onChange={e => setResolvedBy(e.target.value)}
                  placeholder={tf('resolvedByPlaceholder')}
                  type="text"
                  value={resolvedBy}
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
                  disabled={!motivation.trim() || !resolvedBy.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading ? tc('saving') : tf('recordResolution')}
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
