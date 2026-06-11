'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

export type HsaPersonVerificationPurpose =
  | 'requirement_area_owner'
  | 'requirement_area_co_author'
  | 'requirement_package_co_author'
  | 'requirement_package_lead'
  | 'requirements_specification_responsible'
  | 'requirements_specification_co_author'

export interface HsaPersonVerification {
  displayName: string
  email: string | null
  givenName: string
  hsaId: string
  middleName: string | null
  surname: string | null
}

interface HsaPersonVerifyFieldProps {
  disabled?: boolean
  emailLabel: string
  errorFallback: string
  fetchingLabel: string
  fetchLabel: string
  hsaId: string
  initialDisplayName?: string | null
  initialEmail?: string | null
  inputClassName: string
  inputId: string
  nameLabel: string
  onHsaIdChange: (value: string) => void
  onVerified?: (person: HsaPersonVerification) => void
  purpose: HsaPersonVerificationPurpose
  readOnly?: boolean
  required?: boolean
  scopeId?: number
  showPersonSummaryAsText?: boolean
  unavailableText: string
}

export default function HsaPersonVerifyField({
  disabled = false,
  emailLabel,
  errorFallback,
  fetchLabel,
  fetchingLabel,
  hsaId,
  inputClassName,
  inputId,
  initialDisplayName,
  initialEmail,
  nameLabel,
  unavailableText,
  onHsaIdChange,
  onVerified,
  purpose,
  readOnly = false,
  required = false,
  showPersonSummaryAsText = false,
  scopeId,
}: HsaPersonVerifyFieldProps) {
  const [verification, setVerification] =
    useState<HsaPersonVerification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const trimmedHsaId = hsaId.trim()
  const currentHsaIdRef = useRef(trimmedHsaId)
  const refreshButtonRef = useRef<HTMLButtonElement>(null)
  const activeVerification =
    verification?.hsaId === trimmedHsaId ? verification : null
  const displayName =
    activeVerification?.displayName ??
    (initialDisplayName && trimmedHsaId ? initialDisplayName : '')
  const email =
    activeVerification?.email ??
    (initialEmail && trimmedHsaId ? initialEmail : '')
  const personSummary =
    displayName && email
      ? `${displayName} (${email})`
      : displayName || email || unavailableText

  useEffect(() => {
    currentHsaIdRef.current = trimmedHsaId
    setError(null)
    setLoading(false)
    setVerification(null)
  }, [trimmedHsaId])

  const verifyPerson = async (mode: 'refresh' | 'reuse_local') => {
    if (!isHsaId(trimmedHsaId) || loading) return
    const requestedHsaId = trimmedHsaId
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(
        '/api/requirement-responsibility-people/verify',
        {
          body: JSON.stringify({
            hsaId: requestedHsaId,
            mode,
            purpose,
            ...(scopeId === undefined ? {} : { scopeId }),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        if (currentHsaIdRef.current !== requestedHsaId) return
        setError((await readResponseMessage(response)) ?? errorFallback)
        return
      }
      const payload = (await response.json()) as {
        person?: HsaPersonVerification
      }
      if (!payload.person) {
        if (currentHsaIdRef.current !== requestedHsaId) return
        setError(errorFallback)
        return
      }
      if (currentHsaIdRef.current !== requestedHsaId) return
      setVerification(payload.person)
      onVerified?.(payload.person)
    } catch {
      if (currentHsaIdRef.current !== requestedHsaId) return
      setError(errorFallback)
    } finally {
      if (currentHsaIdRef.current === requestedHsaId) {
        setLoading(false)
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-readonly={readOnly || undefined}
          autoComplete="off"
          className={`${inputClassName} font-mono${
            readOnly
              ? ' read-only:cursor-default read-only:border-secondary-200 read-only:bg-secondary-100 read-only:text-secondary-500 read-only:focus:border-secondary-300 read-only:focus:ring-secondary-300/40 read-only:dark:border-secondary-700 read-only:dark:bg-secondary-800 read-only:dark:text-secondary-400'
              : ''
          }`}
          disabled={disabled}
          id={inputId}
          maxLength={HSA_ID_MAX_LENGTH}
          onBlur={event => {
            if (event.relatedTarget === refreshButtonRef.current) return
            void verifyPerson('reuse_local')
          }}
          onChange={event => {
            setError(null)
            onHsaIdChange(event.target.value)
          }}
          pattern="[A-Z]{2}[0-9]{10}-[A-Za-z0-9]+"
          readOnly={readOnly}
          required={required}
          value={hsaId}
        />
        <button
          aria-label={loading ? fetchingLabel : fetchLabel}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-200 dark:hover:bg-secondary-800"
          disabled={disabled || loading || !isHsaId(trimmedHsaId)}
          onClick={() => {
            void verifyPerson('refresh')
          }}
          ref={refreshButtonRef}
          title={loading ? fetchingLabel : fetchLabel}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>
      {showPersonSummaryAsText ? (
        <p className="mt-1 text-xs italic text-secondary-700 dark:text-secondary-300">
          {personSummary}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-medium text-secondary-600 dark:text-secondary-400">
            {nameLabel}
            <input
              className="mt-1 min-h-11 w-full rounded-xl border bg-secondary-50 px-3.5 py-2.5 text-sm text-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
              readOnly
              value={displayName || unavailableText}
            />
          </label>
          <label className="block text-xs font-medium text-secondary-600 dark:text-secondary-400">
            {emailLabel}
            <input
              className="mt-1 min-h-11 w-full rounded-xl border bg-secondary-50 px-3.5 py-2.5 text-sm text-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
              readOnly
              value={email || unavailableText}
            />
          </label>
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
