'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { devMarker } from '@/lib/developer-mode-markers'

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
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setResolution(1)
      setMotivation('')
      setResolvedBy('')
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
    if (!motivation.trim() || !resolvedBy.trim()) return
    onSubmit(resolution, motivation.trim(), resolvedBy.trim())
  }, [resolution, motivation, resolvedBy, onSubmit])

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
          key="suggestion-resolution-backdrop"
          transition={{ duration: 0.15 }}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            aria-labelledby="suggestion-resolution-title"
            aria-modal="true"
            className="relative z-50 w-full max-w-md rounded-xl bg-white dark:bg-secondary-900 shadow-2xl"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'suggestion-resolution',
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
                  <button
                    aria-controls="help-resolution-motivation"
                    aria-expanded={openHelp.has('motivation')}
                    aria-label={`${tc('help')}: ${tf('resolutionMotivation')}`}
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
                    id="help-resolution-motivation"
                  >
                    {tf('resolutionMotivationHelp')}
                  </p>
                )}
                <textarea
                  className="w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                  <button
                    aria-controls="help-resolution-resolvedBy"
                    aria-expanded={openHelp.has('resolvedBy')}
                    aria-label={`${tc('help')}: ${tf('resolvedBy')}`}
                    className="inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => toggleHelp('resolvedBy')}
                    type="button"
                  >
                    <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
                {openHelp.has('resolvedBy') && (
                  <p
                    className="mt-1 mb-2 text-xs text-secondary-500 dark:text-secondary-400 whitespace-pre-line bg-secondary-50 dark:bg-secondary-800/50 rounded-lg px-3 py-2 border border-secondary-200 dark:border-secondary-700"
                    id="help-resolution-resolvedBy"
                  >
                    {tf('resolvedByHelp')}
                  </p>
                )}
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
                  onClick={onClose}
                  type="button"
                >
                  {tc('cancel')}
                </button>
                <button
                  className="btn-primary text-sm px-4 py-2"
                  disabled={!motivation.trim() || !resolvedBy.trim() || loading}
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading ? tc('saving') : tf('recordResolution')}
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
