'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { HelpCircle, UserRoundCog } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useEffect, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import HsaPersonChangeModal, {
  type HsaPersonChangeSubmitResult,
} from '@/components/HsaPersonChangeModal'
import type { HsaPersonVerification } from '@/components/HsaPersonVerifyField'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import { offsetPanelMotion } from '@/lib/reduced-motion'
import { normalizeSlugInput } from '@/lib/slug'

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface SpecificationMeta {
  businessNeedsReference: string | null
  id: number
  name: string
  responsibleDisplayName: string | null
  responsibleHsaId: string
  specificationGovernanceObjectTypeId: number | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  uniqueId: string
}

interface SpecificationEditPanelProps {
  className?: string
  governanceObjectTypes: TaxonomyItem[]
  implementationTypes: TaxonomyItem[]
  lifecycleStatuses: TaxonomyItem[]
  onCancel: () => void
  onResponsibleChanged?: (spec: SpecificationMeta) => Promise<void> | void
  onSaved: (result: { newUniqueId: string }) => Promise<void> | void
  spec: SpecificationMeta
  specificationSlug: string
}

interface SpecificationFormState {
  businessNeedsReference: string
  name: string
  responsibleDisplayName: string
  responsibleHsaId: string
  responsiblePersonVerification: HsaPersonVerification | null
  specificationGovernanceObjectTypeId: string
  specificationImplementationTypeId: string
  specificationLifecycleStatusId: string
  uniqueId: string
}

export const SPECIFICATION_EDIT_FORM_ID = 'requirement-specification-edit-form'

interface CurrentUser {
  hsaId: string
  roles: string[]
}

interface ResponsibleChangeState {
  currentResponsibleHsaId: string
  specificationId: number
}

function readCurrentUser(body: unknown): CurrentUser | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (record.authenticated !== true || typeof record.hsaId !== 'string') {
    return null
  }

  const hsaId = record.hsaId.trim()
  if (!hsaId) return null

  return {
    hsaId,
    roles: Array.isArray(record.roles)
      ? record.roles.filter((role): role is string => typeof role === 'string')
      : [],
  }
}

const editableSignature = (form: SpecificationFormState) =>
  JSON.stringify({
    businessNeedsReference: form.businessNeedsReference,
    name: form.name,
    specificationGovernanceObjectTypeId:
      form.specificationGovernanceObjectTypeId,
    specificationImplementationTypeId: form.specificationImplementationTypeId,
    specificationLifecycleStatusId: form.specificationLifecycleStatusId,
    uniqueId: form.uniqueId,
  })

function buildFormState(
  spec: SpecificationMeta,
  locale: string,
): SpecificationFormState {
  const responsibleDisplayName = formatActorDisplayNameForLocale(
    spec.responsibleDisplayName,
    locale,
  )

  return {
    businessNeedsReference: spec.businessNeedsReference ?? '',
    name: spec.name,
    responsibleDisplayName: responsibleDisplayName ?? '',
    responsibleHsaId: spec.responsibleHsaId,
    responsiblePersonVerification: null,
    specificationImplementationTypeId:
      spec.specificationImplementationTypeId?.toString() ?? '',
    specificationLifecycleStatusId:
      spec.specificationLifecycleStatusId?.toString() ?? '',
    specificationGovernanceObjectTypeId:
      spec.specificationGovernanceObjectTypeId?.toString() ?? '',
    uniqueId: spec.uniqueId,
  }
}

export default function SpecificationEditPanel({
  className,
  implementationTypes,
  lifecycleStatuses,
  onCancel,
  onResponsibleChanged,
  onSaved,
  specificationSlug,
  spec,
  governanceObjectTypes,
}: SpecificationEditPanelProps) {
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const locale = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const { confirm } = useConfirmModal()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [slugError, setSlugError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [currentUserLoading, setCurrentUserLoading] = useState(true)
  const [responsibleChange, setResponsibleChange] =
    useState<ResponsibleChangeState | null>(null)
  const [form, setForm] = useState<SpecificationFormState>(() =>
    buildFormState(spec, locale),
  )
  const [formSignature, setFormSignature] = useState(() =>
    editableSignature(buildFormState(spec, locale)),
  )

  useEffect(() => {
    const nextForm = buildFormState(spec, locale)
    setForm(nextForm)
    setFormSignature(editableSignature(nextForm))
    setOpenHelp(new Set())
    setResponsibleChange(null)
  }, [locale, spec])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCurrentUser() {
      try {
        const response = await apiFetch('/api/auth/me', {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Failed to load current user')
        }
        setCurrentUser(readCurrentUser(await response.json()))
      } catch (error) {
        if (controller.signal.aborted) return
        console.error(
          'Failed to load current user for specification edit panel',
          error,
        )
        setCurrentUser(null)
      } finally {
        if (!controller.signal.aborted) {
          setCurrentUserLoading(false)
        }
      }
    }

    void loadCurrentUser()

    return () => {
      controller.abort()
    }
  }, [])

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

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t(helpKey)}
    </AnimatedHelpPanel>
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setSlugError(null)
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uniqueId: form.uniqueId,
            name: form.name,
            specificationGovernanceObjectTypeId:
              form.specificationGovernanceObjectTypeId
                ? Number(form.specificationGovernanceObjectTypeId)
                : null,
            specificationImplementationTypeId:
              form.specificationImplementationTypeId
                ? Number(form.specificationImplementationTypeId)
                : null,
            specificationLifecycleStatusId: form.specificationLifecycleStatusId
              ? Number(form.specificationLifecycleStatusId)
              : null,
            businessNeedsReference: form.businessNeedsReference || null,
          }),
        },
      )

      if (response.status === 409) {
        setSlugError(t('uniqueIdTaken'))
        return
      }

      if (!response.ok) {
        setSubmitError(tc('error'))
        return
      }

      let data: { uniqueId?: string } = {}
      const text = await response.text()
      if (text) {
        try {
          data = JSON.parse(text) as { uniqueId?: string }
        } catch {
          // Server returned non-JSON success; use form value as fallback
        }
      }

      await onSaved({
        newUniqueId: data.uniqueId ?? form.uniqueId,
      })
    } catch {
      setSubmitError(tc('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const openResponsibleChange = () => {
    setResponsibleChange({
      currentResponsibleHsaId: form.responsibleHsaId,
      specificationId: spec.id,
    })
  }

  const closeResponsibleChange = () => {
    setResponsibleChange(null)
  }

  const hasUnsavedSpecificationEdits = () =>
    formSignature !== editableSignature(form)

  const submitResponsibleChange = async (
    nextResponsibleHsaId: string,
    person: HsaPersonVerification | null,
  ): Promise<HsaPersonChangeSubmitResult> => {
    if (!responsibleChange) return { ok: false }

    const isAdmin = currentUser?.roles.includes('Admin') ?? false
    const shouldCloseFormAfterChange = !isAdmin
    if (shouldCloseFormAfterChange && hasUnsavedSpecificationEdits()) {
      const confirmed = await confirm({
        cancelText: tc('cancel'),
        confirmText: t('changeResponsible'),
        defaultCancel: true,
        icon: 'warning',
        message: t('responsibleChangeUnsavedConfirm'),
        title: t('changeResponsibleTitle'),
      })
      if (!confirmed) return { ok: false }
    }

    try {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}`,
        {
          body: JSON.stringify({ responsibleHsaId: nextResponsibleHsaId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        return {
          error:
            (await readResponseMessage(response)) ??
            t('responsibleChangeError'),
          ok: false,
        }
      }

      const payload = (await response.json()) as SpecificationMeta
      setResponsibleChange(null)
      await onResponsibleChanged?.(payload)
      if (shouldCloseFormAfterChange) {
        onCancel()
      } else {
        const nextForm = {
          ...form,
          responsibleDisplayName:
            formatActorDisplayNameForLocale(
              payload.responsibleDisplayName,
              locale,
            ) ??
            person?.displayName ??
            nextResponsibleHsaId,
          responsibleHsaId: payload.responsibleHsaId,
          responsiblePersonVerification: person,
        }
        setForm(nextForm)
      }
      return { ok: true }
    } catch {
      return { error: t('responsibleChangeError'), ok: false }
    }
  }

  return (
    <motion.form
      aria-busy={isSubmitting}
      className={`glass max-w-lg space-y-5 rounded-2xl p-6 ${className ?? ''}`}
      id={SPECIFICATION_EDIT_FORM_ID}
      {...offsetPanelMotion(shouldReduceMotion)}
      {...devMarker({
        context: 'requirements specification detail',
        name: 'crud form',
        priority: 340,
        value: 'edit',
      })}
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold">{t('editSpecification')}</h2>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-name">
            {t('name')} <span aria-hidden="true">*</span>
          </label>
          {helpButton('spec-name', t('name'))}
        </div>
        {helpPanel('help.name', 'spec-name')}
        <input
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-name"
          onChange={event =>
            setForm(current => ({ ...current, name: event.target.value }))
          }
          required
          value={form.name}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-unique-id">
            {t('uniqueId')} <span aria-hidden="true">*</span>
          </label>
          {helpButton('spec-unique-id', t('uniqueId'))}
        </div>
        {helpPanel('uniqueIdHelp', 'spec-unique-id')}
        <input
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-mono transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
          id="spec-unique-id"
          onChange={event => {
            setSlugError(null)
            setForm(current => ({
              ...current,
              uniqueId: normalizeSlugInput(event.target.value),
            }))
          }}
          placeholder={t('uniqueIdPlaceholder')}
          required
          value={form.uniqueId}
        />
        {slugError ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {slugError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
            {t('uniqueIdHelp')}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-area">
            {t('governanceObjectType')}
          </label>
          {helpButton('spec-area', t('governanceObjectType'))}
        </div>
        {helpPanel('governanceObjectTypeHelp', 'spec-area')}
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-area"
          onChange={event =>
            setForm(current => ({
              ...current,
              specificationGovernanceObjectTypeId: event.target.value,
            }))
          }
          value={form.specificationGovernanceObjectTypeId}
        >
          <option value="">—</option>
          {governanceObjectTypes.map(area => (
            <option key={area.id} value={area.id}>
              {locale === 'sv' ? area.nameSv : area.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label
              className="block text-sm font-medium"
              htmlFor="spec-responsible-hsa-id"
            >
              {t('responsibleHsaId')}
            </label>
            {helpButton('spec-responsible-hsa-id', t('responsibleHsaId'))}
          </div>
          {helpPanel('responsibleHsaIdHelp', 'spec-responsible-hsa-id')}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                aria-readonly="true"
                className="min-h-11 w-full rounded-xl border bg-secondary-100 px-3.5 py-2.5 font-mono text-sm text-secondary-500 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800 dark:text-secondary-400"
                id="spec-responsible-hsa-id"
                readOnly
                value={form.responsibleHsaId}
              />
              <button
                aria-label={t('changeResponsible')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-300 dark:hover:bg-secondary-800"
                disabled={isSubmitting || currentUserLoading}
                onClick={openResponsibleChange}
                title={t('changeResponsible')}
                type="button"
              >
                <UserRoundCog
                  aria-hidden="true"
                  className="h-4 w-4"
                  focusable={false}
                />
              </button>
            </div>
            <p className="mt-1 text-xs italic text-secondary-700 dark:text-secondary-300">
              {form.responsibleDisplayName || tc('hsaVerifyUnavailable')}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-impl-type">
            {t('implementationType')}
          </label>
          {helpButton('spec-impl-type', t('implementationType'))}
        </div>
        {helpPanel('implementationTypeHelp', 'spec-impl-type')}
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-impl-type"
          onChange={event =>
            setForm(current => ({
              ...current,
              specificationImplementationTypeId: event.target.value,
            }))
          }
          value={form.specificationImplementationTypeId}
        >
          <option value="">—</option>
          {implementationTypes.map(implementationType => (
            <option key={implementationType.id} value={implementationType.id}>
              {locale === 'sv'
                ? implementationType.nameSv
                : implementationType.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label
            className="block text-sm font-medium"
            htmlFor="spec-lifecycle-status"
          >
            {t('lifecycleStatus')}
          </label>
          {helpButton('spec-lifecycle-status', t('lifecycleStatus'))}
        </div>
        {helpPanel('lifecycleStatusHelp', 'spec-lifecycle-status')}
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-lifecycle-status"
          onChange={event =>
            setForm(current => ({
              ...current,
              specificationLifecycleStatusId: event.target.value,
            }))
          }
          value={form.specificationLifecycleStatusId}
        >
          <option value="">—</option>
          {lifecycleStatuses.map(ls => (
            <option key={ls.id} value={ls.id}>
              {locale === 'sv' ? ls.nameSv : ls.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label
            className="block text-sm font-medium"
            htmlFor="spec-business-ref"
          >
            {t('businessNeedsReference')}
          </label>
          {helpButton('spec-business-ref', t('businessNeedsReference'))}
        </div>
        {helpPanel('businessNeedsReferenceHelp', 'spec-business-ref')}
        <textarea
          className="w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-business-ref"
          onChange={event =>
            setForm(current => ({
              ...current,
              businessNeedsReference: event.target.value,
            }))
          }
          placeholder={t('businessNeedsReferencePlaceholder')}
          rows={2}
          value={form.businessNeedsReference}
        />
      </div>

      {submitError && (
        <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
      )}

      <div className="flex gap-3">
        <button className="btn-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? tc('loading') : tc('save')}
        </button>
        <button
          className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
          onClick={onCancel}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
      {responsibleChange && (
        <HsaPersonChangeModal
          blockedError={t('responsibleChangeCoAuthorConflict')}
          cancelLabel={tc('cancel')}
          currentHelp={t('currentResponsibleHsaIdHelp')}
          currentHsaId={responsibleChange.currentResponsibleHsaId}
          currentInputId="spec-detail-current-responsible-hsa-id"
          currentLabel={t('currentResponsibleHsaId')}
          description={t('changeResponsibleDescription')}
          developerModeValue="change specification lead"
          emailLabel={tc('hsaVerifyEmail')}
          errorFallback={tc('hsaVerifyError')}
          fetchingLabel={tc('fetchingHsaPerson')}
          fetchLabel={tc('fetchHsaPerson')}
          inputClassName="min-h-11 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          invalidError={t('responsibleChangeInvalid')}
          nameLabel={tc('hsaVerifyName')}
          newHelp={t('newResponsibleHsaIdHelp')}
          newInputId="spec-detail-new-responsible-hsa-id"
          newLabel={t('newResponsibleHsaId')}
          onClose={closeResponsibleChange}
          onSubmit={submitResponsibleChange}
          open
          purpose="requirements_specification_responsible"
          sameError={t('responsibleChangeSame')}
          scopeId={responsibleChange.specificationId}
          submitLabel={t('changeResponsible')}
          submittingLabel={tc('saving')}
          title={t('changeResponsibleTitle')}
          titleId="spec-detail-responsible-change-title"
          unavailableText={tc('hsaVerifyUnavailable')}
        />
      )}
    </motion.form>
  )
}
