'use client'

import { useEffect, useMemo, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormActionRow from '@/components/FormActionRow'
import FormModal from '@/components/FormModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
  type HsaPersonVerificationPurpose,
} from '@/components/HsaPersonVerifyField'
import { isHsaId } from '@/lib/auth/hsa-id'

export type HsaPersonChangeSubmitResult =
  | { error?: string; ok: false }
  | { ok: true }

interface HsaPersonChangeModalProps {
  blockedError: string
  blockedHsaIds?: readonly string[]
  cancelLabel: string
  currentHelp?: string
  currentHsaId: string
  currentInputId: string
  currentLabel: string
  description: string
  developerModeValue: string
  emailLabel: string
  errorFallback: string
  fetchingLabel: string
  fetchLabel: string
  inputClassName: string
  invalidError: string
  nameLabel: string
  newHelp?: string
  newInputId: string
  newLabel: string
  onClose: () => void
  onSubmit: (
    hsaId: string,
    person: HsaPersonVerification | null,
  ) => Promise<HsaPersonChangeSubmitResult>
  open: boolean
  purpose: HsaPersonVerificationPurpose
  sameError: string
  scopeId?: number
  submitLabel: string
  submittingLabel: string
  title: string
  titleId: string
  unavailableText: string
}

export default function HsaPersonChangeModal({
  blockedError,
  blockedHsaIds = [],
  cancelLabel,
  currentHelp,
  currentHsaId,
  currentInputId,
  currentLabel,
  developerModeValue,
  description,
  emailLabel,
  errorFallback,
  fetchingLabel,
  fetchLabel,
  inputClassName,
  invalidError,
  nameLabel,
  newHelp,
  newInputId,
  newLabel,
  onClose,
  onSubmit,
  open,
  purpose,
  sameError,
  scopeId,
  submitLabel,
  submittingLabel,
  title,
  titleId,
  unavailableText,
}: HsaPersonChangeModalProps) {
  const [nextHsaId, setNextHsaId] = useState('')
  const [verifiedPerson, setVerifiedPerson] =
    useState<HsaPersonVerification | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setNextHsaId('')
    setVerifiedPerson(null)
    setSubmitError(null)
    setSubmitting(false)
  }, [open])

  const blockedHsaIdSet = useMemo(
    () => new Set(blockedHsaIds.map(hsaId => hsaId.trim()).filter(Boolean)),
    [blockedHsaIds],
  )
  const trimmedNextHsaId = nextHsaId.trim()
  const validationError =
    trimmedNextHsaId.length === 0
      ? null
      : !isHsaId(trimmedNextHsaId)
        ? invalidError
        : trimmedNextHsaId === currentHsaId.trim()
          ? sameError
          : blockedHsaIdSet.has(trimmedNextHsaId)
            ? blockedError
            : null

  const handleSubmit = async () => {
    if (submitting) return
    if (validationError || !isHsaId(trimmedNextHsaId)) {
      setSubmitError(validationError ?? invalidError)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await onSubmit(trimmedNextHsaId, verifiedPerson)
      if (!result.ok && result.error) {
        setSubmitError(result.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const visibleError = validationError ?? submitError

  return (
    <FormModal
      closeDisabled={submitting}
      developerModeValue={developerModeValue}
      maxWidthClassName="max-w-md"
      onClose={onClose}
      open={open}
      title={title}
      titleId={titleId}
    >
      <div className="space-y-4">
        <p className="text-sm text-secondary-600 dark:text-secondary-400">
          {description}
        </p>
        <div>
          <FieldLabelWithHelp
            help={currentHelp}
            htmlFor={currentInputId}
            label={currentLabel}
          />
          <input
            className={`${inputClassName} bg-secondary-100 font-mono text-secondary-500 dark:bg-secondary-800 dark:text-secondary-400`}
            disabled
            id={currentInputId}
            value={currentHsaId}
          />
        </div>
        <div>
          <FieldLabelWithHelp
            help={newHelp}
            htmlFor={newInputId}
            label={newLabel}
            required
          />
          <HsaPersonVerifyField
            disabled={submitting}
            emailLabel={emailLabel}
            errorFallback={errorFallback}
            fetchingLabel={fetchingLabel}
            fetchLabel={fetchLabel}
            hsaId={nextHsaId}
            inputClassName={inputClassName}
            inputId={newInputId}
            nameLabel={nameLabel}
            onHsaIdChange={value => {
              setNextHsaId(value)
              setVerifiedPerson(null)
              setSubmitError(null)
            }}
            onVerified={setVerifiedPerson}
            purpose={purpose}
            required
            scopeId={scopeId}
            showPersonSummaryAsText
            unavailableText={unavailableText}
          />
        </div>
        {visibleError && (
          <p
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
          >
            {visibleError}
          </p>
        )}
        <FormActionRow>
          <button
            className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:opacity-60 dark:text-secondary-300 dark:hover:bg-secondary-800"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="btn-primary"
            disabled={
              submitting || !!validationError || !isHsaId(trimmedNextHsaId)
            }
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? submittingLabel : submitLabel}
          </button>
        </FormActionRow>
      </div>
    </FormModal>
  )
}
