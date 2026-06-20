'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DirtyStateButton from '@/components/DirtyStateButton'
import { modalResizableTextareaRows4ClassName } from '@/components/modal-textarea-class'
import { useModalFocus } from '@/hooks/useModalFocus'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

const textareaClassName = `w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-900 ${modalResizableTextareaRows4ClassName}`

interface SuggestionFormModalProps {
  initialContent?: string
  initialCreatedBy?: string
  loading?: boolean
  onClose: () => void
  onSubmit: (content: string, createdBy: string) => void
  open: boolean
  title?: string
}

export default function SuggestionFormModal({
  initialContent,
  initialCreatedBy,
  loading,
  onClose,
  onSubmit,
  open,
  title,
}: SuggestionFormModalProps) {
  const tf = useTranslations('improvementSuggestion')
  const tc = useTranslations('common')
  const [content, setContent] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [baselineSignature, setBaselineSignature] = useState(() =>
    createDirtySnapshot({ content: '', createdBy: '' }),
  )
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (open) {
      const nextContent = initialContent ?? ''
      const nextCreatedBy = initialCreatedBy ?? ''
      setContent(nextContent)
      setCreatedBy(nextCreatedBy)
      setBaselineSignature(
        createDirtySnapshot({
          content: nextContent,
          createdBy: nextCreatedBy,
        }),
      )
      setOpenHelp(new Set())
    }
  }, [open, initialContent, initialCreatedBy])

  const { handleKeyDown } = useModalFocus({
    closeDisabled: loading,
    modalRef,
    initialFocusRef: textareaRef,
    onClose,
    open,
  })

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
    baselineSignature !== createDirtySnapshot({ content, createdBy })

  const handleSubmit = useCallback(() => {
    if (!content.trim()) return
    if (!formDirty) return
    onSubmit(content.trim(), createdBy.trim())
  }, [content, createdBy, formDirty, onSubmit])

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="suggestion-form-backdrop"
          {...fadeMotion(shouldReduceMotion)}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={loading ? undefined : onClose}
          />

          <motion.div
            aria-labelledby="suggestion-form-title"
            aria-modal="true"
            className="relative z-50 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'suggestion-form',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            <div className="p-5 space-y-4">
              <h2
                className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                id="suggestion-form-title"
              >
                {title ?? tf('newSuggestion')}
              </h2>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="suggestion-content"
                  >
                    {tf('content')} *
                  </label>
                  <button
                    aria-controls="help-content"
                    aria-expanded={openHelp.has('content')}
                    aria-label={`${tc('help')}: ${tf('content')}`}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => toggleHelp('content')}
                    type="button"
                  >
                    <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
                <AnimatedHelpPanel
                  id="help-content"
                  isOpen={openHelp.has('content')}
                >
                  {tf('contentHelp')}
                </AnimatedHelpPanel>
                <textarea
                  className={textareaClassName}
                  id="suggestion-content"
                  onChange={e => setContent(e.target.value)}
                  placeholder={tf('contentPlaceholder')}
                  ref={textareaRef}
                  rows={4}
                  value={content}
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="suggestion-createdBy"
                  >
                    {tf('createdBy')}
                  </label>
                  <button
                    aria-controls="help-createdBy"
                    aria-expanded={openHelp.has('createdBy')}
                    aria-label={`${tc('help')}: ${tf('createdBy')}`}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
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
                  {tf('createdByHelp')}
                </AnimatedHelpPanel>
                <input
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  id="suggestion-createdBy"
                  onChange={e => setCreatedBy(e.target.value)}
                  placeholder={tf('createdByPlaceholder')}
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
                <DirtyStateButton
                  className="btn-primary text-sm px-4 py-2"
                  dirty={formDirty}
                  disabled={!content.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading ? tc('saving') : tc('save')}
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
