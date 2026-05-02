'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'

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
  description: string | null
  id: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

const DESCRIPTION_TRUNCATE = 80

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

export default function NormReferencesClient() {
  useHelpContent(NORM_REFERENCES_HELP)
  const t = useTranslations('normReference')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const [linkedRequirementsError, setLinkedRequirementsError] = useState(false)
  const linkedReqRequestId = useRef(0)

  const controller = useCrudAdminResource<NormReference, NormReferenceForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/norm-references',
    errorMessage: tc('error'),
    getInitialForm,
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

  const fetchLinkedRequirements = useCallback(async (id: number) => {
    const requestId = ++linkedReqRequestId.current
    setLinkedRequirementsLoading(true)
    setLinkedRequirementsError(false)
    try {
      const response = await apiFetch(`/api/norm-references/${id}`)
      if (requestId !== linkedReqRequestId.current) return
      if (response.ok) {
        const data = (await response.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        setLinkedRequirements(data.linkedRequirements ?? [])
      } else {
        setLinkedRequirementsError(true)
      }
    } catch {
      if (requestId === linkedReqRequestId.current) {
        setLinkedRequirementsError(true)
      }
    } finally {
      if (requestId === linkedReqRequestId.current) {
        setLinkedRequirementsLoading(false)
      }
    }
  }, [])

  const openCreate = async (anchorEl?: HTMLElement | null) => {
    if (!(await guardUnsavedChanges(anchorEl))) return
    setLinkedRequirements([])
    setLinkedRequirementsError(false)
    controller.openCreate()
  }

  const openEdit = async (
    normReference: NormReference,
    anchorEl?: HTMLElement | null,
  ) => {
    if (!(await guardUnsavedChanges(anchorEl))) return
    setLinkedRequirements([])
    setLinkedRequirementsError(false)
    controller.openEdit(normReference)
    void fetchLinkedRequirements(normReference.id)
  }

  const closeForm = async (anchorEl?: HTMLElement | null) => {
    if (!(await guardUnsavedChanges(anchorEl))) return
    setLinkedRequirements([])
    setLinkedRequirementsError(false)
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      setLinkedRequirements([])
      setLinkedRequirementsError(false)
    }
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) {
      setLinkedRequirements([])
      setLinkedRequirementsError(false)
    }
  }

  const setFormField = (field: string, value: string) => {
    controller.setForm(previousForm => ({ ...previousForm, [field]: value }))
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}…`
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('normReferences')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'normReferences',
              name: 'create button',
              priority: 350,
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

        <AnimatePresence>
          {controller.showForm && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
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
                  <h2 className="text-lg font-semibold">
                    {controller.editId
                      ? t('editNormReference')
                      : t('newNormReference')}
                  </h2>
                  <NormReferenceFormFields
                    form={controller.form}
                    idPrefix="nr"
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
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
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

                {controller.editId && (
                  <div>
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-3">
                      {t('linkedRequirements')}
                    </h3>
                    {linkedRequirementsLoading ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('loading')}
                      </p>
                    ) : linkedRequirementsError ? (
                      <p
                        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                        role="alert"
                      >
                        {tc('error')}
                      </p>
                    ) : linkedRequirements.length === 0 ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('noneAvailable')}
                      </p>
                    ) : (
                      <div className="rounded-xl border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                              <th className="py-2 px-3 font-medium">
                                {tr('uniqueId')}
                              </th>
                              <th className="py-2 px-3 font-medium">
                                {tr('description')}
                              </th>
                              <th className="py-2 px-3 font-medium">
                                {tc('version')}
                              </th>
                              <th className="py-2 px-3 font-medium">
                                {tr('status')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {linkedRequirements.map(requirement => {
                              const truncated = truncateDescription(
                                requirement.description,
                              )
                              const isTruncated =
                                truncated !== requirement.description &&
                                requirement.description != null
                              return (
                                <tr
                                  className="border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                                  key={requirement.id}
                                >
                                  <td className="py-2 px-3 font-medium">
                                    <Link
                                      className="inline-flex items-center min-h-[44px] min-w-[44px] rounded text-primary-700 dark:text-primary-300 hover:underline focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus:outline-none"
                                      href={`/requirements/${requirement.uniqueId}/${requirement.versionNumber}`}
                                    >
                                      {requirement.uniqueId}
                                    </Link>
                                  </td>
                                  <td
                                    className="py-2 px-3 text-secondary-600 dark:text-secondary-400 max-w-xs"
                                    title={
                                      isTruncated
                                        ? (requirement.description ?? undefined)
                                        : undefined
                                    }
                                  >
                                    {truncated ?? '—'}
                                  </td>
                                  <td className="py-2 px-3 text-secondary-600 dark:text-secondary-400">
                                    v{requirement.versionNumber}
                                  </td>
                                  <td className="py-2 px-3">
                                    <StatusBadge
                                      color={requirement.statusColor}
                                      label={
                                        (locale === 'sv'
                                          ? requirement.statusNameSv
                                          : requirement.statusNameEn) ?? ''
                                      }
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
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(controller.deleteError || controller.loadError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
            {...devMarker({
              context: 'normReferences',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError ? 'delete-error' : 'load-error',
            })}
          >
            {controller.deleteError ?? controller.loadError}
          </p>
        )}

        {controller.loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-x-auto"
            {...devMarker({
              context: 'normReferences',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">
                    {t('normReferenceId')}
                  </th>
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('type')}</th>
                  <th className="py-3 px-4 font-medium">{t('reference')}</th>
                  <th className="py-3 px-4 font-medium">{t('version')}</th>
                  <th className="py-3 px-4 font-medium">{t('issuer')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4">
                    <span className="sr-only">{tc('actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {controller.items.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                      colSpan={8}
                    >
                      {t('emptyState')}
                    </td>
                  </tr>
                )}
                {controller.items.map(normReference => (
                  <tr
                    className="border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={normReference.id}
                  >
                    <td className="py-3 px-4 font-mono text-xs font-medium text-secondary-700 dark:text-secondary-300">
                      {normReference.normReferenceId}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {normReference.name}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {normReference.type}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {normReference.reference}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {normReference.version ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {normReference.issuer}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: normReference.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        aria-label={`${tc('edit')} ${normReference.name || normReference.normReferenceId}`}
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'normReferences',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={controller.submitting}
                        onClick={event => {
                          void openEdit(normReference, event.currentTarget)
                        }}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        aria-label={
                          controller.deletingIds.has(normReference.id)
                            ? `${tc('loading')} ${normReference.name || normReference.normReferenceId}`
                            : `${tc('delete')} ${normReference.name || normReference.normReferenceId}`
                        }
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'normReferences',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={
                          controller.submitting ||
                          controller.deletingIds.has(normReference.id)
                        }
                        onClick={event => {
                          void remove(normReference.id, event.currentTarget)
                        }}
                        type="button"
                      >
                        {controller.deletingIds.has(normReference.id)
                          ? tc('loading')
                          : tc('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
