'use client'

// Throwaway #1349: reuse creation fields, with memory-only submit callbacks.
import { Info } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import { modalResizableTextareaClassName } from '@/components/modal-textarea-class'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'

export interface PrototypeAssociationDraft {
  issuer: string
  name: string
  normReferenceId: string
  purposeAndScope: string
  reference: string
  type: string
  uri: string
  version: string
}

interface Props {
  kind: 'packages' | 'norms'
  normIds: string[]
  onClose: () => void
  onCreate: (item: PrototypeAssociationDraft) => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function PrototypeAssociationCreateModal({
  kind,
  normIds,
  onClose,
  onCreate,
  returnFocusRef,
}: Props) {
  const t = useTranslations('prototype1349')
  const tp = useTranslations('requirementPackage')
  const tc = useTranslations('common')
  const locale = useLocale()
  const isPackage = kind === 'packages'
  const prefix = `prototype-create-${kind}`
  const formRef = useRef<HTMLFormElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<PrototypeAssociationDraft>({
    name: '',
    purposeAndScope: '',
    issuer: '',
    normReferenceId: '',
    reference: '',
    type: '',
    uri: '',
    version: '',
  })
  const [lead, setLead] = useState<{
    name: string
    email: string
    hsaId: string
  } | null>(null)
  useLayoutEffect(() => {
    initialFocusRef.current =
      formRef.current?.querySelector<HTMLInputElement>(`#${prefix}-name`) ??
      null
  }, [prefix])
  useEffect(() => {
    if (!isPackage) return
    let cancelled = false
    void apiFetch('/api/auth/me')
      .then(response => (response.ok ? response.json() : null))
      .then(user => {
        if (!cancelled && user?.authenticated)
          setLead({
            name: user.name ?? '',
            email: user.email ?? '',
            hsaId: user.hsaId ?? '',
          })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isPackage])
  return (
    <FormModal
      developerModeValue={`prototype create ${kind}`}
      initialFocusRef={initialFocusRef}
      maxWidthClassName={isPackage ? 'max-w-5xl' : 'max-w-4xl'}
      onClose={onClose}
      open
      returnFocusRef={returnFocusRef}
      title={t(isPackage ? 'createPackage' : 'createNorm')}
      titleId={`${prefix}-title`}
    >
      <form
        className="space-y-5"
        ref={formRef}
        {...devMarker({ name: 'prototype creation form', value: kind })}
        onSubmit={event => {
          event.preventDefault()
          event.stopPropagation()
          const trimmed = { ...form }
          for (const key of Object.keys(
            form,
          ) as (keyof PrototypeAssociationDraft)[])
            trimmed[key] = form[key].trim()
          onCreate(trimmed)
        }}
      >
        {isPackage ? (
          <>
            <div>
              <FieldLabelWithHelp
                help={tp('nameHelp')}
                htmlFor={`${prefix}-name`}
                label={tp('name')}
                required
              />
              <input
                className={inputClassName}
                id={`${prefix}-name`}
                maxLength={450}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
                required
                value={form.name}
              />
            </div>
            <div>
              <FieldLabelWithHelp
                help={tp('purposeAndScopeHelp')}
                htmlFor={`${prefix}-purpose`}
                label={tp('purposeAndScope')}
                required
              />
              <textarea
                className={`${inputClassName} ${modalResizableTextareaClassName} min-h-36`}
                id={`${prefix}-purpose`}
                maxLength={10000}
                onChange={event =>
                  setForm({ ...form, purposeAndScope: event.target.value })
                }
                required
                value={form.purposeAndScope}
              />
            </div>
            <section aria-labelledby={`${prefix}-lead`} className="space-y-3">
              <div
                className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 text-sm text-primary-900 dark:border-primary-800/70 dark:bg-primary-950/40 dark:text-primary-100"
                role="note"
              >
                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{tp('createResponsibilityNotice')}</p>
              </div>
              <div className="rounded-xl border border-secondary-200 bg-secondary-50/80 px-4 py-3 dark:border-secondary-700 dark:bg-secondary-900/60">
                <h3 className="text-sm font-medium" id={`${prefix}-lead`}>
                  {tp('lead')}
                </h3>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-secondary-500 dark:text-secondary-400">
                      {tp('leadDisplayName')}
                    </dt>
                    <dd className="mt-1">
                      {lead?.name
                        ? formatActorDisplayNameForLocale(lead.name, locale)
                        : tc('hsaVerifyUnavailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-secondary-500 dark:text-secondary-400">
                      {tp('leadHsaId')}
                    </dt>
                    <dd className="mt-1 font-mono">
                      {lead?.hsaId || tc('hsaVerifyUnavailable')}
                    </dd>
                  </div>
                  {lead?.email && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-secondary-500 dark:text-secondary-400">
                        {tp('leadEmail')}
                      </dt>
                      <dd className="mt-1 wrap-break-word">{lead.email}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </section>
          </>
        ) : (
          <NormReferenceFormFields
            form={form}
            idPrefix={prefix}
            layout="create"
            onSetField={(field, value) => {
              setForm({ ...form, [field]: value })
              if (field === 'normReferenceId') {
                const input = formRef.current?.querySelector<HTMLInputElement>(
                  `#${prefix}-id`,
                )
                input?.setCustomValidity(
                  normIds.some(
                    id =>
                      id.toLocaleLowerCase() ===
                      value.trim().toLocaleLowerCase(),
                  )
                    ? t('duplicateNormId')
                    : '',
                )
              }
            }}
          />
        )}
        <p className="text-sm text-secondary-600 dark:text-secondary-300">
          {t('creationSession')}
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            className="prototype-1349-button"
            onClick={onClose}
            type="button"
          >
            {tc('cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={
              !form.name.trim() ||
              (isPackage
                ? !form.purposeAndScope.trim()
                : !form.type.trim() ||
                  !form.issuer.trim() ||
                  !form.reference.trim())
            }
            type="submit"
          >
            {tc('save')}
          </button>
        </div>
      </form>
    </FormModal>
  )
}
