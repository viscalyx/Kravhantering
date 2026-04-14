'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

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
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setContent(initialContent ?? '')
      setCreatedBy(initialCreatedBy ?? '')
      setOpenHelp(new Set())
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [open, initialContent, initialCreatedBy])

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
    if (!content.trim()) return
    onSubmit(content.trim(), createdBy.trim())
  }, [content, createdBy, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (loading) return
        onClose()
      }
    },
    [onClose, loading],
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
          key="suggestion-form-backdrop"
          transition={{ duration: 0.15 }}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={loading ? undefined : onClose}
          />

          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            aria-labelledby="suggestion-form-title"
            aria-modal="true"
            className="relative z-50 w-full max-w-md rounded-xl bg-white dark:bg-secondary-900 shadow-2xl"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'suggestion-form',
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
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
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
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
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
                <button
                  className="btn-primary text-sm px-4 py-2"
                  disabled={!content.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading ? tc('saving') : tc('save')}
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
