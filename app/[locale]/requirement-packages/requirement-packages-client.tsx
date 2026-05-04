'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { isSwedish } from '@/lib/i18n/localized'

const REQUIREMENT_PACKAGES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementPackages.overview.body',
      headingKey: 'requirementPackages.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementPackages.manage.body',
      headingKey: 'requirementPackages.manage.heading',
    },
  ],
  titleKey: 'requirementPackages.title',
}

interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

interface RequirementPackage {
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  linkedRequirementCount: number
  nameEn: string
  nameSv: string
  owner: Owner | null
  ownerId: number | null
}

interface RequirementPackageForm {
  descriptionEn: string
  descriptionSv: string
  nameEn: string
  nameSv: string
  ownerId: string
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

const getInitialForm = (): RequirementPackageForm => ({
  descriptionEn: '',
  descriptionSv: '',
  nameEn: '',
  nameSv: '',
  ownerId: '',
})

const toForm = (
  requirementPackage: RequirementPackage,
): RequirementPackageForm => ({
  descriptionEn: requirementPackage.descriptionEn ?? '',
  descriptionSv: requirementPackage.descriptionSv ?? '',
  nameEn: requirementPackage.nameEn,
  nameSv: requirementPackage.nameSv,
  ownerId:
    requirementPackage.ownerId != null
      ? String(requirementPackage.ownerId)
      : '',
})

const toPayload = (form: RequirementPackageForm) => ({
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  descriptionSv: form.descriptionSv || undefined,
  descriptionEn: form.descriptionEn || undefined,
  ownerId: form.ownerId ? Number(form.ownerId) : null,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function RequirementPackagesClient() {
  useHelpContent(REQUIREMENT_PACKAGES_HELP)
  const t = useTranslations('requirementPackage')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()
  const [owners, setOwners] = useState<Owner[]>([])
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsError, setLinkedRequirementsError] = useState<
    string | null
  >(null)
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const linkedReqRequestId = useRef(0)

  const getName = (requirementPackage: RequirementPackage) =>
    isSwedish(locale) ? requirementPackage.nameSv : requirementPackage.nameEn
  const getDescription = (requirementPackage: RequirementPackage) =>
    isSwedish(locale)
      ? requirementPackage.descriptionSv
      : requirementPackage.descriptionEn

  const controller = useCrudAdminResource<
    RequirementPackage,
    RequirementPackageForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-packages',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'requirementPackages',
    toForm,
    toPayload,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchOwners() {
      try {
        const response = await apiFetch('/api/owners/all')
        if (!response.ok || cancelled) return
        setOwners(
          ((await response.json()) as { owners?: Owner[] }).owners ?? [],
        )
      } catch {
        if (!cancelled) setOwners([])
      }
    }

    void fetchOwners()

    return () => {
      cancelled = true
    }
  }, [])

  const fetchLinkedRequirements = useCallback(
    async (requirementPackageId: number) => {
      const requestId = ++linkedReqRequestId.current
      setLinkedRequirementsLoading(true)
      setLinkedRequirementsError(null)
      try {
        const response = await apiFetch(
          `/api/requirement-packages/${requirementPackageId}`,
        )
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

  const openCreate = () => {
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    controller.openCreate()
  }

  const openEdit = (requirementPackage: RequirementPackage) => {
    controller.openEdit(requirementPackage)
    void fetchLinkedRequirements(requirementPackage.id)
  }

  const closeForm = () => {
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
    }
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) {
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
    }
  }

  const getOwnerName = (requirementPackage: RequirementPackage) => {
    if (requirementPackage.owner) {
      return `${requirementPackage.owner.firstName} ${requirementPackage.owner.lastName}`
    }
    return '—'
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
            {tn('requirementPackages')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'requirementPackages',
              name: 'create button',
              priority: 350,
            })}
            disabled={controller.submitting}
            onClick={openCreate}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        {(controller.deleteError || controller.loadError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'requirementPackages',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError ? 'delete-error' : 'load-error',
            })}
            role="alert"
          >
            {controller.deleteError ?? controller.loadError}
          </p>
        )}

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
                  className="space-y-5"
                  {...devMarker({
                    context: 'requirementPackages',
                    name: 'crud form',
                    priority: 340,
                    value: controller.editId ? 'edit' : 'create',
                  })}
                  onSubmit={submit}
                >
                  <h2 className="text-lg font-semibold">
                    {controller.editId ? tc('edit') : tc('create')}
                  </h2>
                  <div>
                    <FieldLabelWithHelp
                      help={t('nameSvHelp')}
                      htmlFor="requirement-package-name-sv"
                      label={t('nameSvLabel')}
                      required
                    />
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="requirement-package-name-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          nameSv: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.nameSv}
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('nameEnHelp')}
                      htmlFor="requirement-package-name-en"
                      label={t('nameEnLabel')}
                      required
                    />
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="requirement-package-name-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          nameEn: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.nameEn}
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('descriptionSvHelp')}
                      htmlFor="requirement-package-description-sv"
                      label={t('descriptionSvLabel')}
                    />
                    <textarea
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="requirement-package-description-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionSv: event.target.value,
                        }))
                      }
                      value={controller.form.descriptionSv}
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('descriptionEnHelp')}
                      htmlFor="requirement-package-description-en"
                      label={t('descriptionEnLabel')}
                    />
                    <textarea
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="requirement-package-description-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionEn: event.target.value,
                        }))
                      }
                      value={controller.form.descriptionEn}
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('help.owner')}
                      htmlFor="requirement-package-owner"
                      label={t('owner')}
                    />
                    <select
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="requirement-package-owner"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          ownerId: event.target.value,
                        }))
                      }
                      value={controller.form.ownerId}
                    >
                      <option value="">—</option>
                      {owners.map(owner => (
                        <option key={owner.id} value={owner.id}>
                          {owner.firstName} {owner.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
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
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                      disabled={controller.submitting}
                      onClick={closeForm}
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
                                  key={`${requirement.id}-v${requirement.versionNumber}`}
                                >
                                  <td className="py-2 px-3 font-medium">
                                    <Link
                                      className="inline-flex items-center min-h-11 min-w-11 text-primary-700 dark:text-primary-300 hover:underline"
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
                                        (isSwedish(locale)
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

        {controller.loading ? (
          <p
            className="text-secondary-600 dark:text-secondary-400"
            role="status"
          >
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-x-auto"
            {...devMarker({
              context: 'requirementPackages',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('description')}</th>
                  <th className="py-3 px-4 font-medium">{t('owner')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {controller.items.map(requirementPackage => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={requirementPackage.id}
                  >
                    <td className="py-3 px-4 font-medium">
                      {getName(requirementPackage)}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 max-w-xs truncate">
                      {getDescription(requirementPackage) || '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {getOwnerName(requirementPackage)}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: requirementPackage.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'requirementPackages',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={controller.submitting}
                        onClick={() => openEdit(requirementPackage)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'requirementPackages',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={
                          controller.submitting ||
                          controller.deletingIds.has(requirementPackage.id)
                        }
                        onClick={event => {
                          void remove(
                            requirementPackage.id,
                            event.currentTarget,
                          )
                        }}
                        type="button"
                      >
                        {controller.deletingIds.has(requirementPackage.id)
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
