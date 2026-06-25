'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef } from 'react'
import DirtyStateButton from '@/components/DirtyStateButton'
import FormActionRow from '@/components/FormActionRow'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

export interface NormReferenceFormData {
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  uri: string
  version: string
}

interface NormReferenceModalProps {
  idPrefix?: string
  normRefError: string | null
  normReferenceIdHelperText?: string
  normRefForm: NormReferenceFormData
  normRefFormDirty: boolean
  normRefSubmitting: boolean
  onCancel: () => void
  onSave: () => void
  onSetField: (field: string, value: string) => void
}

export default function NormReferenceModal({
  idPrefix = 'modal-nr',
  normRefError,
  normRefForm,
  normRefFormDirty,
  normRefSubmitting,
  normReferenceIdHelperText,
  onCancel,
  onSave,
  onSetField,
}: NormReferenceModalProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<Element | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  const requestCancel = useCallback(
    async (anchorEl?: HTMLElement | null) => {
      if (normRefSubmitting) return
      if (normRefFormDirty && !(await confirmDiscardChanges(anchorEl))) return
      onCancel()
    },
    [confirmDiscardChanges, normRefFormDirty, normRefSubmitting, onCancel],
  )

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeButtonRef.current?.focus()

    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !normRefSubmitting) {
        void requestCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [normRefSubmitting, requestCancel])

  const hasRequiredNormReferenceFields =
    normRefForm.name.trim() !== '' &&
    normRefForm.type.trim() !== '' &&
    normRefForm.reference.trim() !== '' &&
    normRefForm.issuer.trim() !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        {...fadeMotion(shouldReduceMotion, { duration: 0.22 })}
      />
      <motion.div
        aria-describedby={`${idPrefix}-desc`}
        aria-labelledby={`${idPrefix}-title`}
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border bg-white p-6 shadow-xl dark:bg-secondary-900"
        ref={dialogRef}
        role="dialog"
        {...dialogPanelMotion(shouldReduceMotion, { duration: 0.22 })}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
            id={`${idPrefix}-title`}
          >
            {t('addNewNormReference')}
          </h2>
          <button
            aria-label={tc('cancel')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-secondary-400 transition-colors hover:text-secondary-600 focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:pointer-events-none disabled:opacity-50 dark:hover:text-secondary-300"
            disabled={normRefSubmitting}
            onClick={event => void requestCancel(event.currentTarget)}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-900/20"
          id={`${idPrefix}-desc`}
        >
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {t('newNormReferenceWarning')}
          </p>
        </div>

        {normRefError ? (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {normRefError}
          </p>
        ) : null}

        <div className="space-y-3">
          <NormReferenceFormFields
            form={normRefForm}
            idPrefix={idPrefix}
            layout="create"
            normReferenceIdHelperText={normReferenceIdHelperText}
            onSetField={onSetField}
          />
        </div>

        <FormActionRow className="pt-2">
          <DirtyStateButton
            className="btn-primary"
            dirty={normRefFormDirty}
            disabled={
              normRefSubmitting ||
              (normRefFormDirty && !hasRequiredNormReferenceFields)
            }
            onClick={onSave}
            type="button"
          >
            {normRefSubmitting ? tc('saving') : tc('save')}
          </DirtyStateButton>
          <button
            className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm text-secondary-600 transition-all duration-200 hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-secondary-300 dark:hover:bg-secondary-800"
            disabled={normRefSubmitting}
            onClick={event => void requestCancel(event.currentTarget)}
            type="button"
          >
            {tc('cancel')}
          </button>
        </FormActionRow>
      </motion.div>
    </div>
  )
}
