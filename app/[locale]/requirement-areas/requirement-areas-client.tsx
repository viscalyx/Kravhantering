'use client'

import { Plus, Trash2, UserRoundCog } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import HsaPersonChangeModal, {
  type HsaPersonChangeSubmitResult,
} from '@/components/HsaPersonChangeModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
} from '@/components/HsaPersonVerifyField'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

const REQUIREMENT_AREAS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementAreas.overview.body',
      headingKey: 'requirementAreas.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementAreas.manage.body',
      headingKey: 'requirementAreas.manage.heading',
    },
  ],
  titleKey: 'requirementAreas.title',
}

const AREA_INPUT_CLASS_NAME =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const AREA_ROW_ACTION_BUTTON_CLASS_NAME =
  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

interface Area {
  description: string | null
  id: number
  name: string
  ownerHsaId: string
  prefix: string
}

interface AreaForm {
  description: string
  name: string
  ownerHsaId: string
  ownerPersonVerification: HsaPersonVerification | null
  prefix: string
}

interface OwnerChangeState {
  areaId: number
  currentOwnerHsaId: string
}

interface AreaCoAuthorForm {
  clientId: string
  displayName: string | null
  email: string | null
  hsaId: string
  personVerification?: HsaPersonVerification | null
}

interface AreaCoAuthorDraft {
  clientId: string
  displayName: string
  email: string
  hsaId: string
  personVerification: HsaPersonVerification | null
}

let areaCoAuthorClientIdSequence = 0

const createAreaCoAuthorClientId = () => {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  areaCoAuthorClientIdSequence += 1
  return `area-co-author-${areaCoAuthorClientIdSequence}`
}

const getInitialForm = (): AreaForm => ({
  description: '',
  name: '',
  ownerHsaId: '',
  ownerPersonVerification: null,
  prefix: '',
})

const toForm = (area: Area): AreaForm => ({
  description: area.description ?? '',
  name: area.name,
  ownerHsaId: area.ownerHsaId,
  ownerPersonVerification: null,
  prefix: area.prefix,
})

const toCreatePayload = (form: AreaForm) => ({
  description: form.description,
  name: form.name,
  ownerHsaId: form.ownerHsaId,
  prefix: form.prefix,
})

const toUpdatePayload = (form: AreaForm) => ({
  description: form.description,
  name: form.name,
  prefix: form.prefix,
})

const blankCoAuthorDraft = (): AreaCoAuthorDraft => ({
  clientId: createAreaCoAuthorClientId(),
  displayName: '',
  email: '',
  hsaId: '',
  personVerification: null,
})

const coAuthorLabel = (coAuthor: AreaCoAuthorForm) =>
  coAuthor.displayName || coAuthor.email || coAuthor.hsaId

export default function RequirementAreasClient() {
  useHelpContent(REQUIREMENT_AREAS_HELP)
  const t = useTranslations('area')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const [ownerChange, setOwnerChange] = useState<OwnerChangeState | null>(null)
  const [coAuthors, setCoAuthors] = useState<AreaCoAuthorForm[]>([])
  const [coAuthorDraft, setCoAuthorDraft] = useState<AreaCoAuthorDraft | null>(
    null,
  )
  const [coAuthorsLoading, setCoAuthorsLoading] = useState(false)
  const [coAuthorsSaving, setCoAuthorsSaving] = useState(false)
  const [coAuthorsError, setCoAuthorsError] = useState<string | null>(null)
  const loadCoAuthorsFailedMessage = t('loadCoAuthorsFailed')
  const ownerChangeErrorMessage = t('ownerChangeError')
  const saveCoAuthorsFailedMessage = t('saveCoAuthorsFailed')

  const controller = useCrudAdminResource<Area, AreaForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-areas',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'areas',
    toCreatePayload,
    toForm,
    toPayload: toCreatePayload,
    toUpdatePayload,
  })

  const openOwnerChange = (areaId: number, currentOwnerHsaId: string) => {
    setOwnerChange({
      areaId,
      currentOwnerHsaId,
    })
  }

  const closeOwnerChange = () => {
    setOwnerChange(null)
  }

  const submitOwnerChange = async (
    nextOwnerHsaId: string,
  ): Promise<HsaPersonChangeSubmitResult> => {
    if (!ownerChange) return { ok: false }
    try {
      const response = await apiFetch(
        `/api/requirement-areas/${ownerChange.areaId}`,
        {
          body: JSON.stringify({ ownerHsaId: nextOwnerHsaId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        const message =
          (await readResponseMessage(response)) ?? ownerChangeErrorMessage
        return { error: message, ok: false }
      }
      controller.setForm(previousForm => ({
        ...previousForm,
        ownerHsaId: nextOwnerHsaId,
      }))
      setOwnerChange(null)
      await controller.reload()
      return { ok: true }
    } catch {
      return { error: ownerChangeErrorMessage, ok: false }
    }
  }

  useEffect(() => {
    if (!controller.showForm || typeof controller.editId !== 'number') {
      setCoAuthors([])
      setCoAuthorDraft(null)
      setCoAuthorsError(null)
      return
    }

    const controllerAbort = new AbortController()
    setCoAuthorsLoading(true)
    setCoAuthorsError(null)

    async function loadCoAuthors() {
      try {
        const response = await apiFetch(
          `/api/requirement-areas/${controller.editId}/co-authors`,
          { signal: controllerAbort.signal },
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
            clientId: createAreaCoAuthorClientId(),
            displayName: coAuthor.displayName ?? null,
            email: coAuthor.email ?? null,
            hsaId: coAuthor.hsaId,
            personVerification: null,
          })),
        )
      } catch (error) {
        if (controllerAbort.signal.aborted) return
        setCoAuthorsError(
          error instanceof Error ? error.message : loadCoAuthorsFailedMessage,
        )
      } finally {
        if (!controllerAbort.signal.aborted) {
          setCoAuthorsLoading(false)
        }
      }
    }

    void loadCoAuthors()

    return () => {
      controllerAbort.abort()
    }
  }, [controller.editId, controller.showForm, loadCoAuthorsFailedMessage])

  const saveCoAuthorAssignments = async (
    nextCoAuthors: AreaCoAuthorForm[],
  ): Promise<boolean> => {
    if (typeof controller.editId !== 'number') return false
    setCoAuthorsSaving(true)
    setCoAuthorsError(null)
    try {
      const response = await apiFetch(
        `/api/requirement-areas/${controller.editId}/co-authors`,
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
      setCoAuthorDraft(null)
      return
    }

    const nextCoAuthors = [
      ...coAuthors,
      {
        clientId: createAreaCoAuthorClientId(),
        displayName: person.displayName,
        email: person.email,
        hsaId: person.hsaId,
        personVerification: person,
      },
    ]
    if (await saveCoAuthorAssignments(nextCoAuthors)) {
      setCoAuthorDraft(null)
    }
  }

  const addCoAuthor = () => {
    setCoAuthorDraft(current => current ?? blankCoAuthorDraft())
  }

  const cancelCoAuthorDraft = () => {
    setCoAuthorDraft(null)
  }

  const updateCoAuthorDraft = (values: Partial<AreaCoAuthorDraft>) => {
    setCoAuthorDraft(current => (current ? { ...current, ...values } : current))
  }

  const updateCoAuthor = (
    clientId: string,
    values: Partial<AreaCoAuthorForm>,
  ) => {
    setCoAuthors(current =>
      current.map(coAuthor =>
        coAuthor.clientId === clientId ? { ...coAuthor, ...values } : coAuthor,
      ),
    )
  }

  const saveVerifiedCoAuthorUpdate = async (
    updatedCoAuthor: AreaCoAuthorForm,
    person: HsaPersonVerification,
  ) => {
    if (
      coAuthors.some(
        coAuthor =>
          coAuthor.clientId !== updatedCoAuthor.clientId &&
          coAuthor.hsaId === person.hsaId,
      )
    ) {
      return
    }

    await saveCoAuthorAssignments(
      coAuthors.map(coAuthor =>
        coAuthor.clientId === updatedCoAuthor.clientId
          ? {
              ...coAuthor,
              displayName: person.displayName,
              email: person.email,
              hsaId: person.hsaId,
              personVerification: person,
            }
          : coAuthor,
      ),
    )
  }

  const removeCoAuthor = async (
    coAuthor: AreaCoAuthorForm,
    anchorEl?: HTMLElement,
  ) => {
    const confirmed = await confirm({
      anchorEl,
      confirmText: tc('delete'),
      icon: 'caution',
      message: t('removeCoAuthorConfirm', {
        name: coAuthorLabel(coAuthor),
      }),
      title: t('removeCoAuthor'),
      variant: 'danger',
    })
    if (!confirmed) return

    await saveCoAuthorAssignments(
      coAuthors.filter(item => item.clientId !== coAuthor.clientId),
    )
  }

  const columns: CrudAdminColumn<Area>[] = [
    {
      className: 'py-3 px-4 font-mono font-medium',
      header: t('prefix'),
      key: 'prefix',
      render: area => area.prefix,
    },
    {
      header: t('name'),
      key: 'name',
      render: area => area.name,
    },
    {
      className:
        'py-3 px-4 text-secondary-600 dark:text-secondary-400 truncate max-w-xs',
      header: t('description'),
      key: 'description',
      render: area => area.description ?? '—',
    },
    {
      className: 'py-3 px-4 text-secondary-600 dark:text-secondary-400',
      header: t('owner'),
      key: 'owner',
      render: area => area.ownerHsaId,
    },
  ]

  return (
    <CrudAdminPanel
      columns={columns}
      controller={controller}
      devContext="areas"
      emptyStateMessage={t('emptyState')}
      formCloseDisabled={coAuthorsSaving}
      formDialogDeveloperModeValue={mode =>
        mode === 'create' ? 'new requirement area' : 'edit requirement area'
      }
      formMaxWidthClassName={
        controller.editId === null ? 'max-w-2xl' : 'max-w-5xl'
      }
      formPresentation="modal"
      formTitle={mode => (mode === 'create' ? t('newArea') : t('editArea'))}
      formTitleId="requirement-area-form-title"
      renderFormFields={({
        disabled,
        editId,
        form,
        inputClassName,
        isEditing,
        setForm,
      }) => (
        <div
          className={
            isEditing && typeof editId === 'number'
              ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'
              : 'space-y-5'
          }
        >
          <div className="space-y-5">
            <div>
              <FieldLabelWithHelp
                help={t('help.prefix')}
                htmlFor="area-prefix"
                label={t('prefix')}
                required
              />
              <input
                className={inputClassName}
                disabled={disabled}
                id="area-prefix"
                maxLength={10}
                onChange={event =>
                  setForm(previousForm => ({
                    ...previousForm,
                    prefix: event.target.value.toUpperCase(),
                  }))
                }
                required
                value={form.prefix}
              />
            </div>
            <div>
              <FieldLabelWithHelp
                help={t('help.name')}
                htmlFor="area-name"
                label={t('name')}
                required
              />
              <input
                className={inputClassName}
                disabled={disabled}
                id="area-name"
                onChange={event =>
                  setForm(previousForm => ({
                    ...previousForm,
                    name: event.target.value,
                  }))
                }
                required
                value={form.name}
              />
            </div>
            <div>
              <FieldLabelWithHelp
                help={t('help.description')}
                htmlFor="area-desc"
                label={t('description')}
              />
              <textarea
                className={inputClassName}
                disabled={disabled}
                id="area-desc"
                onChange={event =>
                  setForm(previousForm => ({
                    ...previousForm,
                    description: event.target.value,
                  }))
                }
                value={form.description}
              />
            </div>
            <div>
              <FieldLabelWithHelp
                help={t('help.owner')}
                htmlFor="area-owner"
                label={t('owner')}
                required
              />
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    className={`${inputClassName} bg-secondary-100 text-secondary-500 dark:bg-secondary-800 dark:text-secondary-400`}
                    disabled
                    id="area-owner"
                    value={form.ownerHsaId}
                  />
                  <button
                    aria-label={t('changeOwner')}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-secondary-300 dark:hover:bg-secondary-800"
                    disabled={disabled || editId == null}
                    onClick={() => {
                      if (typeof editId === 'number') {
                        openOwnerChange(editId, form.ownerHsaId)
                      }
                    }}
                    title={t('changeOwner')}
                    type="button"
                  >
                    <UserRoundCog aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <HsaPersonVerifyField
                  disabled={disabled}
                  emailLabel={tc('hsaVerifyEmail')}
                  errorFallback={tc('hsaVerifyError')}
                  fetchingLabel={tc('fetchingHsaPerson')}
                  fetchLabel={tc('fetchHsaPerson')}
                  hsaId={form.ownerHsaId}
                  inputClassName={inputClassName}
                  inputId="area-owner"
                  nameLabel={tc('hsaVerifyName')}
                  onHsaIdChange={value =>
                    setForm(previousForm => ({
                      ...previousForm,
                      ownerHsaId: value,
                      ownerPersonVerification:
                        value.trim() ===
                        previousForm.ownerPersonVerification?.hsaId
                          ? previousForm.ownerPersonVerification
                          : null,
                    }))
                  }
                  onVerified={person =>
                    setForm(previousForm => ({
                      ...previousForm,
                      ownerPersonVerification: person,
                    }))
                  }
                  purpose="requirement_area_owner"
                  required
                  unavailableText={tc('hsaVerifyUnavailable')}
                />
              )}
            </div>
          </div>
          {isEditing && typeof editId === 'number' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                    {t('coAuthors')}
                  </h3>
                  <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                    {t('coAuthorsHelp')}
                  </p>
                </div>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={
                    disabled ||
                    coAuthorsSaving ||
                    coAuthorsLoading ||
                    coAuthorDraft !== null
                  }
                  onClick={addCoAuthor}
                  type="button"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  {t('addCoAuthor')}
                </button>
              </div>
              {coAuthorsError ? (
                <p
                  className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
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
              ) : coAuthors.length === 0 && coAuthorDraft === null ? (
                <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-secondary-500 dark:text-secondary-400">
                  {t('noCoAuthors')}
                </p>
              ) : (
                <div className="space-y-3">
                  {coAuthors.map(coAuthor => {
                    const inputId = `area-co-author-${coAuthor.clientId}`
                    return (
                      <div
                        className="rounded-xl border p-3"
                        key={coAuthor.clientId}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <FieldLabelWithHelp
                              help={t('coAuthorHsaIdHelp')}
                              htmlFor={inputId}
                              label={t('coAuthorHsaId')}
                              required
                            />
                            <HsaPersonVerifyField
                              disabled={
                                disabled || coAuthorsSaving || coAuthorsLoading
                              }
                              emailLabel={tc('hsaVerifyEmail')}
                              errorFallback={tc('hsaVerifyError')}
                              fetchingLabel={tc('fetchingHsaPerson')}
                              fetchLabel={tc('fetchHsaPerson')}
                              hsaId={coAuthor.hsaId}
                              initialDisplayName={coAuthor.displayName}
                              initialEmail={coAuthor.email}
                              inputClassName={inputClassName}
                              inputId={inputId}
                              nameLabel={tc('hsaVerifyName')}
                              onHsaIdChange={value =>
                                updateCoAuthor(coAuthor.clientId, {
                                  displayName:
                                    value.trim() === coAuthor.hsaId.trim()
                                      ? coAuthor.displayName
                                      : '',
                                  email:
                                    value.trim() === coAuthor.hsaId.trim()
                                      ? coAuthor.email
                                      : '',
                                  hsaId: value,
                                  personVerification:
                                    value.trim() ===
                                    coAuthor.personVerification?.hsaId
                                      ? coAuthor.personVerification
                                      : null,
                                })
                              }
                              onVerified={person => {
                                updateCoAuthor(coAuthor.clientId, {
                                  displayName: person.displayName,
                                  email: person.email ?? '',
                                  hsaId: person.hsaId,
                                  personVerification: person,
                                })
                                void saveVerifiedCoAuthorUpdate(
                                  coAuthor,
                                  person,
                                )
                              }}
                              purpose="requirement_area_co_author"
                              required
                              scopeId={editId}
                              showPersonSummaryAsText
                              unavailableText={tc('hsaVerifyUnavailable')}
                            />
                          </div>
                          <button
                            aria-label={t('removeCoAuthor')}
                            className={`${AREA_ROW_ACTION_BUTTON_CLASS_NAME} mt-7 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30`}
                            disabled={
                              disabled || coAuthorsSaving || coAuthorsLoading
                            }
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
                      </div>
                    )
                  })}
                  {coAuthorDraft ? (
                    <div
                      className="rounded-xl border p-3"
                      key={coAuthorDraft.clientId}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <FieldLabelWithHelp
                            help={t('coAuthorHsaIdHelp')}
                            htmlFor={`area-co-author-${coAuthorDraft.clientId}`}
                            label={t('coAuthorHsaId')}
                            required
                          />
                          <HsaPersonVerifyField
                            disabled={
                              disabled || coAuthorsSaving || coAuthorsLoading
                            }
                            emailLabel={tc('hsaVerifyEmail')}
                            errorFallback={tc('hsaVerifyError')}
                            fetchingLabel={tc('fetchingHsaPerson')}
                            fetchLabel={tc('fetchHsaPerson')}
                            hsaId={coAuthorDraft.hsaId}
                            initialDisplayName={coAuthorDraft.displayName}
                            initialEmail={coAuthorDraft.email}
                            inputClassName={inputClassName}
                            inputId={`area-co-author-${coAuthorDraft.clientId}`}
                            nameLabel={tc('hsaVerifyName')}
                            onHsaIdChange={value =>
                              updateCoAuthorDraft({
                                displayName:
                                  value.trim() ===
                                  coAuthorDraft.personVerification?.hsaId
                                    ? coAuthorDraft.displayName
                                    : '',
                                email:
                                  value.trim() ===
                                  coAuthorDraft.personVerification?.hsaId
                                    ? coAuthorDraft.email
                                    : '',
                                hsaId: value,
                                personVerification:
                                  value.trim() ===
                                  coAuthorDraft.personVerification?.hsaId
                                    ? coAuthorDraft.personVerification
                                    : null,
                              })
                            }
                            onVerified={person => {
                              updateCoAuthorDraft({
                                displayName: person.displayName,
                                email: person.email ?? '',
                                hsaId: person.hsaId,
                                personVerification: person,
                              })
                              void addVerifiedCoAuthor(person)
                            }}
                            purpose="requirement_area_co_author"
                            required
                            scopeId={editId}
                            showPersonSummaryAsText
                            unavailableText={tc('hsaVerifyUnavailable')}
                          />
                        </div>
                        <button
                          aria-label={t('removeCoAuthor')}
                          className={`${AREA_ROW_ACTION_BUTTON_CLASS_NAME} mt-7 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30`}
                          disabled={
                            disabled || coAuthorsSaving || coAuthorsLoading
                          }
                          onClick={cancelCoAuthorDraft}
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
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
      title={tn('areas')}
    >
      {ownerChange && (
        <HsaPersonChangeModal
          blockedError={t('ownerChangeCoAuthorConflict')}
          cancelLabel={tc('cancel')}
          currentHelp={t('help.currentOwner')}
          currentHsaId={ownerChange.currentOwnerHsaId}
          currentInputId="area-current-owner"
          currentLabel={t('currentOwner')}
          description={t('changeOwnerDescription')}
          developerModeValue="change requirement area owner"
          emailLabel={tc('hsaVerifyEmail')}
          errorFallback={tc('hsaVerifyError')}
          fetchingLabel={tc('fetchingHsaPerson')}
          fetchLabel={tc('fetchHsaPerson')}
          inputClassName={AREA_INPUT_CLASS_NAME}
          invalidError={t('ownerChangeInvalid')}
          nameLabel={tc('hsaVerifyName')}
          newHelp={t('help.newOwner')}
          newInputId="area-new-owner"
          newLabel={t('newOwner')}
          onClose={closeOwnerChange}
          onSubmit={submitOwnerChange}
          open
          purpose="requirement_area_owner"
          sameError={t('ownerChangeSame')}
          scopeId={ownerChange.areaId}
          submitLabel={t('changeOwner')}
          submittingLabel={tc('saving')}
          title={t('changeOwnerTitle')}
          titleId="area-owner-change-title"
          unavailableText={tc('hsaVerifyUnavailable')}
        />
      )}
    </CrudAdminPanel>
  )
}
