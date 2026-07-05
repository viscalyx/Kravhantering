'use client'

import { UserRoundCog } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormActionRow from '@/components/FormActionRow'
import FormModal from '@/components/FormModal'
import HsaPersonChangeModal, {
  type HsaPersonChangeSubmitResult,
} from '@/components/HsaPersonChangeModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
} from '@/components/HsaPersonVerifyField'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  generateSpecificationCode,
  normalizeSpecificationCodeInput,
} from '@/lib/slug'

export const SPECIFICATION_FORM_ID = 'requirement-specification-form'

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

export interface SpecificationFormModalCurrentUser {
  displayName?: string
  email?: string
  hsaId: string
  roles: string[]
}

export interface SpecificationFormModalSpec {
  businessNeedsReference: string | null
  id: number
  name: string
  permissions?: {
    canEditContent: boolean
    canManageAssignments: boolean
    canReviewDecisions: boolean
    canUseAi: boolean
  }
  responsibleDisplayName: string | null
  responsibleHsaId: string
  specificationCode: string
  specificationGovernanceObjectTypeId: number | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
}

interface SpecificationFormState {
  businessNeedsReference: string
  name: string
  responsibleDisplayName: string
  responsibleEmail: string
  responsibleHsaId: string
  responsiblePersonVerification: HsaPersonVerification | null
  specificationCode: string
  specificationGovernanceObjectTypeId: string
  specificationImplementationTypeId: string
  specificationLifecycleStatusId: string
}

interface ResponsibleChangeState {
  currentResponsibleHsaId: string
  specificationId: number
}

interface SpecificationFormModalProps {
  currentUser?: SpecificationFormModalCurrentUser | null
  currentUserLoading?: boolean
  currentUserUnavailable?: boolean
  developerModeContext?: string
  governanceObjectTypes: TaxonomyItem[]
  implementationTypes: TaxonomyItem[]
  lifecycleStatuses: TaxonomyItem[]
  mode: 'create' | 'edit'
  onClose: () => void
  onResponsibleChanged?: (
    spec: SpecificationFormModalSpec,
  ) => Promise<void> | void
  onSaved: (result: { newSpecificationCode: string }) => Promise<void> | void
  open: boolean
  spec?: SpecificationFormModalSpec | null
  specificationId?: number
}

function readCurrentUser(
  body: unknown,
): SpecificationFormModalCurrentUser | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (record.authenticated !== true || typeof record.hsaId !== 'string') {
    return null
  }

  const hsaId = record.hsaId.trim()
  if (!hsaId) return null

  const displayName =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : hsaId

  return {
    displayName,
    email: typeof record.email === 'string' ? record.email : '',
    hsaId,
    roles: Array.isArray(record.roles)
      ? record.roles.filter((role): role is string => typeof role === 'string')
      : [],
  }
}

function editableSignature(form: SpecificationFormState) {
  return JSON.stringify({
    businessNeedsReference: form.businessNeedsReference,
    name: form.name,
    specificationGovernanceObjectTypeId:
      form.specificationGovernanceObjectTypeId,
    specificationImplementationTypeId: form.specificationImplementationTypeId,
    specificationLifecycleStatusId: form.specificationLifecycleStatusId,
    specificationCode: form.specificationCode,
  })
}

function blankFormState(): SpecificationFormState {
  return {
    businessNeedsReference: '',
    name: '',
    responsibleDisplayName: '',
    responsibleEmail: '',
    responsibleHsaId: '',
    responsiblePersonVerification: null,
    specificationGovernanceObjectTypeId: '',
    specificationImplementationTypeId: '',
    specificationLifecycleStatusId: '',
    specificationCode: '',
  }
}

function buildCreateFormState(
  currentUser: SpecificationFormModalCurrentUser | null | undefined,
): SpecificationFormState {
  return {
    ...blankFormState(),
    responsibleDisplayName: currentUser?.displayName ?? '',
    responsibleEmail: currentUser?.email ?? '',
    responsibleHsaId: currentUser?.hsaId ?? '',
  }
}

function buildEditFormState(
  spec: SpecificationFormModalSpec,
  locale: string,
): SpecificationFormState {
  return {
    businessNeedsReference: spec.businessNeedsReference ?? '',
    name: spec.name,
    responsibleDisplayName:
      formatActorDisplayNameForLocale(spec.responsibleDisplayName, locale) ??
      '',
    responsibleEmail: '',
    responsibleHsaId: spec.responsibleHsaId,
    responsiblePersonVerification: null,
    specificationGovernanceObjectTypeId:
      spec.specificationGovernanceObjectTypeId?.toString() ?? '',
    specificationImplementationTypeId:
      spec.specificationImplementationTypeId?.toString() ?? '',
    specificationLifecycleStatusId:
      spec.specificationLifecycleStatusId?.toString() ?? '',
    specificationCode: spec.specificationCode,
  }
}

async function readSuccessSpecificationCode(
  response: Response,
  fallbackSpecificationCode: string,
): Promise<string> {
  const responseWithOptionalText = response as Response & {
    text?: () => Promise<string>
  }
  const responseWithOptionalJson = response as Response & {
    json?: () => Promise<unknown>
  }

  if (typeof responseWithOptionalText.text === 'function') {
    const text = await responseWithOptionalText.text()
    if (!text) return fallbackSpecificationCode
    try {
      const data = JSON.parse(text) as { specificationCode?: string }
      return data.specificationCode ?? fallbackSpecificationCode
    } catch {
      return fallbackSpecificationCode
    }
  }

  if (typeof responseWithOptionalJson.json === 'function') {
    const data = (await responseWithOptionalJson.json()) as {
      specificationCode?: string
    }
    return data.specificationCode ?? fallbackSpecificationCode
  }

  return fallbackSpecificationCode
}

export default function SpecificationFormModal({
  currentUser,
  currentUserLoading = false,
  currentUserUnavailable = false,
  developerModeContext,
  governanceObjectTypes,
  implementationTypes,
  lifecycleStatuses,
  mode,
  onClose,
  onResponsibleChanged,
  onSaved,
  open,
  spec,
  specificationId,
}: SpecificationFormModalProps) {
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const confirmDiscardChanges = useDiscardChangesConfirmation()
  const formResetKeyRef = useRef<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [loadedCurrentUser, setLoadedCurrentUser] =
    useState<SpecificationFormModalCurrentUser | null>(null)
  const [loadedCurrentUserLoading, setLoadedCurrentUserLoading] =
    useState(false)
  const [loadedCurrentUserUnavailable, setLoadedCurrentUserUnavailable] =
    useState(false)
  const [form, setForm] = useState<SpecificationFormState>(() =>
    blankFormState(),
  )
  const [initialSignature, setInitialSignature] = useState(() =>
    editableSignature(blankFormState()),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [responsibleChange, setResponsibleChange] =
    useState<ResponsibleChangeState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [codeEdited, setCodeEdited] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  const effectiveCurrentUser = currentUser ?? loadedCurrentUser
  const effectiveCurrentUserLoading =
    currentUser === undefined ? loadedCurrentUserLoading : currentUserLoading
  const effectiveCurrentUserUnavailable =
    currentUser === undefined
      ? loadedCurrentUserUnavailable
      : currentUserUnavailable
  const effectiveCurrentUserHsaId = effectiveCurrentUser?.hsaId.trim() ?? ''
  const effectiveCurrentUserDisplayName =
    effectiveCurrentUser?.displayName ?? effectiveCurrentUserHsaId
  const effectiveCurrentUserEmail = effectiveCurrentUser?.email ?? ''
  const isCreate = mode === 'create'
  const isEdit = mode === 'edit' && !!spec
  const createCurrentUserBlocked =
    isCreate &&
    (effectiveCurrentUserLoading ||
      effectiveCurrentUserUnavailable ||
      !effectiveCurrentUserHsaId)
  const createCurrentUserMessage = effectiveCurrentUserLoading
    ? t('currentUserLoading')
    : t('currentUserUnavailable')
  const canEditContent = isCreate || spec?.permissions?.canEditContent === true
  const canManageAssignments =
    isCreate || spec?.permissions?.canManageAssignments === true
  const formControlsDisabled = isSubmitting || createCurrentUserBlocked
  const metadataControlsDisabled =
    formControlsDisabled || (isEdit && !canEditContent)
  const formResetKey = isEdit
    ? `edit:${spec.id}:${spec.specificationCode}:${locale}`
    : `create:${effectiveCurrentUserHsaId}:${effectiveCurrentUserDisplayName}:${effectiveCurrentUserEmail}`
  const title = isEdit ? t('editSpecification') : t('newSpecification')
  const formDeveloperModeContext =
    developerModeContext ??
    (isEdit ? 'requirements specification detail' : 'specifications')
  const titleId = isEdit
    ? 'requirement-specification-edit-title'
    : 'requirement-specification-create-title'
  const editSpecificationId = specificationId ?? spec?.id
  const metadataDirty = initialSignature !== editableSignature(form)
  const inputClassName =
    'min-h-11 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50'
  const selectClassName = inputClassName
  const applyEffectiveCurrentUserResponsible = useCallback(
    (current: SpecificationFormState): SpecificationFormState => {
      if (!effectiveCurrentUserHsaId) return current
      if (
        current.responsibleHsaId === effectiveCurrentUserHsaId &&
        current.responsibleDisplayName === effectiveCurrentUserDisplayName &&
        current.responsibleEmail === effectiveCurrentUserEmail
      ) {
        return current
      }

      return {
        ...current,
        responsibleDisplayName: effectiveCurrentUserDisplayName,
        responsibleEmail: effectiveCurrentUserEmail,
        responsibleHsaId: effectiveCurrentUserHsaId,
        responsiblePersonVerification: null,
      }
    },
    [
      effectiveCurrentUserDisplayName,
      effectiveCurrentUserEmail,
      effectiveCurrentUserHsaId,
    ],
  )

  useEffect(() => {
    if (!open || currentUser !== undefined) return

    const controller = new AbortController()
    setLoadedCurrentUserLoading(true)
    setLoadedCurrentUserUnavailable(false)

    async function loadCurrentUser() {
      try {
        const response = await apiFetch('/api/auth/me', {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Failed to load current user')
        }
        const user = readCurrentUser(await response.json())
        setLoadedCurrentUser(user)
        setLoadedCurrentUserUnavailable(user === null)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error(
          'Failed to load current user for specification form modal',
          error,
        )
        setLoadedCurrentUser(null)
        setLoadedCurrentUserUnavailable(true)
      } finally {
        if (!controller.signal.aborted) {
          setLoadedCurrentUserLoading(false)
        }
      }
    }

    void loadCurrentUser()

    return () => {
      controller.abort()
    }
  }, [currentUser, open])

  useEffect(() => {
    if (!open) {
      formResetKeyRef.current = null
      return
    }
    if (formResetKeyRef.current === formResetKey) return
    if (mode === 'edit' && !spec) return

    const previousFormResetKey = formResetKeyRef.current
    if (mode === 'create' && previousFormResetKey?.startsWith('create:')) {
      setForm(current => applyEffectiveCurrentUserResponsible(current))
      formResetKeyRef.current = formResetKey
      return
    }

    const nextForm =
      mode === 'edit' && spec
        ? buildEditFormState(spec, locale)
        : buildCreateFormState(effectiveCurrentUser)

    setForm(nextForm)
    setInitialSignature(editableSignature(nextForm))
    setIsSubmitting(false)
    setResponsibleChange(null)
    setSaveError(null)
    setCodeEdited(mode === 'edit')
    setCodeError(null)
    formResetKeyRef.current = formResetKey
  }, [
    applyEffectiveCurrentUserResponsible,
    effectiveCurrentUser,
    formResetKey,
    locale,
    mode,
    open,
    spec,
  ])

  useEffect(() => {
    if (!open || !isCreate || !effectiveCurrentUserHsaId) return
    setForm(applyEffectiveCurrentUserResponsible)
  }, [
    applyEffectiveCurrentUserResponsible,
    effectiveCurrentUserHsaId,
    isCreate,
    open,
  ])

  const closeDirectly = () => {
    setResponsibleChange(null)
    onClose()
  }

  const hasUnsavedSpecificationEdits = () =>
    initialSignature !== editableSignature(form)

  const requestClose = async () => {
    if (isSubmitting) return
    if (hasUnsavedSpecificationEdits()) {
      const confirmed = await confirmDiscardChanges()
      if (!confirmed) return
    }
    closeDirectly()
  }

  const submitResponsibleChange = async (
    nextResponsibleHsaId: string,
    person: HsaPersonVerification | null,
  ): Promise<HsaPersonChangeSubmitResult> => {
    if (!responsibleChange || !editSpecificationId) return { ok: false }
    if (!effectiveCurrentUser) {
      return { error: t('currentUserUnavailable'), ok: false }
    }

    const isAdmin = effectiveCurrentUser.roles.includes('Admin')
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
        `/api/requirements-specifications/${editSpecificationId}/responsible`,
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

      const payload = (await response.json()) as SpecificationFormModalSpec
      setResponsibleChange(null)
      await onResponsibleChanged?.(payload)

      if (shouldCloseFormAfterChange) {
        closeDirectly()
      } else {
        setForm(previousForm => ({
          ...previousForm,
          responsibleDisplayName:
            formatActorDisplayNameForLocale(
              payload.responsibleDisplayName,
              locale,
            ) ??
            person?.displayName ??
            nextResponsibleHsaId,
          responsibleEmail: person?.email ?? '',
          responsibleHsaId: payload.responsibleHsaId ?? nextResponsibleHsaId,
          responsiblePersonVerification: person,
        }))
      }
      return { ok: true }
    } catch {
      return { error: t('responsibleChangeError'), ok: false }
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    if (mode === 'edit' && !editSpecificationId) return
    if (!metadataDirty) return
    if (isEdit && !canEditContent) return
    if (createCurrentUserBlocked) {
      setSaveError(t('currentUserUnavailable'))
      return
    }
    if (!form.specificationLifecycleStatusId) {
      setSaveError(t('lifecycleStatusRequired'))
      return
    }

    setCodeError(null)
    setSaveError(null)
    setIsSubmitting(true)

    try {
      const specificationPayload = {
        specificationCode: form.specificationCode,
        name: form.name,
        specificationGovernanceObjectTypeId:
          form.specificationGovernanceObjectTypeId
            ? Number(form.specificationGovernanceObjectTypeId)
            : null,
        specificationImplementationTypeId:
          form.specificationImplementationTypeId
            ? Number(form.specificationImplementationTypeId)
            : null,
        specificationLifecycleStatusId: Number(
          form.specificationLifecycleStatusId,
        ),
        businessNeedsReference: form.businessNeedsReference || null,
      }
      const requestBody =
        mode === 'edit'
          ? specificationPayload
          : {
              ...specificationPayload,
              responsibleHsaId: effectiveCurrentUserHsaId,
            }
      const response = await apiFetch(
        mode === 'edit'
          ? `/api/requirements-specifications/${editSpecificationId}`
          : '/api/requirements-specifications',
        {
          body: JSON.stringify(requestBody),
          headers: { 'Content-Type': 'application/json' },
          method: mode === 'edit' ? 'PUT' : 'POST',
        },
      )

      if (response.status === 409) {
        setCodeError(t('specificationCodeTaken'))
        return
      }

      if (!response.ok) {
        const details = await readResponseMessage(response)
        setSaveError(
          details ? `${t('saveFailed')}: ${details}` : t('saveFailed'),
        )
        return
      }

      await onSaved({
        newSpecificationCode: await readSuccessSpecificationCode(
          response,
          form.specificationCode,
        ),
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const openResponsibleChange = () => {
    if (!spec) return
    setResponsibleChange({
      currentResponsibleHsaId: form.responsibleHsaId,
      specificationId: spec.id,
    })
  }

  return (
    <>
      <FormModal
        closeDisabled={isSubmitting}
        developerModeValue={isEdit ? 'edit specification' : 'new specification'}
        initialFocusRef={nameInputRef}
        maxWidthClassName="max-w-5xl"
        onClose={() => {
          void requestClose()
        }}
        open={open}
        title={title}
        titleId={titleId}
      >
        <form
          aria-busy={isSubmitting}
          className="space-y-6"
          id={SPECIFICATION_FORM_ID}
          {...devMarker({
            context: formDeveloperModeContext,
            name: 'crud form',
            priority: 340,
            value: isEdit ? 'edit' : 'create',
          })}
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <div>
                <FieldLabelWithHelp
                  help={t('help.name')}
                  htmlFor="spec-name"
                  label={t('name')}
                  required
                />
                <input
                  className={inputClassName}
                  disabled={metadataControlsDisabled}
                  id="spec-name"
                  onBlur={() => {
                    if (!codeEdited && form.name) {
                      const nextSpecificationCode = generateSpecificationCode(
                        form.name,
                      )
                      if (!nextSpecificationCode) {
                        setCodeError(t('specificationCodeGenerationFailed'))
                        return
                      }
                      if (form.specificationCode !== nextSpecificationCode) {
                        setCodeError(null)
                        setForm(current => ({
                          ...current,
                          specificationCode: nextSpecificationCode,
                        }))
                      }
                    }
                  }}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  ref={nameInputRef}
                  required
                  value={form.name}
                />
              </div>

              <div>
                <FieldLabelWithHelp
                  help={t('specificationCodeHelp')}
                  htmlFor="spec-specification-code"
                  label={t('specificationCode')}
                  required
                />
                <input
                  aria-describedby={
                    codeError ? 'spec-specification-code-error' : undefined
                  }
                  aria-invalid={!!codeError}
                  className={`${inputClassName} font-mono${codeError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
                  disabled={metadataControlsDisabled}
                  id="spec-specification-code"
                  onChange={event => {
                    setCodeEdited(true)
                    setCodeError(null)
                    setForm(current => ({
                      ...current,
                      specificationCode: normalizeSpecificationCodeInput(
                        event.target.value,
                      ),
                    }))
                  }}
                  onInvalid={() => setCodeError(t('specificationCodeRequired'))}
                  placeholder={t('specificationCodePlaceholder')}
                  required
                  value={form.specificationCode}
                />
                {codeError ? (
                  <p
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                    id="spec-specification-code-error"
                    role="alert"
                  >
                    {codeError}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                    {t('specificationCodeHelp')}
                  </p>
                )}
              </div>

              <div>
                <FieldLabelWithHelp
                  help={t('businessNeedsReferenceHelp')}
                  htmlFor="spec-business-ref"
                  label={t('businessNeedsReference')}
                />
                <textarea
                  className={`${inputClassName} resize-none`}
                  disabled={metadataControlsDisabled}
                  id="spec-business-ref"
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      businessNeedsReference: event.target.value,
                    }))
                  }
                  placeholder={t('businessNeedsReferencePlaceholder')}
                  rows={5}
                  value={form.businessNeedsReference}
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <FieldLabelWithHelp
                  help={t('responsibleHsaIdHelp')}
                  htmlFor="spec-responsible-hsa-id"
                  label={t('responsibleHsaId')}
                />
                {isEdit ? (
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
                        disabled={
                          isSubmitting ||
                          effectiveCurrentUserLoading ||
                          effectiveCurrentUserUnavailable ||
                          !effectiveCurrentUser ||
                          !canManageAssignments
                        }
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
                      {form.responsibleDisplayName ||
                        tc('hsaVerifyUnavailable')}
                    </p>
                  </div>
                ) : (
                  <HsaPersonVerifyField
                    disabled={formControlsDisabled}
                    emailLabel={tc('hsaVerifyEmail')}
                    errorFallback={tc('hsaVerifyError')}
                    fetchingLabel={tc('fetchingHsaPerson')}
                    fetchLabel={tc('fetchHsaPerson')}
                    hsaId={effectiveCurrentUserHsaId}
                    initialDisplayName={effectiveCurrentUserDisplayName}
                    initialEmail={effectiveCurrentUserEmail}
                    inputClassName={inputClassName}
                    inputId="spec-responsible-hsa-id"
                    nameLabel={tc('hsaVerifyName')}
                    onHsaIdChange={() =>
                      setForm(applyEffectiveCurrentUserResponsible)
                    }
                    onVerified={person =>
                      setForm(current => ({
                        ...current,
                        responsibleDisplayName: person.displayName,
                        responsibleEmail: person.email ?? '',
                        responsiblePersonVerification: person,
                      }))
                    }
                    purpose="requirements_specification_responsible"
                    readOnly
                    required
                    showPersonSummaryAsText
                    unavailableText={tc('hsaVerifyUnavailable')}
                  />
                )}
                {createCurrentUserBlocked ? (
                  <p
                    className="mt-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                    role="alert"
                  >
                    {createCurrentUserMessage}
                  </p>
                ) : null}
              </div>

              <div>
                <FieldLabelWithHelp
                  help={t('governanceObjectTypeHelp')}
                  htmlFor="spec-area"
                  label={t('governanceObjectType')}
                />
                <select
                  className={selectClassName}
                  disabled={metadataControlsDisabled}
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

              <div>
                <FieldLabelWithHelp
                  help={t('implementationTypeHelp')}
                  htmlFor="spec-impl-type"
                  label={t('implementationType')}
                />
                <select
                  className={selectClassName}
                  disabled={metadataControlsDisabled}
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
                    <option
                      key={implementationType.id}
                      value={implementationType.id}
                    >
                      {locale === 'sv'
                        ? implementationType.nameSv
                        : implementationType.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabelWithHelp
                  help={t('lifecycleStatusHelp')}
                  htmlFor="spec-lifecycle-status"
                  label={t('lifecycleStatus')}
                  required
                />
                <select
                  className={selectClassName}
                  disabled={metadataControlsDisabled}
                  id="spec-lifecycle-status"
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      specificationLifecycleStatusId: event.target.value,
                    }))
                  }
                  required
                  value={form.specificationLifecycleStatusId}
                >
                  <option disabled value="">
                    —
                  </option>
                  {lifecycleStatuses.map(status => (
                    <option key={status.id} value={status.id}>
                      {locale === 'sv' ? status.nameSv : status.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {saveError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {saveError}
            </p>
          ) : null}

          <FormActionRow>
            <button
              className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                void requestClose()
              }}
              type="button"
            >
              {tc('cancel')}
            </button>
            <DirtyStateButton
              className="btn-primary"
              dirty={metadataDirty}
              disabled={metadataControlsDisabled}
              type="submit"
            >
              {isSubmitting ? tc('saving') : tc('save')}
            </DirtyStateButton>
          </FormActionRow>
        </form>
      </FormModal>

      {responsibleChange ? (
        <HsaPersonChangeModal
          blockedError={t('responsibleChangeCoAuthorConflict')}
          cancelLabel={tc('cancel')}
          currentHelp={t('currentResponsibleHsaIdHelp')}
          currentHsaId={responsibleChange.currentResponsibleHsaId}
          currentInputId="spec-current-responsible-hsa-id"
          currentLabel={t('currentResponsibleHsaId')}
          description={t('changeResponsibleDescription')}
          developerModeValue="change specification lead"
          emailLabel={tc('hsaVerifyEmail')}
          errorFallback={tc('hsaVerifyError')}
          fetchingLabel={tc('fetchingHsaPerson')}
          fetchLabel={tc('fetchHsaPerson')}
          inputClassName={inputClassName}
          invalidError={t('responsibleChangeInvalid')}
          nameLabel={tc('hsaVerifyName')}
          newHelp={t('newResponsibleHsaIdHelp')}
          newInputId="spec-new-responsible-hsa-id"
          newLabel={t('newResponsibleHsaId')}
          onClose={() => setResponsibleChange(null)}
          onSubmit={submitResponsibleChange}
          open
          purpose="requirements_specification_responsible"
          sameError={t('responsibleChangeSame')}
          scopeId={responsibleChange.specificationId}
          submitLabel={t('changeResponsible')}
          submittingLabel={tc('saving')}
          title={t('changeResponsibleTitle')}
          titleId="spec-responsible-change-title"
          unavailableText={tc('hsaVerifyUnavailable')}
        />
      ) : null}
    </>
  )
}
