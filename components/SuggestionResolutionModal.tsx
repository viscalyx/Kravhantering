'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldHelpButton from '@/components/FieldHelpButton'
import { modalResizableTextareaRows3ClassName } from '@/components/modal-textarea-class'
import SuggestionActorContext from '@/components/SuggestionActorContext'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { useModalFocus } from '@/hooks/useModalFocus'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

const textareaClassName = `w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-900 ${modalResizableTextareaRows3ClassName}`

interface SuggestionResolutionModalProps {
  currentActorName?: string | null
  implementationOnly?: boolean
  loading?: boolean
  onClose: () => void
  onSubmit: (
    resolution: 1 | 2,
    motivation: string,
    implementingRequirementVersionId?: number,
  ) => void
  open: boolean
  versions?: {
    id: number
    versionNumber: number
    statusNameEn: string | null
    statusNameSv: string | null
  }[]
}

export default function SuggestionResolutionModal({
  currentActorName,
  implementationOnly = false,
  versions = [],
  loading,
  onClose,
  onSubmit,
  open,
}: SuggestionResolutionModalProps) {
  const tf = useTranslations('improvementSuggestion')
  const locale = useLocale()
  const [implementingVersionId, setImplementingVersionId] = useState('')
  const tc = useTranslations('common')
  const [resolution, setResolution] = useState<1 | 2>(1)
  const [motivation, setMotivation] = useState('')
  const [baselineSignature, setBaselineSignature] = useState(() =>
    createDirtySnapshot({
      motivation: '',
      resolution: 1,
      implementingVersionId: '',
    }),
  )
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const implementingVersionRef = useRef<HTMLSelectElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  useEffect(() => {
    if (open) {
      setResolution(1)
      setMotivation('')
      setImplementingVersionId('')
      setBaselineSignature(
        createDirtySnapshot({
          motivation: '',
          resolution: 1,
          implementingVersionId: '',
        }),
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
    createDirtySnapshot({ motivation, resolution, implementingVersionId })

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
    initialFocusRef: implementationOnly ? implementingVersionRef : textareaRef,
    onClose: () => {
      void requestClose()
    },
    open,
  })

  const handleSubmit = useCallback(() => {
    if (implementationOnly ? !implementingVersionId : !motivation.trim()) return
    if (!formDirty) return
    onSubmit(
      resolution,
      motivation.trim(),
      resolution === 1 && implementingVersionId
        ? Number(implementingVersionId)
        : undefined,
    )
  }, [
    formDirty,
    resolution,
    motivation,
    onSubmit,
    implementationOnly,
    implementingVersionId,
  ])

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
                {tf(
                  implementationOnly
                    ? 'attachImplementation'
                    : 'recordResolution',
                )}
              </h2>

              {!implementationOnly && (
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
              )}

              {!implementationOnly && (
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
              )}

              {resolution === 1 && (
                <div
                  {...devMarker({
                    name: 'form field',
                    value: 'suggestion-implementing-version',
                    priority: 350,
                  })}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <label
                      className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                      htmlFor="suggestion-implementing-version"
                    >
                      {tf('implementingVersion')}
                      {implementationOnly ? ' *' : ''}
                    </label>
                    <FieldHelpButton
                      controls="help-implementing-version"
                      expanded={openHelp.has('implementation')}
                      label={`${tc('help')}: ${tf('implementingVersion')}`}
                      onClick={() => toggleHelp('implementation')}
                    />
                  </div>
                  <AnimatedHelpPanel
                    id="help-implementing-version"
                    isOpen={openHelp.has('implementation')}
                  >
                    {tf('implementingVersionHelp')}
                  </AnimatedHelpPanel>
                  <select
                    className="min-h-11 w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-600 dark:bg-secondary-900"
                    disabled={loading}
                    id="suggestion-implementing-version"
                    onChange={event =>
                      setImplementingVersionId(event.target.value)
                    }
                    ref={implementingVersionRef}
                    value={implementingVersionId}
                  >
                    <option value="">{tf('noImplementingVersion')}</option>
                    {versions.map(version => (
                      <option key={version.id} value={version.id}>
                        {tf('implementationVersionLabel', {
                          version: version.versionNumber,
                        })}{' '}
                        ·{' '}
                        {locale === 'sv'
                          ? version.statusNameSv
                          : version.statusNameEn}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <SuggestionActorContext
                currentActorName={currentActorName}
                helpText={tf(
                  implementationOnly
                    ? 'implementationActorHelp'
                    : 'resolvedByHelp',
                )}
                label={tf(
                  implementationOnly ? 'implementationActor' : 'resolvedBy',
                )}
              />

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
                  disabled={
                    (implementationOnly
                      ? !implementingVersionId
                      : !motivation.trim()) || loading
                  }
                  onClick={handleSubmit}
                  type="button"
                >
                  {loading
                    ? tc('saving')
                    : tf(
                        implementationOnly
                          ? 'attachImplementation'
                          : 'recordResolution',
                      )}
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
