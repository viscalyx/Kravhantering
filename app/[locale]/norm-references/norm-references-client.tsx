'use client'

import {
  Archive,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useDeferredValue, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { getBrowserLinkUri } from '@/lib/norm-references/browser-link-uri'

const NORM_REFERENCES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'normReferences.overview.body',
      headingKey: 'normReferences.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'normReferences.idGeneration.body',
      headingKey: 'normReferences.idGeneration.heading',
    },
    {
      kind: 'text',
      bodyKey: 'normReferences.manage.body',
      headingKey: 'normReferences.manage.heading',
    },
  ],
  titleKey: 'normReferences.title',
}

interface NormReference {
  id: number
  isArchived: boolean
  issuer: string
  linkedRequirementCount: number
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: string
  uri: string | null
  version: string | null
}

interface NormReferenceForm {
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  uri: string
  version: string
}

interface LinkedRequirement {
  archiveInitiatedAt: string | null
  description: string | null
  id: number
  statusColor: string | null
  statusIconName: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

const DESCRIPTION_TRUNCATE = 80
const NORM_REFERENCE_TABLE_COLUMN_COUNT = 9

const getInitialForm = (): NormReferenceForm => ({
  issuer: '',
  name: '',
  normReferenceId: '',
  reference: '',
  type: '',
  uri: '',
  version: '',
})

const toForm = (normReference: NormReference): NormReferenceForm => ({
  issuer: normReference.issuer,
  name: normReference.name,
  normReferenceId: normReference.normReferenceId,
  reference: normReference.reference,
  type: normReference.type,
  uri: normReference.uri ?? '',
  version: normReference.version ?? '',
})

const toPayload = (form: NormReferenceForm) => ({
  normReferenceId: form.normReferenceId || undefined,
  name: form.name,
  type: form.type,
  reference: form.reference,
  version: form.version || null,
  issuer: form.issuer,
  uri: form.uri || null,
})

const rowActionButtonClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

const externalUriLinkClassName =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-primary-300 dark:hover:bg-primary-950/30 dark:hover:text-primary-200'

export default function NormReferencesClient() {
  useHelpContent(NORM_REFERENCES_HELP)
  const t = useTranslations('normReference')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const contentRef = useRef<HTMLDivElement>(null)
  const tableAnchorRef = useRef<HTMLDivElement>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [stateError, setStateError] = useState<string | null>(null)
  const [stateChangingIds, setStateChangingIds] = useState<Set<number>>(
    new Set(),
  )
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const [linkedRequirementsError, setLinkedRequirementsError] = useState<
    string | null
  >(null)
  const linkedReqRequestId = useRef(0)

  const controller = useCrudAdminResource<NormReference, NormReferenceForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/norm-references',
    errorMessage: tc('error'),
    getInitialForm,
    listEndpoint: '/api/norm-references?includeArchived=true',
    listKey: 'normReferences',
    toForm,
    toPayload,
  })

  const isFormDirty = () => {
    const editedNormReference = controller.editId
      ? controller.items.find(
          normReference => normReference.id === controller.editId,
        )
      : null
    const initialForm = editedNormReference
      ? toForm(editedNormReference)
      : getInitialForm()

    return Object.keys(initialForm).some(
      key =>
        controller.form[key as keyof NormReferenceForm] !==
        initialForm[key as keyof NormReferenceForm],
    )
  }

  const guardUnsavedChanges = async (
    anchorEl?: HTMLElement | null,
  ): Promise<boolean> => {
    if (controller.showForm && isFormDirty()) {
      return confirm({
        anchorEl: anchorEl ?? undefined,
        icon: 'caution',
        message: tc('unsavedChangesConfirm'),
        variant: 'danger',
      })
    }
    return true
  }

  const fetchLinkedRequirements = useCallback(
    async (id: number) => {
      const requestId = ++linkedReqRequestId.current
      setLinkedRequirementsLoading(true)
      setLinkedRequirementsError(null)
      try {
        const response = await apiFetch(`/api/norm-references/${id}`)
        if (requestId !== linkedReqRequestId.current) return
        if (!response.ok) {
          setLinkedRequirements([])
          setLinkedRequirementsError(tc('error'))
          return
        }
        const data = (await response.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        if (requestId !== linkedReqRequestId.current) return
        setLinkedRequirements(data.linkedRequirements ?? [])
      } catch {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirements([])
          setLinkedRequirementsError(tc('error'))
        }
      } finally {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirementsLoading(false)
        }
      }
    },
    [tc],
  )

  const openCreate = async (anchorEl?: HTMLElement | null) => {
    if (!(await guardUnsavedChanges(anchorEl))) return
    linkedReqRequestId.current++
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
    setStateError(null)
    controller.openCreate()
  }

  const openEdit = async (
    normReference: NormReference,
    anchorEl?: HTMLElement | null,
  ) => {
    if (!(await guardUnsavedChanges(anchorEl))) return
    setStateError(null)
    controller.openEdit(normReference)
    void fetchLinkedRequirements(normReference.id)
  }

  const closeForm = async (anchorEl?: HTMLElement | null) => {
    if (!(await guardUnsavedChanges(anchorEl))) return
    linkedReqRequestId.current++
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      linkedReqRequestId.current++
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
      setLinkedRequirementsLoading(false)
    }
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) {
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
    }
  }

  const changeArchivedState = async (
    normReference: NormReference,
    operation: 'archive' | 'reactivate',
  ) => {
    setStateError(null)
    setStateChangingIds(previous => new Set(previous).add(normReference.id))
    try {
      const endpoint =
        operation === 'archive'
          ? `/api/norm-reference-actions/${normReference.id}/archive`
          : `/api/norm-references/${normReference.id}/reactivate`
      const response = await apiFetch(endpoint, { method: 'POST' })
      if (!response.ok) {
        setStateError((await readResponseMessage(response)) ?? tc('error'))
        return
      }
      await controller.reload()
    } catch {
      setStateError(tc('error'))
    } finally {
      setStateChangingIds(previous => {
        const next = new Set(previous)
        next.delete(normReference.id)
        return next
      })
    }
  }

  const requestArchivedStateChange = async (
    normReference: NormReference,
    operation: 'archive' | 'reactivate',
    anchorEl?: HTMLElement,
  ) => {
    if (
      operation === 'archive' &&
      !(await confirm({
        anchorEl,
        icon: 'caution',
        message: t('archiveConfirm'),
        variant: 'danger',
      }))
    ) {
      return
    }

    await changeArchivedState(normReference, operation)
  }

  const setFormField = (field: string, value: string) => {
    controller.setForm(previousForm => ({ ...previousForm, [field]: value }))
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}...`
  }

  const isBusy = (normReference: NormReference) =>
    controller.submitting ||
    controller.deletingIds.has(normReference.id) ||
    stateChangingIds.has(normReference.id)
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredNormReferences = controller.items.filter(normReference => {
    const searchableText = [
      normReference.normReferenceId,
      normReference.name,
      normReference.type,
      normReference.reference,
      normReference.version ?? '',
      normReference.issuer,
    ]
      .join(' ')
      .toLocaleLowerCase(locale)

    return searchableText.includes(normalizedNameFilter)
  })

  const renderNormReferenceForm = () => (
    <form
      className="space-y-4"
      {...devMarker({
        context: 'normReferences',
        name: 'crud form',
        priority: 340,
        value: controller.editId ? 'edit' : 'create',
      })}
      onSubmit={submit}
    >
      <NormReferenceFormFields
        form={controller.form}
        idPrefix="norm-reference"
        layout={controller.editId == null ? 'create' : 'stacked'}
        onSetField={setFormField}
      />
      {controller.formError && (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {controller.formError}
        </p>
      )}
      <div className="flex gap-3">
        <button
          className="btn-primary"
          disabled={controller.submitting}
          type="submit"
        >
          {controller.submitting ? tc('saving') : tc('save')}
        </button>
        <button
          className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
          disabled={controller.submitting}
          onClick={event => {
            void closeForm(event.currentTarget)
          }}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
    </form>
  )

  const renderLinkedRequirements = () => (
    <div>
      <h3 className="mb-3 text-sm font-medium text-secondary-600 dark:text-secondary-400">
        {t('linkedRequirements')}
      </h3>
      {linkedRequirementsLoading ? (
        <p
          className="text-sm text-secondary-500 dark:text-secondary-400"
          role="status"
        >
          {tc('loading')}
        </p>
      ) : linkedRequirementsError ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {linkedRequirementsError}
        </p>
      ) : linkedRequirements.length === 0 ? (
        <p className="text-sm text-secondary-500 dark:text-secondary-400">
          {tc('noneAvailable')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                <th className="px-3 py-2 font-medium">{tr('uniqueId')}</th>
                <th className="px-3 py-2 font-medium">{tr('description')}</th>
                <th className="px-3 py-2 font-medium">{tc('version')}</th>
                <th className="px-3 py-2 font-medium">{tr('status')}</th>
              </tr>
            </thead>
            <tbody>
              {linkedRequirements.map(requirement => {
                const truncated = truncateDescription(requirement.description)
                const isTruncated =
                  truncated !== requirement.description &&
                  requirement.description != null
                const statusLabel =
                  (locale === 'sv'
                    ? requirement.statusNameSv
                    : requirement.statusNameEn) ??
                  requirement.statusNameSv ??
                  requirement.statusNameEn ??
                  ''
                return (
                  <tr
                    className="border-b transition-colors last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                    key={`${requirement.id}-v${requirement.versionNumber}`}
                  >
                    <td className="px-3 py-2 font-medium">
                      <Link
                        className="inline-flex min-h-11 min-w-11 items-center text-primary-700 hover:underline dark:text-primary-300"
                        href={`/requirements/${requirement.uniqueId}/${requirement.versionNumber}`}
                      >
                        {requirement.uniqueId}
                      </Link>
                    </td>
                    <td
                      className="max-w-xs px-3 py-2 text-secondary-600 dark:text-secondary-400"
                      title={
                        isTruncated
                          ? (requirement.description ?? undefined)
                          : undefined
                      }
                    >
                      {truncated ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-secondary-600 dark:text-secondary-400">
                      v{requirement.versionNumber}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        color={requirement.statusColor}
                        iconName={requirement.statusIconName}
                        label={statusLabel}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const isEditing = controller.showForm && controller.editId != null
  const formModalTitle = isEditing
    ? t('editNormReference')
    : t('newNormReference')

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom" ref={contentRef}>
        <FloatingActionRail
          anchorRef={tableAnchorRef}
          developerModeContext="normReferences"
          items={[
            {
              ariaLabel: t('newNormReference'),
              developerModeValue: 'new norm reference',
              disabled: controller.submitting,
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create',
              onClick: () => {
                void openCreate()
              },
              variant: 'primary',
            },
          ]}
        />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('normLibrary')}
          </h1>
        </div>

        <div className="mb-4">
          {!controller.loading && controller.items.length > 0 && (
            <div className="w-full max-w-lg">
              <label
                className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                htmlFor="norm-reference-filter"
              >
                {t('filterByName')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                  />
                  <input
                    autoComplete="off"
                    className="min-h-11 w-full rounded-xl border border-secondary-200 bg-white py-2.5 pr-3 pl-10 text-sm text-secondary-900 transition-all duration-200 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                    {...devMarker({
                      context: 'normReferences',
                      name: 'text field',
                      priority: 330,
                      value: 'norm reference filter',
                    })}
                    id="norm-reference-filter"
                    onChange={event => setNameFilter(event.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
                    type="text"
                    value={nameFilter}
                  />
                </div>
                {hasActiveNameFilter && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-secondary-200 px-4 py-2.5 text-sm text-secondary-700 transition-all duration-200 hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800/60"
                    onClick={() => setNameFilter('')}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    {tc('clearSearch')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {(controller.deleteError || controller.loadError || stateError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'normReferences',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError
                ? 'delete-error'
                : stateError
                  ? 'state-error'
                  : 'load-error',
            })}
            role="alert"
          >
            {controller.deleteError ?? controller.loadError ?? stateError}
          </p>
        )}

        <FormModal
          closeDisabled={controller.submitting}
          developerModeValue={
            isEditing ? 'edit norm reference' : 'new norm reference'
          }
          maxWidthClassName={isEditing ? 'max-w-5xl' : 'max-w-4xl'}
          onClose={() => {
            void closeForm()
          }}
          open={controller.showForm}
          title={formModalTitle}
          titleId={
            isEditing
              ? 'norm-reference-edit-title'
              : 'norm-reference-create-title'
          }
        >
          {isEditing ? (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {renderNormReferenceForm()}
              {renderLinkedRequirements()}
            </div>
          ) : (
            renderNormReferenceForm()
          )}
        </FormModal>

        {controller.loading ? (
          <p
            className="text-secondary-600 dark:text-secondary-400"
            role="status"
          >
            {tc('loading')}
          </p>
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm dark:bg-secondary-900/60"
            {...devMarker({
              context: 'normReferences',
              name: 'crud table',
              priority: 340,
            })}
            ref={tableAnchorRef}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                  <th className="px-4 py-3 font-medium">
                    {t('normReferenceId')}
                  </th>
                  <th className="px-4 py-3 font-medium">{t('name')}</th>
                  <th className="px-4 py-3 font-medium">{t('type')}</th>
                  <th className="px-4 py-3 font-medium">{t('reference')}</th>
                  <th className="px-4 py-3 font-medium">{t('version')}</th>
                  <th className="px-4 py-3 font-medium">{t('issuer')}</th>
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                  <th className="px-4 py-3 text-center font-medium">
                    {t('linkedRequirements')}
                  </th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{tc('actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {controller.items.length === 0 ? (
                  <tr
                    {...devMarker({
                      context: 'normReferences',
                      name: 'empty state',
                      priority: 330,
                    })}
                  >
                    <td
                      className="px-4 py-10 text-center"
                      colSpan={NORM_REFERENCE_TABLE_COLUMN_COUNT}
                    >
                      <div className="flex flex-col items-center justify-center gap-3 text-secondary-500 dark:text-secondary-400">
                        <p>{t('emptyState')}</p>
                        <button
                          className="btn-primary inline-flex items-center gap-1.5"
                          {...devMarker({
                            context: 'normReferences',
                            name: 'empty state create button',
                            priority: 330,
                          })}
                          disabled={controller.submitting}
                          onClick={event => {
                            void openCreate(event.currentTarget)
                          }}
                          type="button"
                        >
                          <Plus aria-hidden="true" className="h-4 w-4" />
                          {tc('create')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredNormReferences.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                      colSpan={NORM_REFERENCE_TABLE_COLUMN_COUNT}
                    >
                      {tc('noResults')}
                    </td>
                  </tr>
                ) : (
                  filteredNormReferences.map(normReference => {
                    const archiveActionLabel = normReference.isArchived
                      ? t('reactivate')
                      : t('archive')
                    const archiveActionValue = normReference.isArchived
                      ? 'reactivate'
                      : 'archive'
                    const busy = isBusy(normReference)
                    const browserLinkUri = getBrowserLinkUri(normReference.uri)

                    return (
                      <tr
                        className="border-b transition-colors last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                        key={normReference.id}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium text-secondary-700 dark:text-secondary-300">
                          {normReference.normReferenceId}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <span className="min-w-0 wrap-break-word">
                              {normReference.name}
                            </span>
                            {browserLinkUri && (
                              <a
                                aria-label={t('openUri')}
                                className={externalUriLinkClassName}
                                {...devMarker({
                                  context: 'normReferences',
                                  name: 'table action',
                                  value: 'open URI',
                                })}
                                href={browserLinkUri}
                                rel="noopener noreferrer"
                                target="_blank"
                                title={t('openUri')}
                              >
                                <ExternalLink
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              </a>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {normReference.type}
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {normReference.reference}
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {normReference.version ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {normReference.issuer}
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {normReference.isArchived
                            ? t('archived')
                            : t('active')}
                        </td>
                        <td className="px-4 py-3 text-center text-secondary-600 dark:text-secondary-400">
                          {t('requirementCount', {
                            count: normReference.linkedRequirementCount,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              aria-label={tc('edit')}
                              className={`${rowActionButtonClassName} text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/30`}
                              {...devMarker({
                                context: 'normReferences',
                                name: 'table action',
                                value: 'edit',
                              })}
                              disabled={busy}
                              onClick={event => {
                                void openEdit(
                                  normReference,
                                  event.currentTarget,
                                )
                              }}
                              title={tc('edit')}
                              type="button"
                            >
                              <Pencil
                                aria-hidden="true"
                                className="h-4 w-4"
                                focusable={false}
                              />
                            </button>
                            <button
                              aria-label={archiveActionLabel}
                              className={`${rowActionButtonClassName} text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800/70`}
                              {...devMarker({
                                context: 'normReferences',
                                name: 'table action',
                                value: archiveActionValue,
                              })}
                              disabled={busy}
                              onClick={event => {
                                void requestArchivedStateChange(
                                  normReference,
                                  normReference.isArchived
                                    ? 'reactivate'
                                    : 'archive',
                                  event.currentTarget,
                                )
                              }}
                              title={archiveActionLabel}
                              type="button"
                            >
                              {normReference.isArchived ? (
                                <RotateCcw
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              ) : (
                                <Archive
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              )}
                            </button>
                            <button
                              aria-label={tc('delete')}
                              className={`${rowActionButtonClassName} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30`}
                              {...devMarker({
                                context: 'normReferences',
                                name: 'table action',
                                value: 'delete',
                              })}
                              disabled={busy}
                              onClick={event => {
                                void remove(
                                  normReference.id,
                                  event.currentTarget,
                                )
                              }}
                              title={tc('delete')}
                              type="button"
                            >
                              <Trash2
                                aria-hidden="true"
                                className="h-4 w-4"
                                focusable={false}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
