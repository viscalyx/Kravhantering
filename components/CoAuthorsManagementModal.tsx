'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
  type HsaPersonVerificationPurpose,
} from '@/components/HsaPersonVerifyField'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'

export interface CoAuthorSummary {
  displayName: string | null
  email: string | null
  hsaId: string
}

interface CoAuthorFormRow extends CoAuthorSummary {
  clientId: string
}

interface CoAuthorDraft {
  displayName: string
  email: string
  hsaId: string
  personVerification: HsaPersonVerification | null
}

interface CoAuthorsManagementModalProps {
  description: string
  developerModeValue: string
  endpoint: string
  hsaIdHelp: string
  hsaIdLabel: string
  loadErrorMessage: string
  loadingMessage: string
  noCoAuthorsMessage: string
  onChanged?: () => Promise<void> | void
  onClose: () => void
  open: boolean
  purpose: HsaPersonVerificationPurpose
  removeConfirmMessage: (name: string) => string
  removeLabel: string
  savedCoAuthorsHeading: string
  saveErrorMessage: string
  scopeId: number
  title: string
  titleId: string
  verifiedDraftMessage: (name: string) => string
}

let coAuthorClientIdSequence = 0

const createCoAuthorClientId = () => {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  coAuthorClientIdSequence += 1
  return `co-author-${coAuthorClientIdSequence}`
}

const blankCoAuthorDraft = (): CoAuthorDraft => ({
  displayName: '',
  email: '',
  hsaId: '',
  personVerification: null,
})

const inputClassName =
  'min-h-11 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50'

function coAuthorLabel(coAuthor: CoAuthorSummary, locale: string): string {
  const value = coAuthor.displayName || coAuthor.hsaId
  return formatActorDisplayNameForLocale(value, locale) ?? value
}

function sortCoAuthorsByHsaId<T extends CoAuthorSummary>(coAuthors: T[]): T[] {
  return [...coAuthors].sort((a, b) =>
    a.hsaId.localeCompare(b.hsaId, 'sv', { sensitivity: 'base' }),
  )
}

function toCoAuthorRows(coAuthors: CoAuthorSummary[]): CoAuthorFormRow[] {
  return sortCoAuthorsByHsaId(coAuthors).map(coAuthor => ({
    clientId: createCoAuthorClientId(),
    displayName: coAuthor.displayName ?? null,
    email: coAuthor.email ?? null,
    hsaId: coAuthor.hsaId,
  }))
}

export default function CoAuthorsManagementModal({
  description,
  developerModeValue,
  endpoint,
  hsaIdHelp,
  hsaIdLabel,
  loadErrorMessage,
  loadingMessage,
  noCoAuthorsMessage,
  onChanged,
  onClose,
  open,
  purpose,
  removeConfirmMessage,
  removeLabel,
  saveErrorMessage,
  savedCoAuthorsHeading,
  scopeId,
  title,
  titleId,
  verifiedDraftMessage,
}: CoAuthorsManagementModalProps) {
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [coAuthors, setCoAuthors] = useState<CoAuthorFormRow[]>([])
  const [coAuthorDraft, setCoAuthorDraft] = useState<CoAuthorDraft>(() =>
    blankCoAuthorDraft(),
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setCoAuthors([])
      setCoAuthorDraft(blankCoAuthorDraft())
      setLoading(false)
      setSaving(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    async function loadCoAuthors() {
      try {
        const response = await apiFetch(endpoint, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(
            (await readResponseMessage(response)) ?? loadErrorMessage,
          )
        }
        const body = (await response.json()) as {
          coAuthors?: CoAuthorSummary[]
        }
        setCoAuthors(toCoAuthorRows(body.coAuthors ?? []))
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(
          loadError instanceof Error ? loadError.message : loadErrorMessage,
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadCoAuthors()

    return () => {
      controller.abort()
    }
  }, [endpoint, loadErrorMessage, open])

  const saveCoAuthorAssignments = async (
    nextCoAuthors: CoAuthorFormRow[],
  ): Promise<boolean> => {
    const sortedNextCoAuthors = sortCoAuthorsByHsaId(nextCoAuthors)
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(endpoint, {
        body: JSON.stringify({
          coAuthorHsaIds: sortedNextCoAuthors.map(coAuthor => coAuthor.hsaId),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? saveErrorMessage)
        return false
      }
      setCoAuthors(sortedNextCoAuthors)
      await onChanged?.()
      return true
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : saveErrorMessage,
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  const verifiedDraftContext =
    error &&
    coAuthorDraft.personVerification?.hsaId === coAuthorDraft.hsaId.trim()
      ? verifiedDraftMessage(
          formatActorDisplayNameForLocale(
            coAuthorDraft.personVerification.displayName,
            locale,
          ) ?? coAuthorDraft.personVerification.displayName,
        )
      : null

  const renderRemoveButton = (coAuthor: CoAuthorFormRow) => (
    <button
      aria-label={removeLabel}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-200 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
      disabled={saving || loading}
      onClick={event => void removeCoAuthor(coAuthor, event.currentTarget)}
      title={removeLabel}
      type="button"
    >
      <Trash2 aria-hidden="true" className="h-4 w-4" focusable={false} />
    </button>
  )

  const addVerifiedCoAuthor = async (person: HsaPersonVerification) => {
    if (coAuthors.some(coAuthor => coAuthor.hsaId === person.hsaId)) {
      setCoAuthorDraft(blankCoAuthorDraft())
      return
    }

    const nextCoAuthors = [
      ...coAuthors,
      {
        clientId: createCoAuthorClientId(),
        displayName: person.displayName,
        email: person.email,
        hsaId: person.hsaId,
      },
    ]
    if (await saveCoAuthorAssignments(nextCoAuthors)) {
      setCoAuthorDraft(blankCoAuthorDraft())
    }
  }

  const removeCoAuthor = async (
    coAuthor: CoAuthorFormRow,
    anchorEl?: HTMLElement,
  ) => {
    const confirmed = await confirm({
      anchorEl,
      confirmText: tc('delete'),
      icon: 'caution',
      message: removeConfirmMessage(coAuthorLabel(coAuthor, locale)),
      title: removeLabel,
      variant: 'danger',
    })
    if (!confirmed) return

    await saveCoAuthorAssignments(
      coAuthors.filter(item => item.clientId !== coAuthor.clientId),
    )
  }

  return (
    <FormModal
      closeDisabled={saving}
      developerModeValue={developerModeValue}
      maxWidthClassName="max-w-xl"
      onClose={onClose}
      open={open}
      title={title}
      titleId={titleId}
    >
      <div className="space-y-5">
        <p className="text-sm text-secondary-600 dark:text-secondary-300">
          {description}
        </p>

        <div>
          <FieldLabelWithHelp
            help={hsaIdHelp}
            htmlFor={`${titleId}-co-author-hsa-id`}
            label={hsaIdLabel}
          />
          <HsaPersonVerifyField
            compactHsaIdLayout
            disabled={saving || loading}
            emailLabel={tc('hsaVerifyEmail')}
            errorFallback={tc('hsaVerifyError')}
            fetchingLabel={tc('fetchingHsaPerson')}
            fetchLabel={tc('fetchHsaPerson')}
            hsaId={coAuthorDraft.hsaId}
            initialDisplayName={coAuthorDraft.displayName}
            initialEmail={coAuthorDraft.email}
            inputClassName={inputClassName}
            inputId={`${titleId}-co-author-hsa-id`}
            nameLabel={tc('hsaVerifyName')}
            onHsaIdChange={value =>
              setCoAuthorDraft(current => ({
                ...current,
                displayName:
                  value.trim() === current.personVerification?.hsaId
                    ? current.displayName
                    : '',
                email:
                  value.trim() === current.personVerification?.hsaId
                    ? current.email
                    : '',
                hsaId: value,
                personVerification:
                  value.trim() === current.personVerification?.hsaId
                    ? current.personVerification
                    : null,
              }))
            }
            onVerified={person => {
              setCoAuthorDraft({
                displayName: person.displayName,
                email: '',
                hsaId: person.hsaId,
                personVerification: person,
              })
              void addVerifiedCoAuthor(person)
            }}
            personSummaryMode="hidden"
            purpose={purpose}
            scopeId={scopeId}
            unavailableText={tc('hsaVerifyUnavailable')}
          />
          {verifiedDraftContext ? (
            <p className="mt-2 text-xs text-secondary-600 dark:text-secondary-300">
              {verifiedDraftContext}
            </p>
          ) : null}
        </div>

        {saving ? (
          <p
            className="text-sm text-secondary-500 dark:text-secondary-400"
            role="status"
          >
            {tc('saving')}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <section
          aria-labelledby={`${titleId}-saved-co-authors-heading`}
          className="space-y-3 border-t border-secondary-200 pt-4 dark:border-secondary-700"
        >
          <h3
            className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
            id={`${titleId}-saved-co-authors-heading`}
          >
            {savedCoAuthorsHeading}
          </h3>
          {loading ? (
            <p
              className="inline-flex items-center gap-2 text-sm text-secondary-500 dark:text-secondary-400"
              role="status"
            >
              <Loader2
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
                focusable={false}
              />
              {loadingMessage}
            </p>
          ) : coAuthors.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-secondary-500 dark:text-secondary-400">
              {noCoAuthorsMessage}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-secondary-200 dark:border-secondary-700">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{savedCoAuthorsHeading}</caption>
                <thead className="hidden bg-secondary-50 text-xs font-semibold uppercase text-secondary-500 dark:bg-secondary-800/60 dark:text-secondary-400 sm:table-header-group">
                  <tr>
                    <th className="w-68 px-3 py-2" scope="col">
                      {tc('hsaId')}
                    </th>
                    <th className="px-3 py-2" scope="col">
                      {tc('hsaVerifyName')}
                    </th>
                    <th className="w-14 px-2 py-2 text-right" scope="col">
                      <span className="sr-only">{tc('actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="sm:divide-y sm:divide-secondary-200 sm:dark:divide-secondary-700">
                  {coAuthors.map(coAuthor => (
                    <tr
                      className="grid gap-2 border-b border-secondary-200 px-3 py-3 last:border-b-0 dark:border-secondary-700 sm:table-row sm:border-b-0 sm:p-0"
                      key={coAuthor.clientId}
                    >
                      <td className="block sm:table-cell sm:px-3 sm:py-2">
                        <span className="block text-xs font-medium text-secondary-500 dark:text-secondary-400 sm:hidden">
                          {tc('hsaId')}
                        </span>
                        <span className="break-all font-mono text-xs text-secondary-800 dark:text-secondary-100">
                          {coAuthor.hsaId}
                        </span>
                      </td>
                      <td className="block sm:table-cell sm:px-3 sm:py-2">
                        <span className="block text-xs font-medium text-secondary-500 dark:text-secondary-400 sm:hidden">
                          {tc('hsaVerifyName')}
                        </span>
                        <span className="block truncate text-secondary-800 dark:text-secondary-100">
                          {coAuthorLabel(coAuthor, locale)}
                        </span>
                      </td>
                      <td className="block sm:table-cell sm:px-2 sm:py-2 sm:text-right">
                        <div className="flex justify-end">
                          {renderRemoveButton(coAuthor)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <button
            className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:opacity-60"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            {tc('close')}
          </button>
        </div>
      </div>
    </FormModal>
  )
}
