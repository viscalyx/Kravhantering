'use client'

import { Trash2 } from 'lucide-react'
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
  noCoAuthorsMessage: string
  onChanged?: () => Promise<void> | void
  onClose: () => void
  open: boolean
  purpose: HsaPersonVerificationPurpose
  removeConfirmMessage: (name: string) => string
  removeLabel: string
  saveErrorMessage: string
  scopeId: number
  title: string
  titleId: string
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
  const value = coAuthor.displayName || coAuthor.email || coAuthor.hsaId
  return formatActorDisplayNameForLocale(value, locale) ?? value
}

export default function CoAuthorsManagementModal({
  description,
  developerModeValue,
  endpoint,
  hsaIdHelp,
  hsaIdLabel,
  loadErrorMessage,
  noCoAuthorsMessage,
  onChanged,
  onClose,
  open,
  purpose,
  removeConfirmMessage,
  removeLabel,
  saveErrorMessage,
  scopeId,
  title,
  titleId,
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
        setCoAuthors(
          (body.coAuthors ?? []).map(coAuthor => ({
            clientId: createCoAuthorClientId(),
            displayName: coAuthor.displayName ?? null,
            email: coAuthor.email ?? null,
            hsaId: coAuthor.hsaId,
          })),
        )
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
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(endpoint, {
        body: JSON.stringify({
          coAuthorHsaIds: nextCoAuthors.map(coAuthor => coAuthor.hsaId),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? saveErrorMessage)
        return false
      }
      setCoAuthors(nextCoAuthors)
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
      maxWidthClassName="max-w-3xl"
      onClose={onClose}
      open={open}
      title={title}
      titleId={titleId}
    >
      <div className="space-y-5">
        <p className="text-sm text-secondary-600 dark:text-secondary-300">
          {description}
        </p>

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

        {loading ? (
          <p
            className="text-sm text-secondary-500 dark:text-secondary-400"
            role="status"
          >
            {tc('loading')}
          </p>
        ) : coAuthors.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-secondary-500 dark:text-secondary-400">
            {noCoAuthorsMessage}
          </p>
        ) : (
          <div className="space-y-2">
            {coAuthors.map(coAuthor => (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-secondary-200 px-3 py-2 dark:border-secondary-700"
                key={coAuthor.clientId}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-secondary-800 dark:text-secondary-100">
                    {coAuthorLabel(coAuthor, locale)}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-secondary-500 dark:text-secondary-400">
                    {coAuthor.hsaId}
                  </p>
                </div>
                <button
                  aria-label={removeLabel}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-200 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  disabled={saving || loading}
                  onClick={event =>
                    void removeCoAuthor(coAuthor, event.currentTarget)
                  }
                  title={removeLabel}
                  type="button"
                >
                  <Trash2
                    aria-hidden="true"
                    className="h-4 w-4"
                    focusable={false}
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <FieldLabelWithHelp
            help={hsaIdHelp}
            htmlFor={`${titleId}-co-author-hsa-id`}
            label={hsaIdLabel}
          />
          <HsaPersonVerifyField
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
                email: person.email ?? '',
                hsaId: person.hsaId,
                personVerification: person,
              })
              void addVerifiedCoAuthor(person)
            }}
            purpose={purpose}
            scopeId={scopeId}
            showPersonSummaryAsText
            unavailableText={tc('hsaVerifyUnavailable')}
          />
        </div>

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
