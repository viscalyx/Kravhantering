'use client'

import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import {
  composeHsaId,
  HSA_ID_MAX_LENGTH,
  HSA_ID_PREFIX_LENGTH,
  isHsaId,
  isHsaIdPrefix,
  splitHsaId,
} from '@/lib/auth/hsa-id'
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

interface HsaIdPrefixOption {
  id: number
  isDefault: boolean
  label: string | null
  prefix: string
}

interface HsaPersonVerifyFieldProps {
  compactHsaIdLayout?: boolean
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
  personSummaryMode?: 'fields' | 'hidden' | 'text'
  purpose: HsaPersonVerificationPurpose
  readOnly?: boolean
  required?: boolean
  scopeId?: number
  showPersonSummaryAsText?: boolean
  showUnavailablePersonSummary?: boolean
  unavailableText: string
}

export default function HsaPersonVerifyField({
  compactHsaIdLayout = false,
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
  personSummaryMode,
  purpose,
  readOnly = false,
  required = false,
  showPersonSummaryAsText = false,
  showUnavailablePersonSummary = true,
  scopeId,
}: HsaPersonVerifyFieldProps) {
  const tc = useTranslations('common')
  const [draftPrefix, setDraftPrefix] = useState('')
  const [prefixes, setPrefixes] = useState<HsaIdPrefixOption[]>([])
  const [prefixLoadError, setPrefixLoadError] = useState<string | null>(null)
  const [prefixesLoaded, setPrefixesLoaded] = useState(readOnly)
  const [verification, setVerification] =
    useState<HsaPersonVerification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const prefixLoadErrorMessage = tc('hsaPrefixLoadError')
  const trimmedHsaId = hsaId.trim()
  const hsaIdParts = splitHsaId(trimmedHsaId)
  const currentPrefix = isHsaIdPrefix(hsaIdParts.prefix)
    ? hsaIdParts.prefix
    : ''
  const defaultPrefix =
    prefixes.find(prefix => prefix.isDefault)?.prefix ??
    prefixes[0]?.prefix ??
    ''
  const selectedPrefix = readOnly
    ? ''
    : currentPrefix || draftPrefix || defaultPrefix
  const suffixValue = readOnly || !currentPrefix ? '' : hsaIdParts.suffix
  const hasCurrentPrefixOption =
    Boolean(currentPrefix) &&
    !prefixes.some(prefix => prefix.prefix === currentPrefix)
  const prefixOptions = hasCurrentPrefixOption
    ? [
        {
          id: -1,
          isDefault: false,
          label: tc('hsaPrefixCurrent'),
          prefix: currentPrefix,
        },
        ...prefixes,
      ]
    : prefixes
  const suffixDisabled = disabled || !prefixesLoaded || !selectedPrefix
  const maxSuffixLength = Math.max(
    1,
    HSA_ID_MAX_LENGTH - HSA_ID_PREFIX_LENGTH - 1,
  )
  const currentHsaIdRef = useRef(trimmedHsaId)
  const refreshButtonRef = useRef<HTMLButtonElement>(null)
  const skipBlurVerifyForRefreshPointerRef = useRef(false)
  const activeVerification =
    verification?.hsaId === trimmedHsaId ? verification : null
  const resolvedPersonSummaryMode =
    personSummaryMode ?? (showPersonSummaryAsText ? 'text' : 'fields')
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
  const shouldShowTextPersonSummary = Boolean(
    displayName || email || showUnavailablePersonSummary,
  )

  useEffect(() => {
    if (readOnly) return
    let cancelled = false
    setPrefixesLoaded(false)
    setPrefixLoadError(null)
    apiFetch('/api/hsa-id-prefixes')
      .then(async response => {
        if (!response.ok) {
          throw new Error(
            (await readResponseMessage(response)) ?? prefixLoadErrorMessage,
          )
        }
        return response.json() as Promise<{ prefixes?: HsaIdPrefixOption[] }>
      })
      .then(payload => {
        if (cancelled) return
        setPrefixes(payload.prefixes ?? [])
      })
      .catch(() => {
        if (cancelled) return
        setPrefixes([])
        setPrefixLoadError(prefixLoadErrorMessage)
      })
      .finally(() => {
        if (cancelled) return
        setPrefixesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [prefixLoadErrorMessage, readOnly])

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

  const renderHsaIdInput = () => {
    if (readOnly) {
      return (
        <input
          aria-readonly="true"
          autoComplete="off"
          className={`${inputClassName} font-mono read-only:cursor-default read-only:border-secondary-200 read-only:bg-secondary-100 read-only:text-secondary-500 read-only:focus:border-secondary-300 read-only:focus:ring-secondary-300/40 read-only:dark:border-secondary-700 read-only:dark:bg-secondary-800 read-only:dark:text-secondary-400`}
          disabled={disabled}
          id={inputId}
          maxLength={HSA_ID_MAX_LENGTH}
          readOnly
          required={required}
          value={hsaId}
        />
      )
    }

    const gridClassName = compactHsaIdLayout
      ? 'grid gap-2 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(8rem,1fr)]'
      : 'grid gap-2 sm:grid-cols-[minmax(10rem,0.45fr)_minmax(0,1fr)]'

    return (
      <div className={gridClassName}>
        <select
          aria-label={tc('hsaPrefixLabel')}
          className={`${inputClassName} font-mono`}
          disabled={disabled || !prefixesLoaded || prefixOptions.length === 0}
          onChange={event => {
            setError(null)
            setDraftPrefix(event.target.value)
            onHsaIdChange(composeHsaId(event.target.value, suffixValue))
          }}
          value={selectedPrefix}
        >
          {prefixOptions.length === 0 ? (
            <option value="">{tc('hsaPrefixMissingOption')}</option>
          ) : null}
          {prefixOptions.map(prefix => {
            const label = prefix.label
              ? `${prefix.label} - ${prefix.prefix}`
              : prefix.prefix
            return (
              <option
                key={`${prefix.id}:${prefix.prefix}`}
                value={prefix.prefix}
              >
                {label}
              </option>
            )
          })}
        </select>
        <input
          autoComplete="off"
          className={`${inputClassName} font-mono${
            suffixDisabled
              ? ' disabled:cursor-not-allowed disabled:border-secondary-200 disabled:bg-secondary-100 disabled:text-secondary-500 disabled:dark:border-secondary-700 disabled:dark:bg-secondary-800 disabled:dark:text-secondary-400'
              : ''
          }`}
          disabled={suffixDisabled}
          id={inputId}
          maxLength={maxSuffixLength}
          onBlur={event => {
            const skipBlurVerify =
              event.relatedTarget === refreshButtonRef.current &&
              skipBlurVerifyForRefreshPointerRef.current
            skipBlurVerifyForRefreshPointerRef.current = false
            if (skipBlurVerify) return
            void verifyPerson('refresh')
          }}
          onChange={event => {
            setError(null)
            setDraftPrefix(selectedPrefix)
            onHsaIdChange(composeHsaId(selectedPrefix, event.target.value))
          }}
          pattern="[A-Za-z0-9]+"
          placeholder={tc('hsaSuffixPlaceholder')}
          required={required}
          value={suffixValue}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">{renderHsaIdInput()}</div>
        <button
          aria-label={loading ? fetchingLabel : fetchLabel}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-200 dark:hover:bg-secondary-800"
          disabled={disabled || loading || !isHsaId(trimmedHsaId)}
          onClick={() => {
            void verifyPerson('refresh')
          }}
          onPointerDown={() => {
            skipBlurVerifyForRefreshPointerRef.current = true
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
      {!readOnly && !selectedPrefix && prefixesLoaded ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          {prefixLoadError ?? tc('hsaPrefixMissing')}
        </p>
      ) : null}
      {resolvedPersonSummaryMode === 'text' && shouldShowTextPersonSummary ? (
        <p className="mt-1 text-xs italic text-secondary-700 dark:text-secondary-300">
          {personSummary}
        </p>
      ) : null}
      {resolvedPersonSummaryMode === 'fields' ? (
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
      ) : null}
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
