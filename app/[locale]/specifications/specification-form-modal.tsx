'use client'

import { Plus, Trash2, UserRoundCog } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import HsaPersonChangeModal, {
  type HsaPersonChangeSubmitResult,
} from '@/components/HsaPersonChangeModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
} from '@/components/HsaPersonVerifyField'
import RequiredFieldsHint from '@/components/RequiredFieldsHint'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import { generateSpecificationSlug, normalizeSlugInput } from '@/lib/slug'

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
  specificationGovernanceObjectTypeId: number | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  uniqueId: string
}

interface SpecificationFormState {
  businessNeedsReference: string
  name: string
  responsibleDisplayName: string
  responsibleEmail: string
  responsibleHsaId: string
  responsiblePersonVerification: HsaPersonVerification | null
  specificationGovernanceObjectTypeId: string
  specificationImplementationTypeId: string
  specificationLifecycleStatusId: string
  uniqueId: string
}

interface ResponsibleChangeState {
  currentResponsibleHsaId: string
  specificationId: number
}

interface SpecificationCoAuthorForm {
  clientId: string
  displayName: string | null
  email: string | null
  hsaId: string
}

interface SpecificationCoAuthorDraft {
  displayName: string
  email: string
  hsaId: string
  personVerification: HsaPersonVerification | null
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
  onSaved: (result: { newUniqueId: string }) => Promise<void> | void
  open: boolean
  spec?: SpecificationFormModalSpec | null
  specificationSlug?: string
}

let coAuthorClientIdSequence = 0

const createCoAuthorClientId = () => {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  coAuthorClientIdSequence += 1
  return `specification-co-author-${coAuthorClientIdSequence}`
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
    uniqueId: form.uniqueId,
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
    uniqueId: '',
  }
}

function blankCoAuthorDraft(): SpecificationCoAuthorDraft {
  return {
    displayName: '',
    email: '',
    hsaId: '',
    personVerification: null,
  }
}

function coAuthorLabel(
  coAuthor: SpecificationCoAuthorForm,
  locale: string,
): string {
  const value = coAuthor.displayName || coAuthor.email || coAuthor.hsaId
  return formatActorDisplayNameForLocale(value, locale) ?? value
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
    uniqueId: spec.uniqueId,
  }
}

async function readSuccessUniqueId(
  response: Response,
  fallbackUniqueId: string,
): Promise<string> {
  const responseWithOptionalText = response as Response & {
    text?: () => Promise<string>
  }
  const responseWithOptionalJson = response as Response & {
    json?: () => Promise<unknown>
  }

  if (typeof responseWithOptionalText.text === 'function') {
    const text = await responseWithOptionalText.text()
    if (!text) return fallbackUniqueId
    try {
      const data = JSON.parse(text) as { uniqueId?: string }
      return data.uniqueId ?? fallbackUniqueId
    } catch {
      return fallbackUniqueId
    }
  }

  if (typeof responseWithOptionalJson.json === 'function') {
    const data = (await responseWithOptionalJson.json()) as {
      uniqueId?: string
    }
    return data.uniqueId ?? fallbackUniqueId
  }

  return fallbackUniqueId
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
  specificationSlug,
}: SpecificationFormModalProps) {
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
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
  const [coAuthors, setCoAuthors] = useState<SpecificationCoAuthorForm[]>([])
  const [coAuthorDraft, setCoAuthorDraft] =
    useState<SpecificationCoAuthorDraft>(() => blankCoAuthorDraft())
  const [coAuthorsLoading, setCoAuthorsLoading] = useState(false)
  const [coAuthorsSaving, setCoAuthorsSaving] = useState(false)
  const [coAuthorsError, setCoAuthorsError] = useState<string | null>(null)
  const [initialSignature, setInitialSignature] = useState(() =>
    editableSignature(blankFormState()),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [responsibleChange, setResponsibleChange] =
    useState<ResponsibleChangeState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)

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
  const loadCoAuthorsFailedMessage = t('loadCoAuthorsFailed')
  const saveCoAuthorsFailedMessage = t('saveCoAuthorsFailed')
  const canEditContent = isCreate || spec?.permissions?.canEditContent === true
  const canManageAssignments =
    isCreate || spec?.permissions?.canManageAssignments === true
  const formControlsDisabled = isSubmitting || createCurrentUserBlocked
  const metadataControlsDisabled =
    formControlsDisabled || (isEdit && !canEditContent)
  const assignmentControlsDisabled =
    isSubmitting || coAuthorsSaving || coAuthorsLoading || !canManageAssignments
  const formResetKey = isEdit
    ? `edit:${spec.id}:${spec.uniqueId}:${locale}`
    : `create:${effectiveCurrentUserHsaId}:${effectiveCurrentUserDisplayName}:${effectiveCurrentUserEmail}`
  const title = isEdit ? t('editSpecification') : t('newSpecification')
  const formDeveloperModeContext =
    developerModeContext ??
    (isEdit ? 'requirements specification detail' : 'specifications')
  const titleId = isEdit
    ? 'requirement-specification-edit-title'
    : 'requirement-specification-create-title'
  const editSpecificationSlug = specificationSlug ?? spec?.uniqueId
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

    const nextForm =
      mode === 'edit' && spec
        ? buildEditFormState(spec, locale)
        : buildCreateFormState(effectiveCurrentUser)

    setForm(nextForm)
    setInitialSignature(editableSignature(nextForm))
    setIsSubmitting(false)
    setResponsibleChange(null)
    setSaveError(null)
    setCoAuthors([])
    setCoAuthorDraft(blankCoAuthorDraft())
    setCoAuthorsError(null)
    setCoAuthorsLoading(false)
    setCoAuthorsSaving(false)
    setSlugEdited(mode === 'edit')
    setSlugError(null)
    formResetKeyRef.current = formResetKey
  }, [effectiveCurrentUser, formResetKey, locale, mode, open, spec])

  useEffect(() => {
    if (!open || !isEdit || !editSpecificationSlug || !canManageAssignments) {
      return
    }

    const controller = new AbortController()
    setCoAuthorsLoading(true)
    setCoAuthorsError(null)

    async function loadCoAuthors() {
      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${editSpecificationSlug}/co-authors`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error(
            (await readResponseMessage(response)) ?? loadCoAuthorsFailedMessage,
          )
        }
        const body = (await response.json()) as {
          coAuthors?: Array<{
            displayName?: string | null
            email?: string | null
            hsaId: string
          }>
        }
        setCoAuthors(
          (body.coAuthors ?? []).map(coAuthor => ({
            clientId: createCoAuthorClientId(),
            displayName: coAuthor.displayName ?? null,
            email: coAuthor.email ?? null,
            hsaId: coAuthor.hsaId,
          })),
        )
      } catch (error) {
        if (controller.signal.aborted) return
        setCoAuthorsError(
          error instanceof Error ? error.message : loadCoAuthorsFailedMessage,
        )
      } finally {
        if (!controller.signal.aborted) {
          setCoAuthorsLoading(false)
        }
      }
    }

    void loadCoAuthors()

    return () => {
      controller.abort()
    }
  }, [
    canManageAssignments,
    editSpecificationSlug,
    isEdit,
    loadCoAuthorsFailedMessage,
    open,
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
      const confirmed = await confirm({
        cancelText: tc('cancel'),
        confirmText: tc('discardChanges'),
        defaultCancel: true,
        icon: 'warning',
        message: tc('unsavedChangesConfirm'),
      })
      if (!confirmed) return
    }
    closeDirectly()
  }

  const submitResponsibleChange = async (
    nextResponsibleHsaId: string,
    person: HsaPersonVerification | null,
  ): Promise<HsaPersonChangeSubmitResult> => {
    if (!responsibleChange || !editSpecificationSlug) return { ok: false }
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
        `/api/requirements-specifications/${editSpecificationSlug}/responsible`,
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

  const saveCoAuthorAssignments = async (
    nextCoAuthors: SpecificationCoAuthorForm[],
  ): Promise<boolean> => {
    if (!editSpecificationSlug || !canManageAssignments) return false
    setCoAuthorsSaving(true)
    setCoAuthorsError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${editSpecificationSlug}/co-authors`,
        {
          body: JSON.stringify({
            coAuthorHsaIds: nextCoAuthors.map(coAuthor => coAuthor.hsaId),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        setCoAuthorsError(
          (await readResponseMessage(response)) ?? saveCoAuthorsFailedMessage,
        )
        return false
      }
      setCoAuthors(nextCoAuthors)
      return true
    } catch (error) {
      setCoAuthorsError(
        error instanceof Error ? error.message : saveCoAuthorsFailedMessage,
      )
      return false
    } finally {
      setCoAuthorsSaving(false)
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
    coAuthor: SpecificationCoAuthorForm,
    anchorEl?: HTMLElement,
  ) => {
    const confirmed = await confirm({
      anchorEl,
      confirmText: tc('delete'),
      icon: 'caution',
      message: t('removeCoAuthorConfirm', {
        name: coAuthorLabel(coAuthor, locale),
      }),
      title: t('removeCoAuthor'),
      variant: 'danger',
    })
    if (!confirmed) return

    await saveCoAuthorAssignments(
      coAuthors.filter(item => item.clientId !== coAuthor.clientId),
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    if (mode === 'edit' && !editSpecificationSlug) return
    if (isEdit && !metadataDirty) return
    if (isEdit && !canEditContent) return
    if (createCurrentUserBlocked) {
      setSaveError(t('currentUserUnavailable'))
      return
    }
    if (!form.specificationLifecycleStatusId) {
      setSaveError(t('lifecycleStatusRequired'))
      return
    }

    setSlugError(null)
    setSaveError(null)
    setIsSubmitting(true)

    try {
      const specificationPayload = {
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
          ? `/api/requirements-specifications/${editSpecificationSlug}`
          : '/api/requirements-specifications',
        {
          body: JSON.stringify(requestBody),
          headers: { 'Content-Type': 'application/json' },
          method: mode === 'edit' ? 'PUT' : 'POST',
        },
      )

      if (response.status === 409) {
        setSlugError(t('uniqueIdTaken'))
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
        newUniqueId: await readSuccessUniqueId(response, form.uniqueId),
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
          <RequiredFieldsHint />
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
                    if (!slugEdited && form.name) {
                      const nextUniqueId = generateSpecificationSlug(form.name)
                      if (!nextUniqueId) {
                        setSlugError(t('uniqueIdGenerationFailed'))
                        return
                      }
                      if (form.uniqueId !== nextUniqueId) {
                        setSlugError(null)
                        setForm(current => ({
                          ...current,
                          uniqueId: nextUniqueId,
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
                  help={t('uniqueIdHelp')}
                  htmlFor="spec-unique-id"
                  label={t('uniqueId')}
                  required
                />
                <input
                  aria-describedby={
                    slugError ? 'spec-unique-id-error' : undefined
                  }
                  aria-invalid={!!slugError}
                  className={`${inputClassName} font-mono${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
                  disabled={metadataControlsDisabled}
                  id="spec-unique-id"
                  onChange={event => {
                    setSlugEdited(true)
                    setSlugError(null)
                    setForm(current => ({
                      ...current,
                      uniqueId: normalizeSlugInput(event.target.value),
                    }))
                  }}
                  onInvalid={() => setSlugError(t('uniqueIdRequired'))}
                  placeholder={t('uniqueIdPlaceholder')}
                  required
                  value={form.uniqueId}
                />
                {slugError ? (
                  <p
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                    id="spec-unique-id-error"
                    role="alert"
                  >
                    {slugError}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                    {t('uniqueIdHelp')}
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

          {isEdit && canManageAssignments ? (
            <section className="space-y-3 rounded-xl border border-secondary-200 p-4 dark:border-secondary-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-secondary-800 dark:text-secondary-200">
                    {t('coAuthors')}
                  </h3>
                  <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                    {t('coAuthorsHelp')}
                  </p>
                </div>
                {coAuthorsSaving ? (
                  <p
                    className="text-sm text-secondary-500 dark:text-secondary-400"
                    role="status"
                  >
                    {tc('saving')}
                  </p>
                ) : null}
              </div>
              {coAuthorsError ? (
                <p
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {coAuthorsError}
                </p>
              ) : null}
              {coAuthorsLoading ? (
                <p
                  className="text-sm text-secondary-500 dark:text-secondary-400"
                  role="status"
                >
                  {tc('loading')}
                </p>
              ) : coAuthors.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-secondary-500 dark:text-secondary-400">
                  {t('noCoAuthors')}
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
                        aria-label={t('removeCoAuthor')}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-200 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                        disabled={assignmentControlsDisabled}
                        onClick={event =>
                          void removeCoAuthor(
                            coAuthor,
                            event.currentTarget as HTMLElement,
                          )
                        }
                        title={t('removeCoAuthor')}
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
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <FieldLabelWithHelp
                    help={t('coAuthorHsaIdHelp')}
                    htmlFor="spec-co-author-hsa-id"
                    label={t('coAuthorHsaId')}
                  />
                  <HsaPersonVerifyField
                    disabled={assignmentControlsDisabled}
                    emailLabel={tc('hsaVerifyEmail')}
                    errorFallback={tc('hsaVerifyError')}
                    fetchingLabel={tc('fetchingHsaPerson')}
                    fetchLabel={tc('fetchHsaPerson')}
                    hsaId={coAuthorDraft.hsaId}
                    initialDisplayName={coAuthorDraft.displayName}
                    initialEmail={coAuthorDraft.email}
                    inputClassName={inputClassName}
                    inputId="spec-co-author-hsa-id"
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
                    purpose="requirements_specification_co_author"
                    scopeId={spec?.id}
                    showPersonSummaryAsText
                    unavailableText={tc('hsaVerifyUnavailable')}
                  />
                </div>
                <div className="hidden min-h-11 items-center gap-2 text-sm text-secondary-500 sm:flex">
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  {t('addCoAuthor')}
                </div>
              </div>
            </section>
          ) : null}

          {saveError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {saveError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
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
            <button
              className="btn-primary"
              disabled={metadataControlsDisabled || (isEdit && !metadataDirty)}
              type="submit"
            >
              {isSubmitting ? tc('saving') : tc('save')}
            </button>
          </div>
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
